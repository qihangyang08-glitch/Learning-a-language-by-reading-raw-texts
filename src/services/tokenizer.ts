import type { Token } from '../types/book';

/**
 * Japanese text tokenizer service.
 *
 * Architecture:
 * - Primary: tiny-segmenter (~25KB pure JS, no dictionary files needed)
 * - Fallback: improved regex-based segmentation
 *
 * tiny-segmenter uses a statistical model (based on TinySegmenter)
 * and achieves ~95%+ accuracy on general Japanese text.
 * No dictionary download, no async loading — instant startup.
 */

export type TokenizerState = 'unloaded' | 'loading' | 'ready' | 'error';

interface TinySegmenterInstance {
  segment(text: string): string[];
}

class TokenizerService {
  private segmenter: TinySegmenterInstance | null = null;
  private state: TokenizerState = 'unloaded';
  private loadPromise: Promise<void> | null = null;
  private listeners: Array<(state: TokenizerState, progress: number) => void> = [];
  private tokenCache = new Map<string, Token[]>();
  private readonly MAX_CACHE_SIZE = 200;

  getState(): TokenizerState {
    return this.state;
  }

  onStateChange(fn: (state: TokenizerState, progress: number) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(progress: number) {
    for (const fn of this.listeners) fn(this.state, progress);
  }

  async load(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.loadPromise) return this.loadPromise;
    this.state = 'loading';
    this.emit(0);
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    // Retry up to 2 times with a short delay (Metro bundler may need a tick)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // tiny-segmenter is pure JS — instant load, no dictionary files
        const mod = await import('tiny-segmenter');
        // Handle both ESM default and CJS module.exports
        const TinySegmenter = mod.default || mod;
        this.segmenter = new TinySegmenter();
        this.state = 'ready';
        this.emit(1);
        console.log('[tokenizer] tiny-segmenter ready');
        return;
      } catch (err) {
        if (attempt === 0) {
          console.warn('[tokenizer] tiny-segmenter load attempt 1 failed, retrying...', err);
          await new Promise((r) => setTimeout(r, 200));
        } else {
          console.warn('[tokenizer] tiny-segmenter unavailable, using improved fallback:', err);
        }
      }
    }

    // All attempts failed — use fallback
    this.state = 'error';
    this.emit(1);
    this.loadPromise = null;
  }

  /**
   * Tokenize Japanese text. Always returns tokens —
   * tiny-segmenter if loaded, improved regex fallback otherwise.
   *
   * Results are cached (max 200 entries, FIFO eviction) to avoid
   * re-tokenizing the same sentence on back/forward page turns.
   */
  tokenize(text: string): Token[] {
    const cached = this.tokenCache.get(text);
    if (cached) return cached;

    let tokens: Token[];
    if (this.segmenter && this.state === 'ready') {
      tokens = this.segmenterTokenize(text);
    } else {
      tokens = this.improvedFallbackTokenize(text);
    }

    // FIFO eviction: delete oldest entry when cache is full
    if (this.tokenCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.tokenCache.keys().next().value;
      if (firstKey !== undefined) this.tokenCache.delete(firstKey);
    }
    this.tokenCache.set(text, tokens);
    return tokens;
  }

  /**
   * Fast synchronous tokenize using tiny-segmenter.
   * Also classifies each token with basic POS heuristics
   * (tiny-segmenter doesn't provide POS, but we can infer from surface form).
   */
  private segmenterTokenize(text: string): Token[] {
    const surfaces = this.segmenter!.segment(text);
    const tokens: Token[] = [];
    let charPos = 0;

    for (const surface of surfaces) {
      if (!surface.trim()) {
        charPos += surface.length;
        continue;
      }
      if (/^\s+$/.test(surface)) {
        charPos += surface.length;
        continue;
      }

      const pos = this.inferPos(surface);
      tokens.push({
        surfaceForm: surface,
        reading: '',
        baseForm: surface,
        pos,
        wordPosition: charPos,
      });
      charPos += surface.length;
    }

    return tokens;
  }

  /**
   * Basic POS inference from surface form.
   * Accurate enough for display purposes; the dictionary lookup
   * provides the real POS data when the user taps a word.
   */
  private inferPos(surface: string): string {
    if (/^[一-龯々〆]+$/.test(surface)) return '名詞';
    if (/^[ぁ-ん]+$/.test(surface)) {
      // Common particles
      if (/^(は|が|を|に|へ|と|から|まで|より|で|の|も|か|ね|よ|な|わ|さ|ぞ|し|や|ば|て|け|り|こ)$/.test(surface)) {
        return '助詞';
      }
      // Auxiliary verbs / inflections
      if (/^(た|ます|です|だ|ない|られる|させる|そう|よう|たい|れる|せる|まし|です|でした|だった)$/.test(surface)) {
        return '助動詞';
      }
      return 'ひらがな';
    }
    if (/^[ァ-ンー]+$/.test(surface)) return 'カタカナ';
    if (/^[A-Za-z0-9]+$/.test(surface)) return '英数';
    if (/^[！？。、…　「」『』（）〟〝～]+$/.test(surface)) return '記号';
    return 'その他';
  }

  /**
   * Improved fallback tokenizer.
   *
   * Strategy: split by character-type transitions, but limit kanji runs
   * to at most 2 characters (common compound length). This prevents the
   * pathological case where ALL consecutive kanji merge into one token.
   *
   * Used only if tiny-segmenter fails to load (rare — pure JS, no deps).
   */
  private improvedFallbackTokenize(text: string): Token[] {
    const tokens: Token[] = [];

    // Split by character type, but LIMIT kanji runs to max 2 chars
    // to avoid merging unrelated words separated only by character-type.
    const re =
      /([一-龯々〆]{1,2}|[ぁ-んー]+|[ァ-ンー]+|[A-Za-z0-9]+|[　-〿]+|[^A-Za-z0-9　-〿぀-ゟ゠-ヿ一-龯々〆]+)/g;

    let match;
    while ((match = re.exec(text)) !== null) {
      const surfaceForm = match[0].trim();
      if (!surfaceForm) continue;
      if (/^\s+$/.test(surfaceForm)) continue;

      tokens.push({
        surfaceForm,
        reading: '',
        baseForm: surfaceForm,
        pos: this.inferPos(surfaceForm),
        wordPosition: match.index,
      });
    }

    return tokens;
  }

  isReady(): boolean {
    return this.state === 'ready';
  }
}

export const tokenizerService = new TokenizerService();
