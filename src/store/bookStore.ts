import { create } from 'zustand';
import type { BookMeta } from '../types/book';

/**
 * Book library state.
 */
interface BookStoreState {
  books: BookMeta[];
  isLoading: boolean;

  // Actions
  setBooks: (books: BookMeta[]) => void;
  addBook: (book: BookMeta) => void;
  removeBook: (bookId: string) => void;
  updateProgress: (bookId: string, sentenceIndex: number, totalSentences: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useBookStore = create<BookStoreState>((set) => ({
  books: [],
  isLoading: false,

  setBooks: (books) => set({ books }),

  addBook: (book) =>
    set((state) => ({
      books: [...state.books, book],
    })),

  removeBook: (bookId) =>
    set((state) => ({
      books: state.books.filter((b) => b.id !== bookId),
    })),

  updateProgress: (bookId, currentSentence, totalSentences) =>
    set((state) => ({
      books: state.books.map((b) =>
        b.id === bookId
          ? { ...b, currentSentence, totalSentences, lastReadAt: Date.now() }
          : b,
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}));
