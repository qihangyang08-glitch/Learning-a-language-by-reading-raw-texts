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

/** Page turn gesture thresholds (fraction of gesture-zone dimensions) */
export const SWIPE_VERTICAL_THRESHOLD = 0.15;
export const SWIPE_HORIZONTAL_THRESHOLD = 0.2;

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

/** Sentence window size (loaded around current position for memory efficiency) */
export const SENTENCE_WINDOW_RADIUS = 50; // load ±50 sentences around current

/** Design system colors — minimal, warm, Japanese-reading focused */
export const Colors = {
  // Surfaces
  bg: '#faf9f6',           // rice-paper beige
  card: '#ffffff',         // clean white
  cardHover: '#f8f7f4',   // subtle warm hover

  // Text
  textPrimary: '#2c2c2c',
  textSecondary: '#6b6b6b',
  textTertiary: '#a0a0a0',

  // Accent
  accent: '#5b8cb8',       // muted blue
  accentLight: '#eaf2f8',

  // Divider
  divider: '#e8e5df',      // warm light divider

  // Shadows
  shadow: 'rgba(0,0,0,0.06)',
  shadowMedium: 'rgba(0,0,0,0.10)',

  // Frosted glass top bar
  frostBg: 'rgba(250,249,246,0.85)',
  frostBorder: 'rgba(0,0,0,0.06)',
};
