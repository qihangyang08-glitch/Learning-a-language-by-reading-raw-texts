import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import type { HandMode } from '../../utils/constants';
import { Colors, PAGE_ANIM_DURATION } from '../../utils/constants';

interface BottomZoneProps {
  handMode: HandMode;
  isReading: boolean;
  showTranslation: boolean;
  isFirst: boolean;
  isLast: boolean;
  isLandscape: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTtsToggle: () => void;
  onTranslationToggle: () => void;
}

/**
 * Zone 4: Bottom operation + page-turn zone.
 *
 * Portrait:
 *   Full-width bottom bar with swipe zone above buttons.
 *   Both-hands: buttons spread evenly.
 *   Single-hand: buttons staggered on one side.
 *
 * Landscape single-hand:
 *   Renders as a VERTICAL SIDEBAR on the active hand side,
 *   saving vertical space. The sidebar includes the swipe zone
 *   (top half of the sidebar) and buttons (bottom half).
 *
 * Landscape both-hands:
 *   Compact horizontal strip at the bottom.
 */
export function BottomZone({
  handMode,
  isReading,
  showTranslation,
  isFirst,
  isLast,
  isLandscape,
  onPrev,
  onNext,
  onTtsToggle,
  onTranslationToggle,
}: BottomZoneProps) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isAnimating = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const triggerPrev = useCallback(() => {
    if (!isFirst) onPrev();
  }, [isFirst, onPrev]);

  const triggerNext = useCallback(() => {
    if (!isLast) onNext();
  }, [isLast, onNext]);

  const finishAnim = useCallback(() => {
    isAnimating.value = false;
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (isAnimating.value) return;
      translateX.value = 0;
      opacity.value = 1;
    })
    .onUpdate((e) => {
      if (isAnimating.value) return;
      translateX.value = e.translationX * 0.35;
      opacity.value = 1 - Math.min(Math.abs(e.translationX) / 500, 0.15);
    })
    .onEnd((e) => {
      if (isAnimating.value) return;

      const { translationX, translationY } = e;
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);
      const threshold = 25;

      if (absX > threshold || absY > threshold) {
        isAnimating.value = true;

        if (absX >= absY) {
          const dir = translationX > 0 ? 'prev' : 'next';
          const sign = dir === 'prev' ? 1 : -1;
          translateX.value = withTiming(sign * 60, { duration: PAGE_ANIM_DURATION });
          opacity.value = withTiming(0, { duration: PAGE_ANIM_DURATION }, (finished) => {
            if (finished) {
              if (dir === 'prev') runOnJS(triggerPrev)();
              else runOnJS(triggerNext)();
              translateX.value = sign * -40;
              opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 });
              translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 }, (done) => {
                if (done) runOnJS(finishAnim)();
              });
            } else {
              runOnJS(finishAnim)();
            }
          });
        } else {
          if (translationY < 0) runOnJS(triggerNext)();
          else runOnJS(triggerPrev)();
          translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 });
          opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 }, (done) => {
            if (done) runOnJS(finishAnim)();
          });
        }
        return;
      }

      translateX.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    });

  const isSingle = handMode === 'left' || handMode === 'right';
  const isRight = handMode === 'right';

  // ═══ Landscape single-hand: SIDEBAR ═══
  if (isLandscape && isSingle) {
    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sidebar,
            isRight ? styles.sidebarRight : styles.sidebarLeft,
            animatedStyle,
          ]}
        >
          {/* Swipe zone (top half) */}
          <View style={styles.sidebarSwipeZone} />

          {/* Buttons stacked vertically */}
          <View style={styles.sidebarBtns}>
            <Btn icon="←" onPress={onPrev} />
            <View style={{ height: 8 }} />
            <Btn
              icon={isReading ? '∥' : '♪'}
              onPress={onTtsToggle}
              active={isReading}
            />
            <View style={{ height: 8 }} />
            <Btn
              icon="译"
              onPress={onTranslationToggle}
              active={showTranslation}
              isLabel
            />
            <View style={{ height: 8 }} />
            <Btn icon="→" onPress={onNext} />
          </View>
        </Animated.View>
      </GestureDetector>
    );
  }

  // ═══ Landscape both-hands: compact bottom ═══
  if (isLandscape) {
    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.containerCompact, animatedStyle]}>
          <View style={styles.swipeZoneCompact} />
          <View style={styles.bothRow}>
            <Btn icon="←" onPress={onPrev} />
            <View style={styles.centerBtns}>
              <Btn
                icon={isReading ? '∥' : '♪'}
                onPress={onTtsToggle}
                active={isReading}
              />
              <View style={{ width: 14 }} />
              <Btn
                icon="译"
                onPress={onTranslationToggle}
                active={showTranslation}
                isLabel
              />
            </View>
            <Btn icon="→" onPress={onNext} />
          </View>
        </Animated.View>
      </GestureDetector>
    );
  }

  // ═══ Portrait ═══
  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        {/* Blank swipe zone above buttons */}
        <View style={styles.swipeZone} />

        {/* Button row */}
        {isSingle ? (
          <View style={[styles.singleRow, isRight ? styles.alignRight : styles.alignLeft]}>
            {/* Staggered layout: top button closer to center, bottom at edge.
                 RIGHT hand (flex-end): use marginRight to shift leftward toward center.
                 LEFT hand (flex-start): use marginLeft to shift rightward toward center. */}
            {/* Row 1: ← (innermost — closest to center) */}
            <View style={[styles.staggerGroup, isRight ? { marginRight: 36 } : { marginLeft: 28 }]}>
              <Btn icon="←" onPress={onPrev} />
            </View>
            {/* Row 2: TTS + Translation (slight center offset) */}
            <View style={[styles.staggerGroup, isRight ? { marginRight: 14 } : { marginLeft: 0 }]}>
              <Btn
                icon={isReading ? '∥' : '♪'}
                onPress={onTtsToggle}
                active={isReading}
              />
              <View style={{ width: 10 }} />
              <Btn
                icon="译"
                onPress={onTranslationToggle}
                active={showTranslation}
                isLabel
              />
            </View>
            {/* Row 3: → (at edge — easiest thumb reach) */}
            <View style={styles.staggerGroup}>
              <Btn icon="→" onPress={onNext} />
            </View>
          </View>
        ) : (
          <View style={styles.bothRow}>
            <Btn icon="←" onPress={onPrev} />
            <View style={styles.centerBtns}>
              <Btn
                icon={isReading ? '∥' : '♪'}
                onPress={onTtsToggle}
                active={isReading}
              />
              <View style={{ width: 18 }} />
              <Btn
                icon="译"
                onPress={onTranslationToggle}
                active={showTranslation}
                isLabel
              />
            </View>
            <Btn icon="→" onPress={onNext} />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function Btn({
  icon,
  onPress,
  active,
  isLabel,
}: {
  icon: string;
  onPress: () => void;
  active?: boolean;
  isLabel?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.4}
    >
      <Text
        style={[
          styles.btnIcon,
          isLabel && styles.btnLabel,
          active && styles.btnActive,
        ]}
      >
        {icon}
      </Text>
    </TouchableOpacity>
  );
}

const BTN_SIZE = 44;

const styles = StyleSheet.create({
  // ── Portrait container ──
  container: {
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
    paddingBottom: 24,
  },
  swipeZone: {
    height: 40,
  },

  // ── Landscape compact (both-hands) ──
  containerCompact: {
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
    paddingBottom: 8,
  },
  swipeZoneCompact: {
    height: 24,
  },

  // ── Landscape sidebar (single-hand) ──
  sidebar: {
    width: 64,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    borderColor: Colors.divider,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  sidebarRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  sidebarLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  sidebarSwipeZone: {
    flex: 1,
  },
  sidebarBtns: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 20,
  },

  // ── Both hands ──
  bothRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  centerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Single hand (portrait) ──
  singleRow: {
    paddingHorizontal: 20,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  staggerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },

  // ── Button ──
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  btnIcon: {
    fontSize: 19,
    color: Colors.textSecondary,
    fontWeight: '300',
  },
  btnLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
  btnActive: {
    color: Colors.accent,
    fontWeight: '500',
  },
});
