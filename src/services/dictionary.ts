import * as SQLite from 'expo-sqlite';
import type { DictEntry } from '../types/book';
import { DB_NAME } from '../utils/constants';

/**
 * Dictionary query service.
 *
 * Schema + triggers are self-ensured on first access.
 * Data is imported by dictionary-init.ts (from bundled JSON).
 * FTS5 index is BUILT LAZILY after data import — never during a query,
 * to avoid blocking the UI thread (18K entries ≈ 1-2s synchronous build).
 * Until FTS is ready, ftsSearch() falls back to LIKE-based search.
 */

let db: SQLite.SQLiteDatabase | null = null;
let schemaEnsured = false;
let ftsBuilt = false;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync(DB_NAME);
  ensureSchema();
  return db;
}

function ensureSchema(): void {
  if (schemaEnsured) return;
  const d = db!;

  d.execSync(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY,
    word TEXT NOT NULL,
    reading TEXT NOT NULL,
    pos TEXT,
    gloss TEXT NOT NULL
  );`);

  // Metadata table for version tracking etc.
  d.execSync(`CREATE TABLE IF NOT EXISTS dict_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`);

  d.execSync(`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    word, reading, gloss,
    content='entries', content_rowid='id'
  );`);

  d.execSync(`CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, word, reading, gloss)
    VALUES (new.id, new.word, new.reading, new.gloss);
  END;`);
  d.execSync(`CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, word, reading, gloss)
    VALUES ('delete', old.id, old.word, old.reading, old.gloss);
  END;`);
  d.execSync(`CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, word, reading, gloss)
    VALUES ('delete', old.id, old.word, old.reading, old.gloss);
    INSERT INTO entries_fts(rowid, word, reading, gloss)
    VALUES (new.id, new.word, new.reading, new.gloss);
  END;`);

  schemaEnsured = true;
}

/**
 * Build FTS5 index — call AFTER data import is complete.
 * Safe to call multiple times; skips if already built or no data.
 * This is called from dictionary-init.ts after batch insert, NOT from queries.
 */
export function buildFtsIndex(): void {
  if (ftsBuilt) return;
  const d = getDb();

  const row = d.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM entries');
  if (!row || row.cnt === 0) return; // no data yet

  const ftsRow = d.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM entries_fts',
  );
  if (ftsRow && ftsRow.cnt > 0) {
    ftsBuilt = true; // already built
    return;
  }

  console.log(`[dict] Building FTS5 index for ~${row.cnt} entries...`);
  d.execSync(`
    INSERT INTO entries_fts(rowid, word, reading, gloss)
    SELECT id, word, reading, gloss FROM entries;
  `);
  ftsBuilt = true;
  console.log('[dict] FTS5 index ready');
}

// ── Queries (never trigger FTS building) ──

export function lookupWord(word: string): DictEntry | null {
  const d = getDb();
  const exact = d.getFirstSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE word = ? LIMIT 1',
    [word],
  );
  if (exact) return parseEntry(exact);

  const byReading = d.getFirstSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE reading = ? LIMIT 1',
    [word],
  );
  return byReading ? parseEntry(byReading) : null;
}

export function searchWords(query: string, limit = 20): DictEntry[] {
  const d = getDb();
  const rows = d.getAllSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE word LIKE ? ORDER BY length(word) ASC LIMIT ?',
    [`%${query}%`, limit],
  );
  return rows.map(parseEntry);
}

export function ftsSearch(query: string, limit = 20): DictEntry[] {
  if (!ftsBuilt) return searchWords(query, limit); // fallback while FTS not ready

  const d = getDb();
  const safe = query.replace(/[*"]/g, '');
  try {
    const rows = d.getAllSync<{ id: number; word: string; reading: string; pos: string; gloss: string }>(
      `SELECT e.id, e.word, e.reading, e.pos, e.gloss
       FROM entries_fts f JOIN entries e ON e.id = f.rowid
       WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`,
      [`"${safe}"`, limit],
    );
    return rows.map(parseEntry);
  } catch {
    return searchWords(query, limit);
  }
}

/**
 * Longest-match recursive lookup for arbitrary Japanese text.
 *
 * Decomposes text into dictionary-matched words using a right-to-left
 * shortening strategy — essential for Japanese where conjugations change
 * the word ending (e.g., surface "待っ" vs. dictionary "待つ").
 *
 * Three-phase lookup per position:
 *   Phase 1 (exact):     try exact match on word/reading columns
 *   Phase 2 (prefix):    try entries WHERE word LIKE sub||'%'
 *                        (headword STARTS WITH the queried substring)
 *   Phase 3 (substring): try entries WHERE word LIKE '%'||sub||'%'
 *                        filtered to only accept partial-word overlap that
 *                        shares ≥50% of the headword's characters
 *
 * Returns deduplicated array of DictEntry; empty if nothing found.
 */
export function lookupText(text: string): DictEntry[] {
  if (!text || text.trim().length === 0) return [];

  const results: DictEntry[] = [];
  const seen = new Set<number>(); // dedup by entry id
  let i = 0;
  const len = text.length;

  while (i < len) {
    let found = false;

    // Phase 1: longest exact match from the right
    for (let j = len; j > i; j--) {
      const sub = text.slice(i, j);
      const entry = lookupWord(sub);
      if (entry && !seen.has(entry.id)) {
        results.push(entry);
        seen.add(entry.id);
        i = j;
        found = true;
        break;
      }
    }

    if (found) continue;

    // Phase 2: prefix match — headword STARTS WITH the query substring.
    // This catches inflected forms where the dictionary form is longer
    // (e.g., query "食べ" matches "食べる").
    for (let j = len; j > i; j--) {
      const sub = text.slice(i, j);
      if (sub.length < 1) continue;
      const matches = prefixSearch(sub, 5);
      if (matches.length > 0) {
        // Prefer the shortest headword that matches
        const best = pickBestMatch(matches, seen);
        if (best) {
          results.push(best);
          seen.add(best.id);
        }
        i = j;
        found = true;
        break;
      }
    }

    if (found) continue;

    // Phase 3: substring match — headword CONTAINS the query.
    // Only accept if the match is close: query shares ≥50% of the
    // headword's characters. This prevents matching 教室 when
    // querying single char 室 (only 1/2 = 50%, borderline reject
    // for single-char queries where len < 2).
    for (let j = len; j > i; j--) {
      const sub = text.slice(i, j);
      if (sub.length < 1) continue;
      const matches = searchWords(sub, 5);
      if (matches.length > 0) {
        // Filter: only accept if the query is a significant part of the headword.
        // Single-char queries are too ambiguous — require start/end match.
        const relevant = matches.filter((m) => {
          // Headword starts or ends with the query (strong signal)
          if (m.word.startsWith(sub) || m.word.endsWith(sub)) return true;
          // For multi-char queries: query is at least half the headword length
          if (sub.length >= 2 && sub.length >= m.word.length * 0.5) return true;
          return false;
        });
        if (relevant.length > 0) {
          const best = pickBestMatch(relevant, seen);
          if (best) {
            results.push(best);
            seen.add(best.id);
          }
          i = j;
          found = true;
          break;
        }
      }
    }

    if (found) continue;

    // Phase 4: skip one character
    i++;
  }

  return results;
}

export function getEntryCount(): number {
  const d = getDb();
  const row = d.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM entries');
  return row?.cnt ?? 0;
}

/** Get stored dictionary version (0 if none). */
export function getDictVersion(): number {
  try {
    const d = getDb();
    const row = d.getFirstSync<{ value: string }>(
      "SELECT value FROM dict_meta WHERE key = 'version'",
    );
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

/** Store dictionary version. */
export function setDictVersion(version: number): void {
  try {
    const d = getDb();
    d.runSync(
      "INSERT OR REPLACE INTO dict_meta (key, value) VALUES ('version', ?)",
      [String(version)],
    );
  } catch {
    // Non-critical
  }
}

/** Clear all entries and FTS index (for re-import). */
export function clearEntries(): void {
  const d = getDb();
  d.execSync('DELETE FROM entries;');
  d.execSync('DELETE FROM entries_fts;');
}

export function batchInsertEntries(
  entries: Array<{ word: string; reading: string; pos: string; gloss: string }>,
  onProgress?: (done: number, total: number) => void,
): void {
  const d = getDb();
  const total = entries.length;

  // Drop the AFTER INSERT trigger during bulk insert — per-row trigger
  // fires are ~10x slower than a single bulk INSERT...SELECT afterwards.
  d.execSync('DROP TRIGGER IF EXISTS entries_ai;');

  d.execSync('BEGIN TRANSACTION;');
  for (let i = 0; i < total; i++) {
    const e = entries[i];
    d.runSync('INSERT INTO entries (word, reading, pos, gloss) VALUES (?, ?, ?, ?)',
      [e.word, e.reading, e.pos, e.gloss]);
    if (onProgress && i % 1000 === 0) onProgress(i + 1, total);
  }
  d.execSync('COMMIT;');

  // Re-create the trigger for future inserts
  d.execSync(`CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, word, reading, gloss)
    VALUES (new.id, new.word, new.reading, new.gloss);
  END;`);

  onProgress?.(total, total);
}

/** LIKE-based search where headword STARTS WITH the query. */
function prefixSearch(query: string, limit = 20): DictEntry[] {
  const d = getDb();
  const rows = d.getAllSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE word LIKE ? ORDER BY length(word) ASC LIMIT ?',
    [`${query}%`, limit],
  );
  return rows.map(parseEntry);
}

/** Pick the best match from a list — shortest unseen headword. */
function pickBestMatch(matches: DictEntry[], seen: Set<number>): DictEntry | null {
  const unseen = matches.filter((m) => !seen.has(m.id));
  if (unseen.length === 0) return null;
  return unseen.reduce((a, b) => (a.word.length <= b.word.length ? a : b));
}

function parseEntry(row: any): DictEntry {
  return {
    id: row.id, word: row.word, reading: row.reading,
    pos: row.pos ? row.pos.split(',') : [],
    gloss: row.gloss ? row.gloss.split(';') : [],
  };
}
