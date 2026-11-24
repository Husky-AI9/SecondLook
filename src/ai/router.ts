import type { AiRouterLike, Benchmark, Deal, PrivateRun } from '../engine';
import { benchmarkPrompt, buildBenchmark, cloudQuery, glossaryPrompt, parseBenchmark } from '../engine';
import type { AiProvider, AiStatus, GenerateResult } from './types';

// The privacy router. This is the one place that decides where a prompt may run.
//
//   Private prompt (lender's message, names)   -> ONLY_ON_DEVICE. Never the cloud.
//   No on-device model                         -> the redacted copy, PREFER_ON_DEVICE,
//                                                 labelled "cloud (redacted)" if the cloud answered.
//   Market range                               -> ONLY_IN_CLOUD with Google Search grounding,
//                                                 five coarse facts, opt-in.
//   No model and no network                    -> null; the engine uses offline rules.

export interface RouterOptions {
  cloudModel: () => string;
  benchmarkModel: () => string;
  /** User setting: may redacted text go to the cloud when there is no on-device model? */
  cloudFallbackAllowed: () => boolean;
  timeoutMs?: number;
  onStatus?: (s: AiStatus) => void;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface AiRouter extends AiRouterLike {
  status(force?: boolean): Promise<AiStatus>;
  fetchBenchmark(deal: Deal): Promise<Benchmark>;
  glossary(terms: string[]): Promise<{ text: string; source: 'on-device' | 'cloud' } | null>;
}

export function createRouter(provider: AiProvider, opts: RouterOptions): AiRouter {
  const timeoutMs = opts.timeoutMs ?? 25000;
  let cached: { at: number; status: AiStatus } | null = null;

  async function status(force = false): Promise<AiStatus> {
    if (!force && cached && Date.now() - cached.at < 30000) return cached.status;
    let s: AiStatus;
    try {
      s = await withTimeout(provider.status(), 6000);
    } catch {
      s = { configured: false, onDevice: 'unavailable', reason: 'Could not check the AI status.' };
    }
    cached = { at: Date.now(), status: s };
    opts.onStatus?.(s);
    return s;
  }

  async function tryGenerate(req: Parameters<AiProvider['generate']>[0]): Promise<GenerateResult | null> {
    try {
      const r = await withTimeout(provider.generate(req), timeoutMs);
      return r && typeof r.text === 'string' && r.text.trim() ? r : null;
    } catch {
      return null;
    }
  }

  return {
    status,

    async runPrivate({ privatePrompt, redactedPrompt, json }): Promise<PrivateRun | null> {
      const s = await status();
      if (!s.configured) return null;

      if (s.onDevice === 'available') {
        const r = await tryGenerate({ prompt: privatePrompt, mode: 'only-on-device', json, cloudModel: opts.cloudModel() });
        if (r) return { text: r.text, source: 'on-device' };
        // Throttled or failed: fall through to the redacted path if that is allowed.
      }

      if (redactedPrompt === null || !opts.cloudFallbackAllowed()) return null;
      const r = await tryGenerate({ prompt: redactedPrompt, mode: 'prefer-on-device', json, cloudModel: opts.cloudModel() });
      if (!r) return null;
      return { text: r.text, source: r.source === 'on-device' ? 'on-device' : 'cloud-redacted' };
    },

    async fetchBenchmark(deal: Deal): Promise<Benchmark> {
      const s = await status();
      if (!s.configured) throw new Error('not-configured');
      const q = cloudQuery(deal);
      const r = await tryGenerate({ prompt: benchmarkPrompt(q), mode: 'only-cloud', grounded: true, cloudModel: opts.benchmarkModel() });
      if (!r) throw new Error('no-answer');
      const range = parseBenchmark(r.text);
      if (!range) throw new Error('unreadable');
      return buildBenchmark(deal, range, r.sources ?? [], { searchQueries: r.searchQueries, searchHtml: r.searchHtml });
    },

    async glossary(terms) {
      const s = await status();
      if (!s.configured || terms.length === 0) return null;
      // Term names only, nothing private: let the SDK choose on-device or cloud.
      const r = await tryGenerate({ prompt: glossaryPrompt(terms), mode: 'prefer-on-device', cloudModel: opts.cloudModel() });
      return r ? { text: r.text, source: r.source } : null;
    },
  };
}
