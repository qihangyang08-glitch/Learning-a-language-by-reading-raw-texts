import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import type { HandMode } from '../../utils/constants';

interface HandModeToggleProps {
  mode: HandMode;
  onToggle: () => void;
}

const MODE_LABELS: Record<HandMode, string> = {
  both: '双手',
  right: '右手',
  left: '左手',
};

/**
 * Top bar toggle for switching between two-hand / single-hand (left/right) modes.
 */
export function HandModeToggle({ mode, onToggle }: HandModeToggleProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onToggle} activeOpacity={0.7}>
      <Text style={styles.label}>{MODE_LABELS[mode]}</Text>
      <Text style={styles.arrow}>▾</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  arrow: {
    fontSize: 10,
    color: '#999',
  },
});
