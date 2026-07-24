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
let lookupIndexesEnsured = false;

const LOOKUP_CACHE_LIMIT = 512;
const PREFIX_CACHE_LIMIT = 256;
const wordLookupCache = new Map<string, DictEntry | null>();
const prefixLookupCache = new Map<string, DictEntry[]>();

export interface TextLookupMatch {
  text: string;
  start: number;
  end: number;
  entry: DictEntry;
  source: 'exact' | 'prefix';
}

interface TextLookupCandidate {
  text: string;
  start: number;
  end: number;
}

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

export function ensureLookupIndexes(): void {
  if (lookupIndexesEnsured) return;
  const d = getDb();
  d.execSync('CREATE INDEX IF NOT EXISTS idx_entries_word ON entries(word);');
  d.execSync('CREATE INDEX IF NOT EXISTS idx_entries_reading ON entries(reading);');
  lookupIndexesEnsured = true;
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
  const cached = getLru(wordLookupCache, word);
  if (cached !== undefined) return cached;

  const d = getDb();
  const exact = d.getFirstSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE word = ? LIMIT 1',
    [word],
  );
  if (exact) {
    const entry = parseEntry(exact);
    setLru(wordLookupCache, word, entry, LOOKUP_CACHE_LIMIT);
    return entry;
  }

  const byReading = d.getFirstSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE reading = ? LIMIT 1',
    [word],
  );
  const entry = byReading ? parseEntry(byReading) : null;
  setLru(wordLookupCache, word, entry, LOOKUP_CACHE_LIMIT);
  return entry;
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

export function lookupLongestTextMatchAt(
  text: string,
  charIndex: number,
  maxCandidateLength = 12,
): TextLookupMatch | null {
  if (!text || charIndex < 0 || charIndex >= text.length) return null;
  if (isLookupBoundary(text[charIndex])) return null;

  const span = getLookupSpan(text, charIndex, maxCandidateLength);
  if (!span) return null;

  const candidates = getCoveringCandidates(text, charIndex, span, maxCandidateLength);

  const exactMatch = lookupFirstCandidate(candidates);
  if (exactMatch) {
    return { ...exactMatch.candidate, entry: exactMatch.entry, source: 'exact' };
  }

  for (const candidate of candidates) {
    if (candidate.text.length < 2) continue;
    const entry = pickLongestMatch(prefixSearch(candidate.text, 5), new Set<number>());
    if (entry) {
      return { ...candidate, entry, source: 'prefix' };
    }
  }

  return null;
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
  clearLookupCaches();
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
  const cacheKey = `${query}\u0000${limit}`;
  const cached = getLru(prefixLookupCache, cacheKey);
  if (cached !== undefined) return cached;

  const d = getDb();
  const rows = d.getAllSync<DictEntry>(
    'SELECT id, word, reading, pos, gloss FROM entries WHERE word >= ? AND word < ? ORDER BY length(word) ASC LIMIT ?',
    [query, getPrefixUpperBound(query), limit],
  );
  const entries = rows.map(parseEntry);
  setLru(prefixLookupCache, cacheKey, entries, PREFIX_CACHE_LIMIT);
  return entries;
}

function lookupFirstCandidate(
  candidates: TextLookupCandidate[],
): { candidate: TextLookupCandidate; entry: DictEntry } | null {
  const uniqueTexts = [...new Set(candidates.map((candidate) => candidate.text))];
  const entriesByText = new Map<string, DictEntry | null>();
  const missingTexts: string[] = [];

  for (const text of uniqueTexts) {
    const cached = getLru(wordLookupCache, text);
    if (cached !== undefined) {
      entriesByText.set(text, cached);
    } else {
      missingTexts.push(text);
    }
  }

  if (missingTexts.length > 0) {
    const exactByWord = selectFirstEntriesByColumn('word', missingTexts);
    const missingReadingTexts = missingTexts.filter((text) => !exactByWord.has(text));
    const exactByReading = missingReadingTexts.length > 0
      ? selectFirstEntriesByColumn('reading', missingReadingTexts)
      : new Map<string, DictEntry>();

    for (const text of missingTexts) {
      const entry = exactByWord.get(text) ?? exactByReading.get(text) ?? null;
      entriesByText.set(text, entry);
      setLru(wordLookupCache, text, entry, LOOKUP_CACHE_LIMIT);
    }
  }

  for (const candidate of candidates) {
    const entry = entriesByText.get(candidate.text);
    if (entry) return { candidate, entry };
  }

  return null;
}

function selectFirstEntriesByColumn(
  column: 'word' | 'reading',
  values: string[],
): Map<string, DictEntry> {
  if (values.length === 0) return new Map();

  const d = getDb();
  const placeholders = values.map(() => '?').join(', ');
  const rows = d.getAllSync<DictEntry>(
    `SELECT id, word, reading, pos, gloss FROM entries WHERE ${column} IN (${placeholders}) ORDER BY id ASC`,
    values,
  );

  const entries = new Map<string, DictEntry>();
  for (const row of rows) {
    const key = String(row[column] ?? '');
    if (!entries.has(key)) entries.set(key, parseEntry(row));
  }
  return entries;
}

/** Pick the best match from a list — shortest unseen headword. */
function pickBestMatch(matches: DictEntry[], seen: Set<number>): DictEntry | null {
  const unseen = matches.filter((m) => !seen.has(m.id));
  if (unseen.length === 0) return null;
  return unseen.reduce((a, b) => (a.word.length <= b.word.length ? a : b));
}

function pickLongestMatch(matches: DictEntry[], seen: Set<number>): DictEntry | null {
  const unseen = matches.filter((m) => !seen.has(m.id));
  if (unseen.length === 0) return null;
  return unseen.reduce((a, b) => (a.word.length >= b.word.length ? a : b));
}

function parseEntry(row: any): DictEntry {
  return {
    id: row.id, word: row.word, reading: row.reading,
    pos: row.pos ? row.pos.split(',') : [],
    gloss: row.gloss ? row.gloss.split(';') : [],
  };
}

function getPrefixUpperBound(query: string): string {
  const chars = Array.from(query);
  if (chars.length === 0) return '\u{10ffff}';

  const last = chars[chars.length - 1];
  const codePoint = last.codePointAt(0);
  if (codePoint === undefined || codePoint >= 0x10ffff) return `${query}\u{10ffff}`;

  chars[chars.length - 1] = String.fromCodePoint(codePoint + 1);
  return chars.join('');
}

function getLru<K, V>(cache: Map<K, V>, key: K): V | undefined {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key)!;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setLru<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function clearLookupCaches(): void {
  wordLookupCache.clear();
  prefixLookupCache.clear();
}

function isLookupBoundary(char: string): boolean {
  return /[\s！？。、，．…「」『』（）［］【】《》〈〉・･,.;:!?()[\]{}"'`~―\-]/u.test(char);
}

function getLookupSpan(
  text: string,
  charIndex: number,
  maxCandidateLength: number,
): { start: number; end: number } | null {
  let start = charIndex;
  let end = charIndex + 1;

  while (start > 0 && !isLookupBoundary(text[start - 1])) start--;
  while (end < text.length && !isLookupBoundary(text[end])) end++;

  const limitedStart = Math.max(start, charIndex - maxCandidateLength + 1);
  const limitedEnd = Math.min(end, charIndex + maxCandidateLength);
  if (limitedStart >= limitedEnd) return null;
  return { start: limitedStart, end: limitedEnd };
}

function getCoveringCandidates(
  text: string,
  charIndex: number,
  span: { start: number; end: number },
  maxCandidateLength: number,
): Array<{ text: string; start: number; end: number }> {
  const candidates: Array<{ text: string; start: number; end: number }> = [];
  const maxLength = Math.min(maxCandidateLength, span.end - span.start);

  for (let length = maxLength; length >= 1; length--) {
    const minStart = Math.max(span.start, charIndex - length + 1);
    const maxStart = Math.min(charIndex, span.end - length);
    for (let start = minStart; start <= maxStart; start++) {
      const end = start + length;
      const candidateText = text.slice(start, end).trim();
      if (!candidateText || candidateText.length !== length) continue;
      candidates.push({ text: candidateText, start, end });
    }
  }

  return candidates;
}
