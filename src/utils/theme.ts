/**
 * Light/Dark theme definitions.
 * Used by ThemeProvider to switch color schemes.
 */

export const lightTheme = {
  name: 'light' as const,
  colors: {
    // Backgrounds
    bg: '#faf9f6',
    bgCard: '#ffffff',
    bgInput: '#f5f5f5',
    bgHighlight: '#f0f4ff',
    bgChapterHeader: '#f8f8f8',

    // Text
    textPrimary: '#222222',
    textSecondary: '#555555',
    textTertiary: '#888888',
    textPlaceholder: '#cccccc',
    textLink: '#4a90d9',

    // Borders
    border: '#e8e8e8',
    borderLight: '#f0f0f0',
    hairline: '#f5f5f5',

    // UI elements
    buttonBg: '#f0f0f0',
    buttonBgActive: '#4a90d9',
    buttonText: '#555555',
    buttonTextActive: '#ffffff',
    ttsBtnBg: '#e8f0ff',
    ttsBtnBgActive: '#4a90d9',

    // Progress
    progressBg: '#e8e8e8',
    progressFill: '#d0d0d0',

    // Result box
    resultBg: '#ffffff',
    resultBorder: '#e0e0e0',
    resultWord: '#222222',
    resultReading: '#888888',
    resultGloss: '#444444',

    // Top bar
    topBarBg: '#ffffff',
    topBarBorder: '#e8e8e8',

    // Operation bar
    opBarBg: '#ffffff',
    opBarBorder: '#e8e8e8',
  },
} as const;

export const darkTheme = {
  name: 'dark' as const,
  colors: {
    // Backgrounds
    bg: '#1a1a1e',
    bgCard: '#252528',
    bgInput: '#2c2c30',
    bgHighlight: '#1e2a3a',
    bgChapterHeader: '#252528',

    // Text
    textPrimary: '#e8e8e8',
    textSecondary: '#a0a0a0',
    textTertiary: '#808080',
    textPlaceholder: '#555555',
    textLink: '#6aacf7',

    // Borders
    border: '#333338',
    borderLight: '#2a2a2f',
    hairline: '#2a2a2f',

    // UI elements
    buttonBg: '#2c2c30',
    buttonBgActive: '#4a90d9',
    buttonText: '#a0a0a0',
    buttonTextActive: '#ffffff',
    ttsBtnBg: '#1e2a3a',
    ttsBtnBgActive: '#4a90d9',

    // Progress
    progressBg: '#333338',
    progressFill: '#555558',

    // Result box
    resultBg: '#252528',
    resultBorder: '#333338',
    resultWord: '#e8e8e8',
    resultReading: '#a0a0a0',
    resultGloss: '#cccccc',

    // Top bar
    topBarBg: '#252528',
    topBarBorder: '#333338',

    // Operation bar
    opBarBg: '#252528',
    opBarBorder: '#333338',
  },
} as const;

export type Theme = typeof lightTheme | typeof darkTheme;
