import * as SQLite from 'expo-sqlite';
import type { DictEntry } from '../types/book';
import { DB_NAME } from '../utils/constants';

/**
 * Dictionary query service using SQLite FTS5.
 *
 * Data flow:
 * 1. JMdict JSON is downloaded/converted on first launch (dictionary-init.ts)
 * 2. Inserted into SQLite with FTS5 full-text search
 * 3. This service provides fast lookup by word or reading
 */

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

/**
 * Initialize the dictionary tables (called once on first launch).
 */
export function initDictionaryTables(): void {
  const database = getDb();

  // Words table
  database.execSync(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      reading TEXT NOT NULL,
      pos TEXT,
      gloss TEXT NOT NULL
    );
  `);

  // FTS5 virtual table for full-text search
  database.execSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      word,
      reading,
      gloss,
      content='entries',
      content_rowid='id'
    );
  `);

  // Triggers to keep FTS in sync
  database.execSync(`
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, word, reading, gloss)
      VALUES (new.id, new.word, new.reading, new.gloss);
    END;
  `);
  database.execSync(`
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, word, reading, gloss)
      VALUES ('delete', old.id, old.word, old.reading, old.gloss);
    END;
  `);
  database.execSync(`
    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, word, reading, gloss)
      VALUES ('delete', old.id, old.word, old.reading, old.gloss);
      INSERT INTO entries_fts(rowid, word, reading, gloss)
      VALUES (new.id, new.word, new.reading, new.gloss);
    END;
  `);
}

/**
 * Look up a word in the dictionary.
 * Searches by exact word match first, then by reading.
 */
export function lookupWord(word: string): DictEntry | null {
  const database = getDb();

  // Exact word match
  const exact = database.getFirstSync<DictEntry>(
    `SELECT id, word, reading, pos, gloss
     FROM entries
     WHERE word = ?
     LIMIT 1`,
    [word],
  );

  if (exact) return parseEntry(exact);

  // Try by reading
  const byReading = database.getFirstSync<DictEntry>(
    `SELECT id, word, reading, pos, gloss
     FROM entries
     WHERE reading = ?
     LIMIT 1`,
    [word],
  );

  if (byReading) return parseEntry(byReading);

  return null;
}

/**
 * Full-text search for words containing the query.
 */
export function searchWords(query: string, limit = 20): DictEntry[] {
  const database = getDb();

  const rows = database.getAllSync<DictEntry>(
    `SELECT id, word, reading, pos, gloss
     FROM entries
     WHERE word LIKE ?
     ORDER BY length(word) ASC
     LIMIT ?`,
    [`%${query}%`, limit],
  );

  return rows.map(parseEntry);
}

/**
 * FTS5 full-text search (faster, supports partial matches).
 */
export function ftsSearch(query: string, limit = 20): DictEntry[] {
  const database = getDb();

  // Escape FTS5 special chars
  const safe = query.replace(/[*"]/g, '');
  const ftsQuery = `"${safe}"`;

  try {
    const rows = database.getAllSync<{
      id: number;
      word: string;
      reading: string;
      pos: string;
      gloss: string;
    }>(
      `SELECT e.id, e.word, e.reading, e.pos, e.gloss
       FROM entries_fts f
       JOIN entries e ON e.id = f.rowid
       WHERE entries_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [ftsQuery, limit],
    );
    return rows.map(parseEntry);
  } catch {
    // FTS5 match error (e.g., malformed query) → fall back to LIKE
    return searchWords(query, limit);
  }
}

/**
 * Get total entry count.
 */
export function getEntryCount(): number {
  const database = getDb();
  const row = database.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM entries',
  );
  return row?.cnt ?? 0;
}

/**
 * Batch insert entries (for initial dictionary import).
 * Uses a transaction for performance.
 */
export function batchInsertEntries(
  entries: Array<{ word: string; reading: string; pos: string; gloss: string }>,
  onProgress?: (done: number, total: number) => void,
): void {
  const database = getDb();
  const total = entries.length;

  database.execSync('BEGIN TRANSACTION;');

  for (let i = 0; i < total; i++) {
    const e = entries[i];
    database.runSync(
      'INSERT INTO entries (word, reading, pos, gloss) VALUES (?, ?, ?, ?)',
      [e.word, e.reading, e.pos, e.gloss],
    );

    if (onProgress && i % 500 === 0) {
      onProgress(i + 1, total);
    }
  }

  database.execSync('COMMIT;');
  onProgress?.(total, total);
}

// ── Helpers ──

function parseEntry(row: any): DictEntry {
  return {
    id: row.id,
    word: row.word,
    reading: row.reading,
    pos: row.pos ? row.pos.split(',') : [],
    gloss: row.gloss ? row.gloss.split(';') : [],
  };
}
