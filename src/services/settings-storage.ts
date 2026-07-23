import * as FileSystem from 'expo-file-system/legacy';

/**
 * expo-file-system backed storage adapter for Zustand persist.
 * Uses a single JSON file in the app's document directory.
 */

const SETTINGS_FILE = FileSystem.documentDirectory + 'jareader-settings.json';

interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

let cache: Record<string, any> | null = null;

async function readCache(): Promise<Record<string, any>> {
  if (cache) return cache;
  try {
    const raw = await FileSystem.readAsStringAsync(SETTINGS_FILE);
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache!;
}

async function writeCache(data: Record<string, any>): Promise<void> {
  cache = data;
  try {
    await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn('[settings-storage] write failed:', err);
  }
}

export const fileStorage: StorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const data = await readCache();
    const val = data[key];
    return val !== undefined ? JSON.stringify(val) : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const data = await readCache();
    data[key] = JSON.parse(value);
    await writeCache(data);
  },

  async removeItem(key: string): Promise<void> {
    const data = await readCache();
    delete data[key];
    await writeCache(data);
  },
};
