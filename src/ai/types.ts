import type { SourceLink } from '../engine';

export type OnDeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown';

export interface AiStatus {
  /** False until Firebase config is present (web) or the native module is linked (iOS/Android). */
  configured: boolean;
  onDevice: OnDeviceStatus;
  reason?: string;
}

/**
 * The three ways Quotekey uses Firebase AI Logic hybrid inference:
 *  - only-on-device: private prompts. The SDK itself refuses to use the cloud.
 *  - prefer-on-device: redacted or generic prompts. The SDK picks, and reports which it used.
 *  - only-cloud: the market range, which needs Grounding with Google Search.
 */
export type GenerateMode = 'only-on-device' | 'prefer-on-device' | 'only-cloud';

export interface GenerateRequest {
  prompt: string;
  mode: GenerateMode;
  json?: boolean;
  grounded?: boolean;
  cloudModel: string;
}

export interface GenerateResult {
  text: string;
  source: 'on-device' | 'cloud';
  model?: string;
  sources?: SourceLink[];
  searchQueries?: string[];
  searchHtml?: string;
}

export interface AiProvider {
  status(): Promise<AiStatus>;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Fetches Remote Config values, falling back to the given defaults. */
  remoteConfig(defaults: Record<string, string>): Promise<Record<string, string>>;
}
