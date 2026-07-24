import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, Text, Platform, StatusBar, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { BookGrid } from '../../src/components/books/BookGrid';
import { ImportButton } from '../../src/components/books/ImportButton';
import { SettingsOverlay } from '../../src/components/settings/SettingsOverlay';
import { useBookStore } from '../../src/store/bookStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useAppStatusStore } from '../../src/store/appStatusStore';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageService } from '../../src/services/storage';
import {
  insertBook,
  deleteBook as removeFromBookshelf,
  storeSentences,
  storeChapterImages,
} from '../../src/services/bookshelf';
import { detectFormat, getParser } from '../../src/services/parser/detector';
import { Segmenter } from '../../src/services/segmenter';
import { Colors } from '../../src/utils/constants';
import type { BookMeta, Sentence } from '../../src/types/book';
import { uuidv4 as v4 } from '../../src/utils/uuid';

const storage = new StorageService();
const segmenter = new Segmenter();
const STATUSBAR_H = (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44) + 4;

export default function LibraryScreen() {
  const router = useRouter();
  const { books, addBook, removeBook, setLoading } = useBookStore();
  const { setFirstLaunch } = useSettingsStore();
  const dictionaryStage = useAppStatusStore((s) => s.dictionaryStage);
  const dictionaryMessage = useAppStatusStore((s) => s.dictionaryMessage);
  const dictionaryProgress = useAppStatusStore((s) => s.dictionaryProgress);
  const [showSettings, setShowSettings] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [firstLaunchChecked, setFirstLaunchChecked] = useState(false);

  // Check first-launch flag via file system (avoids zustand persist race)
  useEffect(() => {
    let timerId: any = null;
    const FLAG_FILE = FileSystem.documentDirectory + 'jareader-launched';
    FileSystem.getInfoAsync(FLAG_FILE).then(info => {
      if (!info.exists) {
        // First launch — show settings after a short delay, then write flag
        timerId = setTimeout(() => setShowSettings(true), 800);
        FileSystem.writeAsStringAsync(FLAG_FILE, '1').catch(() => {});
      }
      setFirstLaunchChecked(true);
    });
    return () => { if (timerId) clearTimeout(timerId); };
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    setFirstLaunch(false); // also update settings store for WelcomeGuide
  }, [setFirstLaunch]);

  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/epub+zip', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const format = detectFormat(file.name, file.mimeType ?? undefined);

      if (!format) {
        Alert.alert('不支持的格式', `${file.name}\n\n支持 .txt 和 .epub`);
        return;
      }

      const placeholderId = v4();
      const placeholderTitle = file.name.replace(/\.[^.]+$/, '');
      const placeholder: BookMeta = {
        id: placeholderId,
        title: placeholderTitle,
        author: '导入处理中...',
        format,
        filePath: '',
        totalSentences: 0,
        currentSentence: 0,
        importedAt: Date.now(),
      };
      addBook(placeholder);
      setImportingId(placeholderId);

      try {
        console.log('[Import] Step 1: Copying file...');
        const { filePath, bookId } = await storage.importBook(file.uri, file.name, format);
        console.log('[Import] Step 1 done:', filePath);

        const parser = getParser(format);
        console.log('[Import] Step 2: Parsing...');
        const content = await parser.parse(filePath);
        console.log('[Import] Step 2 done. Chapters:', content.chapters.length);

        const allSentences: Sentence[] = [];
        let globalIdx = 0;
        const chapterImages: Record<number, any[]> = {};

        for (const chapter of content.chapters as any[]) {
          const rawText = chapter._raw || '';
          if (!rawText.trim() && (!chapter.images || chapter.images.length === 0)) continue;

          console.log(`[Import] Step 3: Segmenting ch${chapter.index} (${rawText.length} chars)...`);
          const rawSentences = segmenter.segment(rawText);
          const chapterSentences = segmenter.toSentenceObjects(rawSentences, chapter.index, globalIdx);
          allSentences.push(...chapterSentences);
          globalIdx += chapterSentences.length;
          console.log(`[Import]   → ${chapterSentences.length} sentences`);

          if (chapter.images && chapter.images.length > 0) {
            chapterImages[chapter.index] = chapter.images;
          }
        }

        console.log(`[Import] Step 4: Storing ${allSentences.length} sentences...`);
        const bookMeta: BookMeta = {
          id: bookId, title: content.meta.title, author: content.meta.author,
          format, filePath,
          totalSentences: allSentences.length,
          currentSentence: 0, importedAt: Date.now(),
        };

        insertBook(bookMeta);
        console.log('[Import] Step 5: Inserting sentences (chunked)...');
        await storeSentences(bookId, allSentences);
        console.log('[Import] Step 5 done');
        if (Object.keys(chapterImages).length > 0) {
          console.log(`[Import] Step 6: Storing ${Object.keys(chapterImages).length} chapter images...`);
          storeChapterImages(bookId, chapterImages);
        }

        removeBook(placeholderId);
        addBook(bookMeta);
        setImportingId(null);
        console.log('[Import] ✅ Complete!');
      } catch (err: any) {
        console.warn('[Import] ❌ Failed at step:', err?.message, err?.stack);
      }
    } catch (err: any) {
      setImportingId(null);
      if (err.message !== 'User canceled') {
        Alert.alert('导入失败', err.message || '无法导入书籍');
      }
    }
  }, [addBook, removeBook]);

  const handleBookPress = useCallback((book: BookMeta) => {
    if (book.id === importingId) return;
    router.push(`/reader/${book.id}`);
  }, [router, importingId]);

  const handleBookLongPress = useCallback((book: BookMeta) => {
    if (book.id === importingId) return;
    Alert.alert(book.title, `${book.totalSentences} 句段 · ${book.format}`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          storage.deleteBook(book.filePath);
          removeBook(book.id);
          removeFromBookshelf(book.id);
        },
      },
    ]);
  }, [removeBook, importingId]);

  // Toggle settings with logging for debugging
  const openSettings = useCallback(() => {
    console.log('[Settings] Opening overlay');
    setShowSettings(true);
  }, []);

  const showDictionaryBanner =
    dictionaryStage === 'checking' ||
    dictionaryStage === 'importing' ||
    dictionaryStage === 'error';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        {/* Title bar — pushed below status bar */}
        <View style={[styles.header, { paddingTop: STATUSBAR_H }]}>
          <Text style={styles.title}>Jareader</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={openSettings}
            activeOpacity={0.5}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.settingsIcon}>≡</Text>
          </TouchableOpacity>
        </View>

        {showDictionaryBanner && (
          <View style={[
            styles.dictionaryBanner,
            dictionaryStage === 'error' && styles.dictionaryBannerError,
          ]}>
            {dictionaryStage !== 'error' && (
              <ActivityIndicator size="small" color={Colors.accent} />
            )}
            <Text style={styles.dictionaryBannerText} numberOfLines={1}>
              {dictionaryMessage || '词典准备中...'}
              {dictionaryStage === 'importing' ? ` ${Math.round(dictionaryProgress * 100)}%` : ''}
            </Text>
          </View>
        )}

        {/* Book list */}
        <BookGrid
          books={books}
          onBookPress={handleBookPress}
          onBookLongPress={handleBookLongPress}
          importingId={importingId}
        />

        {/* FAB import */}
        <ImportButton onPress={handleImport} />

        {/* Settings overlay */}
        <SettingsOverlay
          visible={showSettings}
          onClose={handleCloseSettings}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  dictionaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.accentLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  dictionaryBannerError: {
    backgroundColor: '#f7ece8',
  },
  dictionaryBannerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  settingsIcon: {
    fontSize: 36,
    fontWeight: '200',
    color: Colors.textSecondary,
    lineHeight: 38,
  },
});
