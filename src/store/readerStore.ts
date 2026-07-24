import { create } from 'zustand';
import type { Sentence } from '../types/book';
import type { RomajiResult } from '../services/romaji';
import type { HandMode } from '../utils/constants';
import { DEFAULT_FONT_SIZE } from '../utils/constants';

export type TranslationDisplayState = 'hidden' | 'current' | 'stale';
export type RomajiDisplayState = 'hidden' | 'loading' | 'current' | 'stale' | 'error';

function getTranslationState(
  visible: boolean,
  sentenceIndex: number | null,
  currentIndex: number,
): TranslationDisplayState {
  if (!visible || sentenceIndex === null) return 'hidden';
  return sentenceIndex === currentIndex ? 'current' : 'stale';
}

function getRomajiState(
  visible: boolean,
  sentenceIndex: number | null,
  currentIndex: number,
  loading: boolean,
  error: string | null,
): RomajiDisplayState {
  if (!visible || sentenceIndex === null) return 'hidden';
  if (sentenceIndex !== currentIndex) return 'stale';
  if (loading) return 'loading';
  if (error) return 'error';
  return 'current';
}

interface ReaderStoreState {
  // Book identity
  bookId: string | null;

  // Sentence state (window-based: only ±WINDOW around current)
  sentences: Sentence[];
  currentIndex: number;
  totalSentences: number;
  /** Base index of the current window in the full sentence list */
  windowBase: number;

  // Chapter images (from EPUB)
  chapterImages: Record<number, any[]>; // chapterIndex → BookImage[]

  // Display settings
  handMode: HandMode;
  fontSize: number;
  lineHeight: number;
  isLandscape: boolean;
  showTranslation: boolean;

  // TTS state
  isReading: boolean;

  // Dictionary
  selectedWord: string | null;
  lookupResult: any | null;
  lookupResults: any[];        // multi-word results from lookupText()
  showResult: boolean;

  // Translation
  translationState: TranslationDisplayState;
  translationSentenceIndex: number | null;
  currentTranslation: string | null;
  translationLoading: boolean;
  /** Pre-loaded cached translations for current window (sentenceIndex → text) */
  translationCache: Map<number, string>;

  // Romaji annotation
  romajiState: RomajiDisplayState;
  romajiSentenceIndex: number | null;
  currentRomaji: RomajiResult | null;
  romajiLoading: boolean;
  romajiError: string | null;
  romajiCache: Map<string, RomajiResult>;

  // Actions
  openBook: (bookId: string, sentences: Sentence[], total: number, chapterImages?: Record<number, any[]>, translationCache?: Map<number, string>) => void;
  appendWindow: (sentences: Sentence[], base: number, translationCache?: Map<number, string>) => void;
  closeBook: () => void;
  goToSentence: (index: number) => void;
  nextSentence: () => void;
  prevSentence: () => void;
  setHandMode: (mode: HandMode) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setLandscape: (landscape: boolean) => void;
  toggleTranslation: () => void;
  hideTranslation: () => void;
  setIsReading: (reading: boolean) => void;
  showLookupResult: (word: string, result: any, allResults?: any[]) => void;
  hideLookupResult: () => void;
  setTranslation: (translation: string | null, loading: boolean, sentenceIndex?: number) => void;
  mergeTranslationCache: (cache: Map<number, string>) => void;
  setRomaji: (romaji: RomajiResult | null, loading: boolean, sentenceIndex?: number, error?: string | null) => void;
  hideRomaji: () => void;
  mergeRomajiCache: (cache: Map<string, RomajiResult>) => void;
}

export const useReaderStore = create<ReaderStoreState>((set, get) => ({
  bookId: null,
  sentences: [],
  currentIndex: 0,
  totalSentences: 0,
  windowBase: 0,
  chapterImages: {},
  handMode: 'both',
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: 1.6,
  isLandscape: false,
  showTranslation: false,
  isReading: false,
  selectedWord: null,
  lookupResult: null,
  lookupResults: [],
  showResult: false,
  translationState: 'hidden',
  translationSentenceIndex: null,
  currentTranslation: null,
  translationLoading: false,
  translationCache: new Map(),
  romajiState: 'hidden',
  romajiSentenceIndex: null,
  currentRomaji: null,
  romajiLoading: false,
  romajiError: null,
  romajiCache: new Map(),

  openBook: (bookId, sentences, total, chapterImages = {}, translationCache) =>
    set({
      bookId,
      sentences,
      chapterImages,
      currentIndex: sentences.length > 0 ? 0 : 0,
      totalSentences: total,
      windowBase: 0,
      showResult: false,
      showTranslation: false,
      translationState: 'hidden',
      translationSentenceIndex: null,
      currentTranslation: null,
      translationLoading: false,
      lookupResults: [],
      translationCache: translationCache ?? new Map(),
      romajiState: 'hidden',
      romajiSentenceIndex: null,
      currentRomaji: null,
      romajiLoading: false,
      romajiError: null,
      romajiCache: new Map(),
    }),

  appendWindow: (sentences, base, translationCache) =>
    set((s) => {
      // Merge sentences
      const map = new Map<number, Sentence>();
      for (const sent of s.sentences) map.set(sent.index, sent);
      for (const sent of sentences) map.set(sent.index, sent);
      const merged = Array.from(map.values()).sort((a, b) => a.index - b.index);

      // Merge translation cache
      const mergedCache = new Map(s.translationCache);
      if (translationCache) {
        for (const [k, v] of translationCache) mergedCache.set(k, v);
      }

      return { sentences: merged, windowBase: base, translationCache: mergedCache };
    }),

  closeBook: () =>
    set({
      bookId: null,
      sentences: [],
      currentIndex: 0,
      totalSentences: 0,
      windowBase: 0,
      showResult: false,
      isReading: false,
      showTranslation: false,
      translationState: 'hidden',
      translationSentenceIndex: null,
      currentTranslation: null,
      translationLoading: false,
      translationCache: new Map(),
      romajiState: 'hidden',
      romajiSentenceIndex: null,
      currentRomaji: null,
      romajiLoading: false,
      romajiError: null,
      romajiCache: new Map(),
    }),

  goToSentence: (index) => {
    const state = get();
    const total = state.totalSentences;
    const clamped = Math.max(0, Math.min(index, total - 1));

    set({
        currentIndex: clamped,
        showResult: false,
        translationState: getTranslationState(state.showTranslation, state.translationSentenceIndex, clamped),
        romajiState: getRomajiState(
          state.romajiState !== 'hidden',
          state.romajiSentenceIndex,
          clamped,
          state.romajiLoading,
          state.romajiError,
        ),
      });
  },

  nextSentence: () => {
    const state = get();
    const { currentIndex, totalSentences } = state;
    if (currentIndex < totalSentences - 1) {
      const next = currentIndex + 1;
      set({
        currentIndex: next,
        showResult: false,
        translationState: getTranslationState(state.showTranslation, state.translationSentenceIndex, next),
        romajiState: getRomajiState(
          state.romajiState !== 'hidden',
          state.romajiSentenceIndex,
          next,
          state.romajiLoading,
          state.romajiError,
        ),
      });
    }
  },

  prevSentence: () => {
    const state = get();
    const { currentIndex } = state;
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      set({
        currentIndex: prev,
        showResult: false,
        translationState: getTranslationState(state.showTranslation, state.translationSentenceIndex, prev),
        romajiState: getRomajiState(
          state.romajiState !== 'hidden',
          state.romajiSentenceIndex,
          prev,
          state.romajiLoading,
          state.romajiError,
        ),
      });
    }
  },

  setHandMode: (handMode) => set({ handMode }),
  setFontSize: (fontSize) => set({ fontSize }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setLandscape: (isLandscape) => set({ isLandscape }),
  toggleTranslation: () => set((s) => {
    if (s.translationState === 'current') {
      return {
        showTranslation: false,
        translationState: 'hidden',
        translationSentenceIndex: null,
        currentTranslation: null,
        translationLoading: false,
      };
    }

    return {
      showTranslation: true,
      translationState: 'current',
      translationSentenceIndex: s.currentIndex,
      currentTranslation: null,
      translationLoading: false,
    };
  }),
  hideTranslation: () =>
    set({
      showTranslation: false,
      translationState: 'hidden',
      translationSentenceIndex: null,
      currentTranslation: null,
      translationLoading: false,
    }),
  hideRomaji: () =>
    set({
      romajiState: 'hidden',
      romajiSentenceIndex: null,
      currentRomaji: null,
      romajiLoading: false,
      romajiError: null,
    }),
  setIsReading: (isReading) => set({ isReading }),

  setTranslation: (currentTranslation, translationLoading, sentenceIndex) =>
    set((s) => {
      const targetIndex = sentenceIndex ?? s.translationSentenceIndex ?? s.currentIndex;
      return {
        showTranslation: true,
        translationState: getTranslationState(true, targetIndex, s.currentIndex),
        translationSentenceIndex: targetIndex,
        currentTranslation,
        translationLoading,
      };
    }),

  showLookupResult: (selectedWord, lookupResult, lookupResults = []) =>
    set({ selectedWord, lookupResult, lookupResults, showResult: true }),

  hideLookupResult: () =>
    set({ selectedWord: null, lookupResult: null, lookupResults: [], showResult: false }),

  mergeTranslationCache: (cache) =>
    set((s) => {
      const merged = new Map(s.translationCache);
      for (const [k, v] of cache) merged.set(k, v);
      return { translationCache: merged };
    }),

  setRomaji: (currentRomaji, romajiLoading, sentenceIndex, error = null) =>
    set((s) => {
      const targetIndex = sentenceIndex ?? s.romajiSentenceIndex ?? s.currentIndex;
      return {
        romajiState: getRomajiState(true, targetIndex, s.currentIndex, romajiLoading, error),
        romajiSentenceIndex: targetIndex,
        currentRomaji,
        romajiLoading,
        romajiError: error,
      };
    }),

  mergeRomajiCache: (cache) =>
    set((s) => {
      const merged = new Map(s.romajiCache);
      for (const [k, v] of cache) merged.set(k, v);
      return { romajiCache: merged };
    }),
}));
