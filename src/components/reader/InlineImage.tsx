import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { BookImage } from '../../types/book';
import { Colors } from '../../utils/constants';

interface InlineImageProps {
  image: BookImage;
}

/**
 * Inline illustration — memory-safe.
 *
 * Key safeguards for Android:
 * - `resizeMethod="resize"` → decode at target size (not full res)
 * - Image dimensions capped to ~360px width
 * - `fadeDuration={0}` to skip wasteful fade animation
 * - Proper cleanup: cancel async ops on unmount, avoid stale setState
 */
export function InlineImage({ image }: InlineImageProps) {
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [shouldRender, setShouldRender] = useState(false);
  const { width } = useWindowDimensions();
  const mountedRef = useRef(true);
  const cancelRef = useRef(false);

  const imgW = Math.min(width - 32, 360);
  const imgH = imgW * 0.5;

  useEffect(() => {
    mountedRef.current = true;
    cancelRef.current = false;

    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      try {
        const info = await FileSystem.getInfoAsync(image.filePath);
        // Check both flags — component may unmount during await
        if (cancelRef.current || !mountedRef.current) return;

        if (info.exists) {
          if (mountedRef.current) setState('ready');
          // Use requestAnimationFrame for deferred render (not setTimeout — can fire after unmount)
          rafId = requestAnimationFrame(() => {
            if (mountedRef.current && !cancelRef.current) {
              setShouldRender(true);
            }
          });
        } else {
          if (mountedRef.current) setState('error');
        }
      } catch {
        if (mountedRef.current && !cancelRef.current) setState('error');
      }
    };

    // Small delay to avoid rapid state changes during scroll
    timerId = setTimeout(check, 80);

    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
      if (timerId !== null) clearTimeout(timerId);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [image.filePath]);

  if (state === 'checking') {
    return (
      <View style={[styles.placeholder, { width: imgW, height: imgH }]}>
        <ActivityIndicator size="small" color={Colors.textTertiary} />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.errorBox, { width: imgW }]}>
        <Text style={styles.errorText}>{image.alt || '插图'}</Text>
      </View>
    );
  }

  if (!shouldRender) {
    return (
      <View style={[styles.placeholder, { width: imgW, height: imgH }]}>
        <ActivityIndicator size="small" color={Colors.textTertiary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: image.filePath }}
        style={[styles.image, { width: imgW, height: imgH }]}
        resizeMode="contain"
        resizeMethod="resize"
        fadeDuration={0}
        onError={(e) => {
          console.warn('[InlineImage] error:', e.nativeEvent?.error);
          if (mountedRef.current) setState('error');
        }}
      />
      {image.alt ? <Text style={styles.alt}>{image.alt}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 8,
  },
  image: {
    borderRadius: 4,
    backgroundColor: Colors.divider,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.divider,
    borderRadius: 4,
    marginVertical: 6,
    marginHorizontal: 8,
  },
  errorBox: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 4,
    backgroundColor: Colors.bg,
    marginVertical: 4,
  },
  errorText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  alt: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
});
