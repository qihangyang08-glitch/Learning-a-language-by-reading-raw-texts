import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ManualOrientation } from '../types/book';
import type { RomajiLayoutMode } from '../types/reader';
import { fileStorage } from '../services/settings-storage';
import { getApiKey, setApiKey } from '../services/secure-storage';

interface SettingsStoreState {
  // Translation
  translationEnabled: boolean;
  translationApiKey: string;
  translationProvider: 'deepseek';
  /** True once the API key has been loaded from secure store */
  apiKeyLoaded: boolean;

  // TTS
  ttsRate: number;    // 0.5 - 2.0
  ttsPitch: number;   // 0.5 - 2.0
  ttsVoice: string;   // preferred voice identifier
  edgeTtsEndpoint: string;
  edgeTtsVoice: string;

  // Display
  manualOrientation: ManualOrientation;
  romajiLayoutMode: RomajiLayoutMode;

  // First launch
  firstLaunch: boolean;

  // Actions
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationApiKey: (key: string) => void;
  setTranslationProvider: (provider: 'deepseek') => void;
  setTtsRate: (rate: number) => void;
  setTtsPitch: (pitch: number) => void;
  setTtsVoice: (voice: string) => void;
  setEdgeTtsEndpoint: (endpoint: string) => void;
  setEdgeTtsVoice: (voice: string) => void;
  setManualOrientation: (orientation: ManualOrientation) => void;
  setRomajiLayoutMode: (mode: RomajiLayoutMode) => void;
  setFirstLaunch: (first: boolean) => void;
  /** Call once at app startup — loads API key from secure store into the store */
  loadApiKeyFromSecureStore: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      translationEnabled: false,
      translationApiKey: '',
      translationProvider: 'deepseek',
      apiKeyLoaded: false,
      ttsRate: 1.0,
      ttsPitch: 1.0,
      ttsVoice: '',
      edgeTtsEndpoint: '',
      edgeTtsVoice: 'ja-JP-NanamiNeural',
      manualOrientation: 'portrait',
      romajiLayoutMode: 'phrase',
      firstLaunch: true,

      setTranslationEnabled: (translationEnabled) => set({ translationEnabled }),
      setTranslationApiKey: (translationApiKey) => {
        set({ translationApiKey });
        // Persist to secure store (fire-and-forget — no await needed for UI)
        setApiKey(translationApiKey);
      },
      setTranslationProvider: (translationProvider) => set({ translationProvider }),
      setTtsRate: (ttsRate) => set({ ttsRate }),
      setTtsPitch: (ttsPitch) => set({ ttsPitch }),
      setTtsVoice: (ttsVoice) => set({ ttsVoice }),
      setEdgeTtsEndpoint: (edgeTtsEndpoint) => set({ edgeTtsEndpoint }),
      setEdgeTtsVoice: (edgeTtsVoice) => set({ edgeTtsVoice }),
      setManualOrientation: (manualOrientation) => set({ manualOrientation }),
      setRomajiLayoutMode: (romajiLayoutMode) => set({ romajiLayoutMode }),
      setFirstLaunch: (firstLaunch) => set({ firstLaunch }),
      loadApiKeyFromSecureStore: async () => {
        try {
          const key = await getApiKey();
          set({ translationApiKey: key, apiKeyLoaded: true });
        } catch {
          set({ apiKeyLoaded: true });
        }
      },
    }),
    {
      name: 'jareader-settings',
      storage: createJSONStorage(() => fileStorage),
      // API key is stored in secure store (encrypted), NOT in the plaintext JSON file
      partialize: (state) => ({
        translationEnabled: state.translationEnabled,
        translationProvider: state.translationProvider,
        ttsRate: state.ttsRate,
        ttsPitch: state.ttsPitch,
        ttsVoice: state.ttsVoice,
        edgeTtsEndpoint: state.edgeTtsEndpoint,
        edgeTtsVoice: state.edgeTtsVoice,
        manualOrientation: state.manualOrientation,
        romajiLayoutMode: state.romajiLayoutMode,
        firstLaunch: state.firstLaunch,
      }),
    },
  ),
);
