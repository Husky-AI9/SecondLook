import type { AiProvider } from './types';

// Metro picks platform.web.ts on the web and platform.native.ts on iOS and Android.
// This file is the fallback for anything else and for type-checking: no model at all,
// which the app handles by running on offline rules.
export function createProvider(): AiProvider {
  return {
    async status() {
      return { configured: false, onDevice: 'unavailable', reason: 'No AI provider on this platform.' };
    },
    async generate() {
      throw new Error('No AI provider on this platform.');
    },
    async remoteConfig(defaults) {
      return defaults;
    },
  };
}
