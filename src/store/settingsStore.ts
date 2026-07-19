import { create } from 'zustand';

interface SettingsStoreState {
  // Translation
  translationEnabled: boolean;
  translationApiKey: string;
  translationProvider: 'deepseek' | 'baidu' | 'microsoft';

  // TTS
  ttsRate: number;    // 0.5 - 2.0
  ttsPitch: number;   // 0.5 - 2.0
  ttsVoice: string;   // preferred voice identifier

  // Actions
  setTranslationEnabled: (enabled: boolean) => void;
  setTranslationApiKey: (key: string) => void;
  setTranslationProvider: (provider: 'deepseek' | 'baidu' | 'microsoft') => void;
  setTtsRate: (rate: number) => void;
  setTtsPitch: (pitch: number) => void;
  setTtsVoice: (voice: string) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  translationEnabled: false,
  translationApiKey: '',
  translationProvider: 'deepseek',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVoice: '',

  setTranslationEnabled: (translationEnabled) => set({ translationEnabled }),
  setTranslationApiKey: (translationApiKey) => set({ translationApiKey }),
  setTranslationProvider: (translationProvider) => set({ translationProvider }),
  setTtsRate: (ttsRate) => set({ ttsRate }),
  setTtsPitch: (ttsPitch) => set({ ttsPitch }),
  setTtsVoice: (ttsVoice) => set({ ttsVoice }),
}));
