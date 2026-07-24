import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import {
  loadChapterGroups,
  loadChapterSentencePreviews,
  searchSentencePreviews,
} from '../../services/bookshelf';
import { Colors } from '../../utils/constants';

interface SentencePreview {
  index: number;
  chapterIndex?: number;
  sentenceIndex: number;
  preview: string;
}

interface ChapterGroup {
  chapterIndex: number;
  count: number;
  firstIndex: number;
  sentences?: SentencePreview[]; // lazy-loaded
}

interface SentenceNavProps {
  visible: boolean;
  bookId: string | null;
  currentIndex: number;
  bookmarks: Set<number>;
  onClose: () => void;
  onSelect: (index: number) => void;
}

/**
 * Outline navigation — bottom sheet style.
 * - Slides up from bottom, covers ~60% of screen
 * - Chapter grouping with lazy-loaded sentence previews
 * - Search across chapter previews
 * - Tap backdrop to dismiss
 * - Dense list for efficient browsing
 */
export function SentenceNav({
  visible,
  bookId,
  currentIndex,
  bookmarks,
  onClose,
  onSelect,
}: SentenceNavProps) {
  const [search, setSearch] = useState('');
  const [chapters, setChapters] = useState<ChapterGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SentencePreview[] | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const { height } = useWindowDimensions();

  // Load chapter groups on open
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    if (visible && bookId) {
      setLoading(true);
      timerId = setTimeout(() => {
        try {
          const groups = loadChapterGroups(bookId);
          const currentChapter = groups.find(
            (g) => g.firstIndex <= currentIndex && g.firstIndex + g.count > currentIndex,
          );
          const hydratedGroups = currentChapter
            ? groups.map((group) => (
                group.chapterIndex === currentChapter.chapterIndex
                  ? { ...group, sentences: loadChapterSentencePreviews(bookId, group.chapterIndex) }
                  : group
              ))
            : groups;

          if (cancelled) return;
          setChapters(hydratedGroups);
          setExpandedChapters(currentChapter ? new Set([currentChapter.chapterIndex]) : new Set());
        } catch (err) {
          if (cancelled) return;
          console.warn('[SentenceNav] Load failed:', err);
          setChapters([]);
          setExpandedChapters(new Set());
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 0);
    }
    if (!visible) {
      setSearch('');
      setSearchResults(null);
      setSearchLoading(false);
      setLoading(false);
      setChapters([]);
      setExpandedChapters(new Set());
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [visible, bookId, currentIndex]);

  // Toggle chapter expansion — lazy load sentences
  const toggleChapter = useCallback((chIdx: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chIdx)) {
        next.delete(chIdx);
      } else {
        next.add(chIdx);
        // Lazy load sentences for this chapter
        setChapters((prevChapters) =>
          prevChapters.map((ch) => {
            if (ch.chapterIndex === chIdx && !ch.sentences && bookId) {
              const previews = loadChapterSentencePreviews(bookId, chIdx);
              return { ...ch, sentences: previews };
            }
            return ch;
          }),
        );
      }
      return next;
    });
  }, [bookId]);

  // Search directly in SQLite and keep results capped.
  useEffect(() => {
    const q = search.trim();
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    if (!visible || !bookId || !q) {
      setSearchResults(null);
      setSearchLoading(false);
      return () => {};
    }

    setSearchLoading(true);
    timerId = setTimeout(() => {
      try {
        const results = searchSentencePreviews(bookId, q, 200);
        if (!cancelled) setSearchResults(results);
      } catch (err) {
        console.warn('[SentenceNav] Search failed:', err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [search, visible, bookId]);

  const panelHeight = height * 0.62;
  const hasSearch = search.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Prevent backdrop press from closing when tapping the panel */}
        <Pressable style={[styles.panel, { height: panelHeight }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>纲目</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.5}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="搜索..."
              placeholderTextColor={Colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Colors.accent} />
            </View>
          ) : hasSearch ? (
            <FlatList
              data={searchResults ?? []}
              keyExtractor={(s) => `sr-${s.index}`}
              renderItem={({ item }) => (
                <SentenceRow
                  chapterIndex={item.chapterIndex ?? 0}
                  sentence={item}
                  isActive={item.index === currentIndex}
                  isBookmarked={bookmarks.has(item.index)}
                  onSelect={onSelect}
                />
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  {searchLoading ? (
                    <ActivityIndicator size="small" color={Colors.accent} />
                  ) : (
                    <Text style={styles.emptyText}>无匹配结果</Text>
                  )}
                </View>
              }
            />
          ) : (
            <FlatList
              data={chapters}
              keyExtractor={(ch) => `ch-${ch.chapterIndex}`}
              getItemLayout={(_, index) => ({
                length: CHAPTER_HEADER_H,
                offset: CHAPTER_HEADER_H * index,
                index,
              })}
              renderItem={({ item: ch }) => {
                const isExpanded = expandedChapters.has(ch.chapterIndex);
                return (
                  <View>
                    <TouchableOpacity
                      style={styles.chapterHeader}
                      onPress={() => toggleChapter(ch.chapterIndex)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.chapterText}>
                        Ch.{ch.chapterIndex + 1}
                      </Text>
                      <Text style={styles.chapterCount}>
                        {ch.count}句 {isExpanded ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>

                    {isExpanded && ch.sentences && ch.sentences.map((s) => (
                      <SentenceRow
                        key={`s-${s.index}`}
                        chapterIndex={ch.chapterIndex}
                        sentence={s}
                        isActive={s.index === currentIndex}
                        isBookmarked={bookmarks.has(s.index)}
                        onSelect={onSelect}
                      />
                    ))}

                    {isExpanded && !ch.sentences && (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={Colors.textTertiary} />
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>无句段数据</Text>
                </View>
              }
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SentenceRow({
  chapterIndex,
  sentence,
  isActive,
  isBookmarked,
  onSelect,
}: {
  chapterIndex: number;
  sentence: SentencePreview;
  isActive: boolean;
  isBookmarked: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.sentenceRow, isActive && styles.sentenceActive]}
      onPress={() => onSelect(sentence.index)}
      activeOpacity={0.6}
    >
      <Text style={[styles.sentenceNum, isActive && styles.sentenceNumActive]}>
        {chapterIndex + 1}.{sentence.sentenceIndex + 1}
      </Text>
      {isBookmarked && <Text style={styles.bookmarkIcon}>◆</Text>}
      <Text
        style={[styles.sentencePreview, isActive && styles.sentencePreviewActive]}
        numberOfLines={1}
      >
        {sentence.preview}
      </Text>
    </TouchableOpacity>
  );
}

const CHAPTER_HEADER_H = 36;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -18,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: { padding: 6 },
  closeText: { fontSize: 16, color: Colors.textSecondary },
  searchBar: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  searchInput: {
    height: 34,
    backgroundColor: Colors.card,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: CHAPTER_HEADER_H,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  chapterText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chapterCount: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.card,
    gap: 6,
  },
  sentenceActive: {
    backgroundColor: Colors.accentLight,
  },
  sentenceNum: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600',
    minWidth: 36,
  },
  sentenceNumActive: { color: Colors.accent },
  bookmarkIcon: {
    fontSize: 9,
    color: Colors.accent,
  },
  sentencePreview: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  sentencePreviewActive: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  loadingRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
});
