import { useCallback, useMemo } from 'react';
import { useReaderStore } from '../store/readerStore';
import { useDictionary } from './useDictionary';
import type { Token, Sentence } from '../types/book';
import type { LookupResult } from '../types/reader';

/**
 * Main reader hook — combines reader state, dictionary, and tokenizer.
 */
export function useReader() {
  const reader = useReaderStore();
  const { tokenizerState, tokenizerProgress, isReady, tokenize, lookup } =
    useDictionary();

  const currentSentence: Sentence | undefined = reader.sentences.find(
    (s) => s.index === reader.currentIndex,
  );

  // Tokenize current sentence when it changes and tokenizer is ready
  const tokenizedSentence = useMemo((): Sentence | undefined => {
    if (!currentSentence) return undefined;
    if (!isReady) return currentSentence;

    // Only tokenize if not already done
    if (!currentSentence.tokens || currentSentence.tokens.length === 0) {
      const tokens = tokenize(currentSentence.text);
      return { ...currentSentence, tokens };
    }
    return currentSentence;
  }, [currentSentence, isReady, tokenize]);

  // Word tap handler
  const handleWordPress = useCallback(
    (token: Token) => {
      const result = lookup(token.baseForm || token.surfaceForm);
      if (result) {
        reader.showLookupResult(token.surfaceForm, result);
      }
    },
    [lookup],
  );

  // Dismiss result
  const handleDismissResult = useCallback(() => {
    reader.hideLookupResult();
  }, []);

  // Go to sentence by index (for outline nav)
  const goToSentence = useCallback(
    (index: number) => {
      reader.goToSentence(index);
    },
    [],
  );

  return {
    // Book
    bookId: reader.bookId,
    currentIndex: reader.currentIndex,
    totalSentences: reader.totalSentences,
    currentSentence: tokenizedSentence,

    // Settings
    handMode: reader.handMode,
    fontSize: reader.fontSize,
    lineHeight: reader.lineHeight,
    showTranslation: reader.showTranslation,

    // TTS
    isReading: reader.isReading,

    // Dictionary
    showResult: reader.showResult,
    lookupResult: reader.lookupResult as LookupResult | null,
    tokenizerState,
    tokenizerProgress,
    isReady,

    // Actions
    openBook: reader.openBook,
    closeBook: reader.closeBook,
    nextSentence: reader.nextSentence,
    prevSentence: reader.prevSentence,
    goToSentence,
    setHandMode: reader.setHandMode,
    setFontSize: reader.setFontSize,
    setLineHeight: reader.setLineHeight,
    toggleTranslation: reader.toggleTranslation,
    setIsReading: reader.setIsReading,
    handleWordPress,
    handleDismissResult,
  };
}
