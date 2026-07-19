import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useSettingsStore } from '../../src/store/settingsStore';

export default function SettingsScreen() {
  const {
    translationEnabled,
    translationProvider,
    ttsRate,
    setTranslationEnabled,
    setTranslationProvider,
    setTtsRate,
  } = useSettingsStore();

  const providers = ['deepseek', 'baidu', 'microsoft'] as const;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Translation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Translation</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Enable Translation</Text>
            <Switch
              value={translationEnabled}
              onValueChange={setTranslationEnabled}
            />
          </View>

          {translationEnabled && (
            <View style={styles.providerList}>
              <Text style={styles.label}>Provider</Text>
              {providers.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.providerOption,
                    translationProvider === p && styles.providerActive,
                  ]}
                  onPress={() => setTranslationProvider(p)}
                >
                  <Text
                    style={[
                      styles.providerText,
                      translationProvider === p && styles.providerTextActive,
                    ]}
                  >
                    {p === 'deepseek' ? 'DeepSeek (推荐)' :
                     p === 'baidu' ? 'Baidu Translate' :
                     'Microsoft Translator'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* TTS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Text-to-Speech</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Speed: {ttsRate.toFixed(1)}x</Text>
          </View>
          {/* Simple rate controls */}
          <View style={styles.rateControls}>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.rateButton,
                  ttsRate === rate && styles.rateButtonActive,
                ]}
                onPress={() => setTtsRate(rate)}
              >
                <Text
                  style={[
                    styles.rateText,
                    ttsRate === rate && styles.rateTextActive,
                  ]}
                >
                  {rate}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>
            JaReader - Japanese Novel Reader{'\n'}
            Open source, lightweight, free.{'\n'}
            Practice Japanese by reading raw novels.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#333' },
  content: { flex: 1, padding: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: { fontSize: 15, color: '#555', marginBottom: 8 },
  providerList: { marginTop: 4 },
  providerOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 6,
  },
  providerActive: { backgroundColor: '#4a90d9' },
  providerText: { fontSize: 14, color: '#555' },
  providerTextActive: { color: '#fff', fontWeight: '600' },
  rateControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  rateButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  rateButtonActive: { backgroundColor: '#4a90d9' },
  rateText: { fontSize: 14, color: '#555' },
  rateTextActive: { color: '#fff', fontWeight: '600' },
  aboutText: { fontSize: 14, color: '#888', lineHeight: 22 },
});
