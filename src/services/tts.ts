import { Platform } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import type { SpeechOptions, Voice } from 'expo-speech';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';
import { useSettingsStore } from '../store/settingsStore';
import { normalizeTextForSpeech } from './tts-normalizer';

export type TtsState = 'idle' | 'speaking' | 'paused' | 'error';
export type TtsEngine = 'system' | 'edge-dev' | 'azure' | 'google-cloud' | 'none';
export type TtsProviderId = Exclude<TtsEngine, 'none'>;

export interface TtsOptions {
  rate: number;
  pitch: number;
  voice?: string;
}

export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

export interface TtsProviderStatus {
  id: TtsProviderId;
  state: TtsState;
  available: boolean;
  message: string;
  supportsPause: boolean;
}

export interface TtsUsageEstimate {
  provider: TtsProviderId;
  month: string;
  localCharacters: number;
  pendingCharacters: number;
  estimatedCharacters: number;
  note: string;
}

interface TtsSpeakRequest {
  text: string;
  index: number;
  options: TtsOptions;
  onDone?: () => void;
  onStatus: (state: TtsState) => void;
}

export interface TtsProvider {
  readonly id: TtsProviderId;
  readonly label: string;
  speak(request: TtsSpeakRequest): Promise<void>;
  stop(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  getStatus(): Promise<TtsProviderStatus>;
  estimateUsage(text?: string): Promise<TtsUsageEstimate>;
}

export interface CloudTtsConfig {
  enabled: boolean;
  apiKey: string;
  region?: string;
  voice: string;
}

interface CloudSynthesisRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

const DEFAULT_TTS_OPTIONS: TtsOptions = { rate: 1.0, pitch: 1.0 };
const EDGE_DEV_ENABLED = false;
const GOOGLE_TTS_GUIDE = {
  title: 'Google 文字转语音日语配置',
  summary: 'JaReader 默认调用 Android 系统 TTS。中文用户想获得更稳定的日语朗读，建议安装 Google 文字转语音并下载日语语音数据。',
  steps: [
    '在 Google Play 或系统应用商店安装/更新 Google 文字转语音。',
    '打开 Android 设置，进入系统语言与输入法里的文字转语音输出。',
    '将首选引擎切换为 Google 文字转语音。',
    '进入引擎设置，下载日语（日本）语音数据。',
    '回到 JaReader 设置页，确认能检测到 ja-JP 或 Japanese 系统语音。',
  ],
  checks: [
    '若系统没有 Google 服务，可尝试设备厂商提供的日语 TTS 引擎。',
    'Android 上系统 TTS 不支持 pause/resume，暂停按钮会退化为停止/重新播放体验。',
    '系统 TTS 在本地处理文本，不会把小说句子发送到 JaReader 配置的云端 TTS。',
  ],
};

export const TTS_SECURE_STORE_KEYS = {
  azureApiKey: 'jareader-tts-azure-api-key',
  azureRegion: 'jareader-tts-azure-region',
  azureVoice: 'jareader-tts-azure-voice',
  googleCloudApiKey: 'jareader-tts-google-cloud-api-key',
  googleCloudVoice: 'jareader-tts-google-cloud-voice',
} as const;

const DEFAULT_CLOUD_CONFIG: Record<'azure' | 'google-cloud', CloudTtsConfig> = {
  azure: {
    enabled: false,
    apiKey: '',
    region: '',
    voice: 'ja-JP-NanamiNeural',
  },
  'google-cloud': {
    enabled: false,
    apiKey: '',
    voice: 'ja-JP-Standard-A',
  },
};

class TtsUsageTracker {
  private readonly file = FileSystem.documentDirectory + 'jareader-tts-usage.json';
  private cache: Record<string, Record<TtsProviderId, number>> | null = null;

  async record(provider: TtsProviderId, text: string): Promise<void> {
    const chars = countBillableCharacters(text);
    if (chars <= 0) return;

    const usage = await this.read();
    const month = getCurrentMonthKey();
    usage[month] = usage[month] || {};
    usage[month][provider] = (usage[month][provider] || 0) + chars;
    await this.write(usage);
  }

  async estimate(provider: TtsProviderId, text = ''): Promise<TtsUsageEstimate> {
    const usage = await this.read();
    const month = getCurrentMonthKey();
    const localCharacters = usage[month]?.[provider] || 0;
    const pendingCharacters = countBillableCharacters(text);

    return {
      provider,
      month,
      localCharacters,
      pendingCharacters,
      estimatedCharacters: localCharacters + pendingCharacters,
      note: '仅为 JaReader 本机估算字符数，不代表 Azure / Google Cloud 控制台真实账单或余额。',
    };
  }

  private async read(): Promise<Record<string, Record<TtsProviderId, number>>> {
    if (this.cache) return this.cache;

    try {
      const raw = await FileSystem.readAsStringAsync(this.file);
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private async write(data: Record<string, Record<TtsProviderId, number>>): Promise<void> {
    this.cache = data;
    try {
      await FileSystem.writeAsStringAsync(this.file, JSON.stringify(data));
    } catch (err) {
      console.warn('[TTS-usage] write failed:', err);
    }
  }
}

const usageTracker = new TtsUsageTracker();

class SystemTtsProvider implements TtsProvider {
  readonly id = 'system' as const;
  readonly label = '系统 TTS / Google TTS';
  private status: TtsState = 'idle';
  private voices: VoiceInfo[] = [];
  private lastMessage = '系统 TTS 尚未初始化。';
  private currentStopIsManual = false;

  getVoices(): VoiceInfo[] {
    return this.voices;
  }

  async init(options: TtsOptions): Promise<void> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      this.voices = voices.filter(isJapaneseVoice).map(toVoiceInfo);

      if (this.voices.length > 0 && !options.voice) {
        options.voice = pickBestVoice(this.voices).identifier;
      }

      this.lastMessage = this.voices.length > 0
        ? '已使用系统 TTS，优先选择检测到的日语语音。'
        : '系统 TTS 可用，但暂未检测到日语语音。请安装 Google 文字转语音和日语语音数据。';
    } catch (err) {
      this.status = 'error';
      this.lastMessage = `系统 TTS 初始化失败：${formatError(err)}`;
      console.warn('[TTS-System] init failed:', err);
    }
  }

  async speak(request: TtsSpeakRequest): Promise<void> {
    await this.stop();

    const speakOpts: SpeechOptions = {
      language: 'ja-JP',
      rate: clamp(request.options.rate, 0.5, 2.0),
      pitch: clamp(request.options.pitch, 0.5, 2.0),
      onStart: () => {
        this.status = 'speaking';
        request.onStatus('speaking');
      },
      onDone: () => {
        this.finish(request, true);
      },
      onStopped: () => {
        this.finish(request, !this.currentStopIsManual);
      },
      onError: (err) => {
        this.status = 'error';
        this.lastMessage = `系统 TTS 播放失败：${formatError(err)}`;
        request.onStatus('error');
        request.onDone?.();
      },
    };

    if (request.options.voice) speakOpts.voice = request.options.voice;

    this.status = 'speaking';
    this.currentStopIsManual = false;
    request.onStatus('speaking');
    Speech.speak(request.text, speakOpts);
    await usageTracker.record(this.id, request.text);
  }

  async stop(): Promise<void> {
    this.currentStopIsManual = true;
    try {
      await Speech.stop();
    } catch (err) {
      console.warn('[TTS-System] stop failed:', err);
    }
    this.status = 'idle';
  }

  async pause(): Promise<void> {
    if (Platform.OS === 'android') return;

    try {
      await Speech.pause();
      this.status = 'paused';
    } catch (err) {
      console.warn('[TTS-System] pause failed:', err);
    }
  }

  async resume(): Promise<void> {
    if (Platform.OS === 'android') return;

    try {
      await Speech.resume();
      this.status = 'speaking';
    } catch (err) {
      console.warn('[TTS-System] resume failed:', err);
    }
  }

  async getStatus(): Promise<TtsProviderStatus> {
    let speaking = false;
    try {
      speaking = await Speech.isSpeakingAsync();
    } catch {}

    return {
      id: this.id,
      state: speaking && this.status !== 'paused' ? 'speaking' : this.status,
      available: true,
      message: this.lastMessage,
      supportsPause: Platform.OS !== 'android',
    };
  }

  estimateUsage(text?: string): Promise<TtsUsageEstimate> {
    return usageTracker.estimate(this.id, text);
  }

  private finish(request: TtsSpeakRequest, notifyDone: boolean): void {
    this.status = 'idle';
    request.onStatus('idle');
    if (notifyDone) request.onDone?.();
    this.currentStopIsManual = false;
  }
}

class EdgeDevTtsProvider implements TtsProvider {
  readonly id = 'edge-dev' as const;
  readonly label = 'Edge TTS Dev Provider';
  private endpoint = '';
  private voice = 'ja-JP-NanamiNeural';
  private status: TtsState = 'idle';
  private message = EDGE_DEV_ENABLED
    ? 'Edge TTS dev provider 可手动检测。'
    : 'Edge TTS dev provider 已隐藏，默认不检测、不自动使用。';
  private available = false;
  private audioPlayer: any = null;
  private audioSubscription: { remove: () => void } | null = null;
  private finishAudioPlayback: ((err?: Error, notifyDone?: boolean) => void) | null = null;

  configure(endpoint: string, voice: string): void {
    this.endpoint = normalizeEndpoint(endpoint);
    this.voice = voice || this.voice;
  }

  async refreshStatus(): Promise<boolean> {
    if (!EDGE_DEV_ENABLED) {
      this.available = false;
      this.message = 'Edge TTS dev provider 已隐藏，默认不检测、不自动使用。';
      return false;
    }

    if (!this.endpoint) {
      this.available = false;
      this.message = '未配置 Edge TTS dev 服务地址。';
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.available = true;
      this.message = 'Edge TTS dev 服务可用。';
    } catch (err) {
      this.available = false;
      this.message = `Edge TTS dev 服务不可用：${formatError(err)}`;
    } finally {
      clearTimeout(timeout);
    }

    return this.available;
  }

  async speak(request: TtsSpeakRequest): Promise<void> {
    if (!EDGE_DEV_ENABLED) {
      throw new Error('Edge TTS dev provider is hidden and disabled by default.');
    }
    if (!this.endpoint) throw new Error('Edge TTS dev endpoint is empty.');

    await this.stop();
    this.status = 'speaking';
    request.onStatus('speaking');

    const outputPath = FileSystem.cacheDirectory + `edge_tts_${request.index}_${Date.now()}.mp3`;
    const result = await FileSystem.downloadAsync(this.getTtsUrl(request.text, request.options.rate), outputPath);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`HTTP ${result.status}`);
    }

    await usageTracker.record(this.id, request.text);
    await this.playAudio(result.uri, request);
  }

  async stop(): Promise<void> {
    try {
      this.audioPlayer?.pause?.();
      this.audioPlayer?.remove?.();
    } catch {}
    this.audioPlayer = null;
    this.audioSubscription?.remove();
    this.audioSubscription = null;
    this.finishAudioPlayback?.(undefined, false);
    this.finishAudioPlayback = null;
    this.status = 'idle';
  }

  async pause(): Promise<void> {
    try {
      this.audioPlayer?.pause?.();
      this.status = 'paused';
    } catch {}
  }

  async resume(): Promise<void> {
    try {
      this.audioPlayer?.play?.();
      this.status = 'speaking';
    } catch {}
  }

  async getStatus(): Promise<TtsProviderStatus> {
    return {
      id: this.id,
      state: this.status,
      available: this.available,
      message: this.message,
      supportsPause: true,
    };
  }

  estimateUsage(text?: string): Promise<TtsUsageEstimate> {
    return usageTracker.estimate(this.id, text);
  }

  private getTtsUrl(text: string, rate: number): string {
    const params = [
      ['text', text.replace(/\s+/g, ' ').trim()],
      ['voice', this.voice],
      ['rate', toEdgeRate(rate)],
    ];
    const query = params
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return `${this.endpoint}/tts?${query}`;
  }

  private async playAudio(uri: string, request: TtsSpeakRequest): Promise<void> {
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
        this.status = err ? 'error' : 'idle';
        request.onStatus(this.status);
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        if (!err && notifyDone) request.onDone?.();
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
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

abstract class ReservedCloudTtsProvider implements TtsProvider {
  abstract readonly id: 'azure' | 'google-cloud';
  abstract readonly label: string;
  protected status: TtsState = 'idle';

  async speak(request: TtsSpeakRequest): Promise<void> {
    const config = await getCloudTtsConfig(this.id);
    if (!config.enabled || !config.apiKey) {
      this.status = 'error';
      request.onStatus('error');
      throw new Error(`${this.label} 未配置 API Key，当前仅预留模块边界。`);
    }

    const synthesisRequest = this.createSynthesisRequest(request.text, request.options, config);
    this.status = 'error';
    request.onStatus('error');
    throw new Error(`${this.label} 请求已封装但未启用真实云端播放验收：${synthesisRequest.url}`);
  }

  async stop(): Promise<void> {
    this.status = 'idle';
  }

  async getStatus(): Promise<TtsProviderStatus> {
    const config = await getCloudTtsConfig(this.id);
    return {
      id: this.id,
      state: this.status,
      available: Boolean(config.enabled && config.apiKey),
      message: config.apiKey
        ? `${this.label} 已保存配置，但真实云端播放需拿到 Key 后再验收。`
        : `${this.label} 未配置，当前为预留 provider。`,
      supportsPause: false,
    };
  }

  estimateUsage(text?: string): Promise<TtsUsageEstimate> {
    return usageTracker.estimate(this.id, text);
  }

  abstract createSynthesisRequest(text: string, options: TtsOptions, config: CloudTtsConfig): CloudSynthesisRequest;
}

class AzureTtsProvider extends ReservedCloudTtsProvider {
  readonly id = 'azure' as const;
  readonly label = 'Azure Speech TTS';

  createSynthesisRequest(text: string, options: TtsOptions, config: CloudTtsConfig): CloudSynthesisRequest {
    const region = config.region || 'eastasia';
    const voice = config.voice || DEFAULT_CLOUD_CONFIG.azure.voice;
    const rate = toSsmlRate(options.rate);
    const pitch = toSsmlPitch(options.pitch);

    return {
      url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'JaReader',
      },
      body: [
        '<speak version="1.0" xml:lang="ja-JP">',
        `<voice xml:lang="ja-JP" name="${escapeXml(voice)}">`,
        `<prosody rate="${rate}" pitch="${pitch}">${escapeXml(text)}</prosody>`,
        '</voice>',
        '</speak>',
      ].join(''),
    };
  }
}

class GoogleCloudTtsProvider extends ReservedCloudTtsProvider {
  readonly id = 'google-cloud' as const;
  readonly label = 'Google Cloud Text-to-Speech';

  createSynthesisRequest(text: string, options: TtsOptions, config: CloudTtsConfig): CloudSynthesisRequest {
    const voice = config.voice || DEFAULT_CLOUD_CONFIG['google-cloud'].voice;

    return {
      url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(config.apiKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'ja-JP',
          name: voice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: clamp(options.rate, 0.25, 4.0),
          pitch: Math.round((clamp(options.pitch, 0.5, 2.0) - 1) * 10),
        },
      }),
    };
  }
}

class TtsController {
  private state: TtsState = 'idle';
  private engine: TtsEngine = 'none';
  private speakingSentenceIndex = -1;
  private options: TtsOptions = { ...DEFAULT_TTS_OPTIONS };
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private listeners: Array<(state: TtsState, engine: TtsEngine) => void> = [];
  private systemProvider = new SystemTtsProvider();
  private edgeDevProvider = new EdgeDevTtsProvider();
  private providers: Record<TtsProviderId, TtsProvider> = {
    system: this.systemProvider,
    'edge-dev': this.edgeDevProvider,
    azure: new AzureTtsProvider(),
    'google-cloud': new GoogleCloudTtsProvider(),
  };
  private activeProviderId: TtsProviderId = 'system';

  getState(): TtsState { return this.state; }
  getEngine(): TtsEngine { return this.engine; }
  getVoices(): VoiceInfo[] { return this.systemProvider.getVoices(); }
  getInitError(): string | null { return this.initError; }
  getEdgeStatus(): string { return 'Edge TTS dev provider 已隐藏，默认不检测、不自动使用。'; }
  isEdgeAvailable(): boolean { return false; }
  getGoogleTtsGuide() { return GOOGLE_TTS_GUIDE; }
  getProvider(id: TtsProviderId): TtsProvider { return this.providers[id]; }

  onStateChange(fn: (state: TtsState, engine: TtsEngine) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initInternal().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  setOptions(opts: Partial<TtsOptions>) {
    this.options = { ...this.options, ...opts };
  }

  async speak(text: string, index: number, onDone?: () => void): Promise<void> {
    await this.ensureInitialized();

    const provider = this.providers[this.activeProviderId] || this.systemProvider;
    const speechText = normalizeTextForSpeech(text);
    try {
      await provider.speak({
        text: speechText,
        index,
        options: this.options,
        onDone,
        onStatus: (state) => this.setState(state, provider.id, index),
      });
    } catch (err) {
      console.warn(`[TTS-${provider.id}] speak failed:`, err);
      if (provider.id !== 'system') {
        this.initError = `${provider.label} 不可用，已隐藏降级到系统 TTS。`;
        this.activeProviderId = 'system';
        await this.systemProvider.speak({
          text: speechText,
          index,
          options: this.options,
          onDone,
          onStatus: (state) => this.setState(state, 'system', index),
        });
        return;
      }

      this.initError = formatError(err);
      this.setState('error', 'system', index);
      onDone?.();
    }
  }

  async pause(): Promise<void> {
    const provider = this.providers[this.activeProviderId] || this.systemProvider;
    if (provider.id === 'system' && Platform.OS === 'android') return;
    await provider.pause?.();
    const status = await provider.getStatus();
    this.setState(status.state, provider.id, this.speakingSentenceIndex);
  }

  async resume(): Promise<void> {
    const provider = this.providers[this.activeProviderId] || this.systemProvider;
    if (provider.id === 'system' && Platform.OS === 'android') return;
    await provider.resume?.();
    const status = await provider.getStatus();
    this.setState(status.state, provider.id, this.speakingSentenceIndex);
  }

  async stop(): Promise<void> {
    const provider = this.providers[this.activeProviderId] || this.systemProvider;
    await provider.stop();
    this.setState('idle', provider.id, -1);
  }

  async getStatus(providerId: TtsProviderId = this.activeProviderId): Promise<TtsProviderStatus> {
    return this.providers[providerId].getStatus();
  }

  async estimateUsage(text = '', providerId: TtsProviderId = this.activeProviderId): Promise<TtsUsageEstimate> {
    return this.providers[providerId].estimateUsage(text);
  }

  async refreshEdgeStatus(): Promise<boolean> {
    const settings = useSettingsStore.getState();
    this.edgeDevProvider.configure(settings.edgeTtsEndpoint, settings.edgeTtsVoice);
    return this.edgeDevProvider.refreshStatus();
  }

  enableDevProvider(providerId: TtsProviderId): void {
    this.activeProviderId = providerId;
    this.engine = providerId;
    this.emit();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise && this.engine === 'none') {
      await this.init();
    } else if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async initInternal(): Promise<void> {
    const settings = useSettingsStore.getState();
    this.options.rate = settings.ttsRate || this.options.rate;
    this.options.pitch = settings.ttsPitch || this.options.pitch;
    if (settings.ttsVoice) this.options.voice = settings.ttsVoice;
    this.edgeDevProvider.configure(settings.edgeTtsEndpoint, settings.edgeTtsVoice);

    await this.systemProvider.init(this.options);
    const systemStatus = await this.systemProvider.getStatus();
    this.initError = systemStatus.available ? null : systemStatus.message;
    this.engine = systemStatus.available ? 'system' : 'none';
    this.activeProviderId = systemStatus.available ? 'system' : this.activeProviderId;
    this.emit();
  }

  private setState(state: TtsState, engine: TtsEngine, sentenceIndex: number): void {
    this.state = state;
    this.engine = engine;
    this.speakingSentenceIndex = state === 'speaking' || state === 'paused' ? sentenceIndex : -1;
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state, this.engine);
  }
}

export async function getCloudTtsConfig(provider: 'azure' | 'google-cloud'): Promise<CloudTtsConfig> {
  const fallback = DEFAULT_CLOUD_CONFIG[provider];

  try {
    if (provider === 'azure') {
      const [apiKey, region, voice] = await Promise.all([
        SecureStore.getItemAsync(TTS_SECURE_STORE_KEYS.azureApiKey),
        SecureStore.getItemAsync(TTS_SECURE_STORE_KEYS.azureRegion),
        SecureStore.getItemAsync(TTS_SECURE_STORE_KEYS.azureVoice),
      ]);
      return {
        enabled: Boolean(apiKey),
        apiKey: apiKey || '',
        region: region || fallback.region,
        voice: voice || fallback.voice,
      };
    }

    const [apiKey, voice] = await Promise.all([
      SecureStore.getItemAsync(TTS_SECURE_STORE_KEYS.googleCloudApiKey),
      SecureStore.getItemAsync(TTS_SECURE_STORE_KEYS.googleCloudVoice),
    ]);
    return {
      enabled: Boolean(apiKey),
      apiKey: apiKey || '',
      voice: voice || fallback.voice,
    };
  } catch (err) {
    console.warn(`[TTS-secure-store] read ${provider} config failed:`, err);
    return fallback;
  }
}

export async function setCloudTtsConfig(provider: 'azure' | 'google-cloud', config: Partial<CloudTtsConfig>): Promise<void> {
  try {
    if (provider === 'azure') {
      await setSecureValue(TTS_SECURE_STORE_KEYS.azureApiKey, config.apiKey);
      await setSecureValue(TTS_SECURE_STORE_KEYS.azureRegion, config.region);
      await setSecureValue(TTS_SECURE_STORE_KEYS.azureVoice, config.voice);
      return;
    }

    await setSecureValue(TTS_SECURE_STORE_KEYS.googleCloudApiKey, config.apiKey);
    await setSecureValue(TTS_SECURE_STORE_KEYS.googleCloudVoice, config.voice);
  } catch (err) {
    console.warn(`[TTS-secure-store] save ${provider} config failed:`, err);
  }
}

export function getLocalGoogleTtsGuide() {
  return GOOGLE_TTS_GUIDE;
}

async function setSecureValue(key: string, value?: string): Promise<void> {
  const normalized = value?.trim() || '';
  if (normalized) {
    await SecureStore.setItemAsync(key, normalized);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

function toVoiceInfo(voice: Voice): VoiceInfo {
  return {
    identifier: voice.identifier,
    name: voice.name,
    language: voice.language,
    quality: voice.quality,
  };
}

function isJapaneseVoice(voice: Voice): boolean {
  const lang = (voice.language || '').toLowerCase();
  const name = (voice.name || '').toLowerCase();
  const id = (voice.identifier || '').toLowerCase();

  return (
    lang.startsWith('ja') || lang === 'jpn' ||
    name.includes('japan') || name.includes('japanese') ||
    name.includes('日本語') || name.includes('日本') ||
    name.includes('nihongo') ||
    id.includes('ja-jp') || id.includes('ja_jp') ||
    id.includes('japanese') || id.includes('japan')
  );
}

function pickBestVoice(voices: VoiceInfo[]): VoiceInfo {
  const googleJa = voices.find(v =>
    (v.identifier || '').toLowerCase().includes('google') &&
    (v.language || '').toLowerCase().startsWith('ja'),
  );
  if (googleJa) return googleJa;

  const enhanced = voices.find(v => v.quality === 'Enhanced' || v.quality === 'enhanced');
  if (enhanced) return enhanced;

  return voices[0];
}

function normalizeEndpoint(value = ''): string {
  return value.trim().replace(/\/+$/, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toEdgeRate(rate: number): string {
  const percent = Math.round((clamp(rate, 0.5, 2.0) - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function toSsmlRate(rate: number): string {
  const percent = Math.round((clamp(rate, 0.5, 2.0) - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function toSsmlPitch(pitch: number): string {
  const percent = Math.round((clamp(pitch, 0.5, 2.0) - 1) * 20);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function countBillableCharacters(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function getCurrentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '未知错误';
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
