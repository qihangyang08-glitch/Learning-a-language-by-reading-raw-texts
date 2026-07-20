import React from 'react';
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
import {
  SWIPE_VERTICAL_THRESHOLD,
  SWIPE_HORIZONTAL_THRESHOLD,
  PAGE_ANIM_DURATION,
} from '../../utils/constants';

interface PageGestureAreaProps {
  /** Called to navigate to the previous sentence */
  onPrevSentence: () => void;
  /** Called to navigate to the next sentence */
  onNextSentence: () => void;
  /** Whether currently on the first sentence */
  isFirst: boolean;
  /** Whether currently on the last sentence */
  isLast: boolean;
}

/**
 * Gesture area that wraps the sentence display.
 * Handles vertical + horizontal swipe for page turning.
 * Does NOT intercept taps — those pass through to the sentence text.
 */
export function PageGestureArea({
  onPrevSentence,
  onNextSentence,
  isFirst,
  isLast,
  children,
}: React.PropsWithChildren<PageGestureAreaProps>) {
  // Animation for page-turn effect
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const triggerPrev = () => {
    if (!isFirst) onPrevSentence();
  };

  const triggerNext = () => {
    if (!isLast) onNextSentence();
  };

  // Pan gesture for swipe-based page turning
  const panGesture = Gesture.Pan()
    .onStart(() => {
      translateX.value = 0;
      opacity.value = 1;
    })
    .onUpdate((event) => {
      // Track horizontal displacement for visual feedback
      translateX.value = event.translationX * 0.5;
      opacity.value = 1 - Math.min(Math.abs(event.translationX) / 300, 0.3);
    })
    .onEnd((event) => {
      const { translationX, translationY, velocityX, velocityY } = event;

      // Determine swipe direction
      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);
      const screenW = 375; // approximate, actual measured by parent
      const screenH = 700;

      // Use velocity for faster detection, fallback to translation distance
      const fastHorizontal = Math.abs(velocityX) > 300;
      const fastVertical = Math.abs(velocityY) > 300;

      // Horizontal swipe
      if (fastHorizontal || absX > screenW * SWIPE_HORIZONTAL_THRESHOLD) {
        if (velocityX > 0 || translationX > 0) {
          // Right swipe → go to previous
          translateX.value = withTiming(200, { duration: PAGE_ANIM_DURATION });
          opacity.value = withTiming(0, { duration: PAGE_ANIM_DURATION }, () => {
            runOnJS(triggerPrev)();
            translateX.value = -200;
            opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 });
            translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 });
          });
        } else {
          // Left swipe → go to next
          translateX.value = withTiming(-200, { duration: PAGE_ANIM_DURATION });
          opacity.value = withTiming(0, { duration: PAGE_ANIM_DURATION }, () => {
            runOnJS(triggerNext)();
            translateX.value = 200;
            opacity.value = withTiming(1, { duration: PAGE_ANIM_DURATION / 2 });
            translateX.value = withTiming(0, { duration: PAGE_ANIM_DURATION / 2 });
          });
        }
        return;
      }

      // Vertical swipe
      if (fastVertical || absY > screenH * SWIPE_VERTICAL_THRESHOLD) {
        if (velocityY < 0 || translationY < 0) {
          // Swipe up → go to next
          runOnJS(triggerNext)();
        } else {
          // Swipe down → go to previous
          runOnJS(triggerPrev)();
        }
      }

      // Spring back to center
      translateX.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
});
