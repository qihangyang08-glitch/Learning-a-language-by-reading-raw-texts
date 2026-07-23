import { create } from 'zustand';
import type { Sentence } from '../types/book';
import type { HandMode } from '../utils/constants';
import { DEFAULT_FONT_SIZE } from '../utils/constants';

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
  currentTranslation: string | null;
  translationLoading: boolean;
  /** Pre-loaded cached translations for current window (sentenceIndex → text) */
  translationCache: Map<number, string>;

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
  setIsReading: (reading: boolean) => void;
  showLookupResult: (word: string, result: any, allResults?: any[]) => void;
  hideLookupResult: () => void;
  setTranslation: (translation: string | null, loading: boolean) => void;
  mergeTranslationCache: (cache: Map<number, string>) => void;
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
  currentTranslation: null,
  translationLoading: false,
  translationCache: new Map(),

  openBook: (bookId, sentences, total, chapterImages = {}, translationCache) =>
    set({
      bookId,
      sentences,
      chapterImages,
      currentIndex: sentences.length > 0 ? 0 : 0,
      totalSentences: total,
      windowBase: 0,
      showResult: false,
      currentTranslation: null,
      translationLoading: false,
      lookupResults: [],
      translationCache: translationCache ?? new Map(),
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
      translationCache: new Map(),
    }),

  goToSentence: (index) => {
    const state = get();
    const total = state.totalSentences;
    const clamped = Math.max(0, Math.min(index, total - 1));

    // Auto-populate translation from cache if available
    const cached = state.translationCache.get(clamped);
    set({
      currentIndex: clamped,
      showResult: false,
      currentTranslation: cached ?? null,
      showTranslation: !!cached,
    });
  },

  nextSentence: () => {
    const { currentIndex, totalSentences, translationCache } = get();
    if (currentIndex < totalSentences - 1) {
      const next = currentIndex + 1;
      const cached = translationCache.get(next);
      set({
        currentIndex: next,
        showResult: false,
        currentTranslation: cached ?? null,
        showTranslation: !!cached,
      });
    }
  },

  prevSentence: () => {
    const { currentIndex, translationCache } = get();
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      const cached = translationCache.get(prev);
      set({
        currentIndex: prev,
        showResult: false,
        currentTranslation: cached ?? null,
        showTranslation: !!cached,
      });
    }
  },

  setHandMode: (handMode) => set({ handMode }),
  setFontSize: (fontSize) => set({ fontSize }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setLandscape: (isLandscape) => set({ isLandscape }),
  toggleTranslation: () => set((s) => ({ showTranslation: !s.showTranslation })),
  setIsReading: (isReading) => set({ isReading }),

  setTranslation: (currentTranslation, translationLoading) =>
    set({ currentTranslation, translationLoading }),

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
}));
