import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReaderStore } from '../../src/store/readerStore';
import { useBookStore } from '../../src/store/bookStore';
import { HandModeToggle } from '../../src/components/reader/HandModeToggle';
import { PageGestureArea } from '../../src/components/reader/PageGestureArea';
import { SentenceDisplay } from '../../src/components/reader/SentenceDisplay';
import { ResultBox } from '../../src/components/reader/ResultBox';
import { OperationBar } from '../../src/components/reader/OperationBar';
import { SentenceNav } from '../../src/components/reader/SentenceNav';
import { tokenizerService } from '../../src/services/tokenizer';
import { ttsController } from '../../src/services/tts';
import type { Token } from '../../src/types/book';
import type { LookupResult } from '../../src/types/reader';

/**
 * Reader screen — Phase 4 complete.
 *
 * TopBar → ResultBox → SentenceDisplay (gesture) → OperationBar
 * Modals: SentenceNav (纲目)
 */
export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { books, updateProgress } = useBookStore();
  const readerStore = useReaderStore();

  // State
  const [showNav, setShowNav] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [tokState, setTokState] = useState(tokenizerService.getState());
  const [ttsState, setTtsState] = useState(ttsController.getState());

  const book = books.find((b) => b.id === bookId);

  // Init reader
  useEffect(() => {
    if (book && readerStore.bookId !== book.id) {
      readerStore.openBook(book.id, []);
    }
  }, [book?.id]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (readerStore.bookId && readerStore.totalSentences > 0) {
        updateProgress(readerStore.bookId, readerStore.currentIndex, readerStore.totalSentences);
      }
    };
  }, [readerStore.currentIndex]);

  // Init tokenizer
  useEffect(() => {
    if (tokenizerService.getState() === 'unloaded') {
      tokenizerService.load().catch(console.warn);
    }
    return tokenizerService.onStateChange((s) => setTokState(s));
  }, []);

  // Init TTS
  useEffect(() => {
    ttsController.init();
    return ttsController.onStateChange((s) => setTtsState(s));
  }, []);

  const currentSentence = readerStore.sentences[readerStore.currentIndex] ?? null;

  // Tokenize sentence
  const tokenizedText = React.useMemo(() => {
    if (!currentSentence) return null;
    if (tokState !== 'ready') return currentSentence;
    if (currentSentence.tokens?.length) return currentSentence;
    const tokens = tokenizerService.tokenize(currentSentence.text);
    return { ...currentSentence, tokens };
  }, [currentSentence, tokState]);

  // ── Hand mode ──
  const cycleHandMode = useCallback(() => {
    const modes: Array<'both' | 'left' | 'right'> = ['both', 'right', 'left'];
    const idx = modes.indexOf(readerStore.handMode);
    readerStore.setHandMode(modes[(idx + 1) % 3]);
  }, [readerStore.handMode]);

  // ── Dictionary ──
  const handleWordPress = useCallback((token: Token) => {
    const result: LookupResult = {
      word: token.baseForm || token.surfaceForm,
      reading: token.reading || '',
      pos: token.pos ? [token.pos] : [],
      gloss: token.reading
        ? [`${token.pos || ''} · ${token.reading}`]
        : ['(Loading dictionary...)'],
    };
    readerStore.showLookupResult(token.surfaceForm, result);
  }, []);

  const handleDismissResult = useCallback(() => {
    readerStore.hideLookupResult();
  }, []);

  // ── TTS ──
  const handleTtsToggle = useCallback(async () => {
    const state = ttsController.getState();
    if (state === 'speaking') {
      await ttsController.stop();
      readerStore.setIsReading(false);
    } else if (state === 'paused') {
      await ttsController.resume();
      readerStore.setIsReading(true);
    } else if (currentSentence) {
      readerStore.setIsReading(true);
      await ttsController.speak(currentSentence.text, readerStore.currentIndex, async () => {
        // Auto-advance if enabled
        if (readerStore.autoAdvance && readerStore.currentIndex < readerStore.totalSentences - 1) {
          readerStore.nextSentence();
          const next = readerStore.sentences[readerStore.currentIndex];
          if (next) {
            await ttsController.speak(next.text, readerStore.currentIndex, () => {});
          }
        }
        readerStore.setIsReading(false);
      });
    }
  }, [currentSentence, readerStore.currentIndex, readerStore.autoAdvance]);

  // ── Bookmarks ──
  const toggleBookmark = useCallback(() => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(readerStore.currentIndex)) {
        next.delete(readerStore.currentIndex);
      } else {
        next.add(readerStore.currentIndex);
      }
      return next;
    });
  }, [readerStore.currentIndex]);

  // ── Outline nav ──
  const handleOutlineSelect = useCallback((index: number) => {
    readerStore.goToSentence(index);
    setShowNav(false);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>

          <View style={styles.topCenter}>
            {tokState === 'loading' && (
              <ActivityIndicator size="small" color="#ccc" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.progressText}>
              {readerStore.totalSentences > 0
                ? `${readerStore.currentIndex + 1} / ${readerStore.totalSentences}`
                : '—'}
            </Text>
            {bookmarks.has(readerStore.currentIndex) && (
              <Text style={styles.bmIndicator}> 🔖</Text>
            )}
          </View>

          <View style={styles.topRight}>
            {/* Outline nav button */}
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => setShowNav(true)}
            >
              <Text style={styles.outlineBtnText}>纲目</Text>
            </TouchableOpacity>
            {/* Hand mode toggle */}
            <HandModeToggle mode={readerStore.handMode} onToggle={cycleHandMode} />
          </View>
        </View>

        {/* ── Content ── */}
        <View style={styles.content}>
          <ResultBox
            lookup={readerStore.showResult ? (readerStore.lookupResult as LookupResult | null) : null}
            showTranslation={readerStore.showTranslation}
            onDismiss={handleDismissResult}
          />

          <PageGestureArea
            onPrevSentence={() => readerStore.prevSentence()}
            onNextSentence={() => readerStore.nextSentence()}
            isFirst={readerStore.currentIndex <= 0}
            isLast={readerStore.currentIndex >= readerStore.totalSentences - 1}
          >
            {tokenizedText ? (
              <SentenceDisplay
                sentence={tokenizedText}
                fontSize={readerStore.fontSize}
                lineHeight={readerStore.lineHeight}
                onWordPress={handleWordPress}
                isLandscape={isLandscape}
              />
            ) : (
              <View style={styles.emptySentence}>
                <Text style={styles.placeholderText}>
                  {readerStore.totalSentences === 0 ? 'No content' : 'Loading...'}
                </Text>
              </View>
            )}

            {readerStore.totalSentences > 0 && (
              <View style={styles.progressRow}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${((readerStore.currentIndex + 1) / readerStore.totalSentences) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            )}
          </PageGestureArea>
        </View>

        {/* ── Bottom operation bar ── */}
        <OperationBar
          handMode={readerStore.handMode}
          isReading={ttsState === 'speaking'}
          showTranslation={readerStore.showTranslation}
          onPrev={() => readerStore.prevSentence()}
          onNext={() => readerStore.nextSentence()}
          onTtsToggle={handleTtsToggle}
          onTranslationToggle={() => readerStore.toggleTranslation()}
        />
      </SafeAreaView>

      {/* ── Outline navigation modal ── */}
      <SentenceNav
        visible={showNav}
        sentences={readerStore.sentences}
        currentIndex={readerStore.currentIndex}
        bookmarks={bookmarks}
        onClose={() => setShowNav(false)}
        onSelect={handleOutlineSelect}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: '#faf9f6' },
  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  backBtnText: { fontSize: 20, color: '#4a90d9', fontWeight: '400' },
  topCenter: { flexDirection: 'row', alignItems: 'center' },
  progressText: { fontSize: 13, color: '#888', fontWeight: '500' },
  bmIndicator: { fontSize: 13 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  outlineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  outlineBtnText: { fontSize: 12, color: '#666', fontWeight: '500' },
  // Content
  content: { flex: 1 },
  emptySentence: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 18, color: '#999' },
  // Progress
  progressRow: { paddingHorizontal: 40, paddingBottom: 8 },
  progressBar: { height: 3, backgroundColor: '#e8e8e8', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#d0d0d0', borderRadius: 2 },
});
