import SQLite from 'react-native-sqlite-storage';

// Enable promises for SQLite
SQLite.enablePromise(true);

const DB_NAME = 'NHAI_FaceAuth.db';

export interface RegisteredUser {
  employeeId: string;
  embedding: Float32Array;
}

export class Database {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async initDB() {
    if (this.db) return;
    try {
      this.db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS registered_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT UNIQUE NOT NULL,
          embedding TEXT NOT NULL
        );
      `);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database', error);
      throw error;
    }
  }

  static async saveEmbedding(employeeId: string, embedding: Float32Array): Promise<void> {
    if (!this.db) await this.initDB();
    
    // Convert Float32Array to standard array for JSON serialization
    const embeddingArray = Array.from(embedding);
    const embeddingString = JSON.stringify(embeddingArray);

    try {
      await this.db!.executeSql(
        `INSERT OR REPLACE INTO registered_users (employee_id, embedding) VALUES (?, ?)`,
        [employeeId, embeddingString]
      );
      console.log(`Saved embedding for employee: ${employeeId}`);
    } catch (error) {
      console.error('Failed to save embedding', error);
      throw error;
    }
  }

  static async getAllUsers(): Promise<RegisteredUser[]> {
    if (!this.db) await this.initDB();

    try {
      const [results] = await this.db!.executeSql('SELECT * FROM registered_users');
      const users: RegisteredUser[] = [];
      
      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        const embeddingArray = JSON.parse(row.embedding);
        users.push({
          employeeId: row.employee_id,
          embedding: new Float32Array(embeddingArray),
        });
      }
      return users;
    } catch (error) {
      console.error('Failed to fetch users', error);
      throw error;
    }
  }

  /**
   * Calculates the Cosine Similarity between two Float32 vectors.
   * Returns a value between -1.0 and 1.0. 
   * 1.0 means perfectly identical.
   */
  static cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    if (vecA.length !== vecB.length) {
        throw new Error('Vector lengths must match');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Compares an input embedding against all registered users.
   * @param inputEmbedding The 512d face embedding from ONNX
   * @param threshold Minimum similarity score to be considered a match (0.6 is typical for MobileFaceNet)
   * @returns The best matching employeeId, or null if no match above threshold
   */
  static async authenticateUser(inputEmbedding: Float32Array, threshold: number = 0.5): Promise<{ employeeId: string; score: number } | null> {
    const users = await this.getAllUsers();
    
    let bestMatch: string | null = null;
    let highestScore = 0;

    for (const user of users) {
      const score = this.cosineSimilarity(inputEmbedding, user.embedding);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = user.employeeId;
      }
    }

    if (bestMatch && highestScore >= threshold) {
      return { employeeId: bestMatch, score: highestScore };
    }

    return null;
  }

  static async clearAllUsers(): Promise<void> {
    if (!this.db) await this.initDB();
    try {
      await this.db!.executeSql('DELETE FROM registered_users');
      console.log('All users deleted successfully.');
    } catch (error) {
      console.error('Failed to clear users', error);
      throw error;
    }
  }
}
