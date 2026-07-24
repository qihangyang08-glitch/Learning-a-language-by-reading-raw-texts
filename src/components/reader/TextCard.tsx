import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
} from 'react-native-reanimated';
import type { Sentence, Token } from '../../types/book';
import type { RomajiResult } from '../../services/romaji';
import type { RomajiDisplayState } from '../../store/readerStore';
import type { RomajiLayoutMode } from '../../types/reader';
import type { HandMode } from '../../utils/constants';
import { InlineImage } from './InlineImage';
import { Colors } from '../../utils/constants';
import { lookupLongestTextMatchAt } from '../../services/dictionary';
import {
  createTextRangeToken,
  findTokenIndexAtChar,
  getTokenEnd,
  getTokensOverlappingRange,
} from '../../services/tokenizer';

interface TextCardProps {
  sentence: Sentence | null;
  fontSize: number;
  lineHeight: number;
  isLandscape: boolean;
  handMode: HandMode;
  hasImage: boolean;
  chapterImages: any[];
  romaji?: RomajiResult | null;
  romajiState?: RomajiDisplayState;
  romajiError?: string | null;
  romajiLayoutMode?: RomajiLayoutMode;
  onWordPress: (token: Token) => void;
  onRangeSelect?: (tokens: Token[]) => void;
}

/**
 * Zone 3: Central text card with word selection support.
 *
 * Gesture design:
 *   - Single tap on a token → dictionary lookup (onPress, no gesture involved)
 *   - Horizontal drag over tokens → range selection (Pan, activated via onStart)
 *   - Long press (≥400ms) → enter selection mode, then drag to extend
 *
 * The GestureDetector wraps ONLY the textCard (white card), not the outer
 * container. This means the blank area outside the card is free for scroll
 * gestures and won't trigger word selection.
 *
 * Hit-testing uses onLayout-measured token positions for accuracy.
 */
const TextCardInner = React.memo(function TextCard({
  sentence,
  fontSize,
  lineHeight,
  isLandscape,
  handMode,
  hasImage,
  chapterImages,
  romaji,
  romajiState = 'hidden',
  romajiError,
  romajiLayoutMode = 'phrase',
  onWordPress,
  onRangeSelect,
}: TextCardProps) {
  // ═══════════════════════════════════════════
  // ALL HOOKS — must be called unconditionally
  // ═══════════════════════════════════════════

  const [anchorCharIndex, setAnchorCharIndex] = useState<number | null>(null);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [tappedRange, setTappedRange] = useState<{ start: number; end: number } | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const anchorCharIndexRef = useRef<number | null>(null);
  const activeCharIndexRef = useRef<number | null>(null);
  const textRef = useRef<any>(null);

  // Derived data
  const tokens: Token[] = useMemo(() => {
    if (!sentence) return [];
    return sentence.tokens && sentence.tokens.length > 0 ? sentence.tokens : [];
  }, [sentence]);

  const sentenceText = sentence?.text ?? '';
  const hasTokens = tokens.length > 0;
  const hasText = sentenceText.length > 0;
  const showRomaji = romajiState === 'current' || romajiState === 'loading' || romajiState === 'error';
  const romajiItems = useMemo(
    () => romaji?.items?.filter((item) => item.text.trim() && item.romaji.trim()) ?? [],
    [romaji],
  );
  const phraseRomaji = useMemo(() => {
    const plain = romaji?.romaji?.trim();
    if (plain) return plain;
    return romajiItems.map((item) => item.romaji).join(' ').trim();
  }, [romaji?.romaji, romajiItems]);

  const selectedRange = useMemo((): [number, number] | null => {
    if (anchorCharIndex === null || activeCharIndex === null) return null;
    if (!isSelecting && anchorCharIndex === activeCharIndex) return null;
    const start = Math.min(anchorCharIndex, activeCharIndex);
    const end = Math.max(anchorCharIndex, activeCharIndex) + 1;
    if (start >= end && !isSelecting) return null;
    return [start, end];
  }, [anchorCharIndex, activeCharIndex, isSelecting]);

  const selectedSet = useMemo(() => {
    if (!selectedRange) return new Set<number>();
    const s = new Set<number>();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].wordPosition < selectedRange[1] && getTokenEnd(tokens[i]) > selectedRange[0]) {
        s.add(i);
      }
    }
    return s;
  }, [selectedRange, tokens]);

  const tappedSet = useMemo(() => {
    if (!tappedRange) return new Set<number>();
    const s = new Set<number>();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].wordPosition < tappedRange.end && getTokenEnd(tokens[i]) > tappedRange.start) {
        s.add(i);
      }
    }
    return s;
  }, [tappedRange, tokens]);

  type TextLine = {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    start: number;
    end: number;
  };

  const textLeftRef = useRef(0);
  const textTopRef = useRef(0);
  const textWidthRef = useRef(0);
  const lineLayoutRef = useRef<TextLine[]>([]);

  const measureText = useCallback(() => {
    textRef.current?.measureInWindow?.((x: number, y: number, width: number) => {
      textLeftRef.current = x;
      textTopRef.current = y;
      textWidthRef.current = width;
    });
  }, []);

  const onCardLayout = useCallback((_e: LayoutChangeEvent) => {
    measureText();
  }, [measureText]);

  const onTextBoxLayout = useCallback((e: LayoutChangeEvent) => {
    textWidthRef.current = e.nativeEvent.layout.width;
    measureText();
  }, [measureText]);

  const getEstimatedCharWidth = useCallback((char: string): number => {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) return fontSize * 0.55;
    if (code >= 0xff61 && code <= 0xff9f) return fontSize * 0.55;
    return fontSize;
  }, [fontSize]);

  const getEstimatedTextWidth = useCallback((textValue: string): number => {
    let width = 0;
    for (const char of textValue) width += getEstimatedCharWidth(char);
    return width;
  }, [getEstimatedCharWidth]);

  const onTextLayoutHandler = useCallback((e: any) => {
    const lines: Array<{ x?: number; y: number; width?: number; height?: number; text: string }> =
      e.nativeEvent?.lines ?? [];
    if (lines.length === 0 || sentenceText.length === 0) {
      lineLayoutRef.current = [];
      return;
    }

    const layouts: TextLine[] = [];
    let searchFrom = 0;

    for (const line of lines) {
      const lineText = line.text ?? '';
      if (!lineText) continue;

      const foundAt = sentenceText.indexOf(lineText, searchFrom);
      const start = foundAt >= 0 ? foundAt : searchFrom;
      const end = Math.min(sentenceText.length, start + lineText.length);
      const estimatedWidth = getEstimatedTextWidth(lineText);
      const actualWidth = line.width ?? estimatedWidth;
      const fallbackX = Math.max(0, (textWidthRef.current - actualWidth) / 2);

      layouts.push({
        x: line.x ?? fallbackX,
        y: line.y,
        width: actualWidth || estimatedWidth,
        height: line.height || fontSize * lineHeight,
        text: sentenceText.slice(start, end),
        start,
        end,
      });

      searchFrom = end;
    }

    lineLayoutRef.current = layouts;
  }, [fontSize, getEstimatedTextWidth, lineHeight, sentenceText]);

  const findLineAtY = useCallback((absoluteY: number, strict: boolean): TextLine | null => {
    const relY = absoluteY - textTopRef.current;
    const lines = lineLayoutRef.current;
    if (lines.length === 0) return null;

    let best: TextLine | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const line of lines) {
      const tolerance = strict ? Math.max(3, line.height * 0.12) : Math.max(6, line.height * 0.25);
      if (relY < line.y - tolerance || relY > line.y + line.height + tolerance) continue;
      const center = line.y + line.height / 2;
      const distance = Math.abs(relY - center);
      if (distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    }

    return best;
  }, []);

  const getCharIndexAt = useCallback((absoluteX: number, absoluteY: number, strictY: boolean): number | null => {
    if (!hasText) return null;

    const line = findLineAtY(absoluteY, strictY);
    if (!line || line.start >= line.end) return null;

    const relX = absoluteX - textLeftRef.current;
    const lineWidth = line.width || getEstimatedTextWidth(line.text);
    const lineX = line.x ?? Math.max(0, (textWidthRef.current - lineWidth) / 2);
    const targetX = Math.max(0, Math.min(relX - lineX, lineWidth));
    const estimatedWidth = getEstimatedTextWidth(line.text);
    const scale = estimatedWidth > 0 ? lineWidth / estimatedWidth : 1;

    let localOffset = 0;
    let cursorX = 0;
    for (const char of line.text) {
      const charWidth = getEstimatedCharWidth(char) * scale;
      if (targetX <= cursorX + charWidth / 2) {
        return line.start + localOffset;
      }
      cursorX += charWidth;
      localOffset += char.length;
    }

    return Math.max(line.start, line.end - 1);
  }, [findLineAtY, getEstimatedCharWidth, getEstimatedTextWidth, hasText]);

  const createTokenForRange = useCallback((start: number, end: number, entryToken?: Partial<Token>) => {
    const sourceTokens = getTokensOverlappingRange(tokens, start, end);
    return {
      ...createTextRangeToken(sentenceText, start, end, sourceTokens),
      ...entryToken,
      wordPosition: start,
    };
  }, [sentenceText, tokens]);

  // ── Single tap handler ──
  const handleTapAt = useCallback((absX: number, absY: number) => {
    if (isSelecting || !sentence) return;
    const charIndex = getCharIndexAt(absX, absY, false);
    if (charIndex === null) return;

    const dictionaryMatch = lookupLongestTextMatchAt(sentence.text, charIndex);
    if (dictionaryMatch) {
      const token = createTokenForRange(dictionaryMatch.start, dictionaryMatch.end, {
        reading: dictionaryMatch.entry.reading,
        baseForm: dictionaryMatch.entry.word,
        pos: dictionaryMatch.entry.pos.join(','),
      });
      setTappedRange({ start: dictionaryMatch.start, end: dictionaryMatch.end });
      setAnchorCharIndex(null);
      setActiveCharIndex(null);
      setIsSelecting(false);
      onWordPress(token);
      setTimeout(() => setTappedRange(null), 500);
      return;
    }

    const tokenIndex = findTokenIndexAtChar(tokens, charIndex);
    const fallbackToken = tokenIndex === null
      ? createTokenForRange(charIndex, charIndex + 1)
      : tokens[tokenIndex];
    const fallbackEnd = tokenIndex === null ? charIndex + 1 : getTokenEnd(fallbackToken);

    setTappedRange({ start: fallbackToken.wordPosition, end: fallbackEnd });
    setAnchorCharIndex(null);
    setActiveCharIndex(null);
    setIsSelecting(false);
    onWordPress(fallbackToken);
    setTimeout(() => setTappedRange(null), 500);
  }, [createTokenForRange, getCharIndexAt, isSelecting, onWordPress, sentence, tokens]);

  // ── Selection callbacks (JS-only, called via runOnJS from worklets) ──

  const beginSelectionAt = useCallback((charIndex: number | null) => {
    if (charIndex === null) return;
    // Guard against double-init from simultaneous Pan + LongPress
    if (anchorCharIndexRef.current !== null) return;
    anchorCharIndexRef.current = charIndex;
    activeCharIndexRef.current = charIndex;
    setIsSelecting(true);
    setAnchorCharIndex(charIndex);
    setActiveCharIndex(charIndex);
  }, []);

  // Entire JS-path wrapper for Pan's onStart
  const handlePanStart = useCallback(() => {
    if (anchorCharIndexRef.current !== null) return;
    const charIndex = getCharIndexAt(touchStartX.current, touchStartY.current, true);
    beginSelectionAt(charIndex);
  }, [getCharIndexAt, beginSelectionAt]);

  // Entire JS-path wrapper for LongPress's onStart
  const handleLongPressStart = useCallback((absX: number, absY: number) => {
    if (anchorCharIndexRef.current !== null) return;
    const charIndex = getCharIndexAt(absX, absY, true);
    beginSelectionAt(charIndex);
  }, [getCharIndexAt, beginSelectionAt]);

  const updateSelectionTo = useCallback((absX: number, absY: number) => {
    const charIndex = getCharIndexAt(absX, absY, true);
    if (charIndex !== null) {
      activeCharIndexRef.current = charIndex;
      setActiveCharIndex(charIndex);
    }
  }, [getCharIndexAt]);

  const endSelection = useCallback(() => {
    const anchor = anchorCharIndexRef.current;
    const active = activeCharIndexRef.current;
    if (anchor !== null && active !== null && anchor !== active && onRangeSelect) {
      const start = Math.min(anchor, active);
      const end = Math.max(anchor, active) + 1;
      const selectedTokens = [createTokenForRange(start, end)];
      if (selectedTokens.length > 0) onRangeSelect(selectedTokens);
    }
    setTimeout(() => {
      anchorCharIndexRef.current = null;
      activeCharIndexRef.current = null;
      setAnchorCharIndex(null);
      setActiveCharIndex(null);
      setIsSelecting(false);
    }, 600);
  }, [createTokenForRange, onRangeSelect]);

  // ── Gesture: Simultaneous Pan + LongPress for range selection ──
  //
  // ALL JS function calls inside gesture callbacks go through runOnJS
  // to avoid "Tried to synchronously call a Remote Function" crash.
  //
  // Pan handles: quick swipe to select (activates on ~4px horizontal movement).
  // LongPress handles: hold 400ms → enter selection mode at that position.
  // failOffsetY ensures vertical swipes fail the Pan (ScrollView takes over).
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .enabled(hasText && !!onRangeSelect)
      .onTouchesDown((e) => {
        const first = e.changedTouches?.[0];
        if (first) {
          touchStartX.current = first.absoluteX;
          touchStartY.current = first.absoluteY;
        }
      })
      .onStart(() => {
        runOnJS(handlePanStart)();
      })
      .onUpdate((e) => {
        runOnJS(updateSelectionTo)(e.absoluteX, e.absoluteY);
      })
      .onEnd(() => {
        runOnJS(endSelection)();
      })
      .activeOffsetX([-4, 4])
      .failOffsetY([-18, 18])
      .minPointers(1)
      .maxPointers(1),
    [hasText, onRangeSelect, handlePanStart, updateSelectionTo, endSelection],
  );

  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .enabled(hasText)
      .maxDuration(280)
      .maxDistance(10)
      .onEnd((e) => {
        runOnJS(handleTapAt)(e.absoluteX, e.absoluteY);
      }),
    [hasText, handleTapAt],
  );

  // Long press enters selection mode; the Pan gesture's onUpdate handles tracking.
  const longPressGesture = useMemo(() =>
    Gesture.LongPress()
      .enabled(hasText && !!onRangeSelect)
      .minDuration(400)
      .onStart((e) => {
        runOnJS(handleLongPressStart)(e.absoluteX, e.absoluteY);
      }),
    [hasText, onRangeSelect, handleLongPressStart],
  );

  // Compose: Tap looks up a word; Pan and LongPress handle range selection.
  const composedGesture = useMemo(() =>
    Gesture.Simultaneous(tapGesture, panGesture, longPressGesture),
    [tapGesture, panGesture, longPressGesture],
  );

  const lineH = fontSize * lineHeight;

  // ═══════════════════════════════════════════
  // RENDER — conditional returns AFTER all hooks
  // ═══════════════════════════════════════════

  // Image-only chapter
  if (hasImage && chapterImages.length > 0) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.imageContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
      >
        {chapterImages.slice(0, 3).map((img: any, idx: number) => (
          <InlineImage key={`img-${idx}`} image={img} />
        ))}
      </ScrollView>
    );
  }

  // No sentence
  if (!sentence) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>无内容</Text>
      </View>
    );
  }

  // Normal text display
  // Layout: textOuter (flex container) → GestureDetector → textCard (white card)
  // The GestureDetector ONLY wraps the card, so blank space around it is
  // free for scroll gestures.
  return (
    <View style={[
      styles.textOuter,
      handMode === 'right' && styles.textShiftRight,
      handMode === 'left' && styles.textShiftLeft,
    ]}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={styles.textCard}
          onLayout={onCardLayout}
        >
          {showRomaji && romajiState === 'loading' && (
            <Text style={styles.romajiHint}>罗马音生成中...</Text>
          )}
          {showRomaji && romajiState === 'error' && (
            <Text style={[styles.romajiHint, styles.romajiErrorText]}>
              {romajiError || '罗马音暂不可用'}
            </Text>
          )}
          {showRomaji && romajiState === 'current' && romajiLayoutMode === 'phrase' && phraseRomaji ? (
            <View style={styles.romajiPhraseBlock}>
              <Text style={[styles.romajiPhraseLine, { fontSize: Math.max(12, fontSize * 0.58) }]}>
                {phraseRomaji}
              </Text>
              <Text
                ref={textRef}
                style={[hasTokens ? styles.tokenizedText : styles.plainText, { fontSize, lineHeight: lineH }]}
                onLayout={onTextBoxLayout}
                onTextLayout={onTextLayoutHandler}
              >
                {sentence.text}
              </Text>
            </View>
          ) : showRomaji && romajiState === 'current' && romajiLayoutMode === 'token' && romajiItems.length ? (
            <View style={styles.romajiTokenGrid} pointerEvents="none">
              {romajiItems.map((item, index) => (
                <View key={`${item.text}-${index}`} style={styles.romajiTokenItem}>
                  <Text style={styles.romajiTokenReading}>{item.romaji}</Text>
                  <Text style={styles.romajiTokenSurface}>{item.text}</Text>
                </View>
              ))}
            </View>
          ) : !hasTokens ? (
            <Text
              ref={textRef}
              style={[styles.plainText, { fontSize, lineHeight: lineH }]}
              onLayout={onTextBoxLayout}
              onTextLayout={onTextLayoutHandler}
            >
              {sentence.text}
            </Text>
          ) : (
            <Text
              ref={textRef}
              style={[styles.tokenizedText, { fontSize, lineHeight: lineH }]}
              onLayout={onTextBoxLayout}
              onTextLayout={onTextLayoutHandler}
            >
              {tokens.map((token, i) => {
                const isSel = selectedSet.has(i);
                const isAnchor =
                  anchorCharIndex !== null &&
                  anchorCharIndex >= token.wordPosition &&
                  anchorCharIndex < getTokenEnd(token);
                const isTapped = tappedSet.has(i);
                return (
                  <Text
                    key={`${token.wordPosition}-${i}`}
                    style={[
                      styles.token,
                      isSel && styles.highlighted,
                      isAnchor && isSel && styles.anchorHighlight,
                      isTapped && !isSel && styles.tapHighlight,
                    ]}
                    suppressHighlighting
                  >
                    {token.surfaceForm}
                  </Text>
                );
              })}
            </Text>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Selection hint: shows when user is actively selecting */}
      {isSelecting && selectedRange && (
        <View style={styles.selectionHint} pointerEvents="none">
          <Text style={styles.selectionHintText}>
            {selectedRange[1] - selectedRange[0]} 字
          </Text>
        </View>
      )}
    </View>
  );
}, arePropsEqual);

function arePropsEqual(prev: TextCardProps, next: TextCardProps): boolean {
  if (prev.fontSize !== next.fontSize) return false;
  if (prev.lineHeight !== next.lineHeight) return false;
  if (prev.isLandscape !== next.isLandscape) return false;
  if (prev.handMode !== next.handMode) return false;
  if (prev.hasImage !== next.hasImage) return false;
  if (prev.romajiState !== next.romajiState) return false;
  if (prev.romajiError !== next.romajiError) return false;
  if (prev.romaji !== next.romaji) return false;
  if (prev.romajiLayoutMode !== next.romajiLayoutMode) return false;

  const ps = prev.sentence;
  const ns = next.sentence;
  if (ps === ns) return true;
  if (!ps || !ns) return ps === ns;
  if (ps.index !== ns.index) return false;
  if (ps.text !== ns.text) return false;

  const pt = ps.tokens;
  const nt = ns.tokens;
  if (pt === nt) return true;
  if (!pt || !nt) return pt === nt;
  if (pt.length !== nt.length) return false;
  for (let i = 0; i < pt.length; i++) {
    if (pt[i].surfaceForm !== nt[i].surfaceForm) return false;
    if (pt[i].baseForm !== nt[i].baseForm) return false;
    if (pt[i].wordPosition !== nt[i].wordPosition) return false;
  }

  if (prev.chapterImages !== next.chapterImages) return false;
  return true;
}

export { TextCardInner as TextCard };

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  imageContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 12,
  },
  textOuter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textShiftRight: {
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  textShiftLeft: {
    alignItems: 'flex-start',
    paddingLeft: 8,
  },
  textCard: {
    backgroundColor: Colors.card,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.divider,
    marginHorizontal: 16,
    paddingHorizontal: 28,
    paddingVertical: 24,
    shadowColor: Colors.shadowMedium,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    maxWidth: 600,
    alignSelf: 'center',
  },
  romajiBox: {
    alignSelf: 'stretch',
    marginBottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentLight,
  },
  romajiErrorBox: {
    backgroundColor: '#f7ece8',
  },
  romajiPhraseBlock: {
    marginBottom: 12,
  },
  romajiPhraseLine: {
    color: Colors.textTertiary,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  romajiText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  romajiTokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
  },
  romajiTokenItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 24,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  romajiTokenReading: {
    fontSize: 10,
    color: Colors.textTertiary,
    lineHeight: 14,
    textAlign: 'center',
  },
  romajiTokenSurface: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  romajiHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 18,
    textAlign: 'center',
  },
  romajiErrorText: {
    color: '#b85c4a',
  },
  plainText: {
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  tokenizedText: {
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: undefined,
  },
  token: {
    paddingHorizontal: 1,
  },
  highlighted: {
    backgroundColor: 'rgba(91,140,184,0.2)',
    borderRadius: 3,
  },
  anchorHighlight: {
    backgroundColor: 'rgba(91,140,184,0.32)',
  },
  tapHighlight: {
    backgroundColor: 'rgba(91,140,184,0.22)',
    borderRadius: 3,
  },
  selectionHint: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(91,140,184,0.9)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  selectionHintText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: Colors.textTertiary,
  },
});
