import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSettingsStore } from '../../store/settingsStore';
import { ttsController } from '../../services/tts';
import { getEntryCount } from '../../services/dictionary';
import { Colors } from '../../utils/constants';
import type { RomajiLayoutMode } from '../../types/reader';

interface SettingsOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsOverlay({ visible, onClose }: SettingsOverlayProps) {
  const { height, width } = useWindowDimensions();
  const [entryCount, setEntryCount] = useState(0);

  useEffect(() => {
    if (visible) {
      const id = setTimeout(() => setEntryCount(getEntryCount()), 0);
      return () => clearTimeout(id);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.panel, { maxHeight: height * 0.85, width: Math.min(width * 0.92, 440) }]}>
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <Text style={styles.title}>JaReader 设置</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.5}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* ── 欢迎引导（首次使用） ── */}
            <WelcomeGuide />

            {/* ── 应用功能 ── */}
            <Section icon="📖" title="应用功能">
              <InfoRow label="分句阅读" value="以句子为单位展示。翻到上一句/下一句请使用底部操作区的箭头按钮，或在底部操作区空白处滑动。" />
              <InfoRow label="智能翻译" value="接入 DeepSeek 大模型，整句日→中翻译。翻译结果自动缓存，回看不重复请求。" />
              <InfoRow label="词典查询" value={`内置 ${entryCount > 0 ? entryCount.toLocaleString() + ' ' : ''}日汉词典，点按任意单词即可查词释义。离线可用。`} />
              <InfoRow label="罗马音标注" value="底部“音”按钮为当前句生成罗马音。生成结果会缓存；需要 DeepSeek API Key。" />
              <InfoRow label="TTS 朗读" value="默认使用 Android 系统 TTS / Google 文字转语音，本地朗读日语句子。" />
              <InfoRow label="阅读导航" value="点击顶部进度条打开纲目导航，支持章节目录跳转和书签管理。" />
              <InfoRow label="单手模式" value="支持左手/右手操作切换，按钮和正文偏移适配单手使用。" />
              <InfoRow label="横竖屏" value="顶部切换横屏/竖屏模式，适配不同阅读场景。" />
              <InfoRow label="支持格式" value=".txt（纯文本）· .epub（电子书，含插图）" />
            </Section>

            {/* ── 阅读显示 ── */}
            <Section icon="Aa" title="阅读显示">
              <RomajiLayoutControl />
            </Section>

            {/* ── API Key 配置 ── */}
            <Section icon="🔑" title="翻译 API 配置">
              <InfoRow label="说明" value="整句翻译和罗马音生成需要 DeepSeek API Key。申请地址：platform.deepseek.com → API Keys。不配置 Key 不影响离线阅读、查词和系统 TTS。" />
              <ApiKeyInput />
              <Text style={styles.note}>
                你的 API Key 使用 Android Keystore 加密存储，仅保存在手机本地。翻译请求通过 HTTPS 加密发送，本应用不收集任何个人信息。
              </Text>
            </Section>

            {/* ── TTS 语音朗读 ── */}
            <TTSSection />

            {/* ── 隐私保护 ── */}
            <Section icon="🔒" title="隐私保护">
              <InfoRow label="数据存储" value="所有数据（书籍、词典、翻译缓存、阅读进度）均存储在手机本地 SQLite 数据库中。不联网、不上传、不收集。" />
              <InfoRow label="API Key" value="使用 Android Keystore 硬件级加密存储，其他任何应用无法读取。" />
              <InfoRow label="翻译请求" value="仅在你主动点击翻译按钮时，将当前句子文本通过 HTTPS 加密发送至 DeepSeek API。不发送任何个人身份信息。" />
              <InfoRow label="罗马音请求" value="仅在你主动点击“音”按钮且无本地缓存时，将当前句子文本发送至 DeepSeek API 生成罗马音。" />
              <InfoRow label="TTS 朗读" value="默认由手机本地系统 TTS 处理。开发预留的在线 TTS provider 默认隐藏，普通设置页不会启用或发送文本。" />
              <InfoRow label="网络权限" value="本应用仅在你主动操作（翻译、罗马音、TTS 合成）时使用网络，不会后台联网。" />
              <InfoRow label="开源透明" value="本应用完全开源，所有代码可在 GitHub 查阅，无后门、无追踪。" />
            </Section>

            {/* ── 关于 ── */}
            <View style={styles.aboutSection}>
              <Text style={styles.aboutTitle}>JaReader · 日语小说阅读器</Text>
              <Text style={styles.aboutText}>
                开源 · 轻量 · 离线优先{'\n'}
                在阅读原著中练习日语{'\n'}
                小学館中日日中第2版 · 系统 TTS{'\n'}
                DeepSeek 翻译 · 完全离线可用
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Welcome Guide ──
function WelcomeGuide() {
  const { firstLaunch, setFirstLaunch } = useSettingsStore();

  if (!firstLaunch) return null;

  return (
    <View style={styles.welcomeBox}>
      <Text style={styles.welcomeTitle}>欢迎使用 JaReader！</Text>
      <Text style={styles.welcomeText}>
        这是一款专为日语学习者设计的阅读器。请花 2 分钟了解以下设置，以获得最佳体验。
      </Text>
      <TouchableOpacity
        style={styles.welcomeBtn}
        onPress={() => setFirstLaunch(false)}
        activeOpacity={0.6}
      >
        <Text style={styles.welcomeBtnText}>我知道了</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Sub-components ──

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{icon}  {title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function RomajiLayoutControl() {
  const { romajiLayoutMode, setRomajiLayoutMode } = useSettingsStore();

  const options: Array<{ mode: RomajiLayoutMode; label: string; desc: string }> = [
    { mode: 'phrase', label: '不逐字精确', desc: '上方显示罗马音、下方显示原文，不做逐字对齐，适合省 token 的稳定阅读。' },
    { mode: 'token', label: '逐字精确', desc: '实验显示：按返回片段上下排列，尽量靠近原文；正文查词点击保持原逻辑。' },
  ];

  return (
    <View style={styles.settingBlock}>
      <View style={styles.settingHeader}>
        <Text style={styles.settingLabel}>罗马音排布</Text>
        <Text style={styles.settingValue}>
          {romajiLayoutMode === 'token' ? '逐字精确' : '不逐字精确'}
        </Text>
      </View>
      <View style={styles.segmented}>
        {options.map((option) => {
          const active = romajiLayoutMode === option.mode;
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => setRomajiLayoutMode(option.mode)}
              activeOpacity={0.65}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.settingDesc}>
        {options.find((option) => option.mode === romajiLayoutMode)?.desc}
      </Text>
    </View>
  );
}

function ApiKeyInput() {
  const { translationApiKey, setTranslationApiKey, apiKeyLoaded } = useSettingsStore();
  const [input, setInput] = useState(translationApiKey);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(translationApiKey);

  useEffect(() => {
    if (apiKeyLoaded && translationApiKey !== inputRef.current) {
      inputRef.current = translationApiKey;
      setInput(translationApiKey);
    }
  }, [apiKeyLoaded, translationApiKey]);

  const handleSave = () => {
    const key = input.trim();
    inputRef.current = key;
    setTranslationApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    inputRef.current = '';
    setInput('');
    setTranslationApiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.apiKeySection}>
      <TextInput
        style={styles.apiInput}
        placeholder="sk-xxxxxxxxxxxxxxxx"
        placeholderTextColor={Colors.textTertiary}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <View style={styles.apiBtnRow}>
        <TouchableOpacity
          style={[styles.apiBtn, styles.apiBtnSave, !input.trim() && styles.apiBtnDisabled]}
          onPress={handleSave}
          disabled={!input.trim()}
          activeOpacity={0.6}
        >
          <Text style={styles.apiBtnText}>{saved && input ? '已保存 ✓' : '保存'}</Text>
        </TouchableOpacity>
        {input.length > 0 && (
          <TouchableOpacity style={[styles.apiBtn, styles.apiBtnClear]} onPress={handleClear} activeOpacity={0.6}>
            <Text style={styles.apiBtnTextClear}>清除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function TTSSection() {
  const {
    ttsRate,
    setTtsRate,
  } = useSettingsStore();
  const ttsError = ttsController.getInitError();
  const ttsVoices = ttsController.getVoices();
  const engineType = ttsController.getEngine();
  const guide = ttsController.getGoogleTtsGuide();
  const [usageText, setUsageText] = useState('读取中...');

  useEffect(() => {
    let cancelled = false;
    ttsController.estimateUsage('', 'system').then((usage) => {
      if (!cancelled) {
        setUsageText(`${usage.month} · ${usage.localCharacters.toLocaleString()} 字符`);
      }
    }).catch(() => {
      if (!cancelled) setUsageText('暂不可用');
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <Section icon="🔊" title="语音朗读（TTS）">
      <View style={engineType === 'system' ? styles.statusGreen : styles.statusBlue}>
        <Text style={styles.statusTitle}>
          {engineType === 'system' ? '系统 TTS / Google TTS（默认）' : '系统 TTS 尚未完成初始化'}
        </Text>
        <Text style={styles.statusText}>
          JaReader 默认调用手机本地 TTS。Android 系统 TTS 不支持 pause/resume，暂停会保持为平台降级行为。
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>{guide.title}</Text>
        <Text style={styles.warningText}>
          {guide.summary}
        </Text>
        <View style={styles.voiceTipsBox}>
          <Text style={styles.voiceTipText}>不同日语声线效果差异明显，系统默认声线在低语速下可能出现颤音。</Text>
          <Text style={styles.voiceTipText}>如果朗读发抖或不自然，建议到系统 TTS 设置里试听男性声线或其他日语声线。</Text>
          <Text style={styles.voiceTipText}>JaReader 只能调用系统已提供的语音，实际可选项取决于手机系统和已安装语音包。</Text>
        </View>
        {ttsVoices.length > 0 && (
          <View style={styles.voiceList}>
            <Text style={styles.voiceListTitle}>检测到的系统日语语音：</Text>
            {ttsVoices.slice(0, 5).map((v, i) => (
              <Text key={i} style={styles.voiceName}>
                {v.name} ({v.language}{v.quality ? ` · ${v.quality}` : ''})
              </Text>
            ))}
            {ttsVoices.length > 5 && (
              <Text style={styles.voiceName}>另有 {ttsVoices.length - 5} 个日语语音可由系统选择。</Text>
            )}
          </View>
        )}
        {ttsVoices.length === 0 && (
          <Text style={styles.voiceFallback}>
            当前暂未检测到 ja-JP / Japanese 系统语音。请先在系统文字转语音设置中启用 Google 文字转语音并下载日语语音数据。
          </Text>
        )}
        {ttsError && (
          <Text style={styles.errorText}>{ttsError}</Text>
        )}
        <View style={styles.stepsBox}>
          {guide.steps.map((step, index) => (
            <Text key={step} style={styles.stepText}>{index + 1}. {step}</Text>
          ))}
        </View>
      </View>

      <View style={styles.statusBlue}>
        <Text style={styles.statusTitle}>本地估算用量</Text>
        <Text style={styles.statusText}>
          本月系统 TTS 朗读：{usageText}。普通设置页只展示系统 TTS 主线；开发预留 provider 默认隐藏，未显式启用时不会发起在线 TTS 请求。
        </Text>
      </View>

      <View style={styles.sliderSection}>
        <Text style={styles.sliderLabel}>朗读语速：{ttsRate.toFixed(2)}x</Text>
        <Slider
          style={styles.sliderControl}
          value={ttsRate}
          minimumValue={0.2} maximumValue={2.0} step={0.05}
          minimumTrackTintColor={Colors.textSecondary}
          maximumTrackTintColor={Colors.divider}
          thumbTintColor="#222"
          onValueChange={(v) => {
            const rate = Math.round(v * 100) / 100;
            setTtsRate(rate);
            ttsController.setOptions({ rate });
          }}
        />
        <View style={styles.sliderRange}>
          <Text style={styles.sliderRangeText}>0.2x 慢速</Text>
          <Text style={styles.sliderRangeText}>2.0x 快速</Text>
        </View>
      </View>
    </Section>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  panel: {
    backgroundColor: Colors.bg, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 14, elevation: 10,
  },
  scroll: {},
  scrollContent: { paddingBottom: 20 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: { padding: 6 },
  closeText: { fontSize: 18, color: Colors.textSecondary },

  // Welcome
  welcomeBox: {
    marginHorizontal: 18, marginBottom: 8,
    backgroundColor: '#eaf2f8', borderRadius: 8, padding: 16,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  welcomeTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  welcomeText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  welcomeBtn: {
    backgroundColor: Colors.accent, borderRadius: 6,
    paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start',
  },
  welcomeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Section
  section: { paddingHorizontal: 18, paddingTop: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },

  // Info row
  infoRow: { marginBottom: 10 },
  infoLabel: { fontSize: 12, color: Colors.accent, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Reading display
  settingBlock: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 12,
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  settingLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  settingValue: { fontSize: 12, color: Colors.textTertiary },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.bg,
    borderRadius: 6,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    paddingHorizontal: 8,
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent,
  },
  segmentText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: '#fff',
  },
  settingDesc: {
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 18,
    marginTop: 8,
  },

  // Note
  note: {
    fontSize: 11, color: Colors.textTertiary, lineHeight: 16,
    marginTop: 8, fontStyle: 'italic',
  },

  // API Key
  apiKeySection: { marginTop: 6 },
  apiInput: {
    height: 42, backgroundColor: Colors.card, borderRadius: 6,
    paddingHorizontal: 12, fontSize: 13, color: Colors.textPrimary, marginBottom: 8,
  },
  apiBtnRow: { flexDirection: 'row', gap: 8 },
  apiBtn: {
    borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center',
  },
  apiBtnSave: { backgroundColor: Colors.accent, flex: 2 },
  apiBtnClear: { backgroundColor: '#eee', flex: 1 },
  apiBtnDisabled: { opacity: 0.4 },
  apiBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  apiBtnTextClear: { color: '#888', fontSize: 13 },

  // Warning
  warningBox: {
    backgroundColor: '#fdf6e8', borderRadius: 8, padding: 14, marginBottom: 12,
  },
  warningTitle: { fontSize: 13, fontWeight: '600', color: '#8a7030', marginBottom: 8 },
  warningText: { fontSize: 12, color: '#8a7030', lineHeight: 18 },
  stepsBox: { marginTop: 8, paddingLeft: 4 },
  stepText: { fontSize: 12, color: '#6a5530', lineHeight: 22 },
  voiceList: { marginTop: 10, marginBottom: 4 },
  voiceListTitle: { fontSize: 11, color: '#8a7030', fontWeight: '500', marginBottom: 4 },
  voiceName: { fontSize: 11, color: '#6a5530', marginLeft: 2, marginBottom: 1 },
  voiceTipsBox: { marginTop: 10, gap: 4 },
  voiceTipText: { fontSize: 12, color: '#6a5530', lineHeight: 18 },
  voiceFallback: { fontSize: 11, color: '#6a5530', marginTop: 10, lineHeight: 17 },

  // Status
  statusGreen: {
    backgroundColor: '#eaf5ea', borderRadius: 8, padding: 12, marginBottom: 12,
  },
  statusBlue: {
    backgroundColor: '#eaf2f8', borderRadius: 8, padding: 12, marginBottom: 12,
  },
  statusTitle: { fontSize: 13, fontWeight: '600', color: '#3a7030', marginBottom: 4 },
  statusText: { fontSize: 12, color: '#4a7040', lineHeight: 18 },

  // Error
  errorText: { fontSize: 12, color: '#c44', marginTop: 8 },

  // Slider
  sliderSection: { marginTop: 12 },
  sliderLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  sliderControl: { width: '100%', height: 40, marginTop: 4 },
  sliderRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  sliderRangeText: { fontSize: 10, color: Colors.textTertiary },

  // About
  aboutSection: { paddingHorizontal: 18, paddingTop: 24, alignItems: 'center' },
  aboutTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  aboutText: { fontSize: 12, color: Colors.textTertiary, lineHeight: 22, textAlign: 'center' },
});
