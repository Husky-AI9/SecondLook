import { requireOptionalNativeModule } from 'expo';

// JavaScript face of the native module. Kept deliberately tiny, because every change to the
// Swift or Kotlin side needs a native build.

export interface NativeGenerateResult {
  text: string;
  /** "on-device" or "cloud", as reported by Firebase AI Logic for this response. */
  source: 'on-device' | 'cloud';
  model?: string;
  sources?: { title: string; url: string }[];
  searchQueries?: string[];
  searchHtml?: string;
}

export interface NativeAvailability {
  /** "available" | "downloadable" | "downloading" | "unavailable" */
  onDevice: string;
  reason?: string;
  appCheck?: string;
}

export interface SecondLookAINative {
  availability(): Promise<NativeAvailability>;
  /** mode: "only-on-device" | "prefer-on-device" | "only-cloud" */
  generate(prompt: string, mode: string, grounded: boolean, cloudModel: string): Promise<NativeGenerateResult>;
  remoteConfig(defaults: Record<string, string>): Promise<Record<string, string>>;
  /** Shares the limits pack with the keyboard. iOS: keychain group shared with the keyboard
   *  extension. Android: app-private storage read by the SecondLook keyboard (same app). */
  sharedKeychainSet?(key: string, value: string): { ok: boolean; status: number; group: string };
  /** Android only: is the SecondLook keyboard turned on, and is it the keyboard in use? */
  keyboardStatus?(): { enabled: boolean; selected: boolean };
  /** Android only: opens Settings → Keyboards, where the SecondLook keyboard is turned on. */
  openKeyboardSettings?(): boolean;
  /** Android only: the system sheet for switching keyboards. */
  showKeyboardPicker?(): boolean;
  /** iOS only: bundle id, team prefix and shared group of the build as it was signed. */
  deviceInfo?(): { bundleId: string; teamPrefix: string; group: string; os: string; firebase: boolean };
  /** Android only: text selected in another app and sent through "SecondLook". */
  consumeSharedText(): string | null;
  addListener(event: 'onSharedText', cb: (e: { text: string }) => void): { remove(): void };
}

/** null on web, and in any build where the native module is missing. */
export const nativeAi: SecondLookAINative | null = requireOptionalNativeModule<SecondLookAINative>('SecondLookAI');
