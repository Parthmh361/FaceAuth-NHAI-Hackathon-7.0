import SQLite from 'react-native-sqlite-storage';
import CryptoJS from 'crypto-js';

SQLite.enablePromise(true);

const DB_NAME = 'NHAI_FaceAuth.db';

// In production: derive this key from Android Keystore / iOS Secure Enclave.
// For the hackathon demo this constant key demonstrates AES-256 storage at rest.
const ENC_KEY = 'NHAI-FaceAuth-AES256-OfflineKey-2024';

export interface RegisteredUser {
  employeeId: string;
  embedding: Float32Array;
}

export interface AttendanceRecord {
  id?: number;
  employeeId: string;
  timestamp: number;
  similarityScore: number;
  challenge: string;
  synced?: boolean;
}

export class Database {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async initDB(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS registered_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        embedding TEXT NOT NULL
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS attendance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        similarity_score REAL NOT NULL,
        challenge TEXT NOT NULL DEFAULT 'NONE',
        synced INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  // ─── Registered users (AES-256 encrypted embeddings) ─────────

  static async saveEmbedding(employeeId: string, embedding: Float32Array): Promise<void> {
    if (!this.db) await this.initDB();
    const plain = JSON.stringify(Array.from(embedding));
    const cipher = CryptoJS.AES.encrypt(plain, ENC_KEY).toString();
    await this.db!.executeSql(
      'INSERT OR REPLACE INTO registered_users (employee_id, embedding) VALUES (?, ?)',
      [employeeId, cipher],
    );
  }

  static async getAllUsers(): Promise<RegisteredUser[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql('SELECT * FROM registered_users');
    const users: RegisteredUser[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows.item(i);
      try {
        const bytes = CryptoJS.AES.decrypt(row.embedding, ENC_KEY);
        const arr: number[] = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        users.push({ employeeId: row.employee_id, embedding: new Float32Array(arr) });
      } catch {
        // skip rows that can't be decrypted (written by older unencrypted builds)
      }
    }
    return users;
  }

  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  static async authenticateUser(
    input: Float32Array,
    threshold = 0.60,
  ): Promise<{ employeeId: string; score: number } | null> {
    const users = await this.getAllUsers();
    let best: string | null = null;
    let top = 0;
    for (const u of users) {
      const s = this.cosineSimilarity(input, u.embedding);
      if (s > top) { top = s; best = u.employeeId; }
    }
    return best && top >= threshold ? { employeeId: best, score: top } : null;
  }

  static async clearAllUsers(): Promise<void> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql('DELETE FROM registered_users');
  }

  // ─── Attendance log (offline queue for AWS sync) ──────────────

  static async logAttendance(record: Omit<AttendanceRecord, 'id' | 'synced'>): Promise<void> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(
      'INSERT INTO attendance_log (employee_id, timestamp, similarity_score, challenge, synced) VALUES (?, ?, ?, ?, 0)',
      [record.employeeId, record.timestamp, record.similarityScore, record.challenge],
    );
  }

  static async getPendingAttendance(): Promise<AttendanceRecord[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql(
      'SELECT * FROM attendance_log WHERE synced = 0 ORDER BY timestamp ASC',
    );
    const records: AttendanceRecord[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      records.push({
        id: r.id,
        employeeId: r.employee_id,
        timestamp: r.timestamp,
        similarityScore: r.similarity_score,
        challenge: r.challenge,
        synced: false,
      });
    }
    return records;
  }

  static async getPendingCount(): Promise<number> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql(
      'SELECT COUNT(*) as cnt FROM attendance_log WHERE synced = 0',
    );
    return res.rows.item(0).cnt as number;
  }

  static async markSynced(ids: number[]): Promise<void> {
    if (!this.db || ids.length === 0) return;
    const ph = ids.map(() => '?').join(',');
    await this.db!.executeSql(
      `UPDATE attendance_log SET synced = 1 WHERE id IN (${ph})`,
      ids,
    );
  }

  // Purge records that were synced and are older than `olderThanMs` (default 30 days).
  static async purgeSyncedRecords(olderThanMs = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.db) await this.initDB();
    const cutoff = Date.now() - olderThanMs;
    const [res] = await this.db!.executeSql(
      'DELETE FROM attendance_log WHERE synced = 1 AND timestamp < ?',
      [cutoff],
    );
    return res.rowsAffected;
  }
}
