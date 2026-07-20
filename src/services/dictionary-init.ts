import * as FileSystem from 'expo-file-system';
import { initDictionaryTables, batchInsertEntries, getEntryCount } from './dictionary';

/**
 * Dictionary initialization service.
 *
 * On first launch:
 * 1. Checks if dictionary is already imported (entry count > 0)
 * 2. If not, downloads jmdict-simplified JSON (common words, ~25MB compressed)
 * 3. Parses JSON and batch-inserts into SQLite FTS5
 * 4. Reports progress for UI
 */

const JMdict_URL =
  'https://github.com/scriptin/jmdict-simplified/releases/download/3.5.0/jmdict-eng-3.5.0.json.zip';

const DICT_CACHE_PATH = `${FileSystem.cacheDirectory}jmdict-eng.json`;
const DICT_ZIP_PATH = `${FileSystem.cacheDirectory}jmdict-eng.json.zip`;

export interface InitProgress {
  stage: 'checking' | 'downloading' | 'parsing' | 'importing' | 'done' | 'error';
  progress: number; // 0-1
  message: string;
}

/**
 * Initialize the dictionary database.
 * Safe to call multiple times — skips if already initialized.
 */
export async function initDictionary(
  onProgress: (p: InitProgress) => void,
): Promise<void> {
  // Step 0: Check if already initialized
  onProgress({ stage: 'checking', progress: 0, message: 'Checking dictionary...' });

  initDictionaryTables();
  const count = getEntryCount();

  if (count > 0) {
    onProgress({ stage: 'done', progress: 1, message: `${count} entries ready` });
    return;
  }

  // Step 1: Download JMdict JSON
  onProgress({ stage: 'downloading', progress: 0, message: 'Downloading dictionary...' });

  // Check if already cached
  const cached = await FileSystem.getInfoAsync(DICT_CACHE_PATH);
  if (!cached.exists) {
    await downloadFile(DICT_ZIP_PATH, JMdict_URL, (p) => {
      onProgress({ stage: 'downloading', progress: p, message: `Downloading... ${Math.round(p * 100)}%` });
    });

    // Unzip
    onProgress({ stage: 'parsing', progress: 0, message: 'Extracting...' });
    await extractZip(DICT_ZIP_PATH, DICT_CACHE_PATH);

    // Clean up zip
    await FileSystem.deleteAsync(DICT_ZIP_PATH, { idempotent: true });
  }

  // Step 2: Parse JSON and import
  onProgress({ stage: 'parsing', progress: 0, message: 'Reading dictionary file...' });

  const jsonText = await FileSystem.readAsStringAsync(DICT_CACHE_PATH, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  onProgress({ stage: 'parsing', progress: 0.5, message: 'Parsing JSON...' });

  const data = JSON.parse(jsonText);
  const words = data.words || data;

  // Extract entries: word → reading → senses → glosses
  const entries: Array<{ word: string; reading: string; pos: string; gloss: string }> = [];

  for (const entry of words) {
    if (!entry.kanji || entry.kanji.length === 0) continue;
    if (!entry.kana || entry.kana.length === 0) continue;
    if (!entry.sense || entry.sense.length === 0) continue;

    const word = entry.kanji[0].text;
    const reading = entry.kana[0].text;

    // Collect POS tags
    const posSet = new Set<string>();
    for (const sense of entry.sense) {
      if (sense.pos) {
        for (const p of sense.pos) posSet.add(p);
      }
    }

    // Collect glosses (Chinese/English)
    const glosses: string[] = [];
    for (const sense of entry.sense) {
      if (sense.gloss) {
        for (const g of sense.gloss) {
          if (g.lang === 'chi' || g.lang === 'zho' || !g.lang || g.lang === 'eng') {
            glosses.push(g.text);
          }
        }
      }
    }

    if (glosses.length === 0) continue;

    entries.push({
      word,
      reading,
      pos: Array.from(posSet).join(','),
      gloss: glosses.join(';'),
    });
  }

  onProgress({ stage: 'importing', progress: 0, message: `Importing ${entries.length} entries...` });

  // Step 3: Batch insert into SQLite
  batchInsertEntries(entries, (done, total) => {
    onProgress({
      stage: 'importing',
      progress: done / total,
      message: `Importing... ${done}/${total}`,
    });
  });

  // Clean up JSON cache
  await FileSystem.deleteAsync(DICT_CACHE_PATH, { idempotent: true });

  onProgress({ stage: 'done', progress: 1, message: `${entries.length} entries imported` });
}

// ── Helpers ──

async function downloadFile(
  destPath: string,
  url: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const download = FileSystem.createDownloadResumable(
    url,
    destPath,
    {},
    (progress) => {
      const p = progress.totalBytesExpectedToWrite > 0
        ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
        : 0;
      onProgress(p);
    },
  );

  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download failed: ${result?.status ?? 'unknown'}`);
  }
}

async function extractZip(zipPath: string, destPath: string): Promise<void> {
  // Use JSZip for extraction (lazy import)
  const JSZip = (await import('jszip')).default;

  const zipData = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const zip = await JSZip.loadAsync(zipData, { base64: true });

  // Find the first JSON file in the zip
  const jsonFiles = Object.keys(zip.files).filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    throw new Error('No JSON file found in dictionary archive');
  }

  const content = await zip.files[jsonFiles[0]].async('string');
  await FileSystem.writeAsStringAsync(destPath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
