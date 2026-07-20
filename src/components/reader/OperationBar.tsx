import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { HandMode } from '../../utils/constants';

interface OperationBarProps {
  handMode: HandMode;
  isReading: boolean;
  showTranslation: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTtsToggle: () => void;
  onTranslationToggle: () => void;
}

/**
 * Bottom operation bar.
 * Buttons cluster left/right/center based on hand mode.
 * Staggered/cross layout in single-hand mode to prevent misclicks.
 */
export function OperationBar({
  handMode,
  isReading,
  showTranslation,
  onPrev,
  onNext,
  onTtsToggle,
  onTranslationToggle,
}: OperationBarProps) {
  const isSingle = handMode === 'left' || handMode === 'right';
  const isRight = handMode === 'right';

  if (isSingle) {
    return (
      <View
        style={[
          styles.container,
          styles.singleContainer,
          isRight ? styles.alignRight : styles.alignLeft,
        ]}
      >
        {/* Staggered layout for single-hand: prevent misclicks */}
        <View style={styles.staggeredRow}>
          <TouchableOpacity style={styles.btn} onPress={onPrev}>
            <Text style={styles.btnText}>◀◀</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.staggeredRow, styles.staggeredOffset]}>
          <TouchableOpacity
            style={[styles.btn, styles.ttsBtn, isReading && styles.ttsActive]}
            onPress={onTtsToggle}
          >
            <Text style={styles.btnText}>{isReading ? '⏸' : '🔊'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.miniBtn, showTranslation && styles.miniBtnActive]}
            onPress={onTranslationToggle}
          >
            <Text style={styles.miniBtnText}>译</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.staggeredRow}>
          <TouchableOpacity style={styles.btn} onPress={onNext}>
            <Text style={styles.btnText}>▶▶</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Two-hand mode: buttons spread wide
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btn} onPress={onPrev}>
        <Text style={styles.btnText}>◀◀</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.miniBtn, showTranslation && styles.miniBtnActive]}
        onPress={onTranslationToggle}
      >
        <Text style={styles.miniBtnText}>译</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.ttsBtn, isReading && styles.ttsActive]}
        onPress={onTtsToggle}
      >
        <Text style={styles.btnText}>{isReading ? '⏸' : '🔊'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={onNext}>
        <Text style={styles.btnText}>▶▶</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingBottom: 28,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  singleContainer: {
    paddingHorizontal: 20,
    gap: 4,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  // Staggered/cross layout rows
  staggeredRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 2,
  },
  staggeredOffset: {
    marginHorizontal: 20,
  },
  // Buttons
  btn: {
    width: 52,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  ttsBtn: {
    backgroundColor: '#e8f0ff',
    width: 56,
    height: 44,
  },
  ttsActive: {
    backgroundColor: '#4a90d9',
  },
  minibtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  miniBtnActive: {
    backgroundColor: '#e0e8f0',
  },
  btnText: {
    fontSize: 20,
    color: '#555',
  },
  miniBtnText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
});
