import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '../src/store/settingsStore';

/**
 * First-launch setup wizard for translation configuration.
 *
 * Explains:
 * - What data is sent (only sentence text)
 * - Where it goes (to the proxy, then to the translation API)
 * - Privacy guarantees (no PII, local cache, can disable anytime)
 *
 * Options:
 * - Use public proxy (default, plug-and-play)
 * - Self-host proxy (enter your own proxy URL)
 * - Skip (configure later in settings)
 */
export default function SetupScreen() {
  const router = useRouter();
  const settings = useSettingsStore();
  const [step, setStep] = useState<'welcome' | 'choose' | 'custom' | 'done'>('welcome');
  const [customUrl, setCustomUrl] = useState('');

  const handleUsePublic = () => {
    settings.setTranslationEnabled(true);
    settings.setTranslationProvider('deepseek');
    setStep('done');
  };

  const handleSelfHost = () => {
    if (customUrl.trim()) {
      settings.setTranslationEnabled(true);
      settings.setTranslationProvider('deepseek');
      setStep('done');
    }
  };

  const handleSkip = () => {
    router.replace('/');
  };

  const handleFinish = () => {
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      {step === 'welcome' && (
        <View style={styles.step}>
          <Text style={styles.emoji}>🌐</Text>
          <Text style={styles.title}>Translation Setup</Text>
          <Text style={styles.desc}>
            JaReader can translate sentences as you read.{'\n\n'}
            This uses AI translation via a secure proxy —{'\n'}
            your reading data never leaves your device.
          </Text>
          <View style={styles.privacyBox}>
            <Text style={styles.privacyTitle}>🔒 Privacy</Text>
            <Text style={styles.privacyText}>
              • Only the current sentence text is sent{'\n'}
              • No personal or device information{'\n'}
              • Translations cached locally{'\n'}
              • You can disable translation anytime
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('choose')}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'choose' && (
        <View style={styles.step}>
          <Text style={styles.title}>Choose Method</Text>

          <TouchableOpacity style={styles.optionCard} onPress={handleUsePublic}>
            <Text style={styles.optionTitle}>🌍 Public Proxy</Text>
            <Text style={styles.optionDesc}>
              Use the community proxy. Plug-and-play.{'\n'}
              Powered by DeepSeek AI.{'\n'}
              No setup required.
            </Text>
            <Text style={styles.optionTag}>Recommended</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => setStep('custom')}
          >
            <Text style={styles.optionTitle}>🔧 Self-Host</Text>
            <Text style={styles.optionDesc}>
              Deploy your own proxy on Cloudflare{'\n'}
              Workers (free tier, 5 min setup).{'\n'}
              Full control over API keys and data.
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'custom' && (
        <View style={styles.step}>
          <Text style={styles.title}>Self-Host Proxy</Text>
          <Text style={styles.desc}>
            Enter your Cloudflare Worker URL:{'\n\n'}
            See proxy/README.md for deployment instructions.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="https://your-worker.workers.dev"
            placeholderTextColor="#ccc"
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, !customUrl.trim() && styles.primaryBtnDisabled]}
            onPress={handleSelfHost}
            disabled={!customUrl.trim()}
          >
            <Text style={styles.primaryBtnText}>Save & Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => setStep('choose')}
          >
            <Text style={styles.skipBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'done' && (
        <View style={styles.step}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.title}>All Set!</Text>
          <Text style={styles.desc}>
            Translation is ready. Tap the "译" button{'\n'}
            while reading to see translations.{'\n\n'}
            You can change settings anytime.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
            <Text style={styles.primaryBtnText}>Start Reading</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  step: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emoji: { fontSize: 64, textAlign: 'center', marginBottom: 20 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  desc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  privacyBox: {
    backgroundColor: '#f8f9fb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e8ecf0',
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
  },
  // Buttons
  primaryBtn: {
    backgroundColor: '#4a90d9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { color: '#aaa', fontSize: 14 },
  // Options
  optionCard: {
    backgroundColor: '#f8f9fb',
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e8ecf0',
  },
  optionTitle: { fontSize: 17, fontWeight: '600', color: '#333', marginBottom: 8 },
  optionDesc: { fontSize: 14, color: '#777', lineHeight: 20, marginBottom: 8 },
  optionTag: {
    fontSize: 11,
    color: '#4a90d9',
    fontWeight: '600',
    backgroundColor: '#e8f0ff',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
});
