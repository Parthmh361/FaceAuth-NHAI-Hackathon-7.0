import SQLite from 'react-native-sqlite-storage';
import CryptoJS from 'crypto-js';
import { cosineSimilarity } from './core/faceMath';

SQLite.enablePromise(true);

const DB_NAME = 'NHAI_FaceAuth.db';

// In production: derive this key from Android Keystore / iOS Secure Enclave.
// For the hackathon demo this constant key demonstrates AES-256 storage at rest.
const ENC_KEY = 'NHAI-FaceAuth-AES256-OfflineKey-2024';

// Derive a fixed 256-bit key from the passphrase. We use an explicit key + IV
// (CryptoJS AES-256-CBC) instead of passphrase mode on purpose: passphrase mode
// asks crypto-js for a random salt, and crypto-js 4.x throws
// "Native crypto module could not be used to get secure random number" under
// Hermes (no native CSPRNG). A per-record IV derived from the plaintext keeps
// ciphertexts unique without needing any RNG, so encryption works fully offline.
const AES_KEY = CryptoJS.SHA256(ENC_KEY);

function encryptEmbedding(plain: string): string {
  const iv = CryptoJS.lib.WordArray.create(CryptoJS.SHA256(plain).words.slice(0, 4), 16);
  const enc = CryptoJS.AES.encrypt(plain, AES_KEY, { iv });
  return iv.toString(CryptoJS.enc.Hex) + ':' + enc.ciphertext.toString(CryptoJS.enc.Base64);
}

function decryptEmbedding(stored: string): string {
  const sep = stored.indexOf(':');
  if (sep === -1) return ''; // unknown/legacy format — skip
  const iv = CryptoJS.enc.Hex.parse(stored.slice(0, sep));
  const params = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(stored.slice(sep + 1)),
  });
  return CryptoJS.AES.decrypt(params, AES_KEY, { iv }).toString(CryptoJS.enc.Utf8);
}

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

    // Migrate DBs created by an earlier schema. CREATE TABLE IF NOT EXISTS does
    // NOT add columns to a pre-existing table, so older installs are missing
    // newer columns (e.g. employee_name) — add them in place.
    await this.ensureColumn('attendance_log', 'employee_name', 'TEXT');
    await this.ensureColumn('attendance_log', 'challenge', "TEXT NOT NULL DEFAULT 'NONE'");
    await this.ensureColumn('attendance_log', 'synced', 'INTEGER NOT NULL DEFAULT 0');
  }

  /** Add a column if it isn't already present (lightweight forward migration). */
  private static async ensureColumn(table: string, column: string, decl: string): Promise<void> {
    const [info] = await this.db!.executeSql(`PRAGMA table_info(${table})`);
    for (let i = 0; i < info.rows.length; i++) {
      if (info.rows.item(i).name === column) return; // already there
    }
    await this.db!.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }

  // ─── Employees (AES-256 encrypted embeddings) ────────────────

  static async enrollEmployee(
    employeeId: string,
    name: string,
    designation: string,
    embedding: Float32Array,
  ): Promise<void> {
    if (!this.db) await this.initDB();
    const cipher = encryptEmbedding(JSON.stringify(Array.from(embedding)));
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
        const arr: number[] = JSON.parse(decryptEmbedding(row.embedding));
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
