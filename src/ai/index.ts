import { compileRules, DEFAULT_RULES, type ScamRuleSet } from '../engine';
import { REMOTE_DEFAULTS } from '../config';
import { actions, getState } from '../state/store';
import { createProvider } from './platform';
import { createRouter, type AiRouter } from './router';

let router: AiRouter | null = null;

function remote(key: string): string {
  return getState().remote[key] || REMOTE_DEFAULTS[key] || '';
}

export function getAi(): AiRouter {
  if (!router) {
    const provider = createProvider();
    router = createRouter(provider, {
      cloudModel: () => remote('cloud_model'),
      benchmarkModel: () => remote('benchmark_model'),
      cloudFallbackAllowed: () => getState().settings.cloudFallback,
      onStatus: (s) => actions.setAi({ configured: s.configured, onDevice: s.onDevice, reason: s.reason, checkedAt: new Date().toISOString() }),
    });
    // Remote Config: scam rules and model names can change without shipping a new build.
    void provider.remoteConfig(REMOTE_DEFAULTS).then((values) => actions.setRemote(values)).catch(() => undefined);
  }
  return router;
}

let rulesCache: { json: string; rules: ScamRuleSet } | null = null;
export function currentRules(): ScamRuleSet {
  const json = remote('scam_rules');
  if (!json) return DEFAULT_RULES;
  if (!rulesCache || rulesCache.json !== json) rulesCache = { json, rules: compileRules(json) };
  return rulesCache.rules;
}

export function benchmarkEnabled(): boolean {
  return remote('benchmark_enabled') !== 'false';
}
