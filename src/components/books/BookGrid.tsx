import React from 'react';
import { FlatList, StyleSheet, View, Text } from 'react-native';
import { BookCard } from './BookCard';
import type { BookMeta } from '../../types/book';
import { Colors } from '../../utils/constants';

interface BookGridProps {
  books: BookMeta[];
  onBookPress: (book: BookMeta) => void;
  onBookLongPress?: (book: BookMeta) => void;
  importingId?: string | null;
}

/**
 * Vertical list of book items.
 * Shows import placeholders with a spinner state.
 */
export function BookGrid({ books, onBookPress, onBookLongPress, importingId }: BookGridProps) {
  if (books.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📖</Text>
        <Text style={styles.emptyText}>书架空空</Text>
        <Text style={styles.emptySubtext}>点击 + 导入日语小说，开始阅读</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={books}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <BookCard
          book={item}
          onPress={() => onBookPress(item)}
          onLongPress={() => onBookLongPress?.(item)}
          isImporting={item.id === importingId}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
