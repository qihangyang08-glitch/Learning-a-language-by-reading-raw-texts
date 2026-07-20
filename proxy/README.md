# JaReader Translation Proxy

Cloudflare Worker that proxies translation requests to DeepSeek API.

## Deploy (5 minutes, free)

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Set your DeepSeek API key:
   ```bash
   npx wrangler secret put DEEPSEEK_API_KEY
   ```
   Get a key at [platform.deepseek.com](https://platform.deepseek.com)

4. Deploy:
   ```bash
   npx wrangler deploy
   ```

5. Copy your worker URL (e.g., `https://jareader-proxy.yourname.workers.dev`)
   and enter it in JaReader Settings → Translation → Self-Host Proxy.

## API

### POST /translate
```json
{"text": "今日はいい天気です", "from": "ja", "to": "zh"}
→ {"original": "...", "translated": "今天天气很好", "provider": "deepseek"}
```

### POST /translate-batch
```json
{"texts": ["文1", "文2"], "from": "ja", "to": "zh"}
→ {"results": [{"original": "文1", ...}, ...]}
```

## Free Tier Limits
- 100,000 requests/day (Cloudflare Workers free tier)
- DeepSeek API: ¥1 per 1M tokens (~¥0.01 per typical sentence)
