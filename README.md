# JaReader — Japanese Novel Reader

Read raw (生肉) Japanese novels and practice vocabulary. Lightweight, free, open source.

## Features

- **Sentence-by-sentence reading** — each "page" is one semantic segment
- **Tap-to-lookup** — tap any word for instant dictionary (JMdict, offline)
- **TTS** — text-to-speech with automatic engine fallback (system → cloud)
- **Translation** — optional AI translation via secure proxy (DeepSeek)
- **Single-hand mode** — left/right hand layouts for one-thumb reading
- **Outline navigation** — Bible-style verse index, search, jump
- **Bookmarks** — mark sentences for later review
- **Dark mode** — light/dark theme
- **Cross-platform** — Android + iOS (React Native + Expo)

## Supported Formats

- **v1**: `.txt`, `.epub` (JSZip self-parser, ~50KB)
- **v2** (planned): `.mobi` (foliate-js), `.pdf` (text extraction)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React Native + Expo SDK 57 |
| Navigation | expo-router |
| State | Zustand |
| Database | expo-sqlite (synchronous API) |
| Tokenizer | kuromoji.js (morphological, regex fallback) |
| Dictionary | JMdict → SQLite FTS5 |
| TTS | expo-speech + cloud fallback |
| Translation | Cloudflare Worker proxy → DeepSeek API |

## Getting Started

```bash
# Install dependencies
npm install

# Install Expo CLI
npm install -g expo-cli

# Start dev server
npx expo start

# Build for Android
npx expo export --platform android

# Build for iOS (requires macOS or EAS Build)
npx expo export --platform ios
```

## Translation Setup

1. First launch → setup wizard → choose "Public Proxy" (default)
2. Or deploy your own proxy (see [proxy/README.md](proxy/README.md))
3. Translation can be enabled/disabled anytime in Settings

## Dictionary

JMdict (Creative Commons) is downloaded on first launch (~25MB). The app converts
it to SQLite FTS5 for fast offline lookups.

## License

MIT — see [LICENSE](LICENSE)

JMdict data is CC-BY-SA (Electronic Dictionary Research and Development Group).
