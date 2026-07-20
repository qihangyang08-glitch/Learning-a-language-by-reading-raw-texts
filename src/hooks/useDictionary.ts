import { useState, useEffect, useCallback } from 'react';
import { lookupWord } from '../services/dictionary';
import { tokenizerService, type TokenizerState } from '../services/tokenizer';
import type { Token, DictEntry } from '../types/book';
import type { LookupResult } from '../types/reader';

/**
 * Hook for dictionary operations.
 * Handles tokenizer loading, word lookup, and state management.
 */
export function useDictionary() {
  const [tokenizerState, setTokenizerState] = useState<TokenizerState>('unloaded');
  const [tokenizerProgress, setTokenizerProgress] = useState(0);

  // Listen for tokenizer state changes
  useEffect(() => {
    const unsub = tokenizerService.onStateChange((state, progress) => {
      setTokenizerState(state);
      setTokenizerProgress(progress);
    });
    return unsub;
  }, []);

  // Load tokenizer on mount
  useEffect(() => {
    if (tokenizerState === 'unloaded') {
      tokenizerService.load().catch(console.warn);
    }
  }, [tokenizerState]);

  /**
   * Tokenize text for a given sentence.
   * Attaches tokens to the sentence for tappable word display.
   */
  const tokenize = useCallback((text: string): Token[] => {
    return tokenizerService.tokenize(text);
  }, []);

  /**
   * Look up a word in the JMdict database.
   */
  const lookup = useCallback((word: string): LookupResult | null => {
    const entry = lookupWord(word);
    if (!entry) {
      return {
        word,
        reading: '',
        pos: [],
        gloss: ['(not found)'],
      };
    }

    return {
      word: entry.word,
      reading: entry.reading,
      pos: entry.pos,
      gloss: entry.gloss,
    };
  }, []);

  return {
    tokenizerState,
    tokenizerProgress,
    isReady: tokenizerState === 'ready',
    tokenize,
    lookup,
  };
}
