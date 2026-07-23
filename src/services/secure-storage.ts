import * as SecureStore from 'expo-secure-store';

/**
 * Secure credential storage backed by Android Keystore / iOS Keychain.
 *
 * Used ONLY for the DeepSeek API key — all other settings go through
 * the file-based zustand persist adapter.
 *
 * Keys stored here survive app uninstall (on Android, depending on
 * the device and Android version; iOS always deletes on uninstall).
 */

const API_KEY_KEY = 'jareader-api-key';

export async function getApiKey(): Promise<string> {
  try {
    const val = await SecureStore.getItemAsync(API_KEY_KEY);
    return val ?? '';
  } catch (err) {
    console.warn('[secure-store] getApiKey failed:', err);
    return '';
  }
}

export async function setApiKey(key: string): Promise<void> {
  try {
    if (key) {
      await SecureStore.setItemAsync(API_KEY_KEY, key);
    } else {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
    }
  } catch (err) {
    console.warn('[secure-store] setApiKey failed:', err);
  }
}

export async function deleteApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(API_KEY_KEY);
  } catch (err) {
    console.warn('[secure-store] deleteApiKey failed:', err);
  }
}
