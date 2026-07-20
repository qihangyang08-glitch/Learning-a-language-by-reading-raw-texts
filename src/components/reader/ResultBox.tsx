import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import type { LookupResult } from '../../types/reader';

interface ResultBoxProps {
  /** Dictionary lookup result, or null to hide */
  lookup: LookupResult | null;
  /** Translation text (from API), or empty to hide */
  translation?: string;
  /** Whether translation display is enabled */
  showTranslation: boolean;
  /** Called when user taps to dismiss */
  onDismiss: () => void;
}

/**
 * Result box displayed above the sentence text in the operation area.
 * Shows dictionary lookup results and/or sentence translation.
 */
export function ResultBox({
  lookup,
  translation,
  showTranslation,
  onDismiss,
}: ResultBoxProps) {
  const hasLookup = lookup !== null;
  const hasTranslation = showTranslation && translation && translation.length > 0;

  if (!hasLookup && !hasTranslation) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={onDismiss}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Dictionary lookup */}
        {hasLookup && (
          <View style={styles.lookupSection}>
            <Text style={styles.word}>{lookup.word}</Text>
            <Text style={styles.reading}>{lookup.reading}</Text>
            {lookup.pos.length > 0 && (
              <Text style={styles.pos}>{lookup.pos.join(' · ')}</Text>
            )}
            <Text style={styles.gloss}>
              {lookup.gloss.join('; ')}
            </Text>
          </View>
        )}

        {/* Divider between dictionary and translation */}
        {hasLookup && hasTranslation && <View style={styles.divider} />}

        {/* Translation */}
        {hasTranslation && (
          <View style={styles.transSection}>
            <Text style={styles.transLabel}>译文</Text>
            <Text style={styles.transText}>{translation}</Text>
          </View>
        )}
      </ScrollView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginHorizontal: 12,
    marginBottom: 8,
    maxHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
  },
  lookupSection: {},
  word: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
  },
  reading: {
    fontSize: 14,
    color: '#888',
    marginBottom: 6,
  },
  pos: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  gloss: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  transSection: {},
  transLabel: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  transText: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
});
