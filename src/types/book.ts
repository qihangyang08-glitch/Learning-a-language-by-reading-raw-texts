/**
 * Book-related type definitions for JaReader.
 */

/** Supported book file formats */
export type BookFormat = 'txt' | 'epub';

/** Book metadata stored in SQLite */
export interface BookMeta {
  id: string;           // UUID
  title: string;
  author: string;
  format: BookFormat;
  filePath: string;     // path in app's Books/ directory
  coverPath?: string;   // extracted cover image path
  totalSentences: number;
  currentSentence: number; // 0-indexed reading position
  importedAt: number;   // timestamp
  lastReadAt?: number;  // timestamp
}

/** A single parsed sentence segment */
export interface Sentence {
  index: number;        // global sentence index (0-based)
  chapterIndex: number; // chapter number (0-based)
  sentenceIndex: number;// sentence number within chapter (0-based)
  text: string;         // raw text content
  tokens?: Token[];     // tiny-segmenter tokens (lazy-computed at read time)
}

/** An inline image extracted from the book */
export interface BookImage {
  id: string;           // unique id for this image
  filePath: string;     // local filesystem path
  mimeType: string;     // e.g. "image/jpeg", "image/png"
  position: number;     // character position in the chapter raw text
  alt?: string;         // alt text from <img> tag
}

/** A parsed chapter (from epub spine or txt split) */
export interface Chapter {
  index: number;
  title?: string;
  sentences: Sentence[];
  images?: BookImage[];  // inline images within this chapter
}

/** Parsed book content */
export interface BookContent {
  meta: {
    title: string;
    author: string;
    format: BookFormat;
    coverData?: string; // base64 or file path
  };
  chapters: Chapter[];
  totalSentences: number;
}

/** Kuromoji token result */
export interface Token {
  surfaceForm: string;       // 表層形
  reading?: string;          // 読み
  baseForm: string;          // 原形
  pos: string;               // 品詞
  wordPosition: number;      // character offset
  wordType?: string;         // 品詞細分類
}

/** Dictionary entry from JMdict */
export interface DictEntry {
  id: number;
  word: string;         // 見出し語
  reading: string;      // 読み
  pos: string[];        // 品詞
  gloss: string[];      // 中国語の意味
}

/** Book import progress */
export interface ImportProgress {
  stage: 'parsing' | 'segmenting' | 'storing' | 'done' | 'error';
  progress: number;     // 0-1
  message: string;
}

/** Import status for placeholder book entry */
export type ImportStatus = 'processing' | 'done' | 'error';

/** Cached translation (stored in SQLite, keyed by book+sentence) */
export interface TranslationCache {
  id?: number;
  bookId: string;
  sentenceIndex: number;
  translated: string;
  createdAt: number;
}

/** Manual screen orientation (user toggle, not auto) */
export type ManualOrientation = 'portrait' | 'landscape';

/** Bookmark entry */
export interface Bookmark {
  id?: number;
  bookId: string;
  sentenceIndex: number;
  createdAt: number;
}
