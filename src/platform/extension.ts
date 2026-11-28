import { Platform } from 'react-native';

// Quotekey for Chrome (extension/): the extension's side panel shows this web app in a frame
// with ?ext=1. Text the user selects on a page arrives here by postMessage; a reply the user
// taps goes back the same way and the extension types it into the page's reply box.
// Only the Quotekey extension (fixed id from the key in extension/manifest.json) is trusted.

export const EXTENSION_ORIGIN = 'chrome-extension://koogiofpinglcgjiaonpllmbdhcbndcl';

export const inExtension: boolean =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.parent !== window &&
  new URLSearchParams(window.location.search).get('ext') === '1';

export interface PageText {
  /** "theirs": the lender's message. "own": the user's draft reply, for the leak guard. */
  kind: 'theirs' | 'own';
  text: string;
}

export function onPageText(cb: (m: PageText) => void): () => void {
  if (!inExtension) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.origin !== EXTENSION_ORIGIN || e.source !== window.parent) return;
    const d = e.data as { type?: string; kind?: string; text?: unknown } | null;
    if (!d || d.type !== 'secondlook:text' || typeof d.text !== 'string' || !d.text.trim()) return;
    cb({ kind: d.kind === 'own' ? 'own' : 'theirs', text: d.text.slice(0, 4000) });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Tells the side panel the app is listening. */
export function announceReady(): void {
  if (inExtension) window.parent.postMessage({ type: 'secondlook:ready' }, EXTENSION_ORIGIN);
}

/** Asks the extension to type this reply into the page. Resolves false if it could not. */
export function typeIntoPage(text: string): Promise<boolean> {
  if (!inExtension) return Promise.resolve(false);
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('message', onReply);
      resolve(ok);
    };
    const onReply = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: string; ok?: boolean } | null;
      if (e.origin === EXTENSION_ORIGIN && d?.type === 'secondlook:inserted' && d.id === id) done(!!d.ok);
    };
    const timer = setTimeout(() => done(false), 5000);
    window.addEventListener('message', onReply);
    window.parent.postMessage({ type: 'secondlook:insert', id, text }, EXTENSION_ORIGIN);
  });
}
