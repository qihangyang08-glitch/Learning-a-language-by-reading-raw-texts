/**
 * App-wide constants.
 */

/** Supported format file extensions */
export const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.txt': 'txt',
  '.epub': 'epub',
};

/** Books storage directory name (relative to app documents dir) */
export const BOOKS_DIR = 'Books';

/** Sentence segmentation */
export const MIN_SENTENCE_LENGTH = 2; // chars - shorter segments merged with neighbors
export const MAX_SENTENCE_LENGTH = 500; // chars - force split if exceeded

/** Page turn gesture thresholds (ratio of screen dimension) */
export const SWIPE_VERTICAL_THRESHOLD = 0.2;  // 20% of screen height
export const SWIPE_HORIZONTAL_THRESHOLD = 0.25; // 25% of screen width

/** Page turn animation duration */
export const PAGE_ANIM_DURATION = 300; // ms

/** SQLite database name */
export const DB_NAME = 'jareader.db';

/** Hand mode options */
export type HandMode = 'both' | 'left' | 'right';

/** Font size range */
export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 36;
export const DEFAULT_FONT_SIZE = 22;
