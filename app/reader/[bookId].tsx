import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useReaderStore } from '../../src/store/readerStore';
import { useBookStore } from '../../src/store/bookStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { ReaderTopBar } from '../../src/components/reader/ReaderTopBar';
import { NotebookCard } from '../../src/components/reader/NotebookCard';
import { TextCard } from '../../src/components/reader/TextCard';
import { BottomZone } from '../../src/components/reader/BottomZone';
import { SentenceNav } from '../../src/components/reader/SentenceNav';
import { ReaderErrorBoundary } from '../../src/components/reader/ReaderErrorBoundary';
import { tokenizerService } from '../../src/services/tokenizer';
import { ttsController } from '../../src/services/tts';
import { translationClient } from '../../src/services/translator';
import { lookupWord, getEntryCount, lookupText } from '../../src/services/dictionary';
import {
  loadSentenceWindow,
  loadChapterImages,
  loadBookmarks,
  addBookmark,
  removeBookmark,
  getCachedTranslations,
  setCachedTranslation,
  updateProgress as persistProgress,
} from '../../src/services/bookshelf';
import { Colors } from '../../src/utils/constants';
import type { Token } from '../../src/types/book';

const STATUSBAR_H = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { books, updateProgress } = useBookStore();
  const reader = useReaderStore();
  const { translationApiKey, manualOrientation } = useSettingsStore();

  const [showNav, setShowNav] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [tokState, setTokState] = useState(tokenizerService.getState());
  const [ttsState, setTtsState] = useState(ttsController.getState());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dictEntries, setDictEntries] = useState(() => getEntryCount());

  const translationLockRef = useRef(false);
  const translateTargetRef = useRef<{ text: string; index: number } | null>(null);
  const [translateTrigger, setTranslateTrigger] = useState(0);

  const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  // ── Orientation ──
  const isLandscape = useMemo(() => {
    if (manualOrientation === 'landscape') return true;
    if (manualOrientation === 'portrait') return false;
    return width > height;
  }, [manualOrientation, width, height]);

  // ── Open book (always reload to pick up cached translations) ──
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    try {
      const images = loadChapterImages(book.id);
      const initialWindow = loadSentenceWindow(book.id, book.currentSentence);
      const bm = loadBookmarks(book.id);
      if (cancelled) return;

      // Pre-load translation cache for the initial window
      let translationCache: Map<number, string> | undefined;
      if (initialWindow.length > 0) {
        const fromIdx = initialWindow[0].index;
        const toIdx = initialWindow[initialWindow.length - 1].index;
        translationCache = getCachedTranslations(book.id, fromIdx, toIdx);
      }

      reader.openBook(book.id, initialWindow, book.totalSentences, images, translationCache);
      setBookmarks(bm);
      if (book.currentSentence > 0 && book.currentSentence < book.totalSentences) {
        reader.goToSentence(book.currentSentence);
      }
      setLoading(false);
    } catch (err: any) {
      if (cancelled) return;
      console.warn('[Reader] DB load failed:', err);
      setLoadError(err.message || '加载失败');
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [book?.id]);

  // Clean up reader state on unmount
  useEffect(() => {
    return () => { reader.closeBook(); };
  }, []);

  // ── Window reload ──
  useEffect(() => {
    const idx = reader.currentIndex;
    const base = reader.windowBase;
    const radius = 50;
    if (!reader.bookId) return;
    if (idx < base || idx >= base + reader.sentences.length) {
      try {
        const newWindow = loadSentenceWindow(reader.bookId, idx);
        if (newWindow.length > 0) {
          // Pre-load translations for the new window range
          const fromIdx = newWindow[0].index;
          const toIdx = newWindow[newWindow.length - 1].index;
          const translationCache = getCachedTranslations(reader.bookId, fromIdx, toIdx);
          reader.appendWindow(newWindow, Math.max(0, idx - radius), translationCache);
        }
      } catch (err) {
        console.warn('[Reader] window reload failed:', err);
      }
    }
  }, [reader.currentIndex, reader.bookId]);

  // ── Save progress ──
  useEffect(() => {
    const id = reader.bookId;
    const total = reader.totalSentences;
    if (!id || total <= 0) return;
    updateProgress(id, reader.currentIndex, total);
    persistProgress(id, reader.currentIndex, total);
  }, [reader.currentIndex, reader.bookId, reader.totalSentences]);

  // ── Screen orientation lock ──
  useEffect(() => {
    // Lock to stored orientation on mount; unlock on unmount
    const orient = useSettingsStore.getState().manualOrientation;
    if (orient === 'landscape') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    }
    return () => {
      // Unlock when leaving reader so home screen can rotate freely
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  // ── Init ──
  useEffect(() => {
    if (tokenizerService.getState() === 'unloaded') tokenizerService.load().catch(console.warn);
    const unsub = tokenizerService.onStateChange((s) => setTokState(s));
    return unsub;
  }, []);
  useEffect(() => {
    ttsController.init();
    const unsub = ttsController.onStateChange((s) => setTtsState(s));
    return unsub;
  }, []);

  // ── Current sentence ──
  const currentSentence = useMemo(() => {
    if (!reader.bookId || reader.sentences.length === 0) return null;
    return reader.sentences.find((s) => s.index === reader.currentIndex) ?? null;
  }, [reader.sentences, reader.currentIndex, reader.bookId]);

  const currentChapterIndex = currentSentence?.chapterIndex ?? 0;
  const hasChapterImage = (reader.chapterImages[currentChapterIndex] || []).length > 0;

  const chapterName = useMemo(() => {
    if (!book) return '';
    const ch = currentChapterIndex;
    return `Ch.${ch + 1}`;
  }, [book, currentChapterIndex]);

  const tokenizedText = useMemo(() => {
    if (!currentSentence) return null;
    if (currentSentence.tokens && currentSentence.tokens.length > 0) return currentSentence;
    try {
      const tokens = tokenizerService.tokenize(currentSentence.text);
      return { ...currentSentence, tokens };
    } catch { return currentSentence; }
  }, [currentSentence, tokState]);

  // ── Translation (latch mode) ──
  useEffect(() => {
    if (!reader.showTranslation || !translationApiKey || translateTrigger === 0) return;
    const target = translateTargetRef.current;
    if (!target || !reader.bookId) return;

    // Check the in-memory translation cache first (populated on open/window-reload)
    const memCached = reader.translationCache.get(target.index);
    if (memCached) { reader.setTranslation(memCached, false); return; }

    let cancelled = false;
    let retries = 0;

    const attempt = async () => {
      reader.setTranslation(null, true);
      translationLockRef.current = true;
      try {
        const result = await translationClient.translate({ text: target.text, apiKey: translationApiKey });
        if (cancelled) return;
        // Persist to DB and update in-memory cache
        setCachedTranslation(reader.bookId!, target.index, result.translated);
        const entry = new Map([[target.index, result.translated]]);
        reader.mergeTranslationCache(entry);
        reader.setTranslation(result.translated, false);
      } catch (err: any) {
        if (cancelled) return;
        if (retries < 2) { retries++; setTimeout(() => { if (!cancelled) attempt(); }, 1000); }
        else reader.setTranslation(err?.message || '翻译服务不可用', false);
      } finally {
        if (!cancelled) translationLockRef.current = false;
      }
    };
    attempt();
    return () => { cancelled = true; };
  }, [translateTrigger]);

  useEffect(() => {
    if (!reader.showTranslation) reader.setTranslation(null, false);
  }, [reader.showTranslation]);

  // ── Handlers ──

  const cycleHandMode = useCallback(() => {
    const modes: Array<'both' | 'left' | 'right'> = ['both', 'right', 'left'];
    const idx = modes.indexOf(reader.handMode);
    reader.setHandMode(modes[(idx + 1) % 3]);
  }, [reader.handMode]);

  const handleWordPress = useCallback((token: Token) => {
    const word = token.surfaceForm;

    // Phase 1: Try exact match first — the user tapped THIS word
    let entry = lookupWord(word);
    if (!entry && token.reading) entry = lookupWord(token.reading);

    if (entry) {
      reader.showLookupResult(word, {
        word: entry.word, reading: entry.reading,
        pos: entry.pos, gloss: entry.gloss,
      });
      return;
    }

    // Phase 2: Exact match failed — use longest-match decomposition
    const entries = lookupText(word);

    if (entries.length > 0) {
      reader.showLookupResult(
        word,
        {
          word: entries[0].word,
          reading: entries[0].reading,
          pos: entries[0].pos,
          gloss: entries[0].gloss,
        },
        entries.map(e => ({
          word: e.word, reading: e.reading,
          pos: e.pos, gloss: e.gloss,
        })),
      );
    } else {
      const cnt = getEntryCount();
      setDictEntries(cnt);
      reader.showLookupResult(word, {
        word, reading: token.reading || '',
        pos: token.pos ? [token.pos] : [],
        gloss: [cnt > 0 ? `(词库未收录「${word}」，已收录 ${cnt} 词)` : '(词库初始化中)'],
      });
    }
  }, []);

  const handleDismissCard = useCallback(() => {
    reader.hideLookupResult();
    if (reader.showTranslation) reader.toggleTranslation();
  }, []);

  // Dismiss gesture: only fires on a quick tap (<400ms, <8px movement).
  // Scrolling (finger moves >8px) or long-pressing (>400ms) won't dismiss.
  const dismissTapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDuration(400)
      .maxDistance(8)
      .onEnd(() => {
        runOnJS(handleDismissCard)();
      }),
    [handleDismissCard],
  );

  const handleRangeSelect = useCallback((selectedTokens: Token[]) => {
    if (selectedTokens.length === 0) return;
    const combinedText = selectedTokens.map(t => t.surfaceForm).join('');

    // Use longest-match recursive lookup for multi-word text
    const entries = lookupText(combinedText);

    if (entries.length > 0) {
      reader.showLookupResult(
        combinedText,
        {
          word: entries[0].word,
          reading: entries[0].reading,
          pos: entries[0].pos,
          gloss: entries[0].gloss,
        },
        entries.map(e => ({
          word: e.word, reading: e.reading,
          pos: e.pos, gloss: e.gloss,
        })),
      );
    } else {
      const combinedReading = selectedTokens.map(t => t.reading || '').filter(Boolean).join('');
      const combinedPos = [...new Set(selectedTokens.map(t => t.pos).filter(Boolean))];
      reader.showLookupResult(combinedText, {
        word: combinedText, reading: combinedReading, pos: combinedPos,
        gloss: ['(词库中未找到匹配)'],
      });
    }
  }, []);

  const handleTtsToggle = useCallback(async () => {
    const state = ttsController.getState();
    if (state === 'speaking') { await ttsController.stop(); reader.setIsReading(false); }
    else if (state === 'paused') { await ttsController.resume(); reader.setIsReading(true); }
    else if (currentSentence) {
      reader.setIsReading(true);
      try {
        await ttsController.speak(currentSentence.text, reader.currentIndex, () => reader.setIsReading(false));
      } catch { reader.setIsReading(false); }
    }
  }, [currentSentence, reader.currentIndex]);

  const handleOutlineSelect = useCallback((index: number) => {
    try {
      const safeIndex = Math.max(0, Math.min(index, reader.totalSentences - 1));
      if (!reader.bookId) return;
      const newWindow = loadSentenceWindow(reader.bookId, safeIndex);
      if (newWindow.length > 0) {
        reader.appendWindow(newWindow, Math.max(0, safeIndex - 50));
        setTimeout(() => reader.goToSentence(safeIndex), 0);
      }
      setShowNav(false);
    } catch (err: any) { console.warn('[Outline] Select failed:', err?.message); }
  }, [reader.bookId, reader.totalSentences]);

  const handlePrev = useCallback(() => {
    if (!translationLockRef.current) reader.prevSentence();
  }, []);
  const handleNext = useCallback(() => {
    if (!translationLockRef.current) reader.nextSentence();
  }, []);

  const toggleBookmark = useCallback(() => {
    const idx = reader.currentIndex;
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); if (reader.bookId) removeBookmark(reader.bookId, idx); }
      else { next.add(idx); if (reader.bookId) addBookmark(reader.bookId, idx); }
      return next;
    });
  }, [reader.currentIndex, reader.bookId]);

  const progressPercent = reader.totalSentences > 0
    ? Math.round(((reader.currentIndex + 1) / reader.totalSentences) * 100)
    : 0;

  // Is anything shown in the notebook card?
  const showNotebook = reader.showResult || reader.showTranslation;

  const isSingle = reader.handMode === 'left' || reader.handMode === 'right';
  const isRight = reader.handMode === 'right';

  // ── Render ──
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.frostBg} />

      {/* ═══ Zone 1: Top bar (fixed) ═══ */}
      <View style={{ paddingTop: STATUSBAR_H, backgroundColor: Colors.frostBg }}>
        <ReaderTopBar
          chapterName={chapterName}
          handMode={reader.handMode}
          progressPercent={progressPercent}
          isLandscape={isLandscape}
          onBack={() => router.back()}
          onOutline={() => setShowNav(true)}
          onToggleBookmark={toggleBookmark}
          onToggleHandMode={cycleHandMode}
          onToggleOrientation={async () => {
            const next = isLandscape ? 'portrait' : 'landscape';
            useSettingsStore.getState().setManualOrientation(next);
            if (next === 'landscape') {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            } else {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
            }
          }}
        />
      </View>

      {/* ═══ Zone 2: Translation/dict card (only in non-landscape-single mode;
           in landscape single-hand it's rendered inside the scrollable right area) ═══ */}
      {showNotebook && !(isLandscape && isSingle) && (
        <GestureDetector gesture={dismissTapGesture}>
          <View style={styles.dismissArea}>
            <NotebookCard
              dictResult={reader.showResult ? reader.lookupResult : null}
              dictResults={reader.lookupResults}
              queryWord={reader.selectedWord}
              translation={reader.showTranslation ? reader.currentTranslation : null}
              translationLoading={reader.translationLoading}
              onDismiss={handleDismissCard}
            />
          </View>
        </GestureDetector>
      )}

      {/* ═══ Zones 3+4: landscape single-hand → row layout; otherwise → column ═══ */}
      {isLandscape && isSingle ? (
        <View style={styles.landscapeRow}>
          {/* Sidebar on the hand side (fixed width, full height) */}
          {!isRight && (
            <BottomZone
              handMode={reader.handMode}
              isReading={ttsState === 'speaking'}
              showTranslation={reader.showTranslation}
              isFirst={reader.currentIndex <= 0}
              isLast={reader.currentIndex >= reader.totalSentences - 1}
              isLandscape={true}
              onPrev={handlePrev}
              onNext={handleNext}
              onTtsToggle={handleTtsToggle}
              onTranslationToggle={() => {
                if (!reader.showTranslation && currentSentence) {
                  translateTargetRef.current = { text: currentSentence.text, index: currentSentence.index };
                  setTranslateTrigger(n => n + 1);
                }
                reader.toggleTranslation();
              }}
            />
          )}

          {/* Right area: scrollable, contains translation + text stacked vertically */}
          <ScrollView
            style={styles.landscapeScrollArea}
            contentContainerStyle={styles.landscapeScrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Translation/dict card — inside scroll area */}
            {showNotebook && (
              <GestureDetector gesture={dismissTapGesture}>
                <View>
                  <NotebookCard
                    dictResult={reader.showResult ? reader.lookupResult : null}
                    dictResults={reader.lookupResults}
                    queryWord={reader.selectedWord}
                    translation={reader.showTranslation ? reader.currentTranslation : null}
                    translationLoading={reader.translationLoading}
                    onDismiss={handleDismissCard}
                  />
                </View>
              </GestureDetector>
            )}

            {/* Text card */}
            <ReaderErrorBoundary zone="text">
              {loading ? (
                <View style={[styles.centerMessage, { minHeight: height * 0.5 }]}>
                  <ActivityIndicator size="large" color={Colors.accent} />
                  <Text style={styles.centerMessageText}>加载中...</Text>
                </View>
              ) : loadError ? (
                <View style={[styles.centerMessage, { minHeight: height * 0.5 }]}>
                  <Text style={styles.errorIcon}>!</Text>
                  <Text style={styles.errorText}>{loadError}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
                    <Text style={styles.retryText}>返回</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.landscapeTextWrap}>
                  <TextCard
                    sentence={tokenizedText}
                    fontSize={reader.fontSize}
                    lineHeight={reader.lineHeight}
                    isLandscape={isLandscape}
                    handMode={reader.handMode}
                    hasImage={hasChapterImage}
                    chapterImages={reader.chapterImages[currentChapterIndex] || []}
                    onWordPress={handleWordPress}
                    onRangeSelect={handleRangeSelect}
                  />
                </View>
              )}
            </ReaderErrorBoundary>
          </ScrollView>

          {/* Sidebar on the hand side (fixed width, full height) */}
          {isRight && (
            <BottomZone
              handMode={reader.handMode}
              isReading={ttsState === 'speaking'}
              showTranslation={reader.showTranslation}
              isFirst={reader.currentIndex <= 0}
              isLast={reader.currentIndex >= reader.totalSentences - 1}
              isLandscape={true}
              onPrev={handlePrev}
              onNext={handleNext}
              onTtsToggle={handleTtsToggle}
              onTranslationToggle={() => {
                if (!reader.showTranslation && currentSentence) {
                  translateTargetRef.current = { text: currentSentence.text, index: currentSentence.index };
                  setTranslateTrigger(n => n + 1);
                }
                reader.toggleTranslation();
              }}
            />
          )}
        </View>
      ) : (
        <>
          {/* ═══ Zone 3: Text area (column, portrait or landscape both-hands) ═══ */}
          <ReaderErrorBoundary zone="text">
            {loading && (
              <View style={styles.centerMessage}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.centerMessageText}>加载中...</Text>
              </View>
            )}
            {loadError && !loading && (
              <View style={styles.centerMessage}>
                <Text style={styles.errorIcon}>!</Text>
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
                  <Text style={styles.retryText}>返回</Text>
                </TouchableOpacity>
              </View>
            )}
            {!loading && !loadError && (
              <ScrollView
                style={styles.textZone}
                contentContainerStyle={styles.textZoneContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                <TextCard
                  sentence={tokenizedText}
                  fontSize={reader.fontSize}
                  lineHeight={reader.lineHeight}
                  isLandscape={isLandscape}
                  handMode={reader.handMode}
                  hasImage={hasChapterImage}
                  chapterImages={reader.chapterImages[currentChapterIndex] || []}
                  onWordPress={handleWordPress}
                  onRangeSelect={handleRangeSelect}
                />
              </ScrollView>
            )}
          </ReaderErrorBoundary>

          {/* ═══ Zone 4: Bottom bar (column mode) ═══ */}
          <BottomZone
            handMode={reader.handMode}
            isReading={ttsState === 'speaking'}
            showTranslation={reader.showTranslation}
            isFirst={reader.currentIndex <= 0}
            isLast={reader.currentIndex >= reader.totalSentences - 1}
            isLandscape={isLandscape}
            onPrev={handlePrev}
            onNext={handleNext}
            onTtsToggle={handleTtsToggle}
            onTranslationToggle={() => {
              if (!reader.showTranslation && currentSentence) {
                translateTargetRef.current = { text: currentSentence.text, index: currentSentence.index };
                setTranslateTrigger(n => n + 1);
              }
              reader.toggleTranslation();
            }}
          />
        </>
      )}

      {/* Outline nav (accessible via tap on progress bar in top bar) */}
      <SentenceNav
        visible={showNav}
        bookId={reader.bookId}
        currentIndex={reader.currentIndex}
        bookmarks={bookmarks}
        onClose={() => setShowNav(false)}
        onSelect={handleOutlineSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  dismissArea: {
    // Zone 2: tap anywhere here (outside the card) to dismiss
  },
  textZone: {
    flex: 1,
  },
  textZoneContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeScrollArea: {
    flex: 1,
  },
  landscapeScrollContent: {
    flexGrow: 1,
  },
  landscapeTextWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 200,
  },
  centerMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  centerMessageText: {
    fontSize: 15,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  errorIcon: {
    fontSize: 40,
    color: Colors.textTertiary,
    marginBottom: 4,
    fontWeight: '300',
  },
  errorText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
});
