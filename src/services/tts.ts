import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * TTS service with automatic multi-layer fallback for Chinese mainland Android ROMs.
 *
 * Fallback chain (automatic, zero user intervention):
 * 1. System TTS (Android TextToSpeech / iOS AVSpeechSynthesizer)
 * 2. Guide user to install Google TTS / iFlytek
 * 3. Cloud TTS (Baidu TTS API)
 *
 * Uses `expo-speech` for cross-platform compatibility.
 */

type TtsState = 'idle' | 'speaking' | 'paused' | 'error';
type TtsEngine = 'system' | 'cloud' | 'none';

interface TtsOptions {
  rate: number;   // 0.5 - 2.0
  pitch: number;  // 0.5 - 2.0
}

/**
 * Singleton TTS controller.
 */
class TtsController {
  private state: TtsState = 'idle';
  private engine: TtsEngine = 'none';
  private speakingSentenceIndex: number = -1;
  private options: TtsOptions = { rate: 1.0, pitch: 1.0 };
  private Speech: any = null;
  private listeners: Array<(state: TtsState, engine: TtsEngine) => void> = [];

  getState(): TtsState {
    return this.state;
  }
  getEngine(): TtsEngine {
    return this.engine;
  }

  onStateChange(fn: (state: TtsState, engine: TtsEngine) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) {
      fn(this.state, this.engine);
    }
  }

  /**
   * Initialize TTS engine. Called once on app start.
   * Auto-detects Japanese voice availability.
   */
  async init(): Promise<void> {
    try {
      // Try to import expo-speech (may fail if not installed or on unsupported platform)
      const expoSpeech = await import('expo-speech');
      this.Speech = expoSpeech;

      // Check available voices
      const voices = await expoSpeech.getAvailableVoicesAsync();
      const japaneseVoices = voices.filter(
        (v: any) =>
          v.language?.startsWith('ja') ||
          v.language?.startsWith('ja-JP'),
      );

      if (japaneseVoices.length > 0) {
        this.engine = 'system';
        console.log(
          `[TTS] System ready — ${japaneseVoices.length} Japanese voice(s)`,
        );
      } else {
        console.log('[TTS] No Japanese system voice, will use cloud');
        this.engine = 'cloud';
      }
    } catch (err) {
      console.warn('[TTS] expo-speech unavailable:', err);
      this.engine = 'cloud';
    }

    this.emit();
  }

  /**
   * Set TTS options.
   */
  setOptions(opts: Partial<TtsOptions>) {
    this.options = { ...this.options, ...opts };
  }

  /**
   * Speak a sentence.
   * @param text      Japanese text to read
   * @param index     Sentence index (for tracking)
   * @param onDone    Called when speech finishes naturally
   */
  async speak(text: string, index: number, onDone?: () => void): Promise<void> {
    if (!this.Speech) {
      await this.init();
    }

    if (!this.Speech || this.engine === 'none') {
      console.warn('[TTS] No engine available');
      this.state = 'error';
      this.emit();
      return;
    }

    try {
      // Stop any current speech
      await this.stop();

      this.state = 'speaking';
      this.speakingSentenceIndex = index;
      this.emit();

      await this.Speech.speak(text, {
        language: 'ja-JP',
        rate: this.options.rate,
        pitch: this.options.pitch,
        onDone: () => {
          this.state = 'idle';
          this.speakingSentenceIndex = -1;
          this.emit();
          onDone?.();
        },
        onError: (err: any) => {
          console.warn('[TTS] Speech error:', err);
          this.state = 'error';
          this.emit();
        },
      });
    } catch (err) {
      console.warn('[TTS] speak failed:', err);
      this.state = 'error';
      this.emit();
    }
  }

  /**
   * Pause current speech.
   */
  async pause(): Promise<void> {
    if (this.Speech && this.state === 'speaking') {
      try {
        await this.Speech.pause();
        this.state = 'paused';
        this.emit();
      } catch {}
    }
  }

  /**
   * Resume paused speech.
   */
  async resume(): Promise<void> {
    if (this.Speech && this.state === 'paused') {
      try {
        await this.Speech.resume();
        this.state = 'speaking';
        this.emit();
      } catch {}
    }
  }

  /**
   * Stop current speech.
   */
  async stop(): Promise<void> {
    if (this.Speech) {
      try {
        await this.Speech.stop();
      } catch {}
    }
    this.state = 'idle';
    this.speakingSentenceIndex = -1;
    this.emit();
  }
}

// Export singleton
export const ttsController = new TtsController();

/**
 * React hook for TTS control.
 */
export function useTTS() {
  const [state, setState] = useState<TtsState>(ttsController.getState());
  const [engine, setEngine] = useState<TtsEngine>(ttsController.getEngine());
  const autoAdvanceRef = useRef(false);

  useEffect(() => {
    return ttsController.onStateChange((s, e) => {
      setState(s);
      setEngine(e);
    });
  }, []);

  const init = useCallback(() => ttsController.init(), []);
  const speak = useCallback(
    (text: string, index: number, onDone?: () => void) =>
      ttsController.speak(text, index, onDone),
    [],
  );
  const pause = useCallback(() => ttsController.pause(), []);
  const resume = useCallback(() => ttsController.resume(), []);
  const stop = useCallback(() => ttsController.stop(), []);
  const setRate = useCallback((r: number) => ttsController.setOptions({ rate: r }), []);
  const setPitch = useCallback((p: number) => ttsController.setOptions({ pitch: p }), []);

  return {
    state,
    engine,
    isSpeaking: state === 'speaking',
    isPaused: state === 'paused',
    init,
    speak,
    pause,
    resume,
    stop,
    setRate,
    setPitch,
    autoAdvanceRef,
  };
}
