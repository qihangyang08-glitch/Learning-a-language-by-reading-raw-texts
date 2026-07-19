import type { Sentence } from '../types/book';
import {
  isSentenceEnd,
  isQuoteClose,
  shouldContinueAfterQuote,
} from '../utils/japanese';
import { MIN_SENTENCE_LENGTH, MAX_SENTENCE_LENGTH } from '../utils/constants';

/**
 * Japanese sentence segmenter using regex + heuristics.
 *
 * Splits text into sentences based on:
 * 1. Primary delimiters: 。！？!? …
 * 2. Quote handling: don't split 」 when followed by speech verbs
 * 3. Minimum sentence length merging
 */
export class Segmenter {
  /**
   * Segment raw text from a chapter into sentences.
   */
  segment(rawText: string): string[] {
    const sentences: string[] = [];
    let current = '';
    let globalIdx = 0;

    for (let i = 0; i < rawText.length; i++) {
      const char = rawText[i];
      current += char;

      if (isSentenceEnd(char)) {
        // Check if this end is inside a quote that continues
        if (isQuoteClose(char) && i < rawText.length - 1) {
          const remaining = rawText.slice(i + 1);
          if (shouldContinueAfterQuote(remaining)) {
            // Quote + speech verb → don't split yet
            continue;
          }
        }

        // Also check if the end marker is followed by a quote close
        // e.g., "そうだ！」" → include the 」 in current sentence
        if (i < rawText.length - 1 && isQuoteClose(rawText[i + 1])) {
          current += rawText[i + 1];
          i++;
        }

        // Check for accumulated punctuation like "！？" or "！！"
        while (
          i < rawText.length - 1 &&
          /[！？!?]/.test(rawText[i + 1])
        ) {
          current += rawText[i + 1];
          i++;
        }

        current = current.trim();
        if (current.length >= MIN_SENTENCE_LENGTH) {
          sentences.push(current);
          current = '';
        }
      }

      // Force split if current segment exceeds max length
      if (current.length > MAX_SENTENCE_LENGTH) {
        // Find the last known delimiter to split at
        const lastDelim = Math.max(
          current.lastIndexOf('。'),
          current.lastIndexOf('、'),
          current.lastIndexOf('，'),
        );
        if (lastDelim > 0) {
          const part1 = current.slice(0, lastDelim + 1).trim();
          if (part1.length >= MIN_SENTENCE_LENGTH) {
            sentences.push(part1);
          }
          current = current.slice(lastDelim + 1);
        } else {
          // No good split point, force split at max length
          sentences.push(current.trim());
          current = '';
        }
      }
    }

    // Don't forget the last segment
    const remaining = current.trim();
    if (remaining.length >= MIN_SENTENCE_LENGTH) {
      sentences.push(remaining);
    } else if (remaining.length > 0 && sentences.length > 0) {
      // Merge short trailing segment with previous sentence
      sentences[sentences.length - 1] += remaining;
    }

    return sentences;
  }

  /**
   * Convert raw strings to Sentence objects with chapter-relative numbering.
   */
  toSentenceObjects(
    rawSentences: string[],
    chapterIndex: number,
    startGlobalIndex: number,
  ): Sentence[] {
    return rawSentences.map((text, i) => ({
      index: startGlobalIndex + i,
      chapterIndex,
      sentenceIndex: i,
      text,
    }));
  }
}
