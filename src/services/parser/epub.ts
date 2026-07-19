import type { BookContent, BookFormat } from '../../types/book';
import type { BookParser } from './types';

/**
 * EPUB parser using JSZip for lightweight extraction.
 *
 * EPUB is a ZIP archive containing:
 * - META-INF/container.xml → points to the OPF file
 * - *.opf → manifest (list of content files) + spine (reading order)
 * - xhtml/html files → actual content
 *
 * This parser extracts text only — no rendering, no CSS.
 * For vertical text detection, we check the OPF and XHTML for writing-mode.
 */
export class EpubParser implements BookParser {
  readonly format: BookFormat = 'epub';

  async parse(filePath: string): Promise<BookContent> {
    // Dynamic import of JSZip (lazy-loaded only for epub)
    const JSZip = (await import('jszip')).default;

    const response = await fetch(filePath);
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);

    // Step 1: Parse container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: missing META-INF/container.xml');
    }
    const containerXml = await containerFile.async('text');
    const opfPath = this.extractOpfPath(containerXml);

    // Step 2: Parse OPF file
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
    }
    const opfXml = await opfFile.async('text');
    const { manifest, spine, metadata } = this.parseOpf(opfXml);

    // Step 3: Extract text from each spine item in order
    const chapters: any[] = [];
    let globalSentenceIdx = 0;

    for (let i = 0; i < spine.length; i++) {
      const idref = spine[i];
      const href = manifest[idref];
      if (!href) continue;

      const contentFile = zip.file(href);
      if (!contentFile) continue;

      const html = await contentFile.async('text');
      const { text, isVertical } = this.extractText(html);

      if (text.trim().length === 0) continue;

      chapters.push({
        index: i,
        title: undefined,
        sentences: [],
        _raw: isVertical ? this.verticalToHorizontal(text) : text,
        _isVertical: isVertical,
      });
    }

    return {
      meta: {
        title: metadata.title || 'Untitled',
        author: metadata.creator || '',
        format: 'epub',
      },
      chapters: chapters,
      totalSentences: 0,
    } as any;
  }

  /**
   * Extract the OPF file path from container.xml.
   */
  private extractOpfPath(xml: string): string {
    const match = xml.match(/full-path="([^"]+)"/);
    if (!match) {
      throw new Error('Invalid container.xml: no full-path attribute found');
    }
    return match[1];
  }

  /**
   * Parse OPF to get manifest, spine, and metadata.
   */
  private parseOpf(xml: string): {
    manifest: Record<string, string>;
    spine: string[];
    metadata: { title?: string; creator?: string };
  } {
    const manifest: Record<string, string> = {};
    const spine: string[] = [];
    const metadata: { title?: string; creator?: string } = {};

    // Extract manifest items
    const itemRegex = /<item[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*\/?>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      manifest[match[1]] = match[2];
    }

    // Extract spine itemrefs
    const spineRegex = /<itemref[^>]*idref="([^"]*)"[^>]*\/?>/g;
    while ((match = spineRegex.exec(xml)) !== null) {
      spine.push(match[1]);
    }

    // Extract metadata
    const titleMatch = xml.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const creatorMatch = xml.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/);
    if (creatorMatch) metadata.creator = creatorMatch[1].trim();

    return { manifest, spine, metadata };
  }

  /**
   * Extract plain text from an XHTML content file.
   * Detects vertical writing mode.
   */
  private extractText(html: string): { text: string; isVertical: boolean } {
    // Check for vertical writing mode
    const isVertical =
      /writing-mode\s*:\s*vertical-rl/.test(html) ||
      /-epub-writing-mode\s*:\s*vertical-rl/.test(html);

    // Remove scripts and styles
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Strip all HTML tags
    text = text.replace(/<[^>]*>/g, '');

    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&apos;/g, "'");

    // Collapse whitespace
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return { text, isVertical };
  }

  /**
   * Convert vertical-text punctuation to horizontal equivalents.
   */
  private verticalToHorizontal(text: string): string {
    return text
      .replace(/﹒/g, '。')
      .replace(/､/g, '、')
      .replace(/¢/g, '！')
      .replace(/ﾂ?/g, '？');
  }
}
