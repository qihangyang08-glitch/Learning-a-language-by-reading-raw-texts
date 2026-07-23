import * as FileSystem from 'expo-file-system/legacy';
import type { BookContent, BookFormat } from '../../types/book';
import type { BookParser } from './types';

/**
 * TXT parser. Handles plain text Japanese novels.
 * Splits on double-newlines for chapter detection,
 * then segments each paragraph into sentences.
 *
 * Uses expo-file-system for reading (more reliable than fetch() on Android).
 */
export class TxtParser implements BookParser {
  readonly format: BookFormat = 'txt';

  async parse(filePath: string): Promise<BookContent> {
    // Read file as text using expo-file-system (reliable on all platforms)
    const text = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Normalize line endings and strip BOM
    const normalized = text
      .replace(/^﻿/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Detect title from first non-empty line
    const lines = normalized.split('\n');
    let title = 'Untitled';
    let contentStart = 0;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      if (line.length > 0 && line.length < 100) {
        title = line;
        contentStart = i + 1;
        break;
      }
    }

    // Split into chapters by double-newline (blank line separators)
    const body = lines.slice(contentStart).join('\n');
    const rawChapters = body.split(/\n{2,}/).filter(c => c.trim().length > 0);

    const chapters = rawChapters.map((chText, chIdx) => ({
      index: chIdx,
      title: chIdx === 0 ? title : undefined,
      sentences: [], // will be filled by segmenter
      images: [],    // TXT has no images
      _raw: chText.replace(/\n/g, '').trim(), // join single newlines
    }));

    return {
      meta: {
        title,
        author: '',
        format: 'txt',
      },
      chapters: chapters.map(ch => ({
        index: ch.index,
        title: ch.title,
        sentences: [],
        images: [],
        _raw: (ch as any)._raw,
      })),
      totalSentences: 0,
    } as any;
  }
}
