import { create } from 'zustand';
import type { Sentence } from '../types/book';
import type { HandMode } from '../utils/constants';
import { DEFAULT_FONT_SIZE } from '../utils/constants';

interface ReaderStoreState {
  // Book identity
  bookId: string | null;

  // Sentence state
  sentences: Sentence[];
  currentIndex: number;
  totalSentences: number;

  // Display settings
  handMode: HandMode;
  fontSize: number;
  lineHeight: number;
  showTranslation: boolean;

  // TTS state
  isReading: boolean;
  autoAdvance: boolean;

  // Dictionary
  selectedWord: string | null;
  lookupResult: any | null;
  showResult: boolean;

  // Actions
  openBook: (bookId: string, sentences: Sentence[]) => void;
  closeBook: () => void;
  goToSentence: (index: number) => void;
  nextSentence: () => void;
  prevSentence: () => void;
  setHandMode: (mode: HandMode) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  toggleTranslation: () => void;
  setIsReading: (reading: boolean) => void;
  setAutoAdvance: (auto: boolean) => void;
  showLookupResult: (word: string, result: any) => void;
  hideLookupResult: () => void;
}

export const useReaderStore = create<ReaderStoreState>((set, get) => ({
  bookId: null,
  sentences: [],
  currentIndex: 0,
  totalSentences: 0,
  handMode: 'both',
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: 1.6,
  showTranslation: false,
  isReading: false,
  autoAdvance: false,
  selectedWord: null,
  lookupResult: null,
  showResult: false,

  openBook: (bookId, sentences) =>
    set({
      bookId,
      sentences,
      currentIndex: 0,
      totalSentences: sentences.length,
      showResult: false,
    }),

  closeBook: () =>
    set({
      bookId: null,
      sentences: [],
      currentIndex: 0,
      totalSentences: 0,
      showResult: false,
      isReading: false,
    }),

  goToSentence: (index) =>
    set({
      currentIndex: Math.max(0, Math.min(index, get().totalSentences - 1)),
      showResult: false,
    }),

  nextSentence: () => {
    const { currentIndex, totalSentences } = get();
    if (currentIndex < totalSentences - 1) {
      set({ currentIndex: currentIndex + 1, showResult: false });
    }
  },

  prevSentence: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, showResult: false });
    }
  },

  setHandMode: (handMode) => set({ handMode }),
  setFontSize: (fontSize) => set({ fontSize }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  toggleTranslation: () => set((s) => ({ showTranslation: !s.showTranslation })),
  setIsReading: (isReading) => set({ isReading }),
  setAutoAdvance: (autoAdvance) => set({ autoAdvance }),

  showLookupResult: (selectedWord, lookupResult) =>
    set({ selectedWord, lookupResult, showResult: true }),

  hideLookupResult: () =>
    set({ selectedWord: null, lookupResult: null, showResult: false }),
}));
