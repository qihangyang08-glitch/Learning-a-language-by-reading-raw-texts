import React, { useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { BookGrid } from '../../src/components/books/BookGrid';
import { ImportButton } from '../../src/components/books/ImportButton';
import { useBookStore } from '../../src/store/bookStore';
import { StorageService } from '../../src/services/storage';
import { detectFormat, getParser } from '../../src/services/parser/detector';
import { Segmenter } from '../../src/services/segmenter';
import type { BookMeta, Sentence } from '../../src/types/book';

const storage = new StorageService();
const segmenter = new Segmenter();

export default function LibraryScreen() {
  const router = useRouter();
  const { books, addBook, removeBook, setLoading, isLoading } = useBookStore();

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/epub+zip', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const format = detectFormat(file.name, file.mimeType ?? undefined);

      if (!format) {
        Alert.alert(
          'Unsupported Format',
          `${file.name} is not a supported format.\n\nCurrently supported: .txt, .epub`
        );
        return;
      }

      setLoading(true);

      // Import book file
      const { filePath, bookId } = await storage.importBook(
        file.uri,
        file.name,
        format
      );

      // Parse and segment
      const parser = getParser(format);
      const content = await parser.parse(filePath);

      // Segment all chapters
      const allSentences: Sentence[] = [];
      let globalIdx = 0;

      for (const chapter of content.chapters as any[]) {
        const rawText = chapter._raw || '';
        if (!rawText.trim()) continue;

        const rawSentences = segmenter.segment(rawText);
        const chapterSentences = segmenter.toSentenceObjects(
          rawSentences,
          chapter.index,
          globalIdx
        );
        allSentences.push(...chapterSentences);
        globalIdx += chapterSentences.length;
      }

      // Create book metadata
      const bookMeta: BookMeta = {
        id: bookId,
        title: content.meta.title,
        author: content.meta.author,
        format,
        filePath,
        totalSentences: allSentences.length,
        currentSentence: 0,
        importedAt: Date.now(),
      };

      addBook(bookMeta);
      setLoading(false);

      Alert.alert(
        'Import Successful',
        `${bookMeta.title}\n${allSentences.length} sentences parsed.`
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Import Error', err.message || 'Failed to import book.');
    }
  };

  const handleBookPress = (book: BookMeta) => {
    router.push(`/reader/${book.id}`);
  };

  const handleBookLongPress = (book: BookMeta) => {
    Alert.alert(
      book.title,
      `${book.totalSentences} sentences\nFormat: ${book.format}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            storage.deleteBook(book.filePath);
            removeBook(book.id);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <BookGrid
          books={books}
          onBookPress={handleBookPress}
          onBookLongPress={handleBookLongPress}
        />
      </View>
      <ImportButton onPress={handleImport} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
});
