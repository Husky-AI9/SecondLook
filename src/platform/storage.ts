import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Two drawers. Ordinary app data goes to AsyncStorage. The PIN record, the limits and the
// keyboard pack go to the Keychain / Keystore through expo-secure-store. On the web there is
// no secure store, so both use local storage and the Settings screen says so.

export const hasSecureStore = Platform.OS === 'ios' || Platform.OS === 'android';

/** Keychain access group shared with the iOS keyboard extension (set in app.config.ts). */
const ACCESS_GROUP = process.env.EXPO_PUBLIC_KEYCHAIN_GROUP || undefined;

export async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage full or blocked (private browsing). The app keeps working from memory.
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

export async function getSecret(key: string): Promise<string | null> {
  if (!hasSecureStore) return getItem('secret.' + key);
  try {
    return await SecureStore.getItemAsync(key, ACCESS_GROUP ? { keychainAccessGroup: ACCESS_GROUP } : undefined);
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<boolean> {
  if (!hasSecureStore) {
    await setItem('secret.' + key, value);
    return true;
  }
  try {
    await SecureStore.setItemAsync(key, value, ACCESS_GROUP ? { keychainAccessGroup: ACCESS_GROUP } : undefined);
    return true;
  } catch {
    try {
      // A free-Apple-ID build may not be entitled to the shared group. Keep the app working
      // with its own keychain; the keyboard then uses the clipboard pack code instead.
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* keep going from memory */
    }
    return false;
  }
}

export async function removeSecret(key: string): Promise<void> {
  if (!hasSecureStore) return removeItem('secret.' + key);
  try {
    await SecureStore.deleteItemAsync(key, ACCESS_GROUP ? { keychainAccessGroup: ACCESS_GROUP } : undefined);
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* already gone */
  }
}
