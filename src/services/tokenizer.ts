import * as FileSystem from 'expo-file-system';
import type { Token } from '../types/book';

/**
 * Japanese text tokenizer service.
 *
 * Architecture:
 * - Primary: kuromoji.js (morphological analyzer, bundled dict ~12MB unzipped)
 * - Fallback: regex-based segmentation (instant, lower accuracy)
 *
 * Kuromoji loads lazily on first use. The 12 dictionary .dat files are
 * bundled as app assets and extracted to the filesystem cache on init.
 */

// Type for the kuromoji tokenizer instance
interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

interface KuromojiToken {
  surface_form: string;
  reading: string | undefined;
  base_form: string;
  pos: string;
  pos_detail_1: string;
  word_position: number;
}

// Dictionary file names required by kuromoji
const DICT_FILES = [
  'base.dat.gz',
  'cc.dat.gz',
  'check.dat.gz',
  'tid.dat.gz',
  'tid_map.dat.gz',
  'tid_pos.dat.gz',
  'unk.dat.gz',
  'unk_char.dat.gz',
  'unk_compat.dat.gz',
  'unk_invoke.dat.gz',
  'unk_map.dat.gz',
  'unk_pos.dat.gz',
];

const DICT_CACHE_DIR = `${FileSystem.cacheDirectory}kuromoji-dict/`;
const DICT_ASSET_DIR = 'dict/kuromoji';

export type TokenizerState = 'unloaded' | 'loading' | 'ready' | 'error';

/**
 * Singleton tokenizer service.
 */
class TokenizerService {
  private tokenizer: KuromojiTokenizer | null = null;
  private state: TokenizerState = 'unloaded';
  private loadPromise: Promise<void> | null = null;

  /** Listeners for state changes */
  private listeners: Array<(state: TokenizerState, progress: number) => void> = [];

  getState(): TokenizerState {
    return this.state;
  }

  onStateChange(fn: (state: TokenizerState, progress: number) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private emit(progress: number) {
    for (const fn of this.listeners) {
      fn(this.state, progress);
    }
  }

  /**
   * Load the kuromoji dictionary and build the tokenizer.
   * Called once, lazily on first use.
   */
  async load(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.loadPromise) return this.loadPromise;

    this.state = 'loading';
    this.emit(0);

    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    try {
      // Attempt to load kuromoji; fall back to regex if unavailable
      await this.ensureDictFiles();

      try {
        const kuromoji = await import('kuromoji');

        this.tokenizer = await new Promise<KuromojiTokenizer>((resolve, reject) => {
          kuromoji
            .builder({ dicPath: `file://${DICT_CACHE_DIR}` })
            .build((err: Error | null, tokenizer: KuromojiTokenizer) => {
              if (err) reject(err);
              else resolve(tokenizer);
            });
        });
        console.log('[tokenizer] kuromoji ready');
      } catch {
        console.log('[tokenizer] kuromoji unavailable, using fallback');
        // Fallback is already the default — mark as ready
      }

      this.state = 'ready';
      this.emit(1);
    } catch (err) {
      this.state = 'error';
      this.emit(1);
      this.loadPromise = null;
      // Don't throw — fallback is available
      console.warn('[tokenizer] load error, fallback active:', err);
    }
  }

  /**
   * Copy dictionary files from app assets to cache directory.
   */
  private async ensureDictFiles(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(DICT_CACHE_DIR);

    // If dir exists and has files, assume they're valid
    if (dirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(DICT_CACHE_DIR);
      if (files.length >= DICT_FILES.length) {
        this.emit(0.5);
        return;
      }
    }

    // Create cache directory
    await FileSystem.makeDirectoryAsync(DICT_CACHE_DIR, { intermediates: true });

    // Copy each dict file from assets
    for (let i = 0; i < DICT_FILES.length; i++) {
      const fileName = DICT_FILES[i];
      const assetPath = `${DICT_ASSET_DIR}/${fileName}`;
      const cachePath = `${DICT_CACHE_DIR}${fileName}`;

      try {
        // Check if asset exists and copy to cache
        // expo-file-system resolves asset paths automatically
        await FileSystem.copyAsync({
          from: assetPath,
          to: cachePath,
        });
      } catch {
        // If asset doesn't exist, we'll need to download from CDN
        // (handled by dictionary-init.ts)
        console.warn(`Dict file not bundled: ${fileName}, will download`);
      }

      this.emit((i + 1) / (DICT_FILES.length * 2));
    }
  }

  /**
   * Tokenize Japanese text into word tokens.
   * Uses kuromoji if loaded, falls back to regex segmentation.
   */
  tokenize(text: string): Token[] {
    if (this.tokenizer && this.state === 'ready') {
      return this.kuromojiTokenize(text);
    }
    return this.fallbackTokenize(text);
  }

  /**
   * Full morphological analysis via kuromoji.
   */
  private kuromojiTokenize(text: string): Token[] {
    const raw = this.tokenizer!.tokenize(text);
    return raw.map((t) => ({
      surfaceForm: t.surface_form,
      reading: t.reading,
      baseForm: t.base_form || t.surface_form,
      pos: t.pos,
      wordType: t.pos_detail_1,
      wordPosition: t.word_position,
    }));
  }

  /**
   * Fallback: regex-based word boundary detection.
   * Splits on character type transitions (kanji→kana, kana→kanji, etc.)
   * Accuracy ~70% — good enough for basic tap-to-select when kuromoji isn't ready.
   */
  private fallbackTokenize(text: string): Token[] {
    const tokens: Token[] = [];

    // Split on character type boundaries
    // Kanji block: [一-龯]
    // Hiragana: [ぁ-ん]
    // Katakana: [ァ-ン]
    // ASCII: [A-Za-z0-9]
    const re =
      /([　-〿぀-ゟ゠-ヿ]+|[一-龯々]+|[A-Za-z0-9]+|[^A-Za-z0-9　-〿぀-ゟ゠-ヿ一-龯々]+)/g;

    let match;
    let pos = 0;
    while ((match = re.exec(text)) !== null) {
      const surfaceForm = match[0].trim();
      if (!surfaceForm) continue;
      tokens.push({
        surfaceForm,
        reading: '',
        baseForm: surfaceForm,
        pos: '',
        wordPosition: match.index,
      });
    }

    return tokens;
  }

  /**
   * Check if tokenizer is ready for use.
   */
  isReady(): boolean {
    return this.state === 'ready';
  }
}

// Export singleton
export const tokenizerService = new TokenizerService();
