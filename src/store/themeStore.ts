import { create } from 'zustand';
import { lightTheme, darkTheme, type Theme } from '../utils/theme';

type ThemeMode = 'light' | 'dark';

interface ThemeStoreState {
  mode: ThemeMode;
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStoreState>((set) => ({
  mode: 'light',
  theme: lightTheme,

  toggleTheme: () =>
    set((s) => ({
      mode: s.mode === 'light' ? 'dark' : 'light',
      theme: s.mode === 'light' ? darkTheme : lightTheme,
    })),

  setTheme: (mode) =>
    set({
      mode,
      theme: mode === 'dark' ? darkTheme : lightTheme,
    }),
}));
