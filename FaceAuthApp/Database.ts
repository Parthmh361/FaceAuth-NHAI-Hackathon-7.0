import SQLite from 'react-native-sqlite-storage';
import CryptoJS from 'crypto-js';
import { cosineSimilarity } from './core/faceMath';

SQLite.enablePromise(true);

const DB_NAME = 'NHAI_FaceAuth.db';

// In production: derive this key from Android Keystore / iOS Secure Enclave.
// For the hackathon demo this constant key demonstrates AES-256 storage at rest.
const ENC_KEY = 'NHAI-FaceAuth-AES256-OfflineKey-2024';

export interface Employee {
  employeeId: string;
  name: string;
  designation: string;
  enrolledAt: number;
  embedding: Float32Array;
}

export interface EmployeeProfile {
  employeeId: string;
  name: string;
  designation: string;
  enrolledAt: number;
}

export interface AttendanceRecord {
  id?: number;
  employeeId: string;
  employeeName?: string;
  timestamp: number;
  similarityScore: number;
  challenge: string;
  synced?: boolean;
}

export interface MatchResult {
  employeeId: string;
  name: string;
  designation: string;
  score: number;
}

export class Database {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async initDB(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT,
        designation TEXT,
        embedding TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS attendance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        employee_name TEXT,
        timestamp INTEGER NOT NULL,
        similarity_score REAL NOT NULL,
        challenge TEXT NOT NULL DEFAULT 'NONE',
        synced INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  // ─── Employees (AES-256 encrypted embeddings) ────────────────

  static async enrollEmployee(
    employeeId: string,
    name: string,
    designation: string,
    embedding: Float32Array,
  ): Promise<void> {
    if (!this.db) await this.initDB();
    const cipher = CryptoJS.AES.encrypt(
      JSON.stringify(Array.from(embedding)),
      ENC_KEY,
    ).toString();
    await this.db!.executeSql(
      `INSERT OR REPLACE INTO employees (employee_id, name, designation, embedding, enrolled_at)
       VALUES (?, ?, ?, ?, ?)`,
      [employeeId, name || employeeId, designation || '', cipher, Date.now()],
    );
  }

  /** Back-compat shim for the low-level SDK path (name defaults to id). */
  static async saveEmbedding(employeeId: string, embedding: Float32Array): Promise<void> {
    await this.enrollEmployee(employeeId, employeeId, '', embedding);
  }

  static async getEmployees(): Promise<Employee[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql('SELECT * FROM employees ORDER BY enrolled_at DESC');
    const out: Employee[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows.item(i);
      try {
        const arr: number[] = JSON.parse(
          CryptoJS.AES.decrypt(row.embedding, ENC_KEY).toString(CryptoJS.enc.Utf8),
        );
        out.push({
          employeeId: row.employee_id,
          name: row.name ?? row.employee_id,
          designation: row.designation ?? '',
          enrolledAt: row.enrolled_at ?? 0,
          embedding: new Float32Array(arr),
        });
      } catch {
        // skip rows that can't be decrypted (older/foreign key)
      }
    }
    return out;
  }

  /** Lightweight list for UI (no embedding decryption). */
  static async getEmployeeProfiles(): Promise<EmployeeProfile[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql(
      'SELECT employee_id, name, designation, enrolled_at FROM employees ORDER BY enrolled_at DESC',
    );
    const out: EmployeeProfile[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      out.push({
        employeeId: r.employee_id,
        name: r.name ?? r.employee_id,
        designation: r.designation ?? '',
        enrolledAt: r.enrolled_at ?? 0,
      });
    }
    return out;
  }

  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    return cosineSimilarity(a, b);
  }

  static async authenticateUser(
    input: Float32Array,
    threshold = 0.6,
  ): Promise<MatchResult | null> {
    const employees = await this.getEmployees();
    let best: Employee | null = null;
    let top = 0;
    for (const e of employees) {
      const s = this.cosineSimilarity(input, e.embedding);
      if (s > top) { top = s; best = e; }
    }
    return best && top >= threshold
      ? { employeeId: best.employeeId, name: best.name, designation: best.designation, score: top }
      : null;
  }

  static async deleteEmployee(employeeId: string): Promise<void> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql('DELETE FROM employees WHERE employee_id = ?', [employeeId]);
  }

  static async countEmployees(): Promise<number> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql('SELECT COUNT(*) as c FROM employees');
    return res.rows.item(0).c as number;
  }

  static async clearAllUsers(): Promise<void> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql('DELETE FROM employees');
  }

  // ─── Attendance log (offline queue for AWS sync) ──────────────

  static async logAttendance(record: Omit<AttendanceRecord, 'id' | 'synced'>): Promise<void> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(
      `INSERT INTO attendance_log (employee_id, employee_name, timestamp, similarity_score, challenge, synced)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        record.employeeId,
        record.employeeName ?? record.employeeId,
        record.timestamp,
        record.similarityScore,
        record.challenge,
      ],
    );
  }

  static async getAttendanceHistory(limit = 100): Promise<AttendanceRecord[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql(
      'SELECT * FROM attendance_log ORDER BY timestamp DESC LIMIT ?',
      [limit],
    );
    return Database.mapAttendance(res);
  }

  static async getPendingAttendance(): Promise<AttendanceRecord[]> {
    if (!this.db) await this.initDB();
    const [res] = await this.db!.executeSql(
      'SELECT * FROM attendance_log WHERE synced = 0 ORDER BY timestamp ASC',
    );
    return Database.mapAttendance(res);
  }

  private static mapAttendance(res: SQLite.ResultSet): AttendanceRecord[] {
    const out: AttendanceRecord[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i);
      out.push({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name ?? r.employee_id,
        timestamp: r.timestamp,
        similarityScore: r.similarity_score,
        challenge: r.challenge,
        synced: r.synced === 1,
      });
    }
    return out;
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
    await this.db!.executeSql(`UPDATE attendance_log SET synced = 1 WHERE id IN (${ph})`, ids);
  }

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
