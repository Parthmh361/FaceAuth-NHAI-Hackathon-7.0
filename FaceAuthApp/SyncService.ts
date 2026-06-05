import NetInfo from '@react-native-community/netinfo';
import { Database } from './Database';

// Default endpoint; overridden at runtime from persisted settings via setEndpoint().
// Expected payload: POST { records: AttendanceRecord[] }  →  200 OK on success.
const DEFAULT_ENDPOINT =
  'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/attendance';

export interface SyncResult {
  synced: number;
  purged: number;
  errors: number;
  message?: string;
}

export class SyncService {
  private static unsubscribe: (() => void) | null = null;
  private static isSyncing = false;
  private static onSyncComplete: ((r: SyncResult) => void) | null = null;
  private static endpoint: string = DEFAULT_ENDPOINT;
  private static lastSyncAt: number | null = null;

  static setEndpoint(url: string): void {
    if (url && url.trim()) this.endpoint = url.trim();
  }

  static getLastSyncAt(): number | null {
    return this.lastSyncAt;
  }

  /**
   * Start listening for connectivity changes.
   * Automatically triggers a sync whenever the device goes online.
   * Call once at app startup (e.g. in App useEffect).
   */
  static start(onComplete?: (r: SyncResult) => void): void {
    if (this.unsubscribe) return;
    this.onSyncComplete = onComplete ?? null;

    this.unsubscribe = NetInfo.addEventListener(async state => {
      if (state.isConnected && state.isInternetReachable) {
        const result = await this.syncPending();
        this.onSyncComplete?.(result);
      }
    });
  }

  static stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Upload all pending attendance records to AWS, mark them synced,
   * then purge records older than 30 days.
   */
  static async syncPending(): Promise<SyncResult> {
    if (this.isSyncing) return { synced: 0, purged: 0, errors: 0 };

    // Guard: refuse to attempt a fetch against the placeholder URL.
    if (!this.endpoint || this.endpoint.includes('YOUR_API_ID')) {
      return {
        synced: 0, purged: 0, errors: 1,
        message: 'AWS endpoint not configured — set it in Settings → AWS Endpoint.',
      };
    }

    this.isSyncing = true;
    let synced = 0;
    let purged = 0;
    let errors = 0;
    let message: string | undefined;

    try {
      // Check connectivity before attempting the HTTP request so we give a
      // clear "offline" message rather than a confusing network-error crash.
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        return {
          synced: 0, purged: 0, errors: 0,
          message: 'Offline — sync will run automatically when connected.',
        };
      }

      const records = await Database.getPendingAttendance();
      if (records.length === 0) return { synced: 0, purged: 0, errors: 0 };

      console.log(`[Sync] Uploading ${records.length} pending records to ${this.endpoint}`);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });

      if (response.ok) {
        const ids = records.map(r => r.id!);
        await Database.markSynced(ids);
        purged = await Database.purgeSyncedRecords();
        synced = ids.length;
        this.lastSyncAt = Date.now();
        console.log(`[Sync] Synced ${synced}, purged ${purged} old records.`);
      } else {
        errors = records.length;
        message = `Server error (${response.status}) — check AWS endpoint.`;
        console.warn('[Sync] Server rejected upload:', response.status);
      }
    } catch (err: any) {
      errors = 1;
      message = 'Network request failed — check endpoint URL in Settings.';
      console.warn('[Sync] Network error during sync:', err);
    } finally {
      this.isSyncing = false;
    }

    return { synced, purged, errors, message };
  }
}
