/**
 * Cloudflare Worker — JaReader Translation Proxy
 *
 * Deploy with: npx wrangler deploy
 *
 * This worker holds the API key server-side and forwards translation
 * requests to the configured provider (DeepSeek, Baidu, or Microsoft).
 * The app never sees the API key.
 *
 * Endpoints:
 *   POST /translate        - single sentence translation
 *   POST /translate-batch  - batch translation
 */

export interface Env {
  // Provider API keys (set in Cloudflare Dashboard → Workers → Settings → Variables)
  DEEPSEEK_API_KEY?: string;
  BAIDU_APP_ID?: string;
  BAIDU_API_KEY?: string;
  // Which provider to use (default: deepseek)
  DEFAULT_PROVIDER?: string;
}

// ── DeepSeek (OpenAI-compatible) ──

async function deepseekTranslate(
  text: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<string> {
  const langNames: Record<string, string> = {
    ja: 'Japanese',
    zh: 'Chinese',
    en: 'English',
  };

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a translator. Translate ${langNames[from] || from} to ${langNames[to] || to}. Output ONLY the translation, no explanations, no quotes.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data: any = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Router ──

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get API key
    const apiKey = env.DEEPSEEK_API_KEY || '';
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    try {
      if (url.pathname === '/translate') {
        const { text, from = 'ja', to = 'zh' } = await request.json();
        const translated = await deepseekTranslate(text, from, to, apiKey);

        return new Response(
          JSON.stringify({ original: text, translated, provider: 'deepseek' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (url.pathname === '/translate-batch') {
        const { texts, from = 'ja', to = 'zh' } = await request.json();
        const results = await Promise.all(
          texts.map(async (text: string) => {
            try {
              const translated = await deepseekTranslate(text, from, to, apiKey);
              return { original: text, translated, provider: 'deepseek' };
            } catch {
              return { original: text, translated: '', provider: 'error' };
            }
          }),
        );

        return new Response(
          JSON.stringify({ results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  },
};
