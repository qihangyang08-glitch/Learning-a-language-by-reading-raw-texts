/**
 * Translation proxy client.
 *
 * Calls the Cloudflare Worker proxy (or user's self-hosted proxy).
 * The proxy holds the API key server-side, so it's never exposed in the app.
 *
 * Architecture:
 *   App (this file) → Cloudflare Worker → DeepSeek/Baidu Translate API
 *                                     ↓
 *                              Cached in local SQLite
 */

const DEFAULT_PROXY_URL = 'https://jareader-proxy.example.workers.dev';

interface TranslateOptions {
  text: string;
  from?: string;
  to?: string;
}

interface TranslateResult {
  original: string;
  translated: string;
  provider: string;
}

/**
 * Translation client.
 */
class TranslationClient {
  private proxyUrl: string = DEFAULT_PROXY_URL;

  setProxyUrl(url: string) {
    this.proxyUrl = url;
  }

  getProxyUrl(): string {
    return this.proxyUrl;
  }

  /**
   * Translate a single sentence.
   * The proxy expects: POST /translate { text, from, to }
   */
  async translate(opts: TranslateOptions): Promise<TranslateResult> {
    const { text, from = 'ja', to = 'zh' } = opts;

    if (!text.trim()) {
      return { original: text, translated: '', provider: 'none' };
    }

    const response = await fetch(`${this.proxyUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from, to }),
    });

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      original: text,
      translated: data.translated || '',
      provider: data.provider || 'unknown',
    };
  }

  /**
   * Batch translate multiple sentences.
   */
  async translateBatch(
    texts: string[],
    from = 'ja',
    to = 'zh',
  ): Promise<TranslateResult[]> {
    const response = await fetch(`${this.proxyUrl}/translate-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, from, to }),
    });

    if (!response.ok) {
      throw new Error(`Batch translation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  }
}

// Export singleton
export const translationClient = new TranslationClient();

/**
 * Translation cache using local storage (simple key-value).
 * Can be upgraded to SQLite for persistence.
 */
const cache = new Map<string, string>();

export function getCachedTranslation(text: string): string | null {
  return cache.get(text) ?? null;
}

export function setCachedTranslation(text: string, translation: string): void {
  cache.set(text, translation);
  // Limit cache size
  if (cache.size > 5000) {
    const keys = Array.from(cache.keys());
    for (let i = 0; i < 1000; i++) {
      cache.delete(keys[i]);
    }
  }
}
