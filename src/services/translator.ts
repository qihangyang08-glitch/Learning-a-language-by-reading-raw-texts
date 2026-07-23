/**
 * Translation service — DeepSeek API direct call.
 *
 * Architecture:
 *   App → DeepSeek API (with user-provided API key)
 *   Result cached in local SQLite keyed by (bookId, sentenceIndex).
 *
 * The app embeds a translation prompt instructing DeepSeek to produce
 * natural Chinese translations of Japanese text.
 */

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

const TRANSLATION_PROMPT =
  '你是一个专业的日译中翻译助手。请将以下日语文本翻译成自然流畅的中文。\n' +
  '要求：\n' +
  '- 保持原文的语气和风格\n' +
  '- 专有名词保留原文并括号标注中文\n' +
  '- 只输出译文，不要解释\n\n' +
  '日语原文：';

interface TranslateOptions {
  text: string;
  apiKey: string;
}

interface TranslateResult {
  original: string;
  translated: string;
}

/**
 * Translation client — singleton.
 */
class TranslationClient {
  /**
   * Translate a single sentence via DeepSeek API.
   */
  async translate(opts: TranslateOptions): Promise<TranslateResult> {
    const { text, apiKey } = opts;

    if (!text.trim() || !apiKey.trim()) {
      return { original: text, translated: '' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
      const response = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'user', content: TRANSLATION_PROMPT + text },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = (errData as any)?.error?.message || `HTTP ${response.status}`;
        throw new Error(`翻译请求失败: ${msg}`);
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim() || '';

      return { original: text, translated };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('翻译请求超时，请检查网络');
      }
      throw err;
    }
  }
}

export const translationClient = new TranslationClient();
