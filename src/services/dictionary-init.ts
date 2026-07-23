import * as FileSystem from 'expo-file-system/legacy';
import {
  batchInsertEntries,
  getEntryCount,
  getDictVersion,
  setDictVersion,
  clearEntries,
  buildFtsIndex,
} from './dictionary';

/**
 * Dictionary data initialization.
 *
 * Loads 小学館中日日中統合辞書第2版 from assets/dictionary/dict-data.json.
 *
 * The dictionary file is copied to Android assets by the dictionary plugin
 * and read at runtime via expo-file-system — NOT via require(), because
 * a 19MB JSON would bloat the Metro JS bundle and crash on startup.
 *
 * Version tracking via dict_meta table ensures dictionary updates
 * automatically replace old data on device.
 */

// Increment when dictionary data changes
// v1 → v2: initial DreyeJC dictionary
// v2 → v3: 小学館中日日中統合辞書第2版 (79,382 entries)
// v3 → v4: rebuild bundled asset and guard against truncated dictionaries
// v4 → v5: 小学馆日中辞典 v3 MDX (159,388 entries)
const DICT_VERSION = 5;
const MIN_EXPECTED_DICT_ENTRIES = 100_000;

export interface InitProgress {
  stage: 'checking' | 'importing' | 'done' | 'error';
  progress: number;
  message: string;
}

/**
 * Get the path to the bundled dictionary asset.
 * Uses a hardcoded Android asset path as a fallback since
 * expo-file-system/legacy may not expose bundleDirectory.
 */
function getDictAssetPath(): string {
  // Try bundleDirectory first, fall back to hardcoded Android asset path
  try {
    const bundleDir = (FileSystem as any).bundleDirectory;
    if (bundleDir) return bundleDir + 'dictionary/dict-data.json';
  } catch {}
  // Hardcoded Android asset URI
  return 'file:///android_asset/dictionary/dict-data.json';
}

export async function initDictionary(
  onProgress: (p: InitProgress) => void,
): Promise<void> {
  onProgress({ stage: 'checking', progress: 0, message: '初始化词典...' });

  const storedVersion = getDictVersion();
  const count = getEntryCount();

  // Data exists and version is current — skip only if the imported DB is plausible.
  if (count >= MIN_EXPECTED_DICT_ENTRIES && storedVersion === DICT_VERSION) {
    onProgress({ stage: 'done', progress: 1, message: `词库 ${count} 词已就绪` });
    console.log(`[dict] Already has ${count} entries (v${storedVersion})`);
    return;
  }

  // Version mismatch or suspiciously small DB — clear old data
  if (count > 0) {
    const reason = count < MIN_EXPECTED_DICT_ENTRIES
      ? `entry count too small (${count})`
      : `version changed (v${storedVersion} → v${DICT_VERSION})`;
    console.log(`[dict] ${reason}, replacing dictionary...`);
    clearEntries();
  }

  // Load from bundled asset via file system (NOT require() — avoids JS bundle bloat)
  // Defer heavy import to avoid blocking first render
  setTimeout(async () => {
    try {
      onProgress({ stage: 'importing', progress: 0, message: '加载词典数据...' });

      const assetPath = getDictAssetPath();
      console.log(`[dict] Reading dictionary from: ${assetPath}`);

      let rawJson: string;
      try {
        rawJson = await FileSystem.readAsStringAsync(assetPath);
      } catch (readErr: any) {
        console.warn('[dict] File read failed:', readErr?.message);
        // Try the other path format
        const fallbackPath = assetPath.startsWith('file://')
          ? assetPath.replace('file://', '')
          : 'file://' + assetPath;
        console.log(`[dict] Trying fallback: ${fallbackPath}`);
        rawJson = await FileSystem.readAsStringAsync(fallbackPath);
      }

      const raw = JSON.parse(rawJson);
      console.log(`[dict] Parsed ${raw.length} entries`);
      if (!Array.isArray(raw) || raw.length < MIN_EXPECTED_DICT_ENTRIES) {
        throw new Error(`词典数据异常：仅 ${Array.isArray(raw) ? raw.length : 0} 条`);
      }

      const entries = raw.map((e: any) => ({
        word: e.w || '',
        reading: e.r || '',
        pos: e.p || '',
        gloss: e.g || '',
      }));

      // Import in chunks to avoid blocking UI thread
      const CHUNK = 5000;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        batchInsertEntries(chunk);
        onProgress({
          stage: 'importing',
          progress: Math.min(1, (i + CHUNK) / entries.length),
          message: `导入中... ${Math.min(i + CHUNK, entries.length)}/${entries.length}`,
        });
        // Yield to UI thread between chunks
        await new Promise((r) => setTimeout(r, 0));
      }

      setTimeout(() => {
        buildFtsIndex();
        console.log('[dict] FTS index built (deferred)');
      }, 100);

      setDictVersion(DICT_VERSION);

      onProgress({
        stage: 'done', progress: 1,
        message: `词库 ${entries.length} 词已就绪`,
      });
      console.log(`[dict] Imported ${entries.length} entries (v${DICT_VERSION})`);
    } catch (err: any) {
      console.warn('[dict] Failed to load dictionary data:', err?.message);
      onProgress({
        stage: 'error', progress: 1,
        message: `词典加载失败: ${err?.message || '未知错误'}`,
      });
    }
  }, 500);
}
