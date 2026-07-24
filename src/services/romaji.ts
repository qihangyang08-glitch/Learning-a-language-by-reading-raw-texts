import { formatDeepSeekRequestError, formatDeepSeekRuntimeError } from './translator';
import type { RomajiLayoutMode } from '../types/reader';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

const TOKEN_ROMAJI_PROMPT =
  '你是一个日语罗马音注音助手。请把用户给出的日语句子切分成适合阅读的词或短语，并输出对应的 Hepburn 罗马音。\n' +
  '只输出 JSON，不要 Markdown，不要解释。JSON 格式必须是：{"items":[{"text":"彼女","romaji":"kanojo"}]}。\n' +
  '要求：items 按原文顺序排列，text 尽量覆盖原文中的日语文本；标点可以省略；无法判断时返回空 items。\n\n' +
  '日语原文：';

const PLAIN_ROMAJI_PROMPT =
  '请把下面的日语句子转写成 Hepburn 罗马音。只输出罗马音文本，不要解释。\n\n日语原文：';

export interface RomajiItem {
  text: string;
  romaji: string;
}

export interface RomajiResult {
  items: RomajiItem[];
  romaji?: string;
}

interface GenerateRomajiOptions {
  text: string;
  apiKey: string;
  layoutMode?: RomajiLayoutMode;
}

export function createSourceTextHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseRomajiJson(raw: string): RomajiResult {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return { items: [] };

  try {
    const parsed = JSON.parse(jsonText);
    const sourceItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const items: RomajiItem[] = [];

    for (const item of sourceItems) {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      const romaji = typeof item?.romaji === 'string' ? item.romaji.trim() : '';
      if (text && romaji) items.push({ text, romaji });
    }

    return { items };
  } catch {
    return { items: [] };
  }
}

export function parsePlainRomaji(raw: string): RomajiResult {
  const romaji = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:text|txt)?|```/gi, ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^["'「『]|["'」』]$/g, '')
    .trim();

  return romaji ? { items: [], romaji } : { items: [] };
}

class RomajiClient {
  async generate(opts: GenerateRomajiOptions): Promise<RomajiResult> {
    const { text, apiKey, layoutMode = 'phrase' } = opts;
    if (!text.trim() || !apiKey.trim()) return { items: [] };
    const precise = layoutMode === 'token';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

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
            { role: 'user', content: (precise ? TOKEN_ROMAJI_PROMPT : PLAIN_ROMAJI_PROMPT) + text },
          ],
          temperature: 0.1,
          max_tokens: 800,
          ...(precise ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(formatDeepSeekRequestError('罗马音', response.status, errData));
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return precise ? parseRomajiJson(content) : parsePlainRomaji(content);
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(formatDeepSeekRuntimeError('罗马音', err));
    }
  }
}

function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith('{') && text.endsWith('}')) return text;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') && inner.endsWith('}')) return inner;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

export const romajiClient = new RomajiClient();
