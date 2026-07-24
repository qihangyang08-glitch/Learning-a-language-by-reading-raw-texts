# Dictionary lookup optimization note

Updated: 2026-07-24

Expo docs checked before code changes:

- Expo SDK 57 docs entry: https://docs.expo.dev/versions/v57.0.0/
- expo-sqlite SDK 57 page only: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/

## Implemented

- Added ordinary SQLite indexes for lookup hot paths:
  - `idx_entries_word ON entries(word)`
  - `idx_entries_reading ON entries(reading)`
- Added small LRU caches:
  - exact word/reading lookup cache: 512 entries, caches hits and misses
  - prefix lookup cache: 256 entries
- Reused covering candidates in `lookupLongestTextMatchAt` instead of generating them twice.
- Batched exact candidate lookup:
  - word candidates are queried with one `IN (...)` query
  - unresolved candidates are queried with one reading `IN (...)` query
  - final selection still follows the original candidate order and word-before-reading semantics
- Changed prefix lookup from `LIKE 'query%'` to an indexed range query:
  - `word >= query AND word < nextPrefix(query)`
- Updated `scripts/dictionary-benchmark.mjs` so benchmark query counts model cache hits and batched exact lookup.

## Benchmark

Command:

```powershell
node scripts/dictionary-benchmark.mjs --samples 500 --manual 0 --format summary
node scripts/dictionary-benchmark.mjs --samples 500 --manual 0 --engine sqlite --sqlite-indexes none --format summary
node scripts/dictionary-benchmark.mjs --samples 500 --manual 0 --engine sqlite --sqlite-indexes word --format summary
```

Same sample source, seed, dictionary size:

- Source: `败犬女主太多了_第9卷_日文版.txt`
- Seed: `20260724`
- Samples: `500`
- Dictionary entries: `159,388`

| Scenario | Hit rate | Hits | cover p50 | cover p95 | Avg SQL-like queries | p95 SQL-like queries | Source split |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Before, memory baseline | 96.4% | 482/500 | 0.0179ms | 0.0550ms | 59.16 | 147.05 | exact:467, prefix:15, miss:18 |
| After, memory model | 96.4% | 482/500 | 0.0338ms | 0.1099ms | 4.32 | 9.15 | exact:467, prefix:15, miss:18 |
| After, sqlite no index | 96.4% | 482/500 | 44.4831ms | 152.4158ms | 4.32 | 9.15 | exact:467, prefix:15, miss:18 |
| After, sqlite word/reading indexes | 96.4% | 482/500 | 0.2201ms | 0.8861ms | 4.32 | 9.15 | exact:467, prefix:15, miss:18 |

Notes:

- Hit rate and source split stayed unchanged in the 500-sample benchmark.
- Query count reduction is the main win: average `59.16 -> 4.32`, p95 `147.05 -> 9.15`.
- The memory model p95 became slower because batch lookup adds JS Map/array work while removing simulated SQL calls. The sqlite model shows why this is still the right tradeoff for the app's synchronous SQLite path.
- The sql.js sqlite result is not a device result, but it shows that ordinary indexes are critical: p95 `152.4158ms -> 0.8861ms` with indexes.

## Remaining optimization space

- Prefix phase still runs one query per prefix candidate on exact misses. If true device traces show remaining p95 spikes, batch prefix candidates or cap prefix attempts after a strong exact miss window.
- `ORDER BY length(word)` still requires sorting matched prefix rows. If prefix spikes remain, consider a generated/stored `word_len` column plus `(word, word_len)` or a separate normalized prefix table.
- A large in-memory trie is not implemented. It remains a later option only if indexed SQLite plus batching still misses device latency targets.

## Device validation

- Test on Android physical device after dictionary import and after app restart.
- Confirm `idx_entries_word` and `idx_entries_reading` exist in the app database.
- Tap dense Japanese text and record dictionary card latency p50/p95/p99.
- Add temporary tracing around `lookupLongestTextMatchAt` if needed: candidate count, exact batch query count, prefix query count, cache hits, and total duration.
- Check first run after update separately because creating indexes for an existing 159k-entry database can briefly block the JS thread.
