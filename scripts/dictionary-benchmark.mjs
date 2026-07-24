#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SEED = 20260724;
const DEFAULT_SAMPLES = 500;
const DEFAULT_MANUAL = 100;
const DEFAULT_MAX_CANDIDATE_LENGTH = 12;

const args = parseArgs(process.argv.slice(2));
const seed = numberArg('seed', DEFAULT_SEED);
const sampleCount = numberArg('samples', DEFAULT_SAMPLES);
const manualCount = numberArg('manual', DEFAULT_MANUAL);
const maxCandidateLength = numberArg('max-candidate-length', DEFAULT_MAX_CANDIDATE_LENGTH);
const format = stringArg('format', 'summary');
const engineName = stringArg('engine', 'memory');
const sqliteIndexes = stringArg('sqlite-indexes', 'none');
const writeReport = boolArg('write-report');
const reportPath = resolve(ROOT, stringArg('report', 'docs/dictionary-benchmark-report.md'));
const sourceArg = stringArg('source', '');
const sourcePath = sourceArg ? resolve(ROOT, sourceArg) : '';
const dictPath = resolve(ROOT, stringArg('dict', 'assets/dictionary/dict-data.json'));

if (sampleCount < 1) fail('--samples must be at least 1');
if (manualCount < 0) fail('--manual must be 0 or greater');
if (!['summary', 'json', 'jsonl', 'csv'].includes(format)) fail('--format must be summary, json, jsonl, or csv');
if (!['memory', 'sqlite'].includes(engineName)) fail('--engine must be memory or sqlite');
if (!['none', 'word'].includes(sqliteIndexes)) fail('--sqlite-indexes must be none or word');

const startedAt = performance.now();

const novelPath = sourcePath && existsSync(sourcePath) ? sourcePath : await findDefaultTxt();
const [novelText, rawDictJson] = await Promise.all([
  readFile(novelPath, 'utf8'),
  readFile(dictPath, 'utf8'),
]);

const rawEntries = JSON.parse(rawDictJson);
if (!Array.isArray(rawEntries) || rawEntries.length === 0) fail(`Dictionary JSON is empty: ${dictPath}`);

const entries = rawEntries.map((row, index) => ({
  id: index + 1,
  word: String(row.w ?? ''),
  reading: String(row.r ?? ''),
  pos: String(row.p ?? ''),
  gloss: String(row.g ?? ''),
})).filter((entry) => entry.word || entry.reading);

const buildStartedAt = performance.now();
const engine = engineName === 'sqlite'
  ? await createSqliteEngine(entries, { sqliteIndexes })
  : createMemoryEngine(entries, maxCandidateLength);
const engineBuildMs = performance.now() - buildStartedAt;

const sentenceIndex = indexSentences(novelText);
const validPositions = collectValidPositions(novelText);
if (validPositions.length < sampleCount) {
  fail(`Only ${validPositions.length} valid Japanese positions found; need ${sampleCount}`);
}

const rng = mulberry32(seed);
const samplePositions = sampleWithoutReplacement(validPositions.length, sampleCount, rng)
  .map((index) => validPositions[index])
  .sort((a, b) => a - b);

const tokenize = await createTokenizer();
const samples = [];

for (let i = 0; i < samplePositions.length; i++) {
  const globalIndex = samplePositions[i];
  const sentence = findSentence(sentenceIndex, globalIndex);
  const sentenceText = sentence.text;
  const charIndex = globalIndex - sentence.start;
  const tokens = tokenize(sentenceText);

  const tokenStartedAt = performance.now();
  const tokenResult = lookupTokenRaw(engine, tokens, charIndex);
  const tokenDurationMs = performance.now() - tokenStartedAt;

  const coverStartedAt = performance.now();
  const coverResult = lookupCoveringLongest(engine, sentenceText, charIndex, maxCandidateLength);
  const coverDurationMs = performance.now() - coverStartedAt;

  samples.push({
    sampleId: i + 1,
    seed,
    sourceFile: basename(novelPath),
    sentenceIndex: sentence.index,
    sentenceStart: sentence.start,
    globalCharIndex: globalIndex,
    charIndexInSentence: charIndex,
    clickedChar: sentenceText[charIndex],
    sentence: sentenceText,
    token: tokenResult.token ? {
      surfaceForm: tokenResult.token.surfaceForm,
      start: tokenResult.token.wordPosition,
      end: tokenResult.token.wordPosition + tokenResult.token.surfaceForm.length,
    } : null,
    tokenRaw: summarizeLookup(tokenResult.match, tokenDurationMs, tokenResult.stats),
    coverLongest: summarizeLookup(coverResult.match, coverDurationMs, coverResult.stats),
    candidates: coverResult.candidates.slice(0, 30),
    annotation: {
      label: '',
      note: '',
      allowedLabels: ['useful', 'not_useful', 'missing', 'wrong_hit'],
    },
  });
}

engine.close?.();

const summary = buildSummary(samples, {
  seed,
  sampleCount,
  requestedSamples: sampleCount,
  manualCount: Math.min(manualCount, samples.length),
  sourcePath: novelPath,
  dictPath,
  dictEntries: entries.length,
  engineName,
  sqliteIndexes,
  maxCandidateLength,
  engineBuildMs,
  totalMs: performance.now() - startedAt,
});

if (writeReport) {
  await writeFile(reportPath, renderReport(summary, samples.slice(0, manualCount)), 'utf8');
}

if (format === 'json') {
  console.log(JSON.stringify({ summary, samples }, null, 2));
} else if (format === 'jsonl') {
  for (const sample of samples) console.log(JSON.stringify(sample));
} else if (format === 'csv') {
  console.log(toCsv(samples));
} else {
  printSummary(summary, writeReport ? reportPath : null);
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed.set(key, true);
    } else {
      parsed.set(key, next);
      i++;
    }
  }
  return parsed;
}

function numberArg(key, fallback) {
  const value = args.get(key);
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`--${key} must be a number`);
  return parsed;
}

function stringArg(key, fallback) {
  const value = args.get(key);
  if (value === undefined || value === true) return fallback;
  return String(value);
}

function boolArg(key) {
  return args.get(key) === true || args.get(key) === 'true';
}

async function findDefaultTxt() {
  const files = await readdir(ROOT);
  const candidates = files
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .filter((name) => /日文版|日本語|ja|jp/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'ja'));
  if (candidates.length === 0) fail('No root TXT novel found. Pass --source <path>.');
  return join(ROOT, candidates[0]);
}

function createMemoryEngine(sourceEntries, prefixLimit) {
  const byWord = new Map();
  const byReading = new Map();
  const byPrefix = new Map();
  const lookupCache = new Map();
  const prefixCache = new Map();

  for (const entry of sourceEntries) {
    if (entry.word && !byWord.has(entry.word)) byWord.set(entry.word, entry);
    if (entry.reading && !byReading.has(entry.reading)) byReading.set(entry.reading, entry);

    const max = Math.min(prefixLimit, entry.word.length);
    for (let length = 1; length <= max; length++) {
      const prefix = entry.word.slice(0, length);
      let bucket = byPrefix.get(prefix);
      if (!bucket) {
        bucket = [];
        byPrefix.set(prefix, bucket);
      }
      bucket.push(entry);
    }
  }

  for (const bucket of byPrefix.values()) {
    bucket.sort((a, b) => (a.word.length - b.word.length) || (a.id - b.id));
  }

  return {
    kind: 'memory',
    lookupWord(query, stats) {
      const cached = getLru(lookupCache, query);
      if (cached !== undefined) {
        stats.lookupCacheHits++;
        return cached;
      }

      stats.exactWordQueries++;
      const exact = byWord.get(query);
      if (exact) {
        const entry = parseEntry(exact);
        setLru(lookupCache, query, entry, 512);
        return entry;
      }
      stats.exactReadingQueries++;
      const reading = byReading.get(query);
      const entry = reading ? parseEntry(reading) : null;
      setLru(lookupCache, query, entry, 512);
      return entry;
    },
    prefixSearch(query, limit, stats) {
      const cacheKey = `${query}\u0000${limit}`;
      const cached = getLru(prefixCache, cacheKey);
      if (cached !== undefined) {
        stats.prefixCacheHits++;
        return cached;
      }

      stats.prefixQueries++;
      const entries = (byPrefix.get(query) ?? []).slice(0, limit).map(parseEntry);
      setLru(prefixCache, cacheKey, entries, 256);
      return entries;
    },
    lookupFirstCandidate(candidates, stats) {
      return lookupFirstCandidateFromMaps(candidates, stats, {
        lookupCache,
        byWord,
        byReading,
      });
    },
  };
}

async function createSqliteEngine(sourceEntries, options) {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      reading TEXT NOT NULL,
      pos TEXT,
      gloss TEXT NOT NULL
    );
  `);

  db.run('BEGIN TRANSACTION;');
  const insert = db.prepare('INSERT INTO entries (id, word, reading, pos, gloss) VALUES (?, ?, ?, ?, ?)');
  for (const entry of sourceEntries) {
    insert.run([entry.id, entry.word, entry.reading, entry.pos, entry.gloss]);
  }
  insert.free();
  db.run('COMMIT;');

  if (options.sqliteIndexes === 'word') {
    db.run('CREATE INDEX idx_entries_word ON entries(word);');
    db.run('CREATE INDEX idx_entries_reading ON entries(reading);');
  }

  const exactStmt = db.prepare('SELECT id, word, reading, pos, gloss FROM entries WHERE word = ? LIMIT 1');
  const readingStmt = db.prepare('SELECT id, word, reading, pos, gloss FROM entries WHERE reading = ? LIMIT 1');
  const prefixStmt = db.prepare('SELECT id, word, reading, pos, gloss FROM entries WHERE word >= ? AND word < ? ORDER BY length(word) ASC LIMIT ?');
  const lookupCache = new Map();
  const prefixCache = new Map();

  return {
    kind: 'sqlite',
    lookupWord(query, stats) {
      const cached = getLru(lookupCache, query);
      if (cached !== undefined) {
        stats.lookupCacheHits++;
        return cached;
      }

      stats.exactWordQueries++;
      const exact = firstRow(exactStmt, [query]);
      if (exact) {
        const entry = parseEntry(exact);
        setLru(lookupCache, query, entry, 512);
        return entry;
      }
      stats.exactReadingQueries++;
      const reading = firstRow(readingStmt, [query]);
      const entry = reading ? parseEntry(reading) : null;
      setLru(lookupCache, query, entry, 512);
      return entry;
    },
    prefixSearch(query, limit, stats) {
      const cacheKey = `${query}\u0000${limit}`;
      const cached = getLru(prefixCache, cacheKey);
      if (cached !== undefined) {
        stats.prefixCacheHits++;
        return cached;
      }

      stats.prefixQueries++;
      prefixStmt.bind([query, getPrefixUpperBound(query), limit]);
      const rows = [];
      while (prefixStmt.step()) rows.push(parseEntry(prefixStmt.getAsObject()));
      prefixStmt.reset();
      setLru(prefixCache, cacheKey, rows, 256);
      return rows;
    },
    lookupFirstCandidate(candidates, stats) {
      return lookupFirstCandidateFromSqlite(candidates, stats, {
        db,
        lookupCache,
      });
    },
    close() {
      exactStmt.free();
      readingStmt.free();
      prefixStmt.free();
      db.close();
    },
  };
}

function firstRow(stmt, params) {
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.reset();
  return row;
}

function lookupFirstCandidateFromMaps(candidates, stats, source) {
  const uniqueTexts = [...new Set(candidates.map((candidate) => candidate.text))];
  const entriesByText = new Map();
  const missingTexts = [];

  for (const text of uniqueTexts) {
    const cached = getLru(source.lookupCache, text);
    if (cached !== undefined) {
      stats.lookupCacheHits++;
      entriesByText.set(text, cached);
    } else {
      missingTexts.push(text);
    }
  }

  if (missingTexts.length > 0) {
    stats.exactWordQueries++;
    const exactByWord = new Map();
    for (const text of missingTexts) {
      const row = source.byWord.get(text);
      if (row) exactByWord.set(text, parseEntry(row));
    }

    const missingReadingTexts = missingTexts.filter((text) => !exactByWord.has(text));
    const exactByReading = new Map();
    if (missingReadingTexts.length > 0) {
      stats.exactReadingQueries++;
      for (const text of missingReadingTexts) {
        const row = source.byReading.get(text);
        if (row) exactByReading.set(text, parseEntry(row));
      }
    }

    for (const text of missingTexts) {
      const entry = exactByWord.get(text) ?? exactByReading.get(text) ?? null;
      entriesByText.set(text, entry);
      setLru(source.lookupCache, text, entry, 512);
    }
  }

  return pickFirstCandidateEntry(candidates, entriesByText);
}

function lookupFirstCandidateFromSqlite(candidates, stats, source) {
  const uniqueTexts = [...new Set(candidates.map((candidate) => candidate.text))];
  const entriesByText = new Map();
  const missingTexts = [];

  for (const text of uniqueTexts) {
    const cached = getLru(source.lookupCache, text);
    if (cached !== undefined) {
      stats.lookupCacheHits++;
      entriesByText.set(text, cached);
    } else {
      missingTexts.push(text);
    }
  }

  if (missingTexts.length > 0) {
    stats.exactWordQueries++;
    const exactByWord = selectFirstEntriesByColumnSqlite(source.db, 'word', missingTexts);
    const missingReadingTexts = missingTexts.filter((text) => !exactByWord.has(text));
    const exactByReading = new Map();
    if (missingReadingTexts.length > 0) {
      stats.exactReadingQueries++;
      for (const [key, entry] of selectFirstEntriesByColumnSqlite(source.db, 'reading', missingReadingTexts)) {
        exactByReading.set(key, entry);
      }
    }

    for (const text of missingTexts) {
      const entry = exactByWord.get(text) ?? exactByReading.get(text) ?? null;
      entriesByText.set(text, entry);
      setLru(source.lookupCache, text, entry, 512);
    }
  }

  return pickFirstCandidateEntry(candidates, entriesByText);
}

function selectFirstEntriesByColumnSqlite(db, column, values) {
  if (values.length === 0) return new Map();
  const placeholders = values.map(() => '?').join(', ');
  const stmt = db.prepare(`SELECT id, word, reading, pos, gloss FROM entries WHERE ${column} IN (${placeholders}) ORDER BY id ASC`);
  stmt.bind(values);
  const entries = new Map();
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const key = String(row[column] ?? '');
    if (!entries.has(key)) entries.set(key, parseEntry(row));
  }
  stmt.free();
  return entries;
}

function pickFirstCandidateEntry(candidates, entriesByText) {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const entry = entriesByText.get(candidate.text);
    if (entry) return { candidate, entry, inspected: i + 1 };
  }
  return null;
}

function lookupTokenRaw(engine, tokens, charIndex) {
  const stats = createStats();
  const token = findTokenAt(tokens, charIndex);
  if (!token || isLookupBoundary(token.surfaceForm)) return { token, match: null, stats };
  const entry = engine.lookupWord(token.surfaceForm, stats);
  return {
    token,
    match: entry ? {
      text: token.surfaceForm,
      start: token.wordPosition,
      end: token.wordPosition + token.surfaceForm.length,
      entry,
      source: 'exact',
    } : null,
    stats,
  };
}

function lookupCoveringLongest(engine, text, charIndex, maxLength) {
  const stats = createStats();
  if (!text || charIndex < 0 || charIndex >= text.length) return { match: null, candidates: [], stats };
  if (isLookupBoundary(text[charIndex])) return { match: null, candidates: [], stats };

  const span = getLookupSpan(text, charIndex, maxLength);
  if (!span) return { match: null, candidates: [], stats };

  const candidates = getCoveringCandidates(text, charIndex, span, maxLength);
  stats.candidates = candidates.length;

  if (engine.lookupFirstCandidate) {
    const exactMatch = engine.lookupFirstCandidate(candidates, stats);
    stats.exactCandidates = exactMatch?.inspected ?? candidates.length;
    if (exactMatch) {
      return { match: { ...exactMatch.candidate, entry: exactMatch.entry, source: 'exact' }, candidates, stats };
    }
  } else {
    for (const candidate of candidates) {
      stats.exactCandidates++;
      const entry = engine.lookupWord(candidate.text, stats);
      if (entry) {
        return { match: { ...candidate, entry, source: 'exact' }, candidates, stats };
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate.text.length < 2) continue;
    stats.prefixCandidates++;
    const entry = pickLongestMatch(engine.prefixSearch(candidate.text, 5, stats), new Set());
    if (entry) {
      return { match: { ...candidate, entry, source: 'prefix' }, candidates, stats };
    }
  }

  return { match: null, candidates, stats };
}

function createStats() {
  return {
    candidates: 0,
    exactCandidates: 0,
    prefixCandidates: 0,
    exactWordQueries: 0,
    exactReadingQueries: 0,
    prefixQueries: 0,
    lookupCacheHits: 0,
    prefixCacheHits: 0,
  };
}

function summarizeLookup(match, durationMs, stats) {
  return {
    hit: Boolean(match),
    durationMs: round(durationMs, 4),
    source: match?.source ?? null,
    matchedText: match?.text ?? '',
    matchStart: match?.start ?? null,
    matchEnd: match?.end ?? null,
    entry: match ? {
      id: match.entry.id,
      word: match.entry.word,
      reading: match.entry.reading,
      pos: match.entry.pos,
      gloss: match.entry.gloss.slice(0, 3).map((text) => truncateText(text, 180)),
    } : null,
    stats,
  };
}

function parseEntry(row) {
  return {
    id: Number(row.id),
    word: String(row.word ?? ''),
    reading: String(row.reading ?? ''),
    pos: String(row.pos ?? '').split(',').filter(Boolean),
    gloss: String(row.gloss ?? '').split(';').filter(Boolean),
  };
}

async function createTokenizer() {
  try {
    const mod = await import('tiny-segmenter');
    const TinySegmenter = mod.default || mod;
    const segmenter = new TinySegmenter();
    return (text) => segmentWithTinySegmenter(segmenter, text);
  } catch {
    return fallbackTokenize;
  }
}

function segmentWithTinySegmenter(segmenter, text) {
  const surfaces = segmenter.segment(text);
  const tokens = [];
  let charPos = 0;

  for (const surface of surfaces) {
    if (!surface.trim() || /^\s+$/.test(surface)) {
      charPos += surface.length;
      continue;
    }
    tokens.push({
      surfaceForm: surface,
      baseForm: surface,
      wordPosition: charPos,
    });
    charPos += surface.length;
  }
  return tokens;
}

function fallbackTokenize(text) {
  const tokens = [];
  const re = /([一-龯々〆]{1,2}|[ぁ-んー]+|[ァ-ンー]+|[A-Za-z0-9]+|[　-〿]+|[^A-Za-z0-9　-〿぀-ゟ゠-ヿ一-龯々〆]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const surfaceForm = match[0].trim();
    if (!surfaceForm || /^\s+$/.test(surfaceForm)) continue;
    tokens.push({
      surfaceForm,
      baseForm: surfaceForm,
      wordPosition: match.index,
    });
  }
  return tokens;
}

function findTokenAt(tokens, charIndex) {
  for (const token of tokens) {
    const end = token.wordPosition + token.surfaceForm.length;
    if (charIndex >= token.wordPosition && charIndex < end) return token;
  }
  return null;
}

function indexSentences(text) {
  const sentences = [];
  const re = /[^。！？!?]+[。！？!?]?/gu;
  let match;
  let index = 0;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leading = raw.indexOf(trimmed[0]);
    sentences.push({
      index,
      start: match.index + Math.max(0, leading),
      end: match.index + raw.length,
      text: trimmed,
    });
    index++;
  }
  return sentences;
}

function findSentence(sentences, globalIndex) {
  let lo = 0;
  let hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const sentence = sentences[mid];
    if (globalIndex < sentence.start) hi = mid - 1;
    else if (globalIndex >= sentence.end) lo = mid + 1;
    else return sentence;
  }
  return {
    index: -1,
    start: Math.max(0, globalIndex - 40),
    end: Math.min(globalIndex + 40, novelText.length),
    text: novelText.slice(Math.max(0, globalIndex - 40), Math.min(globalIndex + 40, novelText.length)),
  };
}

function collectValidPositions(text) {
  const positions = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (isJapaneseLookupChar(char)) positions.push(i);
  }
  return positions;
}

function isJapaneseLookupChar(char) {
  if (!char || isLookupBoundary(char)) return false;
  return /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff々〆]/u.test(char);
}

function isLookupBoundary(char) {
  return /[\s！？。、，．…「」『』（）［］【】《》〈〉・･,.;:!?()[\]{}"'`~―\-]/u.test(char);
}

function getLookupSpan(text, charIndex, maxCandidateLength) {
  let start = charIndex;
  let end = charIndex + 1;

  while (start > 0 && !isLookupBoundary(text[start - 1])) start--;
  while (end < text.length && !isLookupBoundary(text[end])) end++;

  const limitedStart = Math.max(start, charIndex - maxCandidateLength + 1);
  const limitedEnd = Math.min(end, charIndex + maxCandidateLength);
  if (limitedStart >= limitedEnd) return null;
  return { start: limitedStart, end: limitedEnd };
}

function getCoveringCandidates(text, charIndex, span, maxCandidateLength) {
  const candidates = [];
  const maxLength = Math.min(maxCandidateLength, span.end - span.start);

  for (let length = maxLength; length >= 1; length--) {
    const minStart = Math.max(span.start, charIndex - length + 1);
    const maxStart = Math.min(charIndex, span.end - length);
    for (let start = minStart; start <= maxStart; start++) {
      const end = start + length;
      const candidateText = text.slice(start, end).trim();
      if (!candidateText || candidateText.length !== length) continue;
      candidates.push({ text: candidateText, start, end });
    }
  }

  return candidates;
}

function pickLongestMatch(matches, seen) {
  const unseen = matches.filter((entry) => !seen.has(entry.id));
  if (unseen.length === 0) return null;
  return unseen.reduce((a, b) => (a.word.length >= b.word.length ? a : b));
}

function buildSummary(samples, meta) {
  const cover = samples.map((sample) => sample.coverLongest);
  const token = samples.map((sample) => sample.tokenRaw);
  return {
    generatedAt: new Date().toISOString(),
    ...meta,
    sourceFile: basename(meta.sourcePath),
    dictFile: basename(meta.dictPath),
    tokenRaw: summarizeStrategy(token),
    coverLongest: summarizeStrategy(cover),
    deltas: {
      hitRatePoints: round(summarizeStrategy(cover).hitRate - summarizeStrategy(token).hitRate, 4),
      p95DurationMs: round(percentile(cover.map((x) => x.durationMs), 0.95) - percentile(token.map((x) => x.durationMs), 0.95), 4),
      avgQueryMultiplier: round(avg(cover.map(totalQueries)) / Math.max(0.0001, avg(token.map(totalQueries))), 2),
    },
    manualAnnotationRows: Math.min(meta.manualCount, samples.length),
  };
}

function summarizeStrategy(lookups) {
  const durations = lookups.map((lookup) => lookup.durationMs);
  const hitCount = lookups.filter((lookup) => lookup.hit).length;
  const sources = countBy(lookups.map((lookup) => lookup.source ?? 'miss'));
  return {
    samples: lookups.length,
    hitCount,
    missCount: lookups.length - hitCount,
    hitRate: round(hitCount / Math.max(1, lookups.length), 4),
    durationMs: summarizeNumbers(durations),
    candidates: summarizeNumbers(lookups.map((lookup) => lookup.stats.candidates ?? 0)),
    exactCandidates: summarizeNumbers(lookups.map((lookup) => lookup.stats.exactCandidates ?? 0)),
    prefixCandidates: summarizeNumbers(lookups.map((lookup) => lookup.stats.prefixCandidates ?? 0)),
    exactWordQueries: summarizeNumbers(lookups.map((lookup) => lookup.stats.exactWordQueries ?? 0)),
    exactReadingQueries: summarizeNumbers(lookups.map((lookup) => lookup.stats.exactReadingQueries ?? 0)),
    prefixQueries: summarizeNumbers(lookups.map((lookup) => lookup.stats.prefixQueries ?? 0)),
    lookupCacheHits: summarizeNumbers(lookups.map((lookup) => lookup.stats.lookupCacheHits ?? 0)),
    prefixCacheHits: summarizeNumbers(lookups.map((lookup) => lookup.stats.prefixCacheHits ?? 0)),
    totalQueries: summarizeNumbers(lookups.map(totalQueries)),
    sources,
  };
}

function totalQueries(lookup) {
  return (lookup.stats.exactWordQueries ?? 0)
    + (lookup.stats.exactReadingQueries ?? 0)
    + (lookup.stats.prefixQueries ?? 0);
}

function summarizeNumbers(values) {
  return {
    min: round(Math.min(...values), 4),
    p50: round(percentile(values, 0.5), 4),
    p95: round(percentile(values, 0.95), 4),
    p99: round(percentile(values, 0.99), 4),
    max: round(Math.max(...values), 4),
    avg: round(avg(values), 4),
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function renderReport(summary, manualSamples) {
  const lines = [];
  lines.push('# 字典查询精准度与速度基准报告');
  lines.push('');
  lines.push(`更新时间：${summary.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push('## 运行配置');
  lines.push('');
  lines.push(`- 源文本：\`${summary.sourceFile}\``);
  lines.push(`- 词典：\`${summary.dictFile}\`，${summary.dictEntries.toLocaleString()} 条`);
  lines.push(`- 随机种子：\`${summary.seed}\``);
  lines.push(`- 样本数：${summary.sampleCount}`);
  lines.push(`- 人工标注样本：${summary.manualAnnotationRows}`);
  lines.push(`- 引擎：\`${summary.engineName}\`，SQLite 索引模式：\`${summary.sqliteIndexes}\``);
  lines.push(`- 最大覆盖候选长度：${summary.maxCandidateLength}`);
  lines.push(`- 引擎构建耗时：${summary.engineBuildMs.toFixed(1)}ms；总耗时：${summary.totalMs.toFixed(1)}ms`);
  lines.push('');
  lines.push('说明：Node 不能直接调用 React Native `expo-sqlite` 同步数据库实例。本报告的默认 `memory` 引擎复刻当前查词候选生成、exact 和 prefix 选择逻辑，用于稳定抽样、命中率和查询次数基线；真实 SQL/设备耗时仍需用真机验证。脚本也提供 `--engine sqlite` 作为 sql.js 近似测量。');
  lines.push('');
  lines.push('## 指标摘要');
  lines.push('');
  lines.push('| 策略 | 命中率 | 命中/样本 | 耗时 p50 | 耗时 p95 | 耗时 p99 | 平均 SQL 类查询次数 | p95 查询次数 | 来源分布 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  lines.push(renderStrategyRow('token 原始命中', summary.tokenRaw));
  lines.push(renderStrategyRow('字符覆盖最长匹配', summary.coverLongest));
  lines.push('');
  lines.push('## 初步结论');
  lines.push('');
  lines.push(`- 字符覆盖最长匹配相对 token 原始命中提升命中率 ${formatPercent(summary.deltas.hitRatePoints)}，但 p95 耗时差为 ${summary.deltas.p95DurationMs}ms。`);
  lines.push(`- 字符覆盖最长匹配的平均查询次数约为 token 原始命中的 ${summary.deltas.avgQueryMultiplier} 倍；如果真机变慢，优先怀疑候选枚举导致的多次 exact/prefix SQLite 查询。`);
  lines.push('- 当前业务 schema 未见 `entries(word)` / `entries(reading)` 普通索引；`lookupWord` 不走 FTS，真机上应重点验证无索引 equality scan 是否是主要慢点。');
  lines.push('- 本轮不建议直接引入大型内存 trie；先用本基线确认查询次数，再在真机上对比增加普通索引、LRU 缓存、候选批量查询或减少 prefix 次数。');
  lines.push('');
  lines.push('## 真机验证事项');
  lines.push('');
  lines.push('- 在 Android 真机首次导入词典后，随机点按同一测试 TXT，记录查词卡片出现耗时 p50/p95/p99。');
  lines.push('- 若能添加临时日志，记录 `lookupLongestTextMatchAt` 每次 exact/prefix 查询次数，并与本报告分布对齐。');
  lines.push('- 用 `--engine sqlite --sqlite-indexes none` 和 `--engine sqlite --sqlite-indexes word` 分别跑小样本，辅助判断普通索引收益；最终仍以 `expo-sqlite` 真机为准。');
  lines.push('');
  lines.push('## 人工标注 JSONL 样本');
  lines.push('');
  lines.push('字段包含原句、点击位置、候选片段、token 原始命中、字符覆盖最长匹配和空白 `annotation.label`。建议填入 `useful` / `not_useful` / `missing` / `wrong_hit`。');
  lines.push('');
  lines.push('```jsonl');
  for (const sample of manualSamples) lines.push(JSON.stringify(sample));
  lines.push('```');
  lines.push('');
  lines.push('## 复现命令');
  lines.push('');
  lines.push('```powershell');
  lines.push('node scripts/dictionary-benchmark.mjs --samples 500 --manual 100 --write-report');
  lines.push('node scripts/dictionary-benchmark.mjs --samples 500 --format jsonl > dictionary-benchmark-samples.jsonl');
  lines.push('node scripts/dictionary-benchmark.mjs --samples 500 --format csv > dictionary-benchmark-samples.csv');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderStrategyRow(label, summary) {
  return [
    label,
    formatPercent(summary.hitRate),
    `${summary.hitCount}/${summary.samples}`,
    `${summary.durationMs.p50}ms`,
    `${summary.durationMs.p95}ms`,
    `${summary.durationMs.p99}ms`,
    summary.totalQueries.avg,
    summary.totalQueries.p95,
    Object.entries(summary.sources).map(([key, value]) => `${key}:${value}`).join(', '),
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function printSummary(summary, outputPath) {
  console.log('Dictionary benchmark summary');
  console.log(`Source: ${summary.sourceFile}`);
  console.log(`Dictionary entries: ${summary.dictEntries}`);
  console.log(`Seed: ${summary.seed}`);
  console.log(`Samples: ${summary.sampleCount}`);
  console.log(`Engine: ${summary.engineName} (sqlite-indexes=${summary.sqliteIndexes})`);
  console.log('');
  console.log('tokenRaw:', JSON.stringify(summary.tokenRaw, null, 2));
  console.log('coverLongest:', JSON.stringify(summary.coverLongest, null, 2));
  console.log('deltas:', JSON.stringify(summary.deltas, null, 2));
  if (outputPath) console.log(`Report written: ${outputPath}`);
}

function toCsv(samples) {
  const headers = [
    'sampleId',
    'sourceFile',
    'sentenceIndex',
    'globalCharIndex',
    'charIndexInSentence',
    'clickedChar',
    'sentence',
    'tokenSurface',
    'tokenHit',
    'tokenWord',
    'tokenReading',
    'tokenDurationMs',
    'coverHit',
    'coverSource',
    'coverMatchedText',
    'coverWord',
    'coverReading',
    'coverDurationMs',
    'coverCandidates',
    'coverTotalQueries',
    'annotationLabel',
    'annotationNote',
  ];
  const rows = samples.map((sample) => [
    sample.sampleId,
    sample.sourceFile,
    sample.sentenceIndex,
    sample.globalCharIndex,
    sample.charIndexInSentence,
    sample.clickedChar,
    sample.sentence,
    sample.token?.surfaceForm ?? '',
    sample.tokenRaw.hit,
    sample.tokenRaw.entry?.word ?? '',
    sample.tokenRaw.entry?.reading ?? '',
    sample.tokenRaw.durationMs,
    sample.coverLongest.hit,
    sample.coverLongest.source ?? '',
    sample.coverLongest.matchedText,
    sample.coverLongest.entry?.word ?? '',
    sample.coverLongest.entry?.reading ?? '',
    sample.coverLongest.durationMs,
    sample.coverLongest.stats.candidates,
    totalQueries(sample.coverLongest),
    sample.annotation.label,
    sample.annotation.note,
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function truncateText(text, maxLength) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getPrefixUpperBound(query) {
  const chars = Array.from(query);
  if (chars.length === 0) return '\u{10ffff}';

  const last = chars[chars.length - 1];
  const codePoint = last.codePointAt(0);
  if (codePoint === undefined || codePoint >= 0x10ffff) return `${query}\u{10ffff}`;

  chars[chars.length - 1] = String.fromCodePoint(codePoint + 1);
  return chars.join('');
}

function getLru(cache, key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setLru(cache, key, value, limit) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatPercent(value) {
  return `${round(value * 100, 2)}%`;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sampleWithoutReplacement(size, count, rng) {
  const picked = new Set();
  while (picked.size < count) {
    picked.add(Math.floor(rng() * size));
  }
  return [...picked];
}

function mulberry32(seedValue) {
  let state = seedValue >>> 0;
  return function next() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fail(message) {
  console.error(`dictionary-benchmark: ${message}`);
  process.exit(1);
}
