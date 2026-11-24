import type { Deal, Draft, DraftTone, Offer } from './types';
import { firstName, money, pct } from './format';
import { finalOfferRate } from './loanMath';
import { guardDraft } from './leakGuard';

// Replies are built from templates with placeholders. The numbers are filled in here, on the
// phone, by code. A model only ever writes the words around the placeholders, so it cannot
// invent a rate and it never sees the walk-away number at all.

export interface DraftPlan {
  askRate: number;
  askFees?: number;
  finalRate: number;
  quoteRate?: number;
  quoteWritten: boolean;
  name?: string;
  isAuto: boolean;
  addOn?: string;
  alreadyGood: boolean;
  theirRate?: number;
}

export const TONE_LABEL: Record<DraftTone, string> = {
  friendly: 'Friendly',
  firm: 'Firm',
  final: 'Final offer',
  own: 'Your wording',
  safer: 'Safer version',
};

export function planDrafts(deal: Deal, offer?: Offer): DraftPlan | null {
  const limits = deal.limits;
  if (!limits) return null;
  const theirRate = offer ? offer.rate ?? offer.apr : undefined;
  const cq = deal.competingQuote;
  const useQuote = !!cq && deal.reveal.competingQuote && cq.rate <= limits.targetRate + 0.0005;
  const feesKnown = offer?.fees !== undefined;
  const feesOver = feesKnown && (offer!.fees as number) > limits.maxFees;
  const alreadyGood = theirRate !== undefined && theirRate <= limits.targetRate + 0.0005 && !feesOver;
  return {
    askRate: useQuote ? Math.min(cq!.rate, limits.targetRate) : limits.targetRate,
    askFees: feesKnown ? Math.min(offer!.fees as number, limits.maxFees) : undefined,
    finalRate: finalOfferRate(limits.targetRate, limits.maxRate),
    quoteRate: useQuote ? cq!.rate : undefined,
    quoteWritten: !!cq?.inWriting,
    name: firstName(deal.contact),
    isAuto: deal.loanType === 'auto',
    addOn: offer?.addOns[0],
    alreadyGood,
    theirRate,
  };
}

/** Replaces {ASK_RATE} {ASK_FEES} {FINAL_RATE} {QUOTE_RATE} {NAME}. */
export function fillTemplate(tpl: string, p: DraftPlan): string {
  let out = tpl
    .replace(/\{ASK_RATE\}/g, pct(p.askRate, p.isAuto))
    .replace(/\{FINAL_RATE\}/g, pct(p.finalRate, p.isAuto))
    .replace(/\{QUOTE_RATE\}/g, p.quoteRate !== undefined ? pct(p.quoteRate, p.isAuto) : pct(p.askRate, p.isAuto))
    .replace(/\{ASK_FEES\}/g, p.askFees !== undefined ? money(p.askFees) : 'lower')
    .replace(/\{NAME\}/g, p.name || '');
  // Tidy what an empty name leaves behind: "Thanks !" -> "Thanks!", "Hi ," -> "Hi,".
  out = out.replace(/\s+([!,.?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return out;
}

function templates(p: DraftPlan): Record<'friendly' | 'firm' | 'final', string> {
  const thanks = p.name ? 'Thanks {NAME}!' : 'Thanks!';
  if (p.alreadyGood) {
    const r = p.theirRate !== undefined ? pct(p.theirRate, p.isAuto) + (p.isAuto ? ' APR' : '') : 'that rate';
    return {
      friendly: `${thanks} ${r} works for me. Can you send it in writing with every fee listed?`,
      firm: `I can move ahead at ${r}. Before I do, please confirm in writing that nothing else is added.`,
      final: `I'm ready at ${r} if the fees stay as quoted. Send the paperwork and I'll review it today.`,
    };
  }
  if (p.isAuto) {
    const drop = p.addOn ? ` and take off the ${p.addOn}` : '';
    const without = p.addOn ? ` without the ${p.addOn}` : '';
    const noAdd = p.addOn ? ', no add-ons,' : '';
    return {
      friendly:
        p.quoteRate !== undefined
          ? `${thanks} I'm pre-approved at {QUOTE_RATE} APR elsewhere. Can you match it${drop}?`
          : `${thanks} Could you get the APR to {ASK_RATE}${drop}?`,
      firm: `I'm ready to sign today at {ASK_RATE} APR${without}. Can you do that?`,
      final: `{FINAL_RATE} APR${noAdd} is as far as I can go. If that works, send the paperwork.`,
    };
  }
  const fees = p.askFees !== undefined;
  return {
    friendly:
      p.quoteRate !== undefined
        ? `${thanks} I have a ${p.quoteWritten ? 'written ' : ''}{QUOTE_RATE} elsewhere. Can you match it${fees ? ' and bring fees to {ASK_FEES}' : ''}?`
        : `${thanks} Could you get to {ASK_RATE}${fees ? ' and bring fees to {ASK_FEES}' : ''}?`,
    firm: fees
      ? `I'm ready to lock today at {ASK_RATE} with {ASK_FEES} in fees. Can you do that?`
      : `I'm ready to lock today at {ASK_RATE}. Can you do that, and send the full fee list?`,
    final: fees
      ? `{FINAL_RATE} with {ASK_FEES} in fees is as far as I can go. If that works, send the lock.`
      : `{FINAL_RATE} is as far as I can go. If that works, send the lock and the fee list.`,
  };
}

function toDraft(tone: 'friendly' | 'firm' | 'final', text: string, deal: Deal, offer: Offer | undefined, p: DraftPlan, replaced = false): Draft {
  const g = guardDraft(text, deal, offer);
  return {
    tone,
    label: TONE_LABEL[tone],
    text,
    withinLimits: g.ok,
    reveals: g.reveals,
    replaced,
    askRate: tone === 'final' ? p.finalRate : p.alreadyGood ? p.theirRate : p.askRate,
    askFees: p.askFees,
  };
}

/** Offline drafts. Also the fallback whenever a model's draft is blocked. */
export function ruleDrafts(deal: Deal, offer?: Offer): Draft[] {
  const p = planDrafts(deal, offer);
  if (!p) return [];
  const t = templates(p);
  return (['friendly', 'firm', 'final'] as const).map((tone) => toDraft(tone, fillTemplate(t[tone], p), deal, offer, p));
}

const REQUIRED: Record<'friendly' | 'firm' | 'final', RegExp> = {
  friendly: /\{(ASK_RATE|QUOTE_RATE)\}/,
  firm: /\{ASK_RATE\}/,
  final: /\{FINAL_RATE\}/,
};

/** Checks one model-written template before any number is put into it. */
export function templateProblem(tone: 'friendly' | 'firm' | 'final', tpl: unknown, p: DraftPlan): string | null {
  if (typeof tpl !== 'string') return 'not text';
  const s = tpl.trim();
  if (s.length < 12 || s.length > 260) return 'wrong length';
  if (!p.alreadyGood && !REQUIRED[tone].test(s)) return 'missing placeholder';
  if (p.quoteRate === undefined && /\{QUOTE_RATE\}/.test(s)) return 'cites a quote that may not be mentioned';
  const stripped = s.replace(/\{(ASK_RATE|ASK_FEES|FINAL_RATE|QUOTE_RATE|NAME)\}/g, '');
  if (/[{}]/.test(stripped)) return 'unknown placeholder';
  // Any literal percentage or dollar figure means the model made up a number.
  if (/\d\s?%|\$\s?\d/.test(stripped)) return 'contains its own numbers';
  if (/https?:|www\./i.test(stripped)) return 'contains a link';
  return null;
}

/**
 * Turns the model's three templates into drafts. Each one is validated, filled with numbers,
 * then run through the leak guard. Anything that fails is replaced by the rule-based draft.
 */
export function finalizeDrafts(raw: unknown, deal: Deal, offer?: Offer): { drafts: Draft[]; replacedCount: number } {
  const p = planDrafts(deal, offer);
  if (!p) return { drafts: [], replacedCount: 0 };
  const fallback = ruleDrafts(deal, offer);
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let replacedCount = 0;
  const drafts = (['friendly', 'firm', 'final'] as const).map((tone, i) => {
    const problem = templateProblem(tone, obj[tone], p);
    if (!problem) {
      const d = toDraft(tone, fillTemplate(obj[tone] as string, p), deal, offer, p);
      if (d.withinLimits) return d;
    }
    replacedCount++;
    return { ...fallback[i], replaced: true };
  });
  return { drafts, replacedCount };
}

/** What the guard offers instead of a blocked reply. */
export function saferVersion(deal: Deal, offer?: Offer): Draft | null {
  const p = planDrafts(deal, offer);
  if (!p) return null;
  const text = p.isAuto
    ? fillTemplate(`I'm looking for {ASK_RATE} APR. Can you get there?`, p)
    : fillTemplate(p.askFees !== undefined ? `I'm looking for {ASK_RATE} with {ASK_FEES} in fees. Can you get there?` : `I'm looking for {ASK_RATE}. Can you get there?`, p);
  const g = guardDraft(text, deal, offer);
  return { tone: 'safer', label: TONE_LABEL.safer, text, withinLimits: g.ok, reveals: g.reveals, askRate: p.askRate, askFees: p.askFees };
}
