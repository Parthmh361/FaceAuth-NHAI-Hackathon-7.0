import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted app settings (AsyncStorage). Centralizes all tunables so the
 * Settings screen, SyncService, and FaceAuthSDK read one source of truth.
 */

export interface AppSettings {
  matchThreshold: number;      // cosine similarity cutoff for a positive match
  awsEndpoint: string;         // attendance sync endpoint
  cameraPosition: 'front' | 'back';
  livenessEnabled: boolean;    // require challenge-response before capture
  spoofCheckEnabled: boolean;  // passive texture anti-spoofing gate
  adminPin: string;            // gate for Users/admin section
}

export const DEFAULT_SETTINGS: AppSettings = {
  matchThreshold: 0.6,
  awsEndpoint: 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/attendance',
  cameraPosition: 'front',
  livenessEnabled: true,
  spoofCheckEnabled: true,
  adminPin: '1234',
};

const KEY = '@nhai_faceauth_settings';

export const SettingsStore = {
  async load(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async save(settings: AppSettings): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  },

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.load();
    const next = { ...current, ...patch };
    await this.save(next);
    return next;
  },
};
