import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import type { Sentence } from '../../types/book';

interface SentenceNavProps {
  visible: boolean;
  sentences: Sentence[];
  currentIndex: number;
  bookmarks: Set<number>;
  onClose: () => void;
  onSelect: (index: number) => void;
}

/**
 * Outline navigation — Bible-style sentence index.
 * Shows all sentences with chapter.sentence numbering,
 * search/filter, and bookmark highlights.
 * Opens as a bottom sheet modal.
 */
export function SentenceNav({
  visible,
  sentences,
  currentIndex,
  bookmarks,
  onClose,
  onSelect,
}: SentenceNavProps) {
  const [search, setSearch] = useState('');
  const { height } = useWindowDimensions();

  // Group sentences by chapter
  const filtered = useMemo(() => {
    let list = sentences;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = sentences.filter((s) => s.text.toLowerCase().includes(q));
    }
    return list;
  }, [sentences, search]);

  // Build chapter groups
  const chapterGroups = useMemo(() => {
    const groups: { chapterIndex: number; items: Sentence[] }[] = [];
    for (const s of filtered) {
      const last = groups[groups.length - 1];
      if (!last || last.chapterIndex !== s.chapterIndex) {
        groups.push({ chapterIndex: s.chapterIndex, items: [s] });
      } else {
        last.items.push(s);
      }
    }
    return groups;
  }, [filtered]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { maxHeight: height * 0.85 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>纲目</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索句段..."
            placeholderTextColor="#ccc"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <Text style={styles.searchCount}>
              {filtered.length} / {sentences.length}
            </Text>
          )}
        </View>

        {/* Sentence list */}
        <FlatList
          data={chapterGroups}
          keyExtractor={(g) => `ch-${g.chapterIndex}`}
          initialScrollIndex={Math.max(
            0,
            chapterGroups.findIndex(
              (g) =>
                g.items[0] &&
                g.items[0].index <= currentIndex &&
                g.items[g.items.length - 1].index >= currentIndex,
            ),
          )}
          getItemLayout={(_, index) => ({
            length: 200,
            offset: 200 * index,
            index,
          })}
          renderItem={({ item: group }) => (
            <View key={`ch-${group.chapterIndex}`}>
              {/* Chapter header */}
              <View style={styles.chapterHeader}>
                <Text style={styles.chapterText}>
                  Chapter {group.chapterIndex + 1}
                </Text>
                <Text style={styles.chapterCount}>
                  {group.items.length} sentences
                </Text>
              </View>

              {/* Sentences */}
              {group.items.map((sentence) => {
                const isActive = sentence.index === currentIndex;
                const isBookmarked = bookmarks.has(sentence.index);
                const preview =
                  sentence.text.length > 40
                    ? sentence.text.slice(0, 40) + '...'
                    : sentence.text;

                return (
                  <TouchableOpacity
                    key={`s-${sentence.index}`}
                    style={[
                      styles.sentenceRow,
                      isActive && styles.sentenceActive,
                    ]}
                    onPress={() => onSelect(sentence.index)}
                  >
                    <Text style={styles.sentenceNum}>
                      [{sentence.chapterIndex + 1}.{sentence.sentenceIndex + 1}]
                    </Text>
                    {isBookmarked && <Text style={styles.bookmarkIcon}>🔖</Text>}
                    <Text
                      style={[
                        styles.sentencePreview,
                        isActive && styles.sentencePreviewActive,
                      ]}
                      numberOfLines={2}
                    >
                      {preview}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {search ? '无匹配结果' : '无句段数据'}
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: '#999',
  },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#333',
  },
  searchCount: {
    marginLeft: 8,
    fontSize: 12,
    color: '#aaa',
  },
  // Chapter
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chapterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  chapterCount: {
    fontSize: 11,
    color: '#bbb',
  },
  // Sentences
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f5f5f5',
    gap: 6,
  },
  sentenceActive: {
    backgroundColor: '#f0f4ff',
  },
  sentenceNum: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    minWidth: 48,
    marginTop: 2,
  },
  bookmarkIcon: {
    fontSize: 12,
    marginTop: 2,
  },
  sentencePreview: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  sentencePreviewActive: {
    color: '#4a90d9',
    fontWeight: '500',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#aaa',
  },
});
