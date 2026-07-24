import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { useBookStore } from '../src/store/bookStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useAppStatusStore } from '../src/store/appStatusStore';
import { initBookshelfTables, loadBooks } from '../src/services/bookshelf';
import { initDictionary } from '../src/services/dictionary-init';

/**
 * Settings & bookshelf & dictionary initializer.
 */
function AppInit() {
  const setBooks = useBookStore((s) => s.setBooks);
  const loadApiKey = useSettingsStore((s) => s.loadApiKeyFromSecureStore);
  const setDictionaryStatus = useAppStatusStore((s) => s.setDictionaryStatus);

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    // Load API key from secure store (encrypted, survives restarts)
    loadApiKey();

    // initDictionary: ensureSchema runs synchronously (entries table created immediately).
    // The async part (populate bundled dict-data) runs in background.
    // Bookshelf tables are safe to create immediately —
    // dictionary schema is already in place (same DB file).
    initBookshelfTables();
    const books = loadBooks();
    if (books.length > 0) setBooks(books);

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timerId = setTimeout(() => {
        if (cancelled) return;

        initDictionary((p) => {
          console.log(`[dict] ${p.stage}: ${p.message}`);
          setDictionaryStatus(p);
          if (p.stage === 'done') {
            setTimeout(() => {
              if (!cancelled) {
                setDictionaryStatus({ stage: 'idle', progress: 0, message: '' });
              }
            }, 2000);
          }
        });
      }, 1200);
    });

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      interactionTask.cancel?.();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AppInit />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="reader/[bookId]"
            options={{
              animation: 'slide_from_right',
              gestureEnabled: false,
            }}
          />
        </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
