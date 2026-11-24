import { nativeAi } from '../../modules/secondlook-ai';
import type { AiProvider, AiStatus, GenerateRequest, GenerateResult, OnDeviceStatus } from './types';

// iOS and Android: a small Expo module (modules/secondlook-ai) that calls the native
// Firebase AI Logic SDKs. iOS runs Apple's Foundation Models on-device; Android runs
// Gemini Nano through AICore. Both fall back to Gemini in the cloud through the same SDK.

const KNOWN: OnDeviceStatus[] = ['available', 'downloadable', 'downloading', 'unavailable'];

export function createProvider(): AiProvider {
  return {
    async status(): Promise<AiStatus> {
      if (!nativeAi) return { configured: false, onDevice: 'unavailable', reason: 'The native AI module is not in this build.' };
      try {
        const a = await nativeAi.availability();
        const onDevice = (KNOWN.includes(a.onDevice as OnDeviceStatus) ? a.onDevice : 'unavailable') as OnDeviceStatus;
        return { configured: true, onDevice, reason: a.reason };
      } catch (e) {
        return { configured: true, onDevice: 'unavailable', reason: String((e as Error)?.message || e) };
      }
    },

    async generate(req: GenerateRequest): Promise<GenerateResult> {
      if (!nativeAi) throw new Error('The native AI module is not in this build.');
      const r = await nativeAi.generate(req.prompt, req.mode, !!req.grounded, req.cloudModel);
      return {
        text: r.text,
        source: r.source === 'on-device' ? 'on-device' : 'cloud',
        model: r.model,
        sources: r.sources,
        searchQueries: r.searchQueries,
        searchHtml: r.searchHtml,
      };
    },

    async remoteConfig(defaults) {
      if (!nativeAi) return defaults;
      try {
        return { ...defaults, ...(await nativeAi.remoteConfig(defaults)) };
      } catch {
        return defaults;
      }
    },
  };
}
