// Preview-only stand-ins for the Expo and community packages the app imports.
import React from 'react';
import { createRoot } from 'react-dom/client';

const w = globalThis as any;

// ---- expo ----
export function registerRootComponent(App: React.ComponentType) {
  createRoot(document.getElementById('root')!).render(<App />);
}
/** Tests can install a fake native module on window.__nativeModules to exercise the native adapter. */
export function requireOptionalNativeModule<T>(name: string): T | null {
  return (w.__nativeModules && w.__nativeModules[name]) || null;
}

// ---- react-native-safe-area-context ----
export function SafeAreaProvider(p: { children: React.ReactNode }) {
  return <>{p.children}</>;
}
export function useSafeAreaInsets() {
  return w.__insets || { top: 0, bottom: 0, left: 0, right: 0 };
}

// ---- expo-status-bar ----
export function StatusBar(_p: { style?: string }) {
  return null;
}

// ---- expo-font + @expo-google-fonts/dm-sans ----
export function useFonts(_map: Record<string, unknown>): [boolean, Error | null] {
  return [true, null];
}
export const DMSans_400Regular = 'DMSans_400Regular';
export const DMSans_500Medium = 'DMSans_500Medium';
export const DMSans_600SemiBold = 'DMSans_600SemiBold';
export const DMSans_700Bold = 'DMSans_700Bold';

// ---- expo-clipboard (a fake clipboard on window.__clipboard, so tests are deterministic) ----
export async function hasStringAsync() {
  return typeof w.__clipboard === 'string' && w.__clipboard.length > 0;
}
export async function getStringAsync() {
  return w.__clipboard || '';
}
export async function setStringAsync(s: string) {
  w.__clipboard = s;
  return true;
}

// ---- expo-secure-store ----
export async function getItemAsync(k: string, _opts?: unknown) {
  return localStorage.getItem('ss.' + k);
}
export async function setItemAsync(k: string, v: string, _opts?: unknown) {
  localStorage.setItem('ss.' + k, v);
}
export async function deleteItemAsync(k: string, _opts?: unknown) {
  localStorage.removeItem('ss.' + k);
}

// ---- @react-native-async-storage/async-storage ----
const AsyncStorage = {
  async getItem(k: string) {
    return localStorage.getItem(k);
  },
  async setItem(k: string, v: string) {
    localStorage.setItem(k, v);
  },
  async removeItem(k: string) {
    localStorage.removeItem(k);
  },
};
export default AsyncStorage;
