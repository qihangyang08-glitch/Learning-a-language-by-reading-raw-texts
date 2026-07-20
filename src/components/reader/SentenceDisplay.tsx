import React, { useCallback } from 'react';
import { Text, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Sentence, Token } from '../../types/book';

interface SentenceDisplayProps {
  sentence: Sentence;
  fontSize: number;
  lineHeight: number;
  onWordPress?: (token: Token) => void;
  isLandscape: boolean;
}

/**
 * Displays a single sentence with each word as a tappable element.
 * Uses kuromoji token offsets to determine word boundaries.
 * Falls back to plain text display when tokens are not available.
 */
export function SentenceDisplay({
  sentence,
  fontSize,
  lineHeight,
  onWordPress,
  isLandscape,
}: SentenceDisplayProps) {
  const tokens = sentence.tokens;

  if (!tokens || tokens.length === 0) {
    // Fallback: plain text when no tokens available
    return (
      <View style={[styles.container, isLandscape && styles.landscape]}>
        <Text
          style={[
            styles.sentenceText,
            { fontSize, lineHeight: fontSize * lineHeight },
          ]}
        >
          {sentence.text}
        </Text>
      </View>
    );
  }

  // Render each token as a tappable inline element
  return (
    <View style={[styles.container, isLandscape && styles.landscape]}>
      <Text
        style={[
          styles.sentenceText,
          { fontSize, lineHeight: fontSize * lineHeight },
        ]}
      >
        {tokens.map((token, i) => (
          <Text
            key={`${token.wordPosition}-${i}`}
            onPress={() => onWordPress?.(token)}
            style={styles.tappableWord}
          >
            {token.surfaceForm}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  landscape: {
    maxWidth: '60%',
  },
  sentenceText: {
    color: '#222',
    textAlign: 'center',
  },
  tappableWord: {
    // No extra styling needed — inherits from parent Text
    // The onPress handler makes it tappable
  },
});
