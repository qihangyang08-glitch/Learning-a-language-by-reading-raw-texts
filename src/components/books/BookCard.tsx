import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import type { BookMeta } from '../../types/book';

interface BookCardProps {
  book: BookMeta;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * Book card for the library grid/list.
 * Shows cover, title, author, and reading progress.
 */
export function BookCard({ book, onPress, onLongPress }: BookCardProps) {
  const progress = book.totalSentences > 0
    ? Math.round((book.currentSentence / book.totalSentences) * 100)
    : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Cover placeholder */}
      <View style={styles.coverContainer}>
        {book.coverPath ? (
          <Image source={{ uri: book.coverPath }} style={styles.cover} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverIcon}>📖</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title || 'Untitled'}
        </Text>
        {book.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}

        {/* Progress bar */}
        {book.totalSentences > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  coverContainer: {
    width: '100%',
    aspectRatio: 0.7,
    backgroundColor: '#f0f0f0',
  },
  cover: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8e0d8',
  },
  coverIcon: {
    fontSize: 40,
  },
  info: {
    padding: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  author: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a90d9',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#999',
    minWidth: 32,
    textAlign: 'right',
  },
});
