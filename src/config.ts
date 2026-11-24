// Build-time configuration. Expo inlines EXPO_PUBLIC_* variables from .env (see .env.example).
// Nothing here is a secret: Firebase web config identifies the project and is protected by
// App Check, not by being hidden. The .env file itself still stays out of the repository.

export const firebaseWebConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = !!(firebaseWebConfig.apiKey && firebaseWebConfig.projectId && firebaseWebConfig.appId);

/** reCAPTCHA Enterprise site key for App Check on the web. */
export const recaptchaSiteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || '';
/** Set to a debug token (or "true" to have one printed in the console) for local web testing. */
export const appCheckDebugToken = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || '';
/** Chrome origin-trial token for the Prompt API, if the hosted site is enrolled. */
export const promptApiOriginTrial = process.env.EXPO_PUBLIC_PROMPT_API_ORIGIN_TRIAL || '';
/** True when the iOS build includes the keyboard extension (Plan A). */
export const keyboardExtensionEnabled = process.env.EXPO_PUBLIC_KEYBOARD === '1';

/** Defaults for Firebase Remote Config. The console can change any of these without a release. */
export const REMOTE_DEFAULTS: Record<string, string> = {
  // Cloud model used when no on-device model is available (redacted text only).
  cloud_model: 'gemini-3.5-flash-lite',
  // Cloud model used for the market range, with Grounding with Google Search.
  benchmark_model: 'gemini-3.8-flash',
  benchmark_enabled: 'true',
  // JSON merged over the built-in scam rules (see src/engine/scamRules.ts).
  scam_rules: '',
};

export const APP_VERSION = '1.0.0';
