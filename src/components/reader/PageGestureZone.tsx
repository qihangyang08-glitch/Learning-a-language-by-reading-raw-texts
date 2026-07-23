import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
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
import { PAGE_ANIM_DURATION } from '../../utils/constants';

interface PageGestureZoneProps {
  onPrev: () => void;
  onNext: () => void;
  isFirst: boolean;
  isLast: boolean;
  handMode: HandMode;
}

/**
 * Zone 4a: Page-turn gesture zone.
 *
 * This strip between the text card and the operation bar
 * accepts 4-direction swipe exclusively.
 * Physically isolated — no conflicts with text-area taps or bottom buttons.
 *
 * Animation lock prevents re-entrant gestures during the transition.
 */
export function PageGestureZone({
  onPrev,
  onNext,
  isFirst,
  isLast,
  handMode,
}: PageGestureZoneProps) {
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

  const finishAnimation = useCallback(() => {
    isAnimating.value = false;
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Ignore new gestures during animation
      if (isAnimating.value) return;
      translateX.value = 0;
      opacity.value = 1;
    })
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX * 0.4;
      opacity.value = 1 - Math.min(Math.abs(event.translationX) / 400, 0.2);
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const { translationX, translationY, velocityX, velocityY } = event;
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);

      if (absX > absY && absX > 25) {
        isAnimating.value = true;

        if (velocityX > 80 || translationX > 25) {
          // Swipe right → previous
          translateX.value = withTiming(80, { duration: PAGE_ANIM_DURATION });
          opacity.value = withTiming(0, { duration: PAGE_ANIM_DURATION }, (finished) => {
            if (finished) {
              runOnJS(triggerPrev)();
              translateX.value = -60;
              opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 });
              translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 }, (done) => {
                if (done) runOnJS(finishAnimation)();
              });
            } else {
              runOnJS(finishAnimation)();
            }
          });
        } else if (velocityX < -80 || translationX < -25) {
          // Swipe left → next
          translateX.value = withTiming(-80, { duration: PAGE_ANIM_DURATION });
          opacity.value = withTiming(0, { duration: PAGE_ANIM_DURATION }, (finished) => {
            if (finished) {
              runOnJS(triggerNext)();
              translateX.value = 60;
              opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 });
              translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 }, (done) => {
                if (done) runOnJS(finishAnimation)();
              });
            } else {
              runOnJS(finishAnimation)();
            }
          });
        }
        return;
      }

      if (absY > 20) {
        if (velocityY < -40 || translationY < -20) {
          runOnJS(triggerNext)();
        } else if (velocityY > 40 || translationY > 20) {
          runOnJS(triggerPrev)();
        }
      }

      // Reset position
      translateX.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.zone, animatedStyle]}
        pointerEvents="box-none"
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  zone: {
    height: 56,
  },
});
