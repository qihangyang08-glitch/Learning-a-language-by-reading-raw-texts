import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReaderStore } from '../../src/store/readerStore';
import { useBookStore } from '../../src/store/bookStore';

/**
 * Reader screen placeholder.
 * Full implementation in Phase 2 with:
 * - Sentence-centered layout
 * - Three-mode hand operation
 * - Page gesture areas
 * - ResultBox
 * - OperationBar
 */
export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { books } = useBookStore();
  const reader = useReaderStore();

  const book = books.find((b) => b.id === bookId);
  const currentSentence = reader.sentences[reader.currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn}>
          <Text style={styles.topBtnText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.progress}>
          {reader.currentIndex + 1} / {reader.totalSentences}
        </Text>

        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => {
            const modes: Array<'both' | 'left' | 'right'> = ['both', 'right', 'left'];
            const idx = modes.indexOf(reader.handMode);
            reader.setHandMode(modes[(idx + 1) % 3]);
          }}
        >
          <Text style={styles.topBtnText}>
            {reader.handMode === 'both' ? 'Both' : reader.handMode === 'right' ? 'R-Hand' : 'L-Hand'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Reading area */}
      <View style={styles.readingArea}>
        {/* Result box placeholder */}
        {reader.showResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultWord}>{reader.lookupResult?.word}</Text>
            <Text style={styles.resultReading}>{reader.lookupResult?.reading}</Text>
            <Text style={styles.resultGloss}>
              {reader.lookupResult?.gloss?.join('; ')}
            </Text>
          </View>
        )}

        {/* Sentence text */}
        <View style={[styles.sentenceBox, isLandscape && styles.sentenceBoxLandscape]}>
          {currentSentence ? (
            <Text
              style={[
                styles.sentenceText,
                { fontSize: reader.fontSize, lineHeight: reader.fontSize * reader.lineHeight },
              ]}
            >
              {currentSentence.text}
            </Text>
          ) : (
            <Text style={styles.placeholderText}>Loading...</Text>
          )}
        </View>
      </View>

      {/* Gesture hints */}
      <View style={styles.gestureHints}>
        <Text style={styles.gestureText}>
          ↑ swipe = prev | ← swipe = prev | → swipe = next | ↓ swipe = next
        </Text>
      </View>

      {/* Bottom operation bar */}
      <View
        style={[
          styles.operationBar,
          reader.handMode === 'right' && styles.operationBarRight,
          reader.handMode === 'left' && styles.operationBarLeft,
        ]}
      >
        <TouchableOpacity
          style={styles.opBtn}
          onPress={() => reader.prevSentence()}
        >
          <Text style={styles.opBtnText}>◀◀</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.opBtn, styles.ttsBtn]}
          onPress={() => reader.setIsReading(!reader.isReading)}
        >
          <Text style={styles.opBtnText}>
            {reader.isReading ? '⏸' : '🔊'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.opBtn}
          onPress={() => reader.nextSentence()}
        >
          <Text style={styles.opBtnText}>▶▶</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f6',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  topBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  topBtnText: {
    fontSize: 14,
    color: '#4a90d9',
    fontWeight: '500',
  },
  progress: {
    fontSize: 13,
    color: '#888',
  },
  // Reading area
  readingArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  resultBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'center',
    minWidth: 200,
    maxWidth: '100%',
  },
  resultWord: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  resultReading: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  resultGloss: {
    fontSize: 14,
    color: '#555',
  },
  sentenceBox: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  sentenceBoxLandscape: {
    maxWidth: '60%',
  },
  sentenceText: {
    color: '#222',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
  },
  // Gesture hints
  gestureHints: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  gestureText: {
    fontSize: 11,
    color: '#ccc',
  },
  // Operation bar
  operationBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  operationBarRight: {
    justifyContent: 'flex-end',
    paddingRight: 24,
  },
  operationBarLeft: {
    justifyContent: 'flex-start',
    paddingLeft: 24,
  },
  opBtn: {
    width: 56,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  ttsBtn: {
    backgroundColor: '#e8f0ff',
  },
  opBtnText: {
    fontSize: 20,
    color: '#555',
  },
});
