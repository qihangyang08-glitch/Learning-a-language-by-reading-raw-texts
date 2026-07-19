import React from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, Text } from 'react-native';
import { BookCard } from './BookCard';
import type { BookMeta } from '../../types/book';

interface BookGridProps {
  books: BookMeta[];
  onBookPress: (book: BookMeta) => void;
  onBookLongPress?: (book: BookMeta) => void;
}

/**
 * Adaptive grid/list for displaying books.
 * Switches between 2-4 columns based on screen width.
 */
export function BookGrid({ books, onBookPress, onBookLongPress }: BookGridProps) {
  const { width } = useWindowDimensions();

  // Determine columns based on width
  const numColumns = width > 900 ? 4 : width > 600 ? 3 : 2;
  const cardWidth = (width - 32) / numColumns - 8; // minus padding and gap

  if (books.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={styles.emptyText}>No books yet</Text>
        <Text style={styles.emptySubtext}>
          Tap + to import a Japanese novel
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={books}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      key={numColumns} // force re-render on column change
      contentContainerStyle={styles.container}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      renderItem={({ item }) => (
        <View style={{ width: cardWidth }}>
          <BookCard
            book={item}
            onPress={() => onBookPress(item)}
            onLongPress={() => onBookLongPress?.(item)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  row: {
    justifyContent: 'flex-start',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
