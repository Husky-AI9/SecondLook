import { Platform } from 'react-native';
import { nativeAi } from '../../modules/secondlook-ai';

// Android: highlight text in any app and "Quotekey" appears next to Copy and Share.
// The selected text arrives through the PROCESS_TEXT intent, read by the native module.

export function takeIncomingText(): string | null {
  if (Platform.OS !== 'android' || !nativeAi) return null;
  try {
    const t = nativeAi.consumeSharedText();
    return t && t.trim() ? t : null;
  } catch {
    return null;
  }
}

export function onIncomingText(cb: (text: string) => void): () => void {
  if (Platform.OS !== 'android' || !nativeAi) return () => {};
  try {
    const sub = nativeAi.addListener('onSharedText', (e: { text: string }) => {
      if (e?.text?.trim()) cb(e.text);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
