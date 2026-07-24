import * as SQLite from 'expo-sqlite';
import type { BookMeta, Sentence, BookImage, TranslationCache, Bookmark } from '../types/book';
import type { RomajiResult } from './romaji';
import { DB_NAME, SENTENCE_WINDOW_RADIUS } from '../utils/constants';

/**
 * Persistent bookshelf backed by SQLite.
 *
 * Tables:
 * - books: metadata
 * - sentences: sentence text indexed by (book_id, global_index)
 * - chapter_images: extracted images
 * - translation_cache: DeepSeek translations keyed by (book_id, sentence_index)
 * - romaji_cache: LLM romaji annotations keyed by (book_id, sentence_index, source_hash)
 * - bookmarks: user bookmarks
 */

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync(DB_NAME);
  return db;
}

// ── Schema ──

export function initBookshelfTables(): void {
  const d = getDb();
  d.execSync(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      file_path TEXT NOT NULL,
      total_sentences INTEGER NOT NULL DEFAULT 0,
      current_sentence INTEGER NOT NULL DEFAULT 0,
      imported_at INTEGER NOT NULL,
      last_read_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      sentence_index INTEGER NOT NULL,
      global_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sentences_book ON sentences(book_id, global_index);

    CREATE TABLE IF NOT EXISTS chapter_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      image_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      alt TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_images_book ON chapter_images(book_id, chapter_index);

    CREATE TABLE IF NOT EXISTS translation_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      translated TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trans_book ON translation_cache(book_id, sentence_index);

    CREATE TABLE IF NOT EXISTS romaji_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      items_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_romaji_unique ON romaji_cache(book_id, sentence_index, source_hash);
    CREATE INDEX IF NOT EXISTS idx_romaji_book ON romaji_cache(book_id, sentence_index);

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bm_book ON bookmarks(book_id, sentence_index);
  `);
}

// ── Books ──

export function loadBooks(): BookMeta[] {
  initBookshelfTables();
  const d = getDb();
  const rows = d.getAllSync<{
    id: string; title: string; author: string; format: string;
    file_path: string; total_sentences: number; current_sentence: number;
    imported_at: number; last_read_at: number | null;
  }>('SELECT * FROM books ORDER BY last_read_at DESC, imported_at DESC');

  return rows.map((r) => ({
    id: r.id, title: r.title, author: r.author,
    format: r.format as BookMeta['format'],
    filePath: r.file_path,
    totalSentences: r.total_sentences,
    currentSentence: r.current_sentence,
    importedAt: r.imported_at,
    lastReadAt: r.last_read_at ?? undefined,
  }));
}

export function insertBook(book: BookMeta): void {
  const d = getDb();
  d.runSync(
    `INSERT OR REPLACE INTO books (id, title, author, format, file_path,
      total_sentences, current_sentence, imported_at, last_read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [book.id, book.title, book.author, book.format,
     book.filePath, book.totalSentences, book.currentSentence,
     book.importedAt, book.lastReadAt ?? null],
  );
}

export function updateProgress(bookId: string, currentSentence: number, totalSentences: number): void {
  getDb().runSync(
    `UPDATE books SET current_sentence = ?, total_sentences = ?, last_read_at = ? WHERE id = ?`,
    [currentSentence, totalSentences, Date.now(), bookId],
  );
}

export function deleteBook(bookId: string): void {
  const d = getDb();
  d.runSync('DELETE FROM sentences WHERE book_id = ?', [bookId]);
  d.runSync('DELETE FROM chapter_images WHERE book_id = ?', [bookId]);
  d.runSync('DELETE FROM translation_cache WHERE book_id = ?', [bookId]);
  d.runSync('DELETE FROM romaji_cache WHERE book_id = ?', [bookId]);
  d.runSync('DELETE FROM bookmarks WHERE book_id = ?', [bookId]);
  d.runSync('DELETE FROM books WHERE id = ?', [bookId]);
}

// ── Sentences (import + window-loading) ──

/**
 * Store all sentences for a book — chunked to avoid blocking the UI thread.
 *
 * Large books (5000+ sentences) would previously freeze the app for 10-30s
 * during synchronous SQLite transactions, triggering ANR kills on Android.
 * Now inserts in chunks of 500 with event-loop yields between chunks.
 */
export async function storeSentences(bookId: string, sentences: Sentence[]): Promise<void> {
  initBookshelfTables();
  const d = getDb();
  d.runSync('DELETE FROM sentences WHERE book_id = ?', [bookId]);

  const CHUNK = 500;
  for (let i = 0; i < sentences.length; i += CHUNK) {
    const chunk = sentences.slice(i, i + CHUNK);
    d.execSync('BEGIN TRANSACTION');
    const stmt = d.prepareSync(
      'INSERT INTO sentences (book_id, chapter_index, sentence_index, global_index, text) VALUES (?, ?, ?, ?, ?)',
    );
    for (const s of chunk) {
      stmt.executeSync([bookId, s.chapterIndex, s.sentenceIndex, s.index, s.text]);
    }
    stmt.finalizeSync();
    d.execSync('COMMIT');
    // Yield to the UI thread between chunks
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Get total sentence count for a book (without loading them). */
export function getSentenceCount(bookId: string): number {
  const row = getDb().getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sentences WHERE book_id = ?',
    [bookId],
  );
  return row?.cnt ?? 0;
}

/** Load a window of sentences around a given index (memory-efficient). */
export function loadSentenceWindow(bookId: string, centerIndex: number): Sentence[] {
  const radius = SENTENCE_WINDOW_RADIUS;
  const start = Math.max(0, centerIndex - radius);
  const end = centerIndex + radius;

  const rows = getDb().getAllSync<{
    chapter_index: number; sentence_index: number; global_index: number; text: string;
  }>(
    `SELECT chapter_index, sentence_index, global_index, text
     FROM sentences WHERE book_id = ? AND global_index >= ? AND global_index <= ?
     ORDER BY global_index`,
    [bookId, start, end],
  );

  return rows.map((r) => ({
    index: r.global_index,
    chapterIndex: r.chapter_index,
    sentenceIndex: r.sentence_index,
    text: r.text,
  }));
}

/** Load all sentences (used for outline/nav with short preview text). */
export function loadAllSentencePreviews(bookId: string, maxLength = 60): Array<{ index: number; chapterIndex: number; sentenceIndex: number; preview: string }> {
  const rows = getDb().getAllSync<{
    chapter_index: number; sentence_index: number; global_index: number; text: string;
  }>('SELECT chapter_index, sentence_index, global_index, text FROM sentences WHERE book_id = ? ORDER BY global_index', [bookId]);

  return rows.map((r) => ({
    index: r.global_index,
    chapterIndex: r.chapter_index,
    sentenceIndex: r.sentence_index,
    preview: r.text.length > maxLength ? r.text.slice(0, maxLength) + '…' : r.text,
  }));
}

/** Paginated sentence loading for outline — loads only chapter-level grouping info. */
export function loadChapterGroups(bookId: string): Array<{ chapterIndex: number; count: number; firstIndex: number }> {
  const rows = getDb().getAllSync<{
    chapter_index: number; cnt: number; min_idx: number;
  }>('SELECT chapter_index, COUNT(*) as cnt, MIN(global_index) as min_idx FROM sentences WHERE book_id = ? GROUP BY chapter_index ORDER BY chapter_index', [bookId]);

  return rows.map((r) => ({
    chapterIndex: r.chapter_index,
    count: r.cnt,
    firstIndex: r.min_idx,
  }));
}

/** Load sentence previews for a specific chapter. */
export function loadChapterSentencePreviews(bookId: string, chapterIndex: number, maxLength = 60): Array<{ index: number; sentenceIndex: number; preview: string }> {
  const rows = getDb().getAllSync<{
    global_index: number; sentence_index: number; text: string;
  }>('SELECT global_index, sentence_index, text FROM sentences WHERE book_id = ? AND chapter_index = ? ORDER BY global_index', [bookId, chapterIndex]);

  return rows.map((r) => ({
    index: r.global_index,
    sentenceIndex: r.sentence_index,
    preview: r.text.length > maxLength ? r.text.slice(0, maxLength) + '…' : r.text,
  }));
}

// ── Images ──

export function storeChapterImages(bookId: string, imagesByChapter: Record<number, BookImage[]>): void {
  initBookshelfTables();
  const d = getDb();
  d.runSync('DELETE FROM chapter_images WHERE book_id = ?', [bookId]);

  d.execSync('BEGIN TRANSACTION');
  const stmt = d.prepareSync(
    'INSERT INTO chapter_images (book_id, chapter_index, image_id, file_path, mime_type, position, alt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [chStr, imgs] of Object.entries(imagesByChapter)) {
    const chapterIndex = Number(chStr);
    for (const img of imgs) {
      stmt.executeSync([bookId, chapterIndex, img.id, img.filePath, img.mimeType, img.position, img.alt || '']);
    }
  }
  stmt.finalizeSync();
  d.execSync('COMMIT');
}

export function loadChapterImages(bookId: string): Record<number, BookImage[]> {
  initBookshelfTables();
  const rows = getDb().getAllSync<{
    chapter_index: number; image_id: string; file_path: string;
    mime_type: string; position: number; alt: string;
  }>('SELECT chapter_index, image_id, file_path, mime_type, position, alt FROM chapter_images WHERE book_id = ? ORDER BY chapter_index, position', [bookId]);

  const result: Record<number, BookImage[]> = {};
  for (const r of rows) {
    if (!result[r.chapter_index]) result[r.chapter_index] = [];
    result[r.chapter_index].push({
      id: r.image_id,
      filePath: r.file_path,
      mimeType: r.mime_type,
      position: r.position,
      alt: r.alt,
    });
  }
  return result;
}

// ── Translation Cache ──

export function getCachedTranslation(bookId: string, sentenceIndex: number): string | null {
  initBookshelfTables();
  const row = getDb().getFirstSync<{ translated: string }>(
    'SELECT translated FROM translation_cache WHERE book_id = ? AND sentence_index = ? LIMIT 1',
    [bookId, sentenceIndex],
  );
  return row?.translated ?? null;
}

export function setCachedTranslation(bookId: string, sentenceIndex: number, translated: string): void {
  initBookshelfTables();
  getDb().runSync(
    'INSERT OR REPLACE INTO translation_cache (book_id, sentence_index, translated, created_at) VALUES (?, ?, ?, ?)',
    [bookId, sentenceIndex, translated, Date.now()],
  );
}

/** Batch-load cached translations for a range of sentence indices. */
export function getCachedTranslations(bookId: string, fromIndex: number, toIndex: number): Map<number, string> {
  initBookshelfTables();
  const rows = getDb().getAllSync<{ sentence_index: number; translated: string }>(
    'SELECT sentence_index, translated FROM translation_cache WHERE book_id = ? AND sentence_index >= ? AND sentence_index <= ?',
    [bookId, fromIndex, toIndex],
  );
  const map = new Map<number, string>();
  for (const r of rows) map.set(r.sentence_index, r.translated);
  return map;
}

// ── Romaji Cache ──

export function getCachedRomaji(bookId: string, sentenceIndex: number, sourceHash: string): RomajiResult | null {
  initBookshelfTables();
  const row = getDb().getFirstSync<{ items_json: string }>(
    'SELECT items_json FROM romaji_cache WHERE book_id = ? AND sentence_index = ? AND source_hash = ? LIMIT 1',
    [bookId, sentenceIndex, sourceHash],
  );
  if (!row?.items_json) return null;

  try {
    const parsed = JSON.parse(row.items_json);
    return { items: Array.isArray(parsed?.items) ? parsed.items : [] };
  } catch {
    return null;
  }
}

export function setCachedRomaji(
  bookId: string,
  sentenceIndex: number,
  sourceHash: string,
  romaji: RomajiResult,
): void {
  initBookshelfTables();
  getDb().runSync(
    `INSERT OR REPLACE INTO romaji_cache
      (book_id, sentence_index, source_hash, items_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [bookId, sentenceIndex, sourceHash, JSON.stringify(romaji), Date.now()],
  );
}

// ── Bookmarks ──

export function loadBookmarks(bookId: string): Set<number> {
  initBookshelfTables();
  const rows = getDb().getAllSync<{ sentence_index: number }>(
    'SELECT sentence_index FROM bookmarks WHERE book_id = ?',
    [bookId],
  );
  return new Set(rows.map((r) => r.sentence_index));
}

export function addBookmark(bookId: string, sentenceIndex: number): void {
  initBookshelfTables();
  getDb().runSync(
    'INSERT OR IGNORE INTO bookmarks (book_id, sentence_index, created_at) VALUES (?, ?, ?)',
    [bookId, sentenceIndex, Date.now()],
  );
}

export function removeBookmark(bookId: string, sentenceIndex: number): void {
  getDb().runSync(
    'DELETE FROM bookmarks WHERE book_id = ? AND sentence_index = ?',
    [bookId, sentenceIndex],
  );
}
