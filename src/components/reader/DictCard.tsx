import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { LookupResult } from '../../types/reader';
import type { HandMode } from '../../utils/constants';
import { Colors } from '../../utils/constants';

interface DictCardProps {
  lookup: any | null;
  handMode: HandMode;
  onDismiss: () => void;
}

/**
 * Dictionary lookup card.
 * In single-hand mode, offset to the opposite side from the operation buttons
 * for visual balance. Card is light and minimal.
 */
export function DictCard({ lookup, handMode, onDismiss }: DictCardProps) {
  if (!lookup) return null;

  const isRight = handMode === 'right';
  const isLeft = handMode === 'left';
  const isSingle = isRight || isLeft;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSingle && (isRight ? styles.offsetLeft : styles.offsetRight),
      ]}
      activeOpacity={1}
      onPress={onDismiss}
    >
      <Text style={styles.word}>{lookup.word}</Text>
      {lookup.reading ? (
        <Text style={styles.reading}>{lookup.reading}</Text>
      ) : null}
      {lookup.pos?.length > 0 && (
        <Text style={styles.pos}>{lookup.pos.join(' · ')}</Text>
      )}
      <Text style={styles.gloss}>
        {Array.isArray(lookup.gloss) ? lookup.gloss.join('; ') : lookup.gloss}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: Colors.card,
    borderRadius: 4,
    padding: 12,
    maxWidth: '80%',
    minWidth: 160,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 20,
  },
  offsetLeft: {
    alignSelf: 'flex-start',
    marginLeft: 16,
  },
  offsetRight: {
    alignSelf: 'flex-end',
    marginRight: 16,
  },
  word: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  reading: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  pos: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  gloss: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
});
