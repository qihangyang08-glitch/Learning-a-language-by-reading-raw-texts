/** Reader-related type definitions */

import type { HandMode } from '../utils/constants';
import type { Sentence } from './book';

/** Romaji annotation layout mode */
export type RomajiLayoutMode = 'phrase' | 'token';

/** Reader screen state */
export interface ReaderState {
  bookId: string;
  currentSentenceIndex: number;
  totalSentences: number;
  sentences: Sentence[];
  handMode: HandMode;
  isReading: boolean;       // TTS active
  showTranslation: boolean;
  translationState?: 'hidden' | 'current' | 'stale';
  translationSentenceIndex?: number | null;
  fontSize: number;
  lineHeight: number;
}

/** Dictionary lookup result for display in ResultBox */
export interface LookupResult {
  word: string;
  reading: string;
  pos: string[];
  gloss: string[];
}
