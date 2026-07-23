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
import type { HandMode } from '../../utils/constants';
import { InlineImage } from './InlineImage';
import { Colors } from '../../utils/constants';

interface TextCardProps {
  sentence: Sentence | null;
  fontSize: number;
  lineHeight: number;
  isLandscape: boolean;
  handMode: HandMode;
  hasImage: boolean;
  chapterImages: any[];
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
  onWordPress,
  onRangeSelect,
}: TextCardProps) {
  // ═══════════════════════════════════════════
  // ALL HOOKS — must be called unconditionally
  // ═══════════════════════════════════════════

  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const anchorIndexRef = useRef<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  // Derived data
  const tokens: Token[] = useMemo(() => {
    if (!sentence) return [];
    return sentence.tokens && sentence.tokens.length > 0 ? sentence.tokens : [];
  }, [sentence]);

  const hasTokens = tokens.length > 0;

  const selectedRange = useMemo((): [number, number] | null => {
    if (anchorIndex === null || activeIndex === null) return null;
    if (!isSelecting && anchorIndex === activeIndex) return null;
    const start = Math.min(anchorIndex, activeIndex);
    const end = Math.max(anchorIndex, activeIndex);
    if (start === end && !isSelecting) return null;
    return [start, end];
  }, [anchorIndex, activeIndex, isSelecting]);

  const selectedSet = useMemo(() => {
    if (!selectedRange) return new Set<number>();
    const s = new Set<number>();
    for (let i = selectedRange[0]; i <= selectedRange[1]; i++) s.add(i);
    return s;
  }, [selectedRange]);

  // ── Hit-testing: XY-aware with line layout ──
  // Uses onTextLayout to capture actual line positions, then maps
  // touch Y → line → tokens on that line → touch X → token.
  const cardLeftRef = useRef(0);
  const cardTopRef = useRef(0);

  // Line layout from onTextLayout: [{ y, height, firstToken, lastToken }]
  const lineLayoutRef = useRef<Array<{ y: number; h: number; first: number; last: number }>>([]);

  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const ref = e.target || e.currentTarget;
    if (ref && typeof (ref as any).measureInWindow === 'function') {
      (ref as any).measureInWindow((x: number, y: number) => {
        cardLeftRef.current = x;
        cardTopRef.current = y;
      });
    }
  }, []);

  // Called when the tokenized <Text> lays out — captures line-level
  // Y positions and maps them to token index ranges.
  const onTextLayoutHandler = useCallback((e: any) => {
    const lines: Array<{ y: number; height: number; text: string }> =
      e.nativeEvent?.lines ?? [];
    if (lines.length === 0 || tokens.length === 0) return;

    const layouts: Array<{ y: number; h: number; first: number; last: number }> = [];
    let charOffset = 0;

    for (const line of lines) {
      const lineEnd = charOffset + line.text.length;
      // Find which tokens overlap with this line's character range
      let firstTok = -1;
      let lastTok = -1;
      for (let t = 0; t < tokens.length; t++) {
        const tokStart = tokens[t].wordPosition;
        const tokEnd = tokStart + tokens[t].surfaceForm.length;
        if (tokStart < lineEnd && tokEnd > charOffset) {
          if (firstTok < 0) firstTok = t;
          lastTok = t;
        }
      }
      if (firstTok >= 0) {
        layouts.push({
          // line.y is relative to the Text element; add card paddingVertical
          // so that comparison with (absoluteY - cardTop) is correct
          y: line.y + 24 /* styles.textCard.paddingVertical */,
          h: line.height || fontSize * lineHeight,
          first: firstTok,
          last: lastTok,
        });
      }
      charOffset = lineEnd;
    }

    lineLayoutRef.current = layouts;
  }, [tokens, fontSize, lineHeight]);

  // Pre-compute estimated token widths (used for X hit-testing within a line)
  const tokenWidths = useMemo(() => {
    const w: number[] = [];
    for (const tok of tokens) {
      let cw = 0;
      for (const ch of tok.surfaceForm) {
        const code = ch.charCodeAt(0);
        if (code >= 0x4e00 && code <= 0x9fff) cw += fontSize;
        else if (code >= 0x3000 && code <= 0x30ff) cw += fontSize;
        else if (code >= 0xff00) cw += fontSize;
        else if (code <= 0x7f) cw += fontSize * 0.55;
        else cw += fontSize;
      }
      w.push(cw);
    }
    return w;
  }, [tokens, fontSize]);

  const getTokenIndexAt = useCallback(
    (absoluteX: number, absoluteY: number): number | null => {
      if (tokens.length === 0) return null;

      const relY = absoluteY - cardTopRef.current;
      const lines = lineLayoutRef.current;

      // Find which line the touch is on
      let first = 0;
      let last = tokens.length - 1;
      if (lines.length > 0) {
        for (const line of lines) {
          if (relY >= line.y && relY < line.y + line.h) {
            first = line.first;
            last = line.last;
            break;
          }
        }
      }

      // X search within the line: use proportional estimation
      // for tokens on this specific line
      const count = last - first + 1;
      if (count <= 0) return first;

      // Estimate the total rendered width of tokens on this line
      let lineWidth = 0;
      for (let t = first; t <= last; t++) lineWidth += tokenWidths[t];

      const relX = absoluteX - cardLeftRef.current;

      // Search through tokens on this line using cumulative widths
      // (starting from 0 for this line)
      let cumX = 0;
      for (let t = first; t <= last; t++) {
        const tw = tokenWidths[t];
        if (relX >= cumX && relX < cumX + tw) return t;
        cumX += tw;
      }

      // Before/after the line: return nearest token on this line
      if (relX < 0) return first;
      return last;
    },
    [tokens.length, tokenWidths],
  );

  // ── Single tap handler ──
  const handleTokenPress = useCallback(
    (token: Token, index: number) => {
      // Don't process tap if already in selection mode
      if (isSelecting) return;
      // Brief highlight on tapped token
      setTappedIndex(index);
      setAnchorIndex(null);
      setActiveIndex(null);
      setIsSelecting(false);
      onWordPress(token);
      // Clear tap highlight after feedback delay
      setTimeout(() => setTappedIndex(null), 500);
    },
    [onWordPress, isSelecting],
  );

  // ── Selection callbacks (JS-only, called via runOnJS from worklets) ──

  const beginSelectionAt = useCallback((idx: number | null) => {
    if (idx === null) return;
    // Guard against double-init from simultaneous Pan + LongPress
    if (anchorIndexRef.current !== null) return;
    anchorIndexRef.current = idx;
    activeIndexRef.current = idx;
    setIsSelecting(true);
    setAnchorIndex(idx);
    setActiveIndex(idx);
  }, []);

  // Entire JS-path wrapper for Pan's onStart
  const handlePanStart = useCallback(() => {
    if (anchorIndexRef.current !== null) return;
    const idx = getTokenIndexAt(touchStartX.current, touchStartY.current);
    beginSelectionAt(idx);
  }, [getTokenIndexAt, beginSelectionAt]);

  // Entire JS-path wrapper for LongPress's onStart
  const handleLongPressStart = useCallback((absX: number, absY: number) => {
    if (anchorIndexRef.current !== null) return;
    const idx = getTokenIndexAt(absX, absY);
    beginSelectionAt(idx);
  }, [getTokenIndexAt, beginSelectionAt]);

  const updateSelectionTo = useCallback((absX: number, absY: number) => {
    const idx = getTokenIndexAt(absX, absY);
    if (idx !== null) {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  }, [getTokenIndexAt]);

  const endSelection = useCallback(() => {
    const anchor = anchorIndexRef.current;
    const active = activeIndexRef.current;
    if (anchor !== null && active !== null && anchor !== active && onRangeSelect) {
      const start = Math.min(anchor, active);
      const end = Math.max(anchor, active);
      const selectedTokens = tokens.slice(start, end + 1);
      if (selectedTokens.length > 0) onRangeSelect(selectedTokens);
    }
    setTimeout(() => {
      anchorIndexRef.current = null;
      activeIndexRef.current = null;
      setAnchorIndex(null);
      setActiveIndex(null);
      setIsSelecting(false);
    }, 600);
  }, [tokens, onRangeSelect]);

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
      .enabled(hasTokens && !!onRangeSelect)
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
    [hasTokens, onRangeSelect, handlePanStart, updateSelectionTo, endSelection],
  );

  // Long press enters selection mode; the Pan gesture's onUpdate handles tracking.
  const longPressGesture = useMemo(() =>
    Gesture.LongPress()
      .enabled(hasTokens && !!onRangeSelect)
      .minDuration(400)
      .onStart((e) => {
        runOnJS(handleLongPressStart)(e.absoluteX, e.absoluteY);
      }),
    [hasTokens, onRangeSelect, handleLongPressStart],
  );

  // Compose: Pan and LongPress run simultaneously — the first to activate
  // sets the selection anchor, and Pan's tracking handles extension.
  const composedGesture = useMemo(() =>
    Gesture.Simultaneous(panGesture, longPressGesture),
    [panGesture, longPressGesture],
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
          {!hasTokens ? (
            <Text style={[styles.plainText, { fontSize, lineHeight: lineH }]}>
              {sentence.text}
            </Text>
          ) : (
            <Text
              style={[styles.tokenizedText, { fontSize, lineHeight: lineH }]}
              onTextLayout={onTextLayoutHandler}
            >
              {tokens.map((token, i) => {
                const isSel = selectedSet.has(i);
                const isAnchor = i === anchorIndex;
                const isTapped = i === tappedIndex;
                return (
                  <Text
                    key={`${token.wordPosition}-${i}`}
                    onPress={() => handleTokenPress(token, i)}
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
            {selectedRange[1] - selectedRange[0] + 1} 个词
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
