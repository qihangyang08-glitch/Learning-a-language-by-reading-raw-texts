import { Redirect } from 'expo-router';

/**
 * Settings is now an overlay on the main page.
 * Redirect any direct navigation back to the library.
 */
export default function SettingsRedirect() {
  return <Redirect href="/(tabs)" />;
}
