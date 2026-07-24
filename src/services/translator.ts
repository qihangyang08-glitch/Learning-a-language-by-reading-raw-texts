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

export const DEEPSEEK_BUSY_MESSAGE =
  '大模型服务暂时繁忙，通常不是程序或 API Key 填写错误，请稍后再试。';

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

type DeepSeekErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  type?: unknown;
};

function stringifyErrorPart(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function extractDeepSeekErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';

  const data = body as DeepSeekErrorBody;
  if (typeof data.error === 'string') return data.error;

  if (data.error && typeof data.error === 'object') {
    const error = data.error as DeepSeekErrorBody;
    return [
      stringifyErrorPart(error.message),
      stringifyErrorPart(error.code),
      stringifyErrorPart(error.type),
    ].filter(Boolean).join(' ');
  }

  return [
    stringifyErrorPart(data.message),
    stringifyErrorPart(data.code),
    stringifyErrorPart(data.type),
  ].filter(Boolean).join(' ');
}

function isBusyLikeError(status: number, message: string): boolean {
  if (status === 429 || status === 503) return true;

  const normalized = message.toLowerCase();
  return [
    'service too busy',
    'too busy',
    'overloaded',
    'overload',
    'rate limit',
    'rate_limit',
    'too many requests',
    'temporarily unavailable',
  ].some((part) => normalized.includes(part)) || /\bbusy\b/.test(normalized);
}

function isAuthLikeError(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;

  const normalized = message.toLowerCase();
  return [
    'unauthorized',
    'unauthorised',
    'forbidden',
    'invalid api key',
    'invalid_api_key',
    'authentication',
    'permission denied',
  ].some((part) => normalized.includes(part));
}

export function formatDeepSeekRequestError(taskName: string, status: number, body: unknown): string {
  const upstreamMessage = extractDeepSeekErrorMessage(body);
  const statusText = `HTTP ${status}`;
  const combined = `${statusText} ${upstreamMessage}`;

  if (isAuthLikeError(status, upstreamMessage)) {
    return `${taskName}请求失败：API Key 无效或无权限，请检查 Key 是否填写正确。`;
  }

  if (isBusyLikeError(status, combined)) {
    return `${taskName}请求失败：${DEEPSEEK_BUSY_MESSAGE}`;
  }

  return `${taskName}请求失败：${upstreamMessage || statusText}`;
}

export function formatDeepSeekRuntimeError(taskName: string, err: unknown): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return `${taskName}请求超时，请检查网络`;
  }

  if (err instanceof TypeError) {
    return `${taskName}请求失败：网络连接失败，请检查网络后重试。`;
  }

  if (err instanceof Error) return err.message;
  return `${taskName}服务不可用`;
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
        throw new Error(formatDeepSeekRequestError('翻译', response.status, errData));
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim() || '';

      return { original: text, translated };
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(formatDeepSeekRuntimeError('翻译', err));
    }
  }
}

export const translationClient = new TranslationClient();
