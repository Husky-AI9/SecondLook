import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, type AI } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { appCheckDebugToken, firebaseWebConfig, isFirebaseConfigured, promptApiOriginTrial, recaptchaSiteKey } from '../config';
import type { AiProvider, AiStatus, GenerateRequest, GenerateResult, OnDeviceStatus } from './types';

// Web: Firebase AI Logic JS SDK. On-device inference is Gemini Nano through Chrome's built-in
// Prompt API (desktop Chrome); everywhere else the SDK falls back to the cloud.

let app: FirebaseApp | null = null;
let ai: AI | null = null;

function ensure(): AI | null {
  if (!isFirebaseConfigured) return null;
  if (ai) return ai;
  app = getApps()[0] ?? initializeApp(firebaseWebConfig);

  // App Check. Firebase AI Logic expects it; debug tokens are fine for the hackathon.
  try {
    if (appCheckDebugToken) {
      (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken;
    }
    if (recaptchaSiteKey) {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
    }
  } catch {
    // Already initialised (hot reload) or blocked; AI Logic will report the failure on first call.
  }

  // Anonymous sign-in: gives each install a stable uid without collecting anything.
  try {
    void signInAnonymously(getAuth(app)).catch(() => undefined);
  } catch {
    /* auth is optional */
  }

  if (promptApiOriginTrial && typeof document !== 'undefined') {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'origin-trial';
    meta.content = promptApiOriginTrial;
    document.head.appendChild(meta);
  }

  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

async function onDeviceStatus(): Promise<{ status: OnDeviceStatus; reason?: string }> {
  // Chrome's Prompt API. Not present in other browsers or on phones.
  const LM = (globalThis as { LanguageModel?: { availability?: () => Promise<string> } }).LanguageModel;
  if (!LM?.availability) return { status: 'unavailable', reason: 'This browser has no built-in model. Desktop Chrome has one.' };
  try {
    const a = await LM.availability();
    if (a === 'available' || a === 'downloadable' || a === 'downloading') return { status: a };
    return { status: 'unavailable', reason: 'Chrome reports the built-in model is not available on this device.' };
  } catch {
    return { status: 'unavailable', reason: 'Could not ask Chrome about its built-in model.' };
  }
}

const MODE = {
  'only-on-device': InferenceMode.ONLY_ON_DEVICE,
  'prefer-on-device': InferenceMode.PREFER_ON_DEVICE,
  'only-cloud': InferenceMode.ONLY_IN_CLOUD,
} as const;

export function createProvider(): AiProvider {
  return {
    async status(): Promise<AiStatus> {
      const od = await onDeviceStatus();
      return { configured: !!ensure(), onDevice: od.status, reason: od.reason };
    },

    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const instance = ensure();
      if (!instance) throw new Error('Firebase is not configured.');

      const generationConfig: Record<string, unknown> = { temperature: 0.2 };
      // JSON mode cannot be combined with the Google Search tool, so grounded calls parse text.
      if (req.json && !req.grounded) generationConfig.responseMimeType = 'application/json';

      const model = getGenerativeModel(instance, {
        mode: MODE[req.mode],
        inCloudParams: {
          model: req.cloudModel,
          generationConfig,
          ...(req.grounded ? { tools: [{ googleSearch: {} }] } : {}),
        },
        onDeviceParams: { createOptions: { temperature: 0.2, topK: 3 } },
      });

      const result = await model.generateContent(req.prompt);
      const response = result.response;
      const text = response.text();
      // Reported by the SDK for every response: "ON_DEVICE" or "IN_CLOUD".
      const inferredOnDevice = String((response as { inferenceSource?: string }).inferenceSource || '').toUpperCase().includes('DEVICE');
      const source: GenerateResult['source'] = req.mode === 'only-on-device' ? 'on-device' : req.mode === 'only-cloud' ? 'cloud' : inferredOnDevice ? 'on-device' : 'cloud';

      const out: GenerateResult = { text, source, model: source === 'cloud' ? req.cloudModel : 'gemini-nano' };
      const gm = (response.candidates?.[0] as { groundingMetadata?: Record<string, any> } | undefined)?.groundingMetadata;
      if (gm) {
        out.sources = (gm.groundingChunks || [])
          .map((c: { web?: { uri?: string; title?: string } }) => ({ title: c.web?.title || c.web?.uri || 'Source', url: c.web?.uri || '' }))
          .filter((s: { url: string }) => !!s.url);
        out.searchQueries = gm.webSearchQueries || [];
        out.searchHtml = gm.searchEntryPoint?.renderedContent;
      }
      return out;
    },

    async remoteConfig(defaults) {
      ensure();
      if (!app) return defaults;
      try {
        const rc = getRemoteConfig(app);
        rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
        rc.defaultConfig = defaults;
        await fetchAndActivate(rc);
        const out: Record<string, string> = {};
        for (const k of Object.keys(defaults)) out[k] = getValue(rc, k).asString() || defaults[k];
        return out;
      } catch {
        return defaults;
      }
    },
  };
}
