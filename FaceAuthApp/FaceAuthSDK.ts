/**
 * FaceAuthSDK — clean API surface for integrating face auth into Datalake 3.0.
 *
 * Usage in the host Datalake app:
 *
 *   import { FaceAuthSDK } from './FaceAuthSDK';
 *
 *   // Once at startup
 *   await FaceAuthSDK.initialize(onnxSession);
 *
 *   // Enroll a new field employee
 *   const result = await FaceAuthSDK.enroll(imageUri, faceBounds, 'EMP-1234');
 *
 *   // Authenticate on attendance
 *   const auth = await FaceAuthSDK.authenticate(imageUri, faceBounds, 'BLINK');
 *   if (auth.success) markAttendance(auth.employeeId);
 *
 *   // Trigger manual sync (also runs automatically on connectivity)
 *   await FaceAuthSDK.syncNow();
 */

import { Database } from './Database';
import { FaceProcessor } from './FaceProcessor';
import { SyncService, SyncResult } from './SyncService';

export interface AuthResult {
  success: boolean;
  employeeId?: string;
  score?: number;
  challenge?: string;
  timing?: {
    prepMs: number;
    onnxMs: number;
    dbMs: number;
    totalMs: number;
  };
  error?: string;
}

export interface EnrollResult {
  success: boolean;
  employeeId?: string;
  error?: string;
}

let _onnxSession: any = null;

export const FaceAuthSDK = {
  /** Call once after creating the ONNX InferenceSession. */
  async initialize(
    onnxSession: any,
    onSyncComplete?: (r: SyncResult) => void,
  ): Promise<void> {
    _onnxSession = onnxSession;
    await Database.initDB();
    SyncService.start(onSyncComplete);
  },

  /** Enroll a new employee's face embedding (AES-256 encrypted at rest). */
  async enroll(
    imageUri: string,
    faceBounds: { top: number; left: number; width: number; height: number },
    employeeId: string,
  ): Promise<EnrollResult> {
    if (!_onnxSession) return { success: false, error: 'SDK not initialized' };
    try {
      const { Tensor } = require('onnxruntime-react-native');
      const floatData = await FaceProcessor.cropResizeAndNormalize(imageUri, faceBounds);
      const tensor = new Tensor('float32', floatData, [1, 3, 112, 112]);
      const out = await _onnxSession.run({ 'input.1': tensor });
      const raw = (Object.values(out)[0] as any).data as Float32Array;
      const norm = Math.sqrt(raw.reduce((s: number, v: number) => s + v * v, 0));
      const embedding = new Float32Array(raw.map((v: number) => v / (norm || 1)));
      await Database.saveEmbedding(employeeId, embedding);
      return { success: true, employeeId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Authenticate a face. Logs a successful match to the offline attendance queue
   * (synced to AWS when connectivity resumes).
   */
  async authenticate(
    imageUri: string,
    faceBounds: { top: number; left: number; width: number; height: number },
    challengeCompleted: string,
  ): Promise<AuthResult> {
    if (!_onnxSession) return { success: false, error: 'SDK not initialized' };
    const t0 = Date.now();
    try {
      const { Tensor } = require('onnxruntime-react-native');

      const t1 = Date.now();
      const floatData = await FaceProcessor.cropResizeAndNormalize(imageUri, faceBounds);
      const prepMs = Date.now() - t1;

      const t2 = Date.now();
      const tensor = new Tensor('float32', floatData, [1, 3, 112, 112]);
      const out = await _onnxSession.run({ 'input.1': tensor });
      const onnxMs = Date.now() - t2;

      const raw = (Object.values(out)[0] as any).data as Float32Array;
      const norm = Math.sqrt(raw.reduce((s: number, v: number) => s + v * v, 0));
      const embedding = new Float32Array(raw.map((v: number) => v / (norm || 1)));

      const t3 = Date.now();
      const match = await Database.authenticateUser(embedding, 0.60);
      const dbMs = Date.now() - t3;
      const totalMs = Date.now() - t0;

      if (match) {
        await Database.logAttendance({
          employeeId: match.employeeId,
          timestamp: Date.now(),
          similarityScore: match.score,
          challenge: challengeCompleted,
        });
        return {
          success: true,
          employeeId: match.employeeId,
          score: match.score,
          challenge: challengeCompleted,
          timing: { prepMs, onnxMs, dbMs, totalMs },
        };
      }

      return {
        success: false,
        timing: { prepMs, onnxMs, dbMs, totalMs },
        error: 'No matching face found',
      };
    } catch (e: any) {
      return { success: false, totalMs: Date.now() - t0, error: e.message } as AuthResult;
    }
  },

  /** Manually trigger an AWS sync (also fires automatically on connectivity). */
  async syncNow(): Promise<SyncResult> {
    return SyncService.syncPending();
  },

  async enrolledCount(): Promise<number> {
    return (await Database.getAllUsers()).length;
  },

  async pendingSyncCount(): Promise<number> {
    return Database.getPendingCount();
  },

  async clearAll(): Promise<void> {
    await Database.clearAllUsers();
  },
};
