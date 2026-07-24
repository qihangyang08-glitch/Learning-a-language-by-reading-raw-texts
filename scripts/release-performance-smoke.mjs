#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SENTENCE_WINDOW_RADIUS = 50;
const MIN_SENTENCE_LENGTH = 2;
const MAX_SENTENCE_LENGTH = 500;
const DICT_VERSION = 5;
const MIN_EXPECTED_DICT_ENTRIES = 100_000;

const DEFAULTS = {
  iterations: 3,
  windows: 250,
  cacheRanges: 250,
  cacheStride: 3,
  dictionaryChunkSize: 5000,
  sentenceChunkSize: 500,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--txt') args.txt = next, i += 1;
    else if (arg === '--epub') args.epub = next, i += 1;
    else if (arg === '--iterations') args.iterations = Number(next), i += 1;
    else if (arg === '--windows') args.windows = Number(next), i += 1;
    else if (arg === '--cache-ranges') args.cacheRanges = Number(next), i += 1;
    else if (arg === '--skip-dictionary-import') args.skipDictionaryImport = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/release-performance-smoke.mjs [options]',
    '',
    'Options:',
    '  --txt <path>                 TXT fixture path, defaults to the first root .txt novel',
    '  --epub <path>                EPUB fixture path, defaults to the first root .epub novel',
    '  --iterations <n>             Parse/import repeat count, default 3',
    '  --windows <n>                loadSentenceWindow samples, default 250',
    '  --cache-ranges <n>           translation cache range samples, default 250',
    '  --skip-dictionary-import     Only inspect dictionary assets; skip full import simulation',
    '  --json                       Emit JSON instead of a readable text report',
  ].join('\n');
}

function resolveFixture(explicit, extension) {
  if (explicit) return path.resolve(ROOT, explicit);
  const files = fs.readdirSync(ROOT)
    .filter((name) => name.toLowerCase().endsWith(extension))
    .sort((a, b) => a.localeCompare(b));
  return files.length > 0 ? path.join(ROOT, files[0]) : null;
}

function timeSync(label, fn) {
  const start = performance.now();
  const value = fn();
  return { label, ms: performance.now() - start, value };
}

async function timeAsync(label, fn) {
  const start = performance.now();
  const value = await fn();
  return { label, ms: performance.now() - start, value };
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function stats(values) {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length === 0) return { count: 0, min: null, max: null, avg: null, p50: null, p95: null, p99: null };
  const sum = filtered.reduce((a, b) => a + b, 0);
  return {
    count: filtered.length,
    min: Math.min(...filtered),
    max: Math.max(...filtered),
    avg: sum / filtered.length,
    p50: percentile(filtered, 50),
    p95: percentile(filtered, 95),
    p99: percentile(filtered, 99),
  };
}

function mb(bytes) {
  return bytes == null ? null : bytes / 1024 / 1024;
}

function memorySample(label) {
  const mem = process.memoryUsage();
  return {
    label,
    rssMB: mb(mem.rss),
    heapUsedMB: mb(mem.heapUsed),
    externalMB: mb(mem.external),
    arrayBuffersMB: mb(mem.arrayBuffers),
  };
}

function formatMs(ms) {
  return ms == null ? 'n/a' : `${ms.toFixed(2)} ms`;
}

function formatMB(value) {
  return value == null ? 'n/a' : `${value.toFixed(1)} MB`;
}

function createRng(seed = 0x57c0de) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function isSentenceEnd(char) {
  return /[。！？!?]/u.test(char);
}

function isQuoteClose(char) {
  return /[」』）】》〉]/u.test(char);
}

function shouldContinueAfterQuote(text) {
  return /^[とて]?([言思答叫呟囁笑聞尋]|い|おも|こた|さけ|つぶや|ささや|わら|き)/u.test(text.trimStart());
}

function segment(rawText) {
  const sentences = [];
  let current = '';

  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i];
    current += char;

    if (isSentenceEnd(char)) {
      if (isQuoteClose(char) && i < rawText.length - 1 && shouldContinueAfterQuote(rawText.slice(i + 1))) {
        continue;
      }
      if (i < rawText.length - 1 && isQuoteClose(rawText[i + 1])) {
        current += rawText[i + 1];
        i += 1;
      }
      while (i < rawText.length - 1 && /[！？!?]/u.test(rawText[i + 1])) {
        current += rawText[i + 1];
        i += 1;
      }
      current = current.trim();
      if (current.length >= MIN_SENTENCE_LENGTH) {
        sentences.push(current);
        current = '';
      }
    }

    if (current.length > MAX_SENTENCE_LENGTH) {
      const lastDelim = Math.max(current.lastIndexOf('。'), current.lastIndexOf('、'), current.lastIndexOf('，'));
      if (lastDelim > 0) {
        const part = current.slice(0, lastDelim + 1).trim();
        if (part.length >= MIN_SENTENCE_LENGTH) sentences.push(part);
        current = current.slice(lastDelim + 1);
      } else {
        sentences.push(current.trim());
        current = '';
      }
    }
  }

  const remaining = current.trim();
  if (remaining.length >= MIN_SENTENCE_LENGTH) sentences.push(remaining);
  else if (remaining.length > 0 && sentences.length > 0) sentences[sentences.length - 1] += remaining;
  return sentences;
}

function parseTxt(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = text.split('\n');
  let title = 'Untitled';
  let contentStart = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i += 1) {
    const line = lines[i].trim();
    if (line.length > 0 && line.length < 100) {
      title = line;
      contentStart = i + 1;
      break;
    }
  }
  const body = lines.slice(contentStart).join('\n');
  const rawChapters = body.split(/\n{2,}/).filter((chapter) => chapter.trim().length > 0);
  return {
    meta: { title, author: '', format: 'txt' },
    chapters: rawChapters.map((chapter, index) => ({
      index,
      title: index === 0 ? title : undefined,
      raw: chapter.replace(/\n/g, '').trim(),
      images: [],
    })),
  };
}

function extractAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? match[1] : undefined;
}

function parseOpf(xml) {
  const manifest = {};
  const spine = [];
  const metadata = {};
  const imageMap = {};

  const itemTagRegex = /<item\b([^>]*?)\s*\/?>/gi;
  let match;
  while ((match = itemTagRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const id = extractAttr(attrs, 'id');
    const href = extractAttr(attrs, 'href');
    const mediaType = extractAttr(attrs, 'media-type');
    if (!id || !href) continue;
    if (mediaType && mediaType.startsWith('image/')) imageMap[id] = { href, mediaType };
    else manifest[id] = href;
  }

  if (Object.keys(manifest).length === 0) {
    const simpleRegex = /<item[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*\/?>/gi;
    while ((match = simpleRegex.exec(xml)) !== null) {
      const href = match[2];
      const ext = href.split('.').pop()?.toLowerCase() || '';
      if (!['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) manifest[match[1]] = href;
    }
  }

  const spineRegex = /<itemref[^>]*idref="([^"]*)"[^>]*\/?>/gi;
  while ((match = spineRegex.exec(xml)) !== null) spine.push(match[1]);

  const titleMatch = xml.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/i);
  if (titleMatch) metadata.title = decodeEntities(titleMatch[1].trim());
  const creatorMatch = xml.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/i);
  if (creatorMatch) metadata.creator = decodeEntities(creatorMatch[1].trim());

  return { manifest, spine, metadata, imageMap };
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'");
}

function verticalToHorizontal(text) {
  return text
    .replace(/﹒/g, '。')
    .replace(/､/g, '、')
    .replace(/¢/g, '！')
    .replace(/ﾂ?/g, '？');
}

function extractText(html, imageMap) {
  const isVertical = /writing-mode\s*:\s*vertical-rl/.test(html) || /-epub-writing-mode\s*:\s*vertical-rl/.test(html);
  const images = [];
  const imgRegex = /<img[^>]*src="([^"]*)"[^>]*?(?:alt="([^"]*)")?[^>]*\/?>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const src = imgMatch[1];
    const srcFile = src.split('/').pop();
    const found = Object.values(imageMap).find((info) => {
      const hrefFile = info.href.split('/').pop();
      return src === info.href || src.endsWith(info.href) || (srcFile && hrefFile && srcFile === hrefFile);
    });
    if (found) images.push({ src, mediaType: found.mediaType, position: imgMatch.index, alt: imgMatch[2] || '' });
  }

  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*\/?>/gi, '【插图】')
    .replace(/<image[^>]*\/?>/gi, '【插图】')
    .replace(/<[^>]*>/g, '');
  text = decodeEntities(text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: isVertical ? verticalToHorizontal(text) : text, isVertical, images };
}

async function parseEpub(filePath) {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Invalid EPUB: missing META-INF/container.xml');
  const containerXml = await containerFile.async('text');
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('Invalid EPUB: no OPF path in container.xml');
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  const opfXml = await opfFile.async('text');
  const { manifest, spine, metadata, imageMap } = parseOpf(opfXml);
  const opfBase = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const chapters = [];

  for (let i = 0; i < spine.length; i += 1) {
    const href = manifest[spine[i]];
    if (!href) continue;
    const fullHref = opfBase + href;
    const contentFile = zip.file(fullHref) || zip.file(href);
    if (!contentFile) continue;
    const html = await contentFile.async('text');
    const { text, images } = extractText(html, imageMap);
    if (text.trim().length === 0 && images.length === 0) continue;
    chapters.push({ index: i, title: undefined, raw: text, images });
  }

  return {
    meta: { title: metadata.title || 'Untitled', author: metadata.creator || '', format: 'epub' },
    chapters,
    imageCount: Object.keys(imageMap).length,
    spineCount: spine.length,
    manifestCount: Object.keys(manifest).length,
  };
}

function toSentences(content) {
  const all = [];
  let globalIndex = 0;
  for (const chapter of content.chapters) {
    const rawSentences = segment(chapter.raw);
    for (let i = 0; i < rawSentences.length; i += 1) {
      all.push({
        index: globalIndex,
        chapterIndex: chapter.index,
        sentenceIndex: i,
        text: rawSentences[i],
      });
      globalIndex += 1;
    }
  }
  return all;
}

function initBookshelfSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      sentence_index INTEGER NOT NULL,
      global_index INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sentences_book ON sentences(book_id, global_index);
    CREATE TABLE IF NOT EXISTS translation_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      translated TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trans_book ON translation_cache(book_id, sentence_index);
  `);
}

function storeSentences(db, bookId, sentences, chunkSize) {
  db.run('DELETE FROM sentences WHERE book_id = ?', [bookId]);
  const chunkDurations = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const chunk = sentences.slice(i, i + chunkSize);
    const start = performance.now();
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('INSERT INTO sentences (book_id, chapter_index, sentence_index, global_index, text) VALUES (?, ?, ?, ?, ?)');
    for (const sentence of chunk) {
      stmt.run([bookId, sentence.chapterIndex, sentence.sentenceIndex, sentence.index, sentence.text]);
    }
    stmt.free();
    db.run('COMMIT');
    chunkDurations.push(performance.now() - start);
  }
  return chunkDurations;
}

function loadSentenceWindow(db, bookId, centerIndex) {
  const start = Math.max(0, centerIndex - SENTENCE_WINDOW_RADIUS);
  const end = centerIndex + SENTENCE_WINDOW_RADIUS;
  const stmt = db.prepare(`
    SELECT chapter_index, sentence_index, global_index, text
    FROM sentences
    WHERE book_id = ? AND global_index >= ? AND global_index <= ?
    ORDER BY global_index
  `);
  stmt.bind([bookId, start, end]);
  let rows = 0;
  while (stmt.step()) rows += 1;
  stmt.free();
  return rows;
}

function seedTranslationCache(db, bookId, sentences, stride) {
  db.run('DELETE FROM translation_cache WHERE book_id = ?', [bookId]);
  const start = performance.now();
  db.run('BEGIN TRANSACTION');
  const stmt = db.prepare('INSERT INTO translation_cache (book_id, sentence_index, translated, created_at) VALUES (?, ?, ?, ?)');
  let inserted = 0;
  for (let i = 0; i < sentences.length; i += stride) {
    stmt.run([bookId, sentences[i].index, `mock translation ${sentences[i].index}: ${sentences[i].text.slice(0, 80)}`, Date.now()]);
    inserted += 1;
  }
  stmt.free();
  db.run('COMMIT');
  return { inserted, ms: performance.now() - start };
}

function getCachedTranslations(db, bookId, fromIndex, toIndex) {
  const stmt = db.prepare(`
    SELECT sentence_index, translated
    FROM translation_cache
    WHERE book_id = ? AND sentence_index >= ? AND sentence_index <= ?
  `);
  stmt.bind([bookId, fromIndex, toIndex]);
  let rows = 0;
  while (stmt.step()) rows += 1;
  stmt.free();
  return rows;
}

function runWindowBenchmarks(db, bookId, totalSentences, samples, rng) {
  const timings = [];
  const counts = [];
  for (let i = 0; i < samples; i += 1) {
    const center = Math.floor(rng() * totalSentences);
    const start = performance.now();
    counts.push(loadSentenceWindow(db, bookId, center));
    timings.push(performance.now() - start);
  }
  return { timings: stats(timings), rowCounts: stats(counts) };
}

function runCacheBenchmarks(db, bookId, totalSentences, samples, rng) {
  const timings = [];
  const counts = [];
  for (let i = 0; i < samples; i += 1) {
    const center = Math.floor(rng() * totalSentences);
    const from = Math.max(0, center - SENTENCE_WINDOW_RADIUS);
    const to = center + SENTENCE_WINDOW_RADIUS;
    const start = performance.now();
    counts.push(getCachedTranslations(db, bookId, from, to));
    timings.push(performance.now() - start);
  }
  return { timings: stats(timings), rowCounts: stats(counts) };
}

function initDictionarySchema(db, ftsAvailable) {
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      reading TEXT NOT NULL,
      pos TEXT,
      gloss TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dict_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  if (ftsAvailable) {
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      word, reading, gloss,
      content='entries', content_rowid='id'
    );`);
  }
}

function testFtsAvailability(SQL) {
  const db = new SQL.Database();
  try {
    db.run('CREATE VIRTUAL TABLE fts_probe USING fts5(value)');
    db.close();
    return true;
  } catch {
    db.close();
    return false;
  }
}

function inspectBundledDictionaryDb(SQL, failPoints) {
  const dbPath = path.join(ROOT, 'assets', 'dictionary', 'jareader.db');
  if (!fs.existsSync(dbPath)) {
    return { exists: false, optional: true };
  }

  const bytes = fs.readFileSync(dbPath);
  try {
    const db = new SQL.Database(bytes);
    const entries = db.exec('SELECT COUNT(*) AS count FROM entries')?.[0]?.values?.[0]?.[0] ?? null;
    const version = db.exec("SELECT value FROM dict_meta WHERE key = 'version'")?.[0]?.values?.[0]?.[0] ?? null;
    db.close();
    return { exists: true, sizeBytes: bytes.length, entries, version };
  } catch (error) {
    return { exists: true, optional: true, sizeBytes: bytes.length, error: error.message };
  }
}

function runDictionaryInitSimulation(SQL, options, failPoints) {
  const jsonPath = path.join(ROOT, 'assets', 'dictionary', 'dict-data.json');
  const bundledDb = inspectBundledDictionaryDb(SQL, failPoints);
  const ftsAvailableInNode = testFtsAvailability(SQL);
  const result = {
    dictVersion: DICT_VERSION,
    minExpectedEntries: MIN_EXPECTED_DICT_ENTRIES,
    jsonPath,
    jsonExists: fs.existsSync(jsonPath),
    bundledDb,
    ftsAvailableInNode,
    skippedImport: !!options.skipDictionaryImport,
  };

  if (!result.jsonExists) {
    failPoints.push('assets/dictionary/dict-data.json is missing.');
    return result;
  }

  result.jsonSizeBytes = fs.statSync(jsonPath).size;
  if (options.skipDictionaryImport) return result;

  const read = timeSync('dictionary json read', () => fs.readFileSync(jsonPath, 'utf8'));
  const parsed = timeSync('dictionary json parse', () => JSON.parse(read.value));
  if (!Array.isArray(parsed.value) || parsed.value.length < MIN_EXPECTED_DICT_ENTRIES) {
    failPoints.push(`Dictionary JSON has ${Array.isArray(parsed.value) ? parsed.value.length : 0} entries; expected at least ${MIN_EXPECTED_DICT_ENTRIES}.`);
  }

  const mapped = timeSync('dictionary map entries', () => parsed.value.map((entry) => ({
    word: entry.w || '',
    reading: entry.r || '',
    pos: entry.p || '',
    gloss: entry.g || '',
  })));

  const db = new SQL.Database();
  const schema = timeSync('dictionary schema init', () => initDictionarySchema(db, ftsAvailableInNode));
  const chunkDurations = [];
  const importStart = performance.now();
  for (let i = 0; i < mapped.value.length; i += options.dictionaryChunkSize) {
    const chunk = mapped.value.slice(i, i + options.dictionaryChunkSize);
    const chunkStart = performance.now();
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('INSERT INTO entries (word, reading, pos, gloss) VALUES (?, ?, ?, ?)');
    for (const entry of chunk) stmt.run([entry.word, entry.reading, entry.pos, entry.gloss]);
    stmt.free();
    db.run('COMMIT');
    chunkDurations.push(performance.now() - chunkStart);
  }
  const importMs = performance.now() - importStart;
  const versionWrite = timeSync('dictionary version write', () => {
    db.run("INSERT OR REPLACE INTO dict_meta (key, value) VALUES ('version', ?)", [String(DICT_VERSION)]);
  });

  let ftsBuild = { available: ftsAvailableInNode, skipped: !ftsAvailableInNode };
  if (ftsAvailableInNode) {
    const measured = timeSync('dictionary FTS build', () => {
      db.run('INSERT INTO entries_fts(rowid, word, reading, gloss) SELECT id, word, reading, gloss FROM entries');
    });
    ftsBuild = { available: true, ms: measured.ms };
  } else {
    failPoints.push('Node sql.js build does not include FTS5; measure FTS build on Expo/Android with expo-sqlite.');
  }

  const count = db.exec('SELECT COUNT(*) AS count FROM entries')?.[0]?.values?.[0]?.[0] ?? 0;
  db.close();

  return {
    ...result,
    entries: mapped.value.length,
    timings: {
      readJsonMs: read.ms,
      parseJsonMs: parsed.ms,
      mapEntriesMs: mapped.ms,
      schemaInitMs: schema.ms,
      importEntriesMs: importMs,
      versionWriteMs: versionWrite.ms,
      chunkInsertMs: stats(chunkDurations),
      ftsBuild,
      totalMs: read.ms + parsed.ms + mapped.ms + schema.ms + importMs + versionWrite.ms + (ftsBuild.ms || 0),
    },
    finalEntryCount: count,
  };
}

async function runImportBenchmark(SQL, label, filePath, parseFn, options, failPoints) {
  if (!filePath || !fs.existsSync(filePath)) {
    failPoints.push(`${label.toUpperCase()} fixture is missing: ${filePath || '(not found)'}`);
    return { label, exists: false, filePath };
  }

  const iterations = [];
  for (let i = 0; i < options.iterations; i += 1) {
    const parse = await timeAsync(`${label} parse`, () => parseFn(filePath));
    const sentenceBuild = timeSync(`${label} sentence segmentation`, () => toSentences(parse.value));
    const db = new SQL.Database();
    initBookshelfSchema(db);
    const store = timeSync(`${label} store sentences`, () => storeSentences(db, `smoke-${label}`, sentenceBuild.value, options.sentenceChunkSize));
    const translationSeed = seedTranslationCache(db, `smoke-${label}`, sentenceBuild.value, options.cacheStride);
    const rng = createRng(0x57c0de + i);
    const windowBench = runWindowBenchmarks(db, `smoke-${label}`, sentenceBuild.value.length, options.windows, rng);
    const cacheBench = runCacheBenchmarks(db, `smoke-${label}`, sentenceBuild.value.length, options.cacheRanges, rng);
    db.close();

    iterations.push({
      iteration: i + 1,
      parseMs: parse.ms,
      segmentMs: sentenceBuild.ms,
      storeSentencesMs: store.ms,
      storeChunkMs: stats(store.value),
      translationSeedMs: translationSeed.ms,
      translationSeedRows: translationSeed.inserted,
      chapterCount: parse.value.chapters.length,
      imageCount: parse.value.imageCount ?? parse.value.chapters.reduce((count, chapter) => count + chapter.images.length, 0),
      spineCount: parse.value.spineCount,
      manifestCount: parse.value.manifestCount,
      sentenceCount: sentenceBuild.value.length,
      loadSentenceWindow: windowBench,
      getCachedTranslations: cacheBench,
    });
  }

  return {
    label,
    exists: true,
    filePath,
    sizeBytes: fs.statSync(filePath).size,
    iterations,
    summary: {
      parseMs: stats(iterations.map((it) => it.parseMs)),
      segmentMs: stats(iterations.map((it) => it.segmentMs)),
      storeSentencesMs: stats(iterations.map((it) => it.storeSentencesMs)),
      sentenceCount: stats(iterations.map((it) => it.sentenceCount)),
      translationSeedMs: stats(iterations.map((it) => it.translationSeedMs)),
      loadSentenceWindowMs: stats(iterations.flatMap((it) => [
        it.loadSentenceWindow.timings.p50,
        it.loadSentenceWindow.timings.p95,
        it.loadSentenceWindow.timings.p99,
      ].filter((v) => v != null))),
      getCachedTranslationsMs: stats(iterations.flatMap((it) => [
        it.getCachedTranslations.timings.p50,
        it.getCachedTranslations.timings.p95,
        it.getCachedTranslations.timings.p99,
      ].filter((v) => v != null))),
    },
  };
}

function printImportResult(result) {
  if (!result.exists) {
    console.log(`\n${result.label.toUpperCase()}: missing (${result.filePath || 'not found'})`);
    return;
  }
  console.log(`\n${result.label.toUpperCase()}: ${path.relative(ROOT, result.filePath)} (${(result.sizeBytes / 1024).toFixed(1)} KB)`);
  for (const it of result.iterations) {
    console.log(`  run ${it.iteration}: parse ${formatMs(it.parseMs)}, segment ${formatMs(it.segmentMs)}, store ${formatMs(it.storeSentencesMs)}, sentences ${it.sentenceCount}, chapters ${it.chapterCount}, images ${it.imageCount}`);
    console.log(`    loadSentenceWindow p50 ${formatMs(it.loadSentenceWindow.timings.p50)}, p95 ${formatMs(it.loadSentenceWindow.timings.p95)}, p99 ${formatMs(it.loadSentenceWindow.timings.p99)}, rows p50 ${it.loadSentenceWindow.rowCounts.p50}`);
    console.log(`    getCachedTranslations p50 ${formatMs(it.getCachedTranslations.timings.p50)}, p95 ${formatMs(it.getCachedTranslations.timings.p95)}, p99 ${formatMs(it.getCachedTranslations.timings.p99)}, rows p50 ${it.getCachedTranslations.rowCounts.p50}`);
  }
}

function printDictionaryResult(result) {
  console.log('\nDICTIONARY INIT SIMULATION');
  console.log(`  JSON: ${result.jsonExists ? `${(result.jsonSizeBytes / 1024 / 1024).toFixed(1)} MB` : 'missing'}`);
  if (result.bundledDb?.exists) {
    console.log(`  bundled DB: ${(result.bundledDb.sizeBytes / 1024).toFixed(1)} KB, entries ${result.bundledDb.entries ?? 'n/a'}, version ${result.bundledDb.version ?? 'n/a'}`);
    if (result.bundledDb.error) console.log(`  bundled DB note: optional asset not usable (${result.bundledDb.error})`);
  } else {
    console.log('  bundled DB: not bundled (optional)');
  }
  console.log(`  Node FTS5 support: ${result.ftsAvailableInNode ? 'yes' : 'no'}`);
  if (result.skippedImport) {
    console.log('  full import: skipped by --skip-dictionary-import');
    return;
  }
  if (result.timings) {
    console.log(`  entries: ${result.entries}, final count ${result.finalEntryCount}`);
    console.log(`  read ${formatMs(result.timings.readJsonMs)}, parse ${formatMs(result.timings.parseJsonMs)}, map ${formatMs(result.timings.mapEntriesMs)}, insert ${formatMs(result.timings.importEntriesMs)}`);
    console.log(`  insert chunks p50 ${formatMs(result.timings.chunkInsertMs.p50)}, p95 ${formatMs(result.timings.chunkInsertMs.p95)}, p99 ${formatMs(result.timings.chunkInsertMs.p99)}`);
    console.log(`  FTS build: ${result.timings.ftsBuild.available ? formatMs(result.timings.ftsBuild.ms) : 'Expo/Android only'}`);
    console.log(`  total observed ${formatMs(result.timings.totalMs)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const failPoints = [];
  const memory = [memorySample('start')];
  const txt = resolveFixture(options.txt, '.txt');
  const epub = resolveFixture(options.epub, '.epub');
  const sqlWasmPath = path.join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => sqlWasmPath });

  const startedAt = new Date().toISOString();
  const txtResult = await runImportBenchmark(SQL, 'txt', txt, async (fixture) => parseTxt(fixture), options, failPoints);
  memory.push(memorySample('after txt'));
  const epubResult = await runImportBenchmark(SQL, 'epub', epub, parseEpub, options, failPoints);
  memory.push(memorySample('after epub'));
  const dictionaryResult = runDictionaryInitSimulation(SQL, options, failPoints);
  memory.push(memorySample('after dictionary'));

  const report = {
    startedAt,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: ROOT,
      iterations: options.iterations,
      windows: options.windows,
      cacheRanges: options.cacheRanges,
    },
    expoDocsChecked: [
      'https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md',
      'https://docs.expo.dev/versions/v57.0.0/sdk/sqlite.md',
      'https://docs.expo.dev/versions/v57.0.0/sdk/document-picker.md',
    ],
    txt: txtResult,
    epub: epubResult,
    dictionary: dictionaryResult,
    memory,
    failPoints,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('JaReader release performance smoke');
  console.log(`Started: ${startedAt}`);
  console.log(`Node: ${process.version} ${process.platform}/${process.arch}`);
  console.log(`Samples: iterations=${options.iterations}, windows=${options.windows}, cacheRanges=${options.cacheRanges}`);
  printImportResult(txtResult);
  printImportResult(epubResult);
  printDictionaryResult(dictionaryResult);

  console.log('\nMEMORY SAMPLES (Node process, not Android app RSS)');
  for (const sample of memory) {
    console.log(`  ${sample.label}: rss ${formatMB(sample.rssMB)}, heap ${formatMB(sample.heapUsedMB)}, external ${formatMB(sample.externalMB)}, arrayBuffers ${formatMB(sample.arrayBuffersMB)}`);
  }

  console.log('\nFAIL POINTS');
  if (failPoints.length === 0) console.log('  none observed in Node smoke run');
  else for (const point of failPoints) console.log(`  - ${point}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
