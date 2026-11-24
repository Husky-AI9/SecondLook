import { benchmarkEnabled, currentRules, getAi } from '../ai';
import {
  checkMessage, checkOwnDraft, checkScam, draftCounter, explainMessage, inferAmount, judge, latestOffer, matchDeal, sampleBenchmark, uid,
  type CounterResult, type Deal, type Draft, type ExplainResult, type OwnDraftResult,
} from '../engine';
import { openInMessages } from '../platform/send';
import { actions, findDeal, getState } from './store';

// Things a tap does. Screens call these; these call the engine and the AI router.

function ctx(deal?: Deal) {
  return { deal, rules: currentRules(), userName: getState().profile.name || undefined, ai: getAi() };
}

/** Check a lender's message and open the verdict. */
export async function runCheck(rawText: string, preferDealId?: string): Promise<void> {
  const text = rawText.trim();
  if (!text) {
    actions.toast('Nothing to check yet. Copy or paste a message first.');
    return;
  }
  const s = getState();
  const deal = (preferDealId && findDeal(s, preferDealId)) || matchDeal(text, s.deals, s.activeDealId);
  actions.setBusy('Reading the message');
  try {
    const result = await checkMessage(text, ctx(deal));
    let roundId: string | undefined;
    if (deal && result.kind !== 'scam') {
      actions.setActive(deal.id);
      const last = [...deal.rounds].reverse().find((r) => r.who === 'them');
      if (last && last.text.trim() === text) {
        roundId = last.id;
        actions.updateRound(deal.id, last.id, { offer: result.offer, verdict: result.kind, source: result.source });
      } else {
        roundId = actions.addRound(deal.id, { who: 'them', text, offer: result.offer, verdict: result.kind, source: result.source });
      }
    }
    actions.setCheck({ id: uid('c'), text, result, dealId: result.kind === 'scam' ? undefined : deal?.id, roundId });
    actions.go({ name: 'verdict' });
  } finally {
    actions.setBusy(null);
  }
}

export async function runCounter(dealId: string): Promise<CounterResult> {
  const deal = findDeal(getState(), dealId);
  if (!deal) return { drafts: [], source: 'offline-rules', replaced: 0, needsLimits: true };
  const lastThem = [...deal.rounds].reverse().find((r) => r.who === 'them');
  return draftCounter(deal, latestOffer(deal), lastThem?.text ?? '', ctx(deal));
}

export async function runExplain(text: string, dealId?: string): Promise<ExplainResult> {
  return explainMessage(text, ctx(findDeal(getState(), dealId)));
}

export async function runOwnDraft(text: string, dealId: string): Promise<OwnDraftResult | null> {
  const deal = findDeal(getState(), dealId);
  if (!deal) return null;
  return checkOwnDraft(text, deal, latestOffer(deal), ctx(deal));
}

/** Records the reply as a round and hands it to the messaging app. The user presses send. */
export async function sendDraft(dealId: string, draft: Draft): Promise<void> {
  actions.addRound(dealId, { who: 'you', text: draft.text, tone: draft.tone, reveals: draft.reveals, askRate: draft.askRate, askFees: draft.askFees });
  const outcome = await openInMessages(draft.text);
  actions.resetTo({ name: 'home' }, { name: 'rounds', dealId });
  actions.toast(outcome === 'opened-messages' ? 'Filled in. Read it, then press send.' : outcome === 'copied' ? 'Copied. Paste it into your chat, then press send.' : 'Could not copy. Press and hold the reply to copy it.');
}

export type RangeOutcome = 'live' | 'sample' | 'failed' | 'disabled';

/** The one opt-in cloud call that is not redacted text: today's market range. */
export async function fetchRange(dealId: string): Promise<RangeOutcome> {
  const deal = findDeal(getState(), dealId);
  if (!deal) return 'failed';
  if (!benchmarkEnabled()) return 'disabled';
  actions.setBusy("Getting today's range");
  try {
    const b = await getAi().fetchBenchmark(deal);
    actions.setBenchmark(dealId, b);
    return 'live';
  } catch (e) {
    if ((e as Error).message === 'not-configured') {
      actions.setBenchmark(dealId, sampleBenchmark(deal));
      return 'sample';
    }
    return 'failed';
  } finally {
    actions.setBusy(null);
  }
}

/** Starting values for a new Deal File when the user checked a message first. */
export function prefillFromCheck(): Partial<Deal> {
  const c = getState().check;
  if (!c) return {};
  const o = c.result.offer;
  return {
    amount: inferAmount(o),
    termMonths: o.termMonths,
    rateType: o.rateType,
    loanType: o.apr !== undefined && (o.termMonths ?? 0) <= 96 && o.rate === undefined ? 'auto' : undefined,
  };
}

/** Re-opens the verdict for a message already in the timeline. No model call: stored numbers, fresh arithmetic. */
export function openRound(dealId: string, roundId: string): void {
  const deal = findDeal(getState(), dealId);
  const round = deal?.rounds.find((r) => r.id === roundId);
  if (!deal || !round || round.who !== 'them' || !round.offer) return;
  const scam = checkScam(round.text, currentRules(), { knownNames: [deal.lender, deal.contact].filter(Boolean) as string[], marketLow: deal.benchmark?.low });
  const result = { ...judge(round.text, round.offer, { ...scam, isScam: false }, deal), source: round.source ?? ('offline-rules' as const) };
  actions.setCheck({ id: uid('c'), text: round.text, result, dealId, roundId });
  actions.go({ name: 'verdict' });
}

/** Engine context for screens that call the pipeline directly (the practice panel). */
export function pipelineCtx(deal?: Deal) {
  return ctx(deal);
}
