/**
 * Book-related type definitions for JaReader.
 */

/** Supported book file formats */
export type BookFormat = 'txt' | 'epub' | 'mobi' | 'pdf';

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
  tokens?: Token[];     // kuromoji tokens (lazy-loaded)
}

/** A parsed chapter (from epub spine or txt split) */
export interface Chapter {
  index: number;
  title?: string;
  sentences: Sentence[];
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
