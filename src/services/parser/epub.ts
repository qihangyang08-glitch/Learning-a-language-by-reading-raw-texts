import * as FileSystem from 'expo-file-system/legacy';
import type { BookContent, BookFormat, BookImage } from '../../types/book';
import type { BookParser } from './types';

/**
 * EPUB parser using JSZip for lightweight extraction.
 *
 * EPUB is a ZIP archive containing:
 * - META-INF/container.xml → points to the OPF file
 * - *.opf → manifest (list of content files) + spine (reading order)
 * - xhtml/html files → actual content
 * - image files (jpeg, png, svg, etc.)
 *
 * This parser extracts text AND images (inline illustrations).
 * Uses expo-file-system to read files (more reliable than fetch() on Android).
 */

const BOOK_IMAGES_DIR = `${FileSystem.documentDirectory}Books/images/`;

export class EpubParser implements BookParser {
  readonly format: BookFormat = 'epub';

  private bookId: string = '';

  async parse(filePath: string): Promise<BookContent> {
    // Dynamic import of JSZip (lazy-loaded only for epub)
    const JSZip = (await import('jszip')).default;

    // Read the EPUB file as base64 using expo-file-system (more reliable than fetch() on Android)
    const base64Data = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(base64Data, { base64: true });

    // Generate book ID from file path
    this.bookId = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';

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
    const { manifest, spine, metadata, imageMap } = this.parseOpf(opfXml);

    // Derive the OPF base directory for resolving relative paths
    const opfBase = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';

    // Step 3: Extract images from ZIP to filesystem
    const imageDir = `${BOOK_IMAGES_DIR}${this.bookId}/`;
    await this.extractImages(zip, imageMap, imageDir, opfBase);

    // Step 4: Extract text from each spine item in order
    const chapters: any[] = [];

    for (let i = 0; i < spine.length; i++) {
      const idref = spine[i];
      const href = manifest[idref];
      if (!href) continue;

      // Resolve href relative to OPF's directory
      const fullHref = opfBase + href;
      const contentFile = zip.file(fullHref) || zip.file(href);
      if (!contentFile) {
        console.warn(`[epub] Content file not found: ${fullHref} (tried: ${href})`);
        continue;
      }

      const html = await contentFile.async('text');
      const { text, isVertical, images } = this.extractText(
        html,
        imageMap,
        imageDir,
        opfBase,
      );

      if (text.trim().length === 0 && images.length === 0) continue;

      chapters.push({
        index: i,
        title: undefined,
        sentences: [],
        images: images,
        _raw: isVertical ? this.verticalToHorizontal(text) : text,
        _isVertical: isVertical,
      });
    }

    console.log(`[epub] Parsed ${chapters.length} chapters from ${spine.length} spine items`);

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
   * Parse OPF to get manifest, spine, metadata, and image mapping.
   */
  private parseOpf(xml: string): {
    manifest: Record<string, string>;
    spine: string[];
    metadata: { title?: string; creator?: string };
    imageMap: Record<string, { href: string; mediaType: string }>;
  } {
    const manifest: Record<string, string> = {};
    const spine: string[] = [];
    const metadata: { title?: string; creator?: string } = {};
    const imageMap: Record<string, { href: string; mediaType: string }> = {};

    // Extract each <item> tag individually, then parse attributes independently.
    // This avoids attribute-order dependencies in regex.
    const itemTagRegex = /<item\b([^>]*?)\s*\/?>/gi;
    let match;
    while ((match = itemTagRegex.exec(xml)) !== null) {
      const attrs = match[1];
      const id = this.extractAttr(attrs, 'id');
      const href = this.extractAttr(attrs, 'href');
      const mediaType = this.extractAttr(attrs, 'media-type');

      if (!id || !href) continue;

      if (mediaType && mediaType.startsWith('image/')) {
        imageMap[id] = { href, mediaType };
      } else {
        // Any non-image item goes to manifest (xhtml, html, xml, css, ncx, etc.)
        manifest[id] = href;
      }
    }

    // Fallback: if manifest is still empty, try simpler extraction (by extension)
    if (Object.keys(manifest).length === 0) {
      const simpleRegex = /<item[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*\/?>/gi;
      while ((match = simpleRegex.exec(xml)) !== null) {
        const href = match[2];
        const ext = href.split('.').pop()?.toLowerCase() || '';
        if (!['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
          manifest[match[1]] = href;
        }
      }
    }

    // Extract spine itemrefs
    const spineRegex = /<itemref[^>]*idref="([^"]*)"[^>]*\/?>/gi;
    while ((match = spineRegex.exec(xml)) !== null) {
      spine.push(match[1]);
    }

    // Extract metadata
    const titleMatch = xml.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const creatorMatch = xml.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/);
    if (creatorMatch) metadata.creator = creatorMatch[1].trim();

    console.log(`[epub] OPF: ${Object.keys(manifest).length} content items, ${Object.keys(imageMap).length} images, ${spine.length} spine refs`);

    return { manifest, spine, metadata, imageMap };
  }

  /** Extract an attribute value from an attribute string (order-independent). */
  private extractAttr(attrs: string, name: string): string | undefined {
    const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
    const m = attrs.match(re);
    return m ? m[1] : undefined;
  }

  /**
   * Extract image files from EPUB ZIP and save them to the app's filesystem.
   */
  private async extractImages(
    zip: any,
    imageMap: Record<string, { href: string; mediaType: string }>,
    imageDir: string,
    opfBase: string,
  ): Promise<void> {
    if (Object.keys(imageMap).length === 0) return;

    // Ensure image directory exists
    await FileSystem.makeDirectoryAsync(imageDir, { intermediates: true });

    for (const [id, { href }] of Object.entries(imageMap)) {
      // Resolve relative path
      const fullPath = opfBase + href;
      const zipFile = zip.file(fullPath) || zip.file(href);

      if (!zipFile) {
        console.warn(`[epub] Image not found in ZIP: ${fullPath}`);
        continue;
      }

      try {
        // Use JSZip's built-in base64 output (avoids btoa compatibility issues)
        const base64 = await zipFile.async('base64');
        const destPath = `${imageDir}${id}_${href.split('/').pop() || href}`;

        await FileSystem.writeAsStringAsync(destPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (err) {
        console.warn(`[epub] Failed to extract image ${href}:`, err);
      }
    }
  }

  /**
   * Extract plain text from an XHTML content file.
   * Also finds <img> tags and records image references.
   */
  private extractText(
    html: string,
    imageMap: Record<string, { href: string; mediaType: string }>,
    imageDir: string,
    opfBase: string,
  ): { text: string; isVertical: boolean; images: BookImage[] } {
    // Check for vertical writing mode
    const isVertical =
      /writing-mode\s*:\s*vertical-rl/.test(html) ||
      /-epub-writing-mode\s*:\s*vertical-rl/.test(html);

    const images: BookImage[] = [];

    // Find <img> tags before stripping HTML
    const imgRegex = /<img[^>]*src="([^"]*)"[^>]*?(?:alt="([^"]*)")?[^>]*\/?>/gi;

    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      const alt = imgMatch[2] || '';

      const imgInfo = this.findImageInMap(src, imageMap);
      if (imgInfo) {
        const imageId = `img_${images.length}_${this.bookId}`;
        const destFile = `${imgInfo.id}_${imgInfo.href.split('/').pop() || imgInfo.href}`;
        images.push({
          id: imageId,
          filePath: `${imageDir}${destFile}`,
          mimeType: imgInfo.mediaType,
          position: imgMatch.index,
          alt,
        });
      }
    }

    // Remove scripts and styles
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    text = this.simplifyRubyTags(text);

    // Replace <img> tags with a visible marker
    text = text.replace(/<img[^>]*\/?>/gi, '【插图】');
    text = text.replace(/<image[^>]*\/?>/gi, '【插图】');

    // Strip all remaining HTML tags
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

    // Collapse whitespace (keep 【插图】 markers)
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return { text, isVertical, images };
  }

  private simplifyRubyTags(html: string): string {
    return html.replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi, (_match, inner: string) => {
      const rbText = this.extractRubyBaseText(inner);
      if (rbText) return rbText;

      return this.stripHtmlTags(
        inner
          .replace(/<rtc\b[^>]*>[\s\S]*?<\/rtc>/gi, '')
          .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '')
          .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, ''),
      );
    });
  }

  private extractRubyBaseText(inner: string): string {
    const parts: string[] = [];
    const rbRegex = /<rb\b[^>]*>([\s\S]*?)<\/rb>/gi;
    let match: RegExpExecArray | null;

    while ((match = rbRegex.exec(inner)) !== null) {
      const text = this.stripHtmlTags(match[1]);
      if (text) parts.push(text);
    }

    return parts.join('');
  }

  private stripHtmlTags(fragment: string): string {
    return fragment.replace(/<[^>]*>/g, '');
  }

  /**
   * Find an image entry in imageMap by matching its src/href.
   */
  private findImageInMap(
    src: string,
    imageMap: Record<string, { href: string; mediaType: string }>,
  ): { id: string; href: string; mediaType: string } | null {
    for (const [id, info] of Object.entries(imageMap)) {
      if (src === info.href) return { id, ...info };
      const srcFile = src.split('/').pop();
      const hrefFile = info.href.split('/').pop();
      if (srcFile && hrefFile && srcFile === hrefFile) {
        return { id, ...info };
      }
      if (src.endsWith(info.href)) return { id, ...info };
    }
    return null;
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
