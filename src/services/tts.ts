import { Platform } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';
import { useSettingsStore } from '../store/settingsStore';

type TtsState = 'idle' | 'speaking' | 'paused' | 'error';
type TtsEngine = 'edge' | 'system' | 'none';

interface TtsOptions {
  rate: number;
  pitch: number;
  voice?: string;
}

interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

class TtsController {
  private state: TtsState = 'idle';
  private engine: TtsEngine = 'none';
  private speakingSentenceIndex = -1;
  private options: TtsOptions = { rate: 1.0, pitch: 1.0 };
  private Speech: any = null;
  private listeners: Array<(state: TtsState, engine: TtsEngine) => void> = [];
  private availableJapaneseVoices: VoiceInfo[] = [];
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private edgeEndpoint = '';
  private edgeVoice = 'ja-JP-NanamiNeural';
  private edgeAvailable: boolean | null = null;
  private edgeStatusMessage = '';
  private audioPlayer: any = null;
  private audioSubscription: { remove: () => void } | null = null;
  private finishAudioPlayback: ((err?: Error, notifyDone?: boolean) => void) | null = null;
  private currentOutputPath: string | null = null;

  getState(): TtsState { return this.state; }
  getEngine(): TtsEngine { return this.engine; }
  getVoices(): VoiceInfo[] { return this.availableJapaneseVoices; }
  getInitError(): string | null { return this.initError; }
  getEdgeStatus(): string { return this.edgeStatusMessage; }
  isEdgeAvailable(): boolean { return this.edgeAvailable === true; }

  onStateChange(fn: (state: TtsState, engine: TtsEngine) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state, this.engine);
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initInternal().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async initInternal(): Promise<void> {
    const settings = useSettingsStore.getState();
    this.options.rate = settings.ttsRate || this.options.rate;
    this.options.pitch = settings.ttsPitch || this.options.pitch;
    if (settings.ttsVoice) this.options.voice = settings.ttsVoice;
    this.edgeEndpoint = normalizeEndpoint(settings.edgeTtsEndpoint);
    this.edgeVoice = settings.edgeTtsVoice || this.edgeVoice;

    await Promise.all([
      this.checkEdgeAvailability(),
      this.initSystemSpeech(),
    ]);

    this.engine = this.edgeAvailable ? 'edge' : this.Speech ? 'system' : 'none';
    this.emit();
  }

  async refreshEdgeStatus(): Promise<boolean> {
    this.edgeEndpoint = normalizeEndpoint(useSettingsStore.getState().edgeTtsEndpoint);
    this.edgeVoice = useSettingsStore.getState().edgeTtsVoice || this.edgeVoice;
    await this.checkEdgeAvailability();
    this.engine = this.edgeAvailable ? 'edge' : this.Speech ? 'system' : 'none';
    this.emit();
    return this.edgeAvailable === true;
  }

  private async checkEdgeAvailability(): Promise<void> {
    if (!this.edgeEndpoint) {
      this.edgeAvailable = false;
      this.edgeStatusMessage = '未配置 Edge TTS 服务地址。';
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(`${this.edgeEndpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.edgeAvailable = true;
      this.edgeStatusMessage = 'Edge TTS 服务可用。';
      this.initError = null;
    } catch (err: any) {
      this.edgeAvailable = false;
      this.edgeStatusMessage = `Edge TTS 服务不可用：${err?.message || '连接失败'}`;
      this.initError = 'Edge TTS 不可用，已切换到系统 TTS。';
    } finally {
      clearTimeout(timeout);
    }
  }

  private async initSystemSpeech(): Promise<void> {
    try {
      const expoSpeech = await import('expo-speech');
      this.Speech = expoSpeech;

      const voices: VoiceInfo[] = await expoSpeech.getAvailableVoicesAsync();
      this.availableJapaneseVoices = voices.filter((v: VoiceInfo) => {
        const lang = (v.language || '').toLowerCase();
        const name = (v.name || '').toLowerCase();
        const id = (v.identifier || '').toLowerCase();

        return (
          lang.startsWith('ja') || lang === 'jpn' ||
          name.includes('japan') || name.includes('japanese') ||
          name.includes('日本語') || name.includes('日本') ||
          name.includes('nihongo') ||
          id.includes('ja-jp') || id.includes('ja_jp') ||
          id.includes('japanese') || id.includes('japan')
        );
      });

      if (this.availableJapaneseVoices.length > 0 && !this.options.voice) {
        this.options.voice = this.pickBestVoice(this.availableJapaneseVoices).identifier;
      }
    } catch (err: any) {
      console.warn('[TTS] expo-speech unavailable:', err);
      this.Speech = null;
      if (!this.edgeAvailable) this.initError = 'Edge TTS 和系统 TTS 均不可用。';
    }
  }

  private pickBestVoice(voices: VoiceInfo[]): VoiceInfo {
    const googleJa = voices.find(v =>
      (v.identifier || '').toLowerCase().includes('google') &&
      (v.language || '').toLowerCase().startsWith('ja'),
    );
    if (googleJa) return googleJa;

    const enhanced = voices.find(v => v.quality === 'Enhanced' || v.quality === 'enhanced');
    if (enhanced) return enhanced;

    return voices[0];
  }

  setOptions(opts: Partial<TtsOptions>) {
    this.options = { ...this.options, ...opts };
  }

  async speak(text: string, index: number, onDone?: () => void): Promise<void> {
    if (!this.initPromise && this.engine === 'none') {
      await this.init();
    } else if (this.initPromise) {
      await this.initPromise;
    }

    if (this.edgeAvailable) {
      try {
        await this.speakEdge(text, index, onDone);
        return;
      } catch (err: any) {
        console.warn('[TTS-Edge] failed, falling back to system TTS:', err?.message || err);
        this.edgeAvailable = false;
        this.edgeStatusMessage = `Edge TTS 播放失败：${err?.message || '未知错误'}`;
      }
    }

    await this.speakSystem(text, index, onDone);
  }

  private getEdgeTtsUrl(text: string): string {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const params = [
      ['text', normalizedText],
      ['voice', this.edgeVoice],
      ['rate', toEdgeRate(this.options.rate)],
    ];
    const query = params
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return `${this.edgeEndpoint}/tts?${query}`;
  }

  private async speakEdge(text: string, index: number, onDone?: () => void): Promise<void> {
    if (!this.edgeEndpoint) throw new Error('Edge TTS endpoint is empty.');

    await this.stop();
    this.engine = 'edge';
    this.state = 'speaking';
    this.speakingSentenceIndex = index;
    this.emit();

    const outputPath = FileSystem.cacheDirectory + `edge_tts_${index}_${Date.now()}.mp3`;
    this.currentOutputPath = outputPath;

    const result = await FileSystem.downloadAsync(this.getEdgeTtsUrl(text), outputPath);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`HTTP ${result.status}`);
    }

    await this.playAudio(result.uri, onDone);
  }

  private async playAudio(uri: string, onDone?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (err?: Error, notifyDone = true) => {
        if (settled) return;
        settled = true;
        this.audioSubscription?.remove();
        this.audioSubscription = null;
        this.finishAudioPlayback = null;
        try { this.audioPlayer?.remove?.(); } catch {}
        this.audioPlayer = null;
        this.state = err ? 'error' : 'idle';
        this.speakingSentenceIndex = -1;
        this.currentOutputPath = null;
        this.emit();
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        if (!err && notifyDone) onDone?.();
        err ? reject(err) : resolve();
      };

      try {
        this.audioPlayer?.remove?.();
        this.audioPlayer = createAudioPlayer({ uri }, { updateInterval: 250 });
        this.finishAudioPlayback = finish;
        this.audioSubscription = this.audioPlayer.addListener('playbackStatusUpdate', (status: any) => {
          if (status?.error) finish(new Error(status.error));
          if (status?.didJustFinish) finish();
        });
        this.audioPlayer.play();
      } catch (err: any) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private async speakSystem(text: string, index: number, onDone?: () => void): Promise<void> {
    if (!this.Speech) await this.initSystemSpeech();

    if (!this.Speech) {
      this.state = 'error';
      this.initError = '语音引擎不可用。请启动 Edge TTS 服务，或安装/切换 Google TTS。';
      this.emit();
      onDone?.();
      return;
    }

    try {
      await this.stop();

      this.engine = 'system';
      this.state = 'speaking';
      this.speakingSentenceIndex = index;
      this.emit();

      const speakOpts: any = {
        language: 'ja-JP',
        rate: clamp(this.options.rate, 0.5, 2.0),
        pitch: clamp(this.options.pitch, 0.5, 2.0),
        onDone: () => this.finishSystemSpeech(onDone),
        onStopped: () => this.finishSystemSpeech(onDone),
        onError: (err: any) => {
          console.warn('[TTS-System] Speech error:', err);
          this.state = 'error';
          this.emit();
          onDone?.();
        },
      };

      if (this.options.voice) speakOpts.voice = this.options.voice;
      this.Speech.speak(text, speakOpts);
    } catch (err) {
      console.warn('[TTS-System] speak failed:', err);
      this.state = 'error';
      this.emit();
      onDone?.();
    }
  }

  private finishSystemSpeech(onDone?: () => void) {
    this.state = 'idle';
    this.speakingSentenceIndex = -1;
    this.emit();
    onDone?.();
  }

  async pause(): Promise<void> {
    if (this.engine === 'edge') {
      try { this.audioPlayer?.pause?.(); this.state = 'paused'; this.emit(); } catch {}
      return;
    }

    if (Platform.OS !== 'android' && this.Speech && this.state === 'speaking') {
      try { await this.Speech.pause(); this.state = 'paused'; this.emit(); } catch {}
    }
  }

  async resume(): Promise<void> {
    if (this.engine === 'edge') {
      try { this.audioPlayer?.play?.(); this.state = 'speaking'; this.emit(); } catch {}
      return;
    }

    if (Platform.OS !== 'android' && this.Speech && this.state === 'paused') {
      try { await this.Speech.resume(); this.state = 'speaking'; this.emit(); } catch {}
    }
  }

  async stop(): Promise<void> {
    if (this.engine === 'edge') {
      try { this.audioPlayer?.pause?.(); this.audioPlayer?.remove?.(); } catch {}
      this.audioPlayer = null;
      this.audioSubscription?.remove();
      this.audioSubscription = null;
      this.finishAudioPlayback?.(undefined, false);
      this.finishAudioPlayback = null;
    } else if (this.Speech) {
      try { await this.Speech.stop(); } catch {}
    }

    this.state = 'idle';
    this.speakingSentenceIndex = -1;
    this.currentOutputPath = null;
    this.emit();
  }

}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toEdgeRate(rate: number): string {
  const percent = Math.round((clamp(rate, 0.5, 2.0) - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

export const ttsController = new TtsController();

export function useTTS() {
  const [state, setState] = useState<TtsState>(ttsController.getState());
  const [engine, setEngine] = useState<TtsEngine>(ttsController.getEngine());

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
  const autoAdvanceRef = useRef(false);

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
