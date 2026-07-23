/**
 * Dictionary Builder for JaReader
 *
 * Downloads JMdict from jmdict-simplified (which includes multilingual glosses),
 * PREFERS Chinese glosses (zh/chi/cmn/yue), falls back to English if missing.
 * Filters to common words by frequency/priority tags (~20-25K entries).
 *
 * Usage:
 *   node scripts/build-dict.mjs
 *
 * Output:
 *   1. assets/dictionary/jareader.db      — pre-built SQLite DB (for fast init)
 *   2. src/services/dict-data.json        — Chinese-glossed JSON (replaces the English version)
 */

import { createWriteStream, existsSync } from 'fs';
import { mkdir, unlink, copyFile } from 'fs/promises';
import { get } from 'https';
import { pipeline } from 'stream/promises';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS_DIR = join(ROOT, 'assets', 'dictionary');
const DB_PATH = join(ASSETS_DIR, 'jareader.db');
const TEMP_DIR = join(ROOT, 'node_modules', '.cache', 'dict-build');

const GITHUB_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

/**
 * Fetch JSON from URL with retry.
 */
async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`  Fetching ${url}...`);
      const data = await new Promise((resolve, reject) => {
        let body = '';
        const req = get(url, {
          timeout: 15000,
          headers: { 'User-Agent': 'JaReader-DictBuilder/1.0' },
        }, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            fetchJson(res.headers.location).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          res.on('data', c => body += c);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return data;
    } catch (err) {
      if (attempt === 2) throw err;
      console.log(`  Retry ${attempt + 1}: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/**
 * Download a file with redirect following and retry.
 */
async function download(url, dest, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`  Downloading ${label}... (${Math.round(attempt + 1)}/3)`);
      await new Promise((resolve, reject) => {
        const file = createWriteStream(dest);
        const req = get(url, {
          timeout: 30000,
          headers: { 'User-Agent': 'JaReader-DictBuilder/1.0' },
        }, (res) => {
          // Follow redirects (GitHub release assets redirect to CDN)
          if (res.statusCode === 302 || res.statusCode === 301) {
            file.close();
            unlink(dest, () => {});
            download(res.headers.location, dest, label).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            file.close();
            unlink(dest, () => {});
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          pipeline(res, file).then(resolve).catch(reject);
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return; // success
    } catch (err) {
      if (attempt === 2) throw err;
      console.log(`  Retrying: ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function main() {
  console.log('=== JaReader Dictionary Builder ===\n');

  await mkdir(TEMP_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });

  // Step 1: Get download URL via GitHub API
  // Search for Chinese-glossed variant first, fall back to English
  console.log('Fetching latest JMdict release info...');
  const release = await fetchJson(GITHUB_API);
  const allNames = release.assets.map(a => a.name);

  // Priority order: Chinese variants first, then English as fallback
  const LANG_CODES = [
    ['zho-', 'zho'], ['zh-', 'zh'], ['chi-', 'chi'],
    ['cmn-', 'cmn'], ['zhs-', 'zhs'],
  ];

  let asset = null;
  let usedLang = 'eng';

  // Try Chinese variants
  for (const [prefix, label] of LANG_CODES) {
    asset = release.assets.find(a =>
      a.name.includes(`jmdict-${prefix}`) &&
      !a.name.includes('common') &&
      !a.name.includes('examples') &&
      a.name.endsWith('.zip')
    );
    if (asset) {
      usedLang = label;
      console.log(`Found Chinese variant: ${asset.name}`);
      break;
    }
  }

  // Fall back to English
  if (!asset) {
    asset = release.assets.find(a =>
      a.name.includes('jmdict-eng-') &&
      !a.name.includes('common') &&
      !a.name.includes('examples') &&
      a.name.endsWith('.zip')
    );
    if (asset) {
      usedLang = 'eng';
      console.log(`Using English fallback: ${asset.name}`);
      console.log('(No Chinese JMdict variant found. Chinese glosses will be extracted from multi-language entries if available.)');
      console.log('Available variants:', allNames.filter(n => n.includes('jmdict')).join(', '));
    }
  }

  if (!asset) {
    console.log('Available assets:', allNames.join(', '));
    throw new Error('Could not find any JMdict zip asset');
  }

  console.log(`Found: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)}MB) [lang: ${usedLang}]`);

  // Step 2: Download the zip (redirects to release-assets.githubusercontent.com CDN)
  const zipPath = join(TEMP_DIR, asset.name);
  if (!existsSync(zipPath)) {
    await download(asset.browser_download_url, zipPath, asset.name);
  } else {
    console.log('  Already cached.');
  }

  // Step 3: Extract the JSON from ZIP
  const jsonPath = join(TEMP_DIR, 'jmdict-eng-full.json');
  if (!existsSync(jsonPath)) {
    console.log('Extracting ZIP...');
    const JSZip = (await import('jszip')).default;
    const zipData = await (await import('fs/promises')).readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    const jsonFiles = Object.keys(zip.files).filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) throw new Error('No JSON found in ZIP');
    const content = await zip.files[jsonFiles[0]].async('string');
    await (await import('fs/promises')).writeFile(jsonPath, content, 'utf-8');
    console.log(`  Extracted: ${jsonFiles[0]} (${(content.length / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    console.log('  JSON already extracted.');
  }

  // Step 4: Parse and build SQLite
  console.log('Parsing and building SQLite database...');
  const raw = await (await import('fs/promises')).readFile(jsonPath, 'utf-8');
  const data = JSON.parse(raw);
  const words = data.words || data;

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create entries table only.
  // FTS5 index is created on-device by expo-sqlite (which supports FTS5 natively).
  // This keeps the bundle smaller and avoids sql.js FTS5 incompatibility.
  db.run(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      reading TEXT NOT NULL,
      pos TEXT,
      gloss TEXT NOT NULL
    );
  `);

  // Priority tags for filtering common words from the full JMdict
  const PRIORITY_TAGS = new Set([
    'news1', 'news2', 'ichi1', 'ichi2', 'spec1', 'spec2', 'gai1',
    'nf01', 'nf02', 'nf03', 'nf04', 'nf05', 'nf06', 'nf07', 'nf08',
    'nf09', 'nf10', 'nf11', 'nf12', 'nf13', 'nf14', 'nf15', 'nf16',
    'nf17', 'nf18', 'nf19', 'nf20', 'nf21', 'nf22', 'nf23', 'nf24',
    'nf25', 'nf26', 'nf27', 'nf28', 'nf29', 'nf30', 'nf31', 'nf32',
  ]);

  // Chinese gloss language codes
  const CHINESE_LANGS = new Set(['chi', 'zho', 'cmn', 'yue', 'zh', 'zhs', 'zht']);
  const isChineseVariant = usedLang !== 'eng';

  if (isChineseVariant) {
    console.log(`Processing ${words.length.toLocaleString()} words (Chinese variant — all glosses are Chinese)...`);
  } else {
    console.log(`Processing ${words.length.toLocaleString()} words (English variant — extracting Chinese glosses where available)...`);
  }

  db.run('BEGIN TRANSACTION;');
  const stmt = db.prepare(
    'INSERT INTO entries (word, reading, pos, gloss) VALUES (?, ?, ?, ?)'
  );

  let count = 0;
  let skipped = 0;
  let noPriority = 0;
  let noChinese = 0;

  for (const entry of words) {
    if (!entry.kanji || entry.kanji.length === 0) { skipped++; continue; }
    if (!entry.kana || entry.kana.length === 0) { skipped++; continue; }
    if (!entry.sense || entry.sense.length === 0) { skipped++; continue; }

    // Filter to common words only (frequency/priority tags)
    let hasPriority = false;
    for (const k of entry.kanji) {
      if (k.pri && k.pri.some(p => PRIORITY_TAGS.has(p))) { hasPriority = true; break; }
    }
    if (!hasPriority) {
      for (const k of (entry.kana || [])) {
        if (k.pri && k.pri.some(p => PRIORITY_TAGS.has(p))) { hasPriority = true; break; }
      }
    }
    if (!hasPriority) { noPriority++; continue; }

    const word = entry.kanji[0].text;
    const reading = entry.kana[0].text;

    const posSet = new Set();
    for (const sense of entry.sense) {
      if (sense.pos) {
        for (const p of sense.pos) posSet.add(p);
      }
    }

    const glosses = [];

    if (isChineseVariant) {
      // Chinese-specific variant: take all glosses (they're all Chinese)
      for (const sense of entry.sense) {
        if (sense.gloss) {
          for (const g of sense.gloss) {
            const text = typeof g === 'string' ? g : (g.text || '');
            if (text) glosses.push(text);
          }
        }
      }
    } else {
      // English variant: search for Chinese glosses first, fall back to English
      for (const sense of entry.sense) {
        if (sense.gloss) {
          for (const g of sense.gloss) {
            const lang = (g.lang || '').toLowerCase();
            if (CHINESE_LANGS.has(lang)) {
              glosses.push(g.text);
            }
          }
        }
      }
      // No Chinese gloss? Fall back to English
      if (glosses.length === 0) {
        noChinese++;
        for (const sense of entry.sense) {
          if (sense.gloss) {
            for (const g of sense.gloss) {
              const lang = (g.lang || '').toLowerCase();
              if (!lang || lang === 'eng') {
                glosses.push(g.text);
              }
            }
          }
        }
      }
    }

    if (glosses.length === 0) { skipped++; continue; }

    stmt.run([word, reading, Array.from(posSet).join(','), glosses.slice(0, 5).join(';')]);
    count++;

    if (count % 5000 === 0) {
      console.log(`  Inserted ${count.toLocaleString()}...`);
    }
  }

  stmt.free();
  db.run('COMMIT;');

  console.log(`  Inserted: ${count.toLocaleString()}, Skipped: ${skipped.toLocaleString()}, NoPriority: ${noPriority.toLocaleString()}, NoChinese: ${noChinese.toLocaleString()}`);

  // Write to file (FTS5 index will be built on-device by expo-sqlite)
  const dbData = db.export();
  const buf = Buffer.from(dbData);
  await (await import('fs/promises')).writeFile(DB_PATH, buf);

  const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Dictionary built: assets/dictionary/jareader.db (${sizeMB}MB)`);
  console.log(`✓ ${count.toLocaleString()} common words`);

  // ── Also write JSON output (Chinese glosses) ──
  const jsonRows = [];
  db.each('SELECT word, reading, pos, gloss FROM entries ORDER BY id', (row) => {
    jsonRows.push({ w: row.word, r: row.reading, p: row.pos, g: row.gloss });
  });
  const outputJsonPath = join(ROOT, 'src', 'services', 'dict-data.json');
  await (await import('fs/promises')).writeFile(outputJsonPath, JSON.stringify(jsonRows));
  const jsonMB = (JSON.stringify(jsonRows).length / 1024 / 1024).toFixed(1);
  console.log(`✓ ${jsonRows.length.toLocaleString()} entries written to src/services/dict-data.json (${jsonMB}MB, Chinese glosses)`);

  db.close();

  console.log('\nRebuild the APK to bundle the updated dictionary.');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
