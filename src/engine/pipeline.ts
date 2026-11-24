import type { CheckResult, Deal, Draft, GuardResult, InferenceSource, Offer } from './types';
import { extractOffer, mergeOffers } from './extract';
import { checkScam, DEFAULT_RULES, type ScamRuleSet } from './scamRules';
import { redact } from './redact';
import { judge } from './verdict';
import { extractJson } from './parse';
import { counterPrompt, decodePrompt, explainPrompt, wordingPrompt } from './prompts';
import { finalizeDrafts, planDrafts, ruleDrafts, saferVersion } from './drafts';
import { guardDraft } from './leakGuard';
import { explainOffline, parseExplain } from './explain';

// One tap, one model call. Each function here:
//   1. does everything it can in code,
//   2. asks the AI router for the part that needs language,
//   3. validates what came back, and
//   4. falls back to rules if there is no model, no network, or bad output.

export interface PrivateRun {
  text: string;
  source: 'on-device' | 'cloud-redacted';
}

/**
 * The only door to a model. `privatePrompt` may contain the lender's message and names and is
 * only ever given to an on-device model. `redactedPrompt` is what may go to the cloud if there
 * is no on-device model; pass null to forbid the cloud for this call.
 */
export interface AiRouterLike {
  runPrivate(args: { privatePrompt: string; redactedPrompt: string | null; json?: boolean }): Promise<PrivateRun | null>;
}

export interface PipelineContext {
  deal?: Deal;
  rules?: ScamRuleSet;
  userName?: string;
  ai?: AiRouterLike | null;
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function normalizeModelOffer(j: Record<string, unknown>): Partial<Offer> {
  return {
    rate: numOrUndef(j.rate),
    apr: numOrUndef(j.apr),
    termMonths: numOrUndef(j.termMonths),
    amount: numOrUndef(j.amount),
    fees: numOrUndef(j.fees),
    points: numOrUndef(j.points),
    monthlyPayment: numOrUndef(j.monthlyPayment),
    addOns: Array.isArray(j.addOns) ? (j.addOns.filter((a) => typeof a === 'string') as string[]) : [],
    expires: typeof j.expires === 'string' ? j.expires : undefined,
  };
}

async function runJson(
  ai: AiRouterLike,
  privatePrompt: string,
  redactedPrompt: string | null,
): Promise<{ json: Record<string, unknown>; source: PrivateRun['source'] } | null> {
  // "Validate and retry": small models sometimes wrap JSON in prose. One retry, then rules.
  for (let attempt = 0; attempt < 2; attempt++) {
    let run: PrivateRun | null = null;
    try {
      run = await ai.runPrivate({ privatePrompt, redactedPrompt, json: true });
    } catch {
      run = null;
    }
    if (!run) return null;
    const j = extractJson(run.text);
    if (j && typeof j === 'object' && !Array.isArray(j)) return { json: j as Record<string, unknown>, source: run.source };
  }
  return null;
}

export async function checkMessage(text: string, ctx: PipelineContext = {}): Promise<CheckResult> {
  const { deal } = ctx;
  const rules = ctx.rules ?? DEFAULT_RULES;
  const scam = checkScam(text, rules, { knownNames: [deal?.lender, deal?.contact].filter(Boolean) as string[], marketLow: deal?.benchmark?.low });
  const fromRules = extractOffer(text);

  // A scam verdict never waits for a model and never sends anything anywhere.
  if (scam.isScam) return { ...judge(text, fromRules, scam, deal), source: 'offline-rules' };

  let source: InferenceSource = 'offline-rules';
  let modelOffer: Partial<Offer> | null = null;
  let modelKind: unknown;
  let redacted: string[] | undefined;

  if (ctx.ai) {
    const red = redact(text, { names: [deal?.lender, deal?.contact, ctx.userName] });
    const got = await runJson(ctx.ai, decodePrompt(text), decodePrompt(red.text));
    if (got) {
      modelOffer = normalizeModelOffer(got.json);
      modelKind = got.json.kind;
      source = got.source;
      if (got.source === 'cloud-redacted') redacted = red.removed;
    }
  }

  const offer = mergeOffers(text, fromRules, modelOffer);
  // The model can tip a borderline message into "scam", but only with a rule to back it up.
  const backed = modelKind === 'scam' && scam.reasons.length >= 2;
  const res = judge(text, offer, backed ? { ...scam, isScam: true } : scam, deal);
  return { ...res, source, redacted };
}

export interface CounterResult {
  drafts: Draft[];
  source: InferenceSource;
  /** How many model drafts the leak guard or validator threw out. */
  replaced: number;
  needsLimits: boolean;
}

export async function draftCounter(deal: Deal, offer: Offer | undefined, lastMessage: string, ctx: PipelineContext = {}): Promise<CounterResult> {
  const plan = planDrafts(deal, offer);
  if (!plan) return { drafts: [], source: 'offline-rules', replaced: 0, needsLimits: true };

  if (ctx.ai && !plan.alreadyGood) {
    const red = redact(lastMessage, { names: [deal.lender, deal.contact, ctx.userName] });
    const base = { isAuto: plan.isAuto, hasQuote: plan.quoteRate !== undefined, quoteWritten: plan.quoteWritten, hasFees: plan.askFees !== undefined, hasName: !!plan.name, addOn: plan.addOn };
    const got = await runJson(ctx.ai, counterPrompt({ ...base, message: lastMessage }), counterPrompt({ ...base, message: red.text }));
    if (got) {
      const { drafts, replacedCount } = finalizeDrafts(got.json, deal, offer);
      if (replacedCount < 3) return { drafts, source: got.source, replaced: replacedCount, needsLimits: false };
    }
  }
  return { drafts: ruleDrafts(deal, offer), source: 'offline-rules', replaced: 0, needsLimits: false };
}

export interface ExplainResult {
  points: string[];
  source: InferenceSource;
}

export async function explainMessage(text: string, ctx: PipelineContext = {}): Promise<ExplainResult> {
  const offer = extractOffer(text);
  const offline = () => ({ points: explainOffline(text, offer, ctx.deal?.amount, ctx.deal?.termMonths), source: 'offline-rules' as const });
  if (!ctx.ai) return offline();
  const red = redact(text, { names: [ctx.deal?.lender, ctx.deal?.contact, ctx.userName] });
  try {
    const run = await ctx.ai.runPrivate({ privatePrompt: explainPrompt(text), redactedPrompt: explainPrompt(red.text) });
    if (!run) return offline();
    const points = parseExplain(run.text);
    return points.length >= 2 ? { points, source: run.source } : offline();
  } catch {
    return offline();
  }
}

export interface OwnDraftResult {
  guard: GuardResult;
  safer: Draft | null;
  /** A second opinion from the on-device model when the code check found nothing. */
  advisory?: string;
  source: InferenceSource;
}

export async function checkOwnDraft(text: string, deal: Deal, offer: Offer | undefined, ctx: PipelineContext = {}): Promise<OwnDraftResult> {
  const guard = guardDraft(text, deal, offer);
  const safer = saferVersion(deal, offer);
  if (!guard.ok || !ctx.ai) return { guard, safer, source: 'offline-rules' };
  // Wording check: the user's own words stay on the phone, so the cloud is not allowed here.
  const got = await runJson(ctx.ai, wordingPrompt(text), null);
  if (got && got.json.leaks === true && typeof got.json.why === 'string') {
    return { guard, safer, advisory: got.json.why.slice(0, 200), source: 'on-device' };
  }
  return { guard, safer, source: got ? 'on-device' : 'offline-rules' };
}
