/**
 * App-wide context: owns model init, settings, and the live status counters
 * (enrolled employees, pending sync). Every screen reads from here.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { FaceAuthSDK } from '../FaceAuthSDK';
import { SyncService, SyncResult } from '../SyncService';
import { SettingsStore, AppSettings, DEFAULT_SETTINGS } from '../services/SettingsStore';

const MODEL_NAME = 'w600k_mbf.onnx'; // swap to w600k_mbf_int8.onnx after quantization

interface AppState {
  modelReady: boolean;
  initError: string | null;
  initModel: () => Promise<void>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  enrolledCount: number;
  pendingCount: number;
  lastSyncAt: number | null;
  lastSyncMsg: string;
  refresh: () => Promise<void>;
  syncNow: () => Promise<SyncResult>;
}

const Ctx = createContext<AppState | undefined>(undefined);

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used within AppProvider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [modelReady, setModelReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncMsg, setLastSyncMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      setEnrolledCount(await FaceAuthSDK.enrolledCount());
      setPendingCount(await FaceAuthSDK.pendingSyncCount());
      setLastSyncAt(SyncService.getLastSyncAt());
    } catch { /* db not ready yet */ }
  }, []);

  const initModel = useCallback(async () => {
    setInitError(null);
    try {
      const loaded = await SettingsStore.load();
      setSettings(loaded);
      SyncService.setEndpoint(loaded.awsEndpoint);

      const { InferenceSession, Tensor } = require('onnxruntime-react-native');
      let modelPath: string;
      if (Platform.OS === 'ios') {
        modelPath = `${RNFS.MainBundlePath}/${MODEL_NAME}`;
      } else {
        modelPath = `${RNFS.DocumentDirectoryPath}/${MODEL_NAME}`;
        if (!(await RNFS.exists(modelPath))) {
          await RNFS.copyFileAssets(MODEL_NAME, modelPath);
        }
      }

      const session = await InferenceSession.create(modelPath);
      // Warm-up pass so the first real inference isn't cold.
      await session.run({ 'input.1': new Tensor('float32', new Float32Array(3 * 112 * 112), [1, 3, 112, 112]) });

      await FaceAuthSDK.initialize(session, {
        threshold: loaded.matchThreshold,
        spoofEnabled: loaded.spoofCheckEnabled,
        onSync: (r) => {
          if (r.synced > 0) setLastSyncMsg(`Synced ${r.synced} record(s)`);
          refresh();
        },
      });

      setModelReady(true);
      await refresh();
    } catch (e: any) {
      setInitError(e.message ?? 'Model initialization failed');
    }
  }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await SettingsStore.update(patch);
    setSettings(next);
    if (patch.awsEndpoint != null) SyncService.setEndpoint(next.awsEndpoint);
    if (patch.matchThreshold != null) FaceAuthSDK.setThreshold(next.matchThreshold);
    if (patch.spoofCheckEnabled != null) FaceAuthSDK.setSpoofEnabled(next.spoofCheckEnabled);
  }, []);

  const syncNow = useCallback(async () => {
    const r = await FaceAuthSDK.syncNow();
    setLastSyncMsg(
      r.synced > 0 ? `Synced ${r.synced} record(s)` :
      r.errors > 0 ? 'Sync failed (no network?)' : 'Nothing to sync',
    );
    await refresh();
    return r;
  }, [refresh]);

  useEffect(() => {
    SettingsStore.load().then(setSettings).catch(() => {});
    return () => SyncService.stop();
  }, []);

  return (
    <Ctx.Provider value={{
      modelReady, initError, initModel,
      settings, updateSettings,
      enrolledCount, pendingCount, lastSyncAt, lastSyncMsg,
      refresh, syncNow,
    }}>
      {children}
    </Ctx.Provider>
  );
}
