import type { BookContent, BookFormat } from '../../types/book';

/**
 * Unified parser interface. Each format implements this.
 */
export interface BookParser {
  readonly format: BookFormat;

  /**
   * Parse a book file from the given path.
   * Returns structured BookContent with chapters and sentences.
   */
  parse(filePath: string): Promise<BookContent>;
}
