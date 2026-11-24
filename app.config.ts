import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

// Identifiers. Register exactly these in the Firebase console (see SETUP.md). If Sideloadly
// rewrites the iOS bundle id when signing with a free Apple ID, set IOS_BUNDLE_ID to the
// rewritten id and rebuild, so it matches what Firebase and App Check expect.
const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || 'com.secondlook.app';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || 'com.secondlook.app';

// Firebase config files are not in the repository. Without them the app still builds and
// runs on its built-in rules; Settings shows "Not set up".
const iosPlist = existsSync('./GoogleService-Info.plist') ? './GoogleService-Info.plist' : undefined;
const androidJson = existsSync('./google-services.json') ? './google-services.json' : undefined;

// App Check: debug provider unless APPCHECK_DEBUG=0 (the hackathon accepts debug tokens).
const appCheckDebug = process.env.APPCHECK_DEBUG !== '0';

// Plan A: include the iOS keyboard extension in targets/keyboard.
const withKeyboard = process.env.EXPO_PUBLIC_KEYBOARD === '1';

const config: ExpoConfig = {
  name: 'SecondLook',
  slug: 'secondlook',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'secondlook',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    googleServicesFile: iosPlist,
    // Plan A only: a keychain group shared with the keyboard extension. The app's own group
    // stays first, so everything expo-secure-store already saved is still found.
    entitlements: withKeyboard ? { 'keychain-access-groups': [`$(AppIdentifierPrefix)${IOS_BUNDLE_ID}`, '$(AppIdentifierPrefix)secondlook.shared'] } : undefined,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      SLAppCheckDebug: appCheckDebug,
      // Optional fixed debug token so a sideloaded build can be registered without Xcode logs.
      // Comes from a CI secret or your shell; never commit it.
      SLAppCheckDebugToken: process.env.APPCHECK_DEBUG_TOKEN_IOS || '',
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    googleServicesFile: androidJson,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#3D4A45' },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    name: 'SecondLook',
    shortName: 'SecondLook',
    themeColor: '#3D4A45',
    backgroundColor: '#E9E7E1',
  },
  plugins: [
    'expo-font',
    'expo-secure-store',
    'expo-status-bar',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#3D4A45' }],
    // firebase-ai-ondevice needs Android API 26.
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    [
      './plugins/withSecondLookAndroid',
      {
        appCheckDebug,
        appCheckDebugToken: process.env.APPCHECK_DEBUG_TOKEN_ANDROID || '',
        onDeviceOption: process.env.ANDROID_ONDEVICE_OPTION || 'PREVIEW',
      },
    ],
    // Plan A: the iOS keyboard extension in targets/keyboard. Off unless EXPO_PUBLIC_KEYBOARD=1,
    // so an untested extension can never break the main build (see SETUP.md §7).
    ...(withKeyboard ? ['@bacons/apple-targets'] : []),
  ],
};

export default config;
