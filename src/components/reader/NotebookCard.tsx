import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideOutUp } from 'react-native-reanimated';
import { Colors } from '../../utils/constants';

interface DictResultItem {
  word: string;
  reading?: string;
  pos?: string[];
  gloss?: string[];
}

interface NotebookCardProps {
  /** Single word lookup result (for backward compat / single tap) */
  dictResult?: DictResultItem | null;
  /** Multiple word lookup results (from lookupText) */
  dictResults?: DictResultItem[];
  /** Original queried text — shown when it differs from the matched word */
  queryWord?: string | null;
  /** Sentence translation */
  translation?: string | null;
  /** Translation loading state */
  translationLoading?: boolean;
  /** Dismiss handler — taps outside card are caught by parent */
  onDismiss: () => void;
}

/**
 * Zone 2: Unified notebook-style card.
 *
 * Displays EITHER a dictionary result OR a sentence translation.
 * Styled like handwritten notebook paper:
 * - Cream/beige background
 * - Horizontal lines
 * - 16dp rounded corners
 * - Very subtle shadow
 *
 * The card area is expanded/shrunk by the parent layout.
 * Dismiss: parent wraps this in a dismiss-area TouchableOpacity.
 */
export function NotebookCard({
  dictResult,
  dictResults,
  queryWord,
  translation,
  translationLoading,
}: NotebookCardProps) {
  const { height } = useWindowDimensions();
  const maxH = height * 0.38;

  // ── Nothing to show ──
  const hasDict = !!(dictResult || (dictResults && dictResults.length > 0));
  if (!hasDict && !translation && !translationLoading) {
    return null;
  }

  // Merge single + multi results, deduplicating by word
  const allResults: DictResultItem[] = [];
  const seen = new Set<string>();
  if (dictResult) { allResults.push(dictResult); seen.add(dictResult.word); }
  if (dictResults) {
    for (const r of dictResults) {
      if (!seen.has(r.word)) { allResults.push(r); seen.add(r.word); }
    }
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={SlideOutUp.duration(200)}
      style={styles.wrapper}
    >
      <ScrollView
        style={[styles.card, { maxHeight: maxH }]}
        contentContainerStyle={styles.cardInner}
        showsVerticalScrollIndicator={true}
        bounces={false}
      >
        {/* Translation loading */}
        {translationLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#8a7030" />
            <Text style={styles.loadingText}>翻译中...</Text>
          </View>
        )}

        {/* Sentence translation */}
        {!translationLoading && translation && (
          <>
            <Text style={styles.label}>译文</Text>
            {translation.split('\n').filter(Boolean).map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
          </>
        )}

        {/* Dictionary results (single or multiple) */}
        {!translationLoading && allResults.length > 0 && (
          <>
            {allResults.length > 1 && (
              <Text style={styles.label}>
                词典 · {allResults.length} 词
              </Text>
            )}
            {/* Show queried word if different from first matched headword */}
            {queryWord && allResults[0].word !== queryWord && (
              <Text style={styles.queryHint}>
                查询「{queryWord}」
              </Text>
            )}
            {allResults.map((entry, idx) => (
              <View key={`${entry.word}-${idx}`} style={idx > 0 ? styles.entrySep : undefined}>
                <Text style={styles.dictWord}>{entry.word}</Text>
                {entry.reading ? (
                  <Text style={styles.dictReading}>{entry.reading}</Text>
                ) : null}
                {entry.pos && entry.pos.length > 0 && (
                  <Text style={styles.dictPos}>{entry.pos.join(' · ')}</Text>
                )}
                {entry.gloss && entry.gloss.length > 0 && (
                  <View style={styles.glossList}>
                    {entry.gloss.map((g, gi) => (
                      <Text key={gi} style={styles.dictGloss}>{g}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  card: {
    backgroundColor: '#faf7f0',
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e0d8c0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardInner: {
    padding: 16,
  },
  label: {
    fontSize: 9,
    color: '#b0a080',
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  line: {
    fontSize: 14,
    color: '#4a4035',
    lineHeight: 26,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e0cc',
    paddingBottom: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#8a7030',
  },
  queryHint: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  dictWord: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  dictReading: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  dictPos: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 10,
  },
  glossList: {
    gap: 2,
  },
  dictGloss: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e0cc',
    paddingBottom: 1,
  },
  entrySep: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e0cc',
  },
});
