import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="setup"
            options={{ animation: 'fade', gestureEnabled: false }}
          />
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
