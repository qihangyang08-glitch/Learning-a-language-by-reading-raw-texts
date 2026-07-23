import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { BookMeta } from '../../types/book';
import { Colors } from '../../utils/constants';

interface BookCardProps {
  book: BookMeta;
  onPress: () => void;
  onLongPress?: () => void;
  isImporting?: boolean;
}

/**
 * Book list item — minimal horizontal layout.
 * Shows spinner for importing books.
 */
export function BookCard({ book, onPress, onLongPress, isImporting }: BookCardProps) {
  const progress = book.totalSentences > 0
    ? Math.round((book.currentSentence / book.totalSentences) * 100)
    : 0;

  return (
    <TouchableOpacity
      style={[styles.card, isImporting && styles.cardImporting]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={isImporting ? 1 : 0.6}
      disabled={isImporting}
    >
      {/* Cover */}
      <View style={styles.cover}>
        <View style={styles.coverPlaceholder}>
          {isImporting ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={styles.coverTitle} numberOfLines={3}>
              {book.title || 'Untitled'}
            </Text>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title || 'Untitled'}
        </Text>
        {isImporting ? (
          <Text style={styles.importingLabel}>导入处理中...</Text>
        ) : (
          <>
            {book.author ? (
              <Text style={styles.author} numberOfLines={1}>
                {book.author}
              </Text>
            ) : null}

            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
            </View>

            <Text style={styles.meta}>
              {book.totalSentences > 0
                ? `${book.totalSentences} 句段 · ${progress}%`
                : '尚未阅读'}
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const COVER_W = 64;
const COVER_H = 88;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 6,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  cardImporting: {
    opacity: 0.7,
  },
  cover: {
    width: COVER_W,
    height: COVER_H,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#f0ede6',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    backgroundColor: '#ece8df',
  },
  coverTitle: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 13,
  },
  info: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: 3,
  },
  importingLabel: {
    fontSize: 13,
    color: Colors.accent,
    marginTop: 4,
  },
  author: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  progressRow: {
    marginBottom: 4,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#eae7e0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: Colors.accent,
  },
  meta: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
});
