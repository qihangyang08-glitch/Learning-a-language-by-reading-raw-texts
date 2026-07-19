import type { BookFormat } from '../../types/book';
import type { BookParser } from './types';
import { TxtParser } from './txt';
import { EpubParser } from './epub';
import { SUPPORTED_EXTENSIONS } from '../../utils/constants';

/**
 * Detect book format from file extension or MIME type.
 */
export function detectFormat(fileName: string, mimeType?: string): BookFormat | null {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  const byExt = SUPPORTED_EXTENSIONS[ext];

  if (byExt) return byExt as BookFormat;

  // Fallback to MIME type detection
  if (mimeType) {
    if (mimeType === 'text/plain') return 'txt';
    if (mimeType === 'application/epub+zip') return 'epub';
  }

  return null;
}

/**
 * Get the appropriate parser for a given format.
 */
export function getParser(format: BookFormat): BookParser {
  switch (format) {
    case 'txt':
      return new TxtParser();
    case 'epub':
      return new EpubParser();
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Check if a format is currently supported (v1: txt + epub).
 */
export function isFormatSupported(format: BookFormat): boolean {
  return format === 'txt' || format === 'epub';
}
