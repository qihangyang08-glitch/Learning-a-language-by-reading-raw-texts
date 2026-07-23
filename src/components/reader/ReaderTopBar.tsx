import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { HandMode } from '../../utils/constants';
import { Colors } from '../../utils/constants';

interface ReaderTopBarProps {
  chapterName: string;
  handMode: HandMode;
  progressPercent: number;
  isLandscape: boolean;
  onBack: () => void;
  onOutline: () => void;
  onToggleBookmark: () => void;
  onToggleHandMode: () => void;
  onToggleOrientation: () => void;
}

const MODE_LABELS: Record<HandMode, string> = {
  both: '双',
  right: '右',
  left: '左',
};

/**
 * Zone 1: Frosted glass top bar.
 *
 * Portrait: standard height (44px), full controls.
 * Landscape: compact height (34px), smaller text, minimal padding — saves
 *   vertical space for the text area.
 */
export function ReaderTopBar({
  chapterName,
  handMode,
  progressPercent,
  isLandscape,
  onBack,
  onOutline,
  onToggleBookmark,
  onToggleHandMode,
  onToggleOrientation,
}: ReaderTopBarProps) {
  const compact = isLandscape;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Left: back arrow + chapter name */}
      <TouchableOpacity
        style={styles.leftGroup}
        onPress={onBack}
        activeOpacity={0.5}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.backArrow, compact && styles.backArrowCompact]}>←</Text>
        <Text
          style={[styles.chapterName, compact && styles.chapterNameCompact]}
          numberOfLines={1}
        >
          {chapterName || '—'}
        </Text>
      </TouchableOpacity>

      {/* Center: progress — tap → outline, long-press → bookmark */}
      <TouchableOpacity
        style={styles.centerGroup}
        onPress={onOutline}
        onLongPress={onToggleBookmark}
        activeOpacity={0.5}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <View style={[styles.progressTrack, compact && styles.progressTrackCompact]}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progressPercent)}%` }]} />
        </View>
        <Text style={[styles.progressLabel, compact && styles.progressLabelCompact]}>
          {progressPercent}%
        </Text>
      </TouchableOpacity>

      {/* Right: toggles */}
      <View style={styles.rightGroup}>
        <ToggleBtn
          label={MODE_LABELS[handMode]}
          onPress={onToggleHandMode}
          compact={compact}
        />
        <ToggleBtn
          label={isLandscape ? '▬' : '▯'}
          onPress={onToggleOrientation}
          compact={compact}
        />
      </View>
    </View>
  );
}

function ToggleBtn({
  label,
  onPress,
  compact,
}: {
  label: string;
  onPress: () => void;
  compact: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleBtn, compact && styles.toggleBtnCompact]}
      onPress={onPress}
      activeOpacity={0.5}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Text style={[styles.toggleLabel, compact && styles.toggleLabelCompact]}>{label}</Text>
    </TouchableOpacity>
  );
}

const BAR_HEIGHT = 44;
const BAR_HEIGHT_COMPACT = 34;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BAR_HEIGHT,
    paddingHorizontal: 12,
    backgroundColor: Colors.frostBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.frostBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    zIndex: 10,
  },
  containerCompact: {
    height: BAR_HEIGHT_COMPACT,
    paddingHorizontal: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 60,
  },
  backArrow: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '300',
  },
  backArrowCompact: {
    fontSize: 13,
  },
  chapterName: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
    maxWidth: 120,
  },
  chapterNameCompact: {
    fontSize: 11,
    maxWidth: 80,
  },
  centerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTrack: {
    width: 70,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.divider,
    overflow: 'hidden',
  },
  progressTrackCompact: {
    width: 50,
    height: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: Colors.accent,
  },
  progressLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '500',
    minWidth: 30,
  },
  progressLabelCompact: {
    fontSize: 9,
    minWidth: 24,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnCompact: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 26,
  },
  toggleLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  toggleLabelCompact: {
    fontSize: 10,
  },
});
