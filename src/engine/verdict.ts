import type { Benchmark, CheckResult, Deal, Offer } from './types';
import { effectiveRate, hasPricing } from './extract';
import { money, pct } from './format';
import { monthlyPayment, principalFromPayment, round2, totalInterest } from './loanMath';
import type { ScamCheck } from './scamRules';

// Decides the verdict from numbers. A model can read the message, but the judgement
// (overpriced or not, inside the limits or not) is always arithmetic.

export function rangeText(b: Benchmark, short = false): string {
  return `${pct(b.low, short)}–${pct(b.high, short)}`.replace('%–', '–');
}

function notesFor(offer: Offer, deal: Deal | undefined, text: string): string[] {
  const notes: string[] = [];
  const isAuto = deal ? deal.loanType === 'auto' : offer.termMonths !== undefined && offer.termMonths <= 96 && offer.apr !== undefined;
  const amount = offer.amount ?? deal?.amount;
  const rate = effectiveRate(offer);
  const term = offer.termMonths ?? deal?.termMonths;

  if (isAuto) {
    if (/\bdealer|finance desk|financing (desk|office)|we can do\b/i.test(text) || deal?.loanType === 'auto') {
      notes.push("Dealers can add their own markup to the rate. Ask for the lender's base rate.");
    }
    for (const a of offer.addOns) notes.push(`An add-on is bundled in: the ${a}. You can decline it.`);
    if (term !== undefined && term >= 72) notes.push(`${term} months keeps the payment low and the total cost high.`);
  } else {
    if (offer.points !== undefined && offer.points > 0 && amount) {
      notes.push(`${offer.points} point${offer.points === 1 ? '' : 's'} means about ${money((amount * offer.points) / 100)} paid upfront to buy the rate down. Ask for the no-points rate too.`);
    }
    if (offer.rateType === 'arm') notes.push('This is an adjustable rate. Ask when it first resets and what the cap is.');
    if (offer.rate !== undefined && offer.apr !== undefined && offer.apr - offer.rate >= 0.25) {
      notes.push('The APR is well above the rate, which usually means fees are rolled into the loan.');
    }
    if (offer.fees === undefined && rate !== undefined) notes.push('No fees were given. Ask for a Loan Estimate with every fee listed.');
    for (const a of offer.addOns) notes.push(`This includes an extra: the ${a}. Ask what it costs on its own.`);
    if (offer.expires) notes.push('A lock deadline is normal, and it is also pressure. Asking for a day to compare is reasonable.');
  }

  if (offer.monthlyPayment !== undefined && rate !== undefined && term && amount) {
    const expected = monthlyPayment(amount, rate, term);
    if (offer.monthlyPayment > expected * 1.02) {
      notes.push(`The quoted payment is about ${money(offer.monthlyPayment - expected)}/mo more than this rate and term alone would give. Ask what else is in it.`);
    }
  }
  return notes;
}

export function judge(text: string, offer: Offer, scam: ScamCheck, deal?: Deal): Omit<CheckResult, 'source'> {
  if (scam.isScam) {
    return {
      kind: 'scam',
      headline: "Likely a scam. Don't reply.",
      detail: scam.reasons[0]?.label ?? 'Several warning signs.',
      offer,
      scamReasons: scam.reasons,
      notes: [],
    };
  }

  if (!hasPricing(offer)) {
    return {
      kind: 'needs-info',
      headline: 'Not enough to judge yet',
      detail: 'No rate or payment in this message. Ask for the rate, APR, fees and term in writing.',
      offer,
      scamReasons: scam.reasons,
      notes: [],
    };
  }

  const rate = effectiveRate(offer);
  const limits = deal?.limits;
  const bench = deal?.benchmark;
  const amount = offer.amount ?? deal?.amount;
  const term = offer.termMonths ?? deal?.termMonths;
  const math: NonNullable<CheckResult['math']> = {};

  if (rate !== undefined && amount && term) {
    math.payment = round2(monthlyPayment(amount, rate, term));
    math.totalInterest = round2(totalInterest(amount, rate, term));
  } else if (offer.monthlyPayment !== undefined) {
    math.payment = offer.monthlyPayment;
  }

  const parts: string[] = [];
  let over = false;

  if (rate !== undefined && bench) {
    if (rate > bench.high + 0.0005) {
      over = true;
      parts.push(`Above today's ${rangeText(bench)}.`);
      if (amount && term) math.aboveRangeMonthly = round2(monthlyPayment(amount, rate, term) - monthlyPayment(amount, bench.high, term));
    } else if (rate < bench.low - 0.0005) {
      parts.push(`Below today's ${rangeText(bench)}. Check the fees and points.`);
    } else {
      parts.push(`Inside today's ${rangeText(bench)}.`);
    }
  }
  if (limits) {
    if (rate !== undefined && rate > limits.maxRate + 0.0005) {
      over = true;
      math.rateOverLimit = round2(rate - limits.maxRate);
      parts.push('The rate is over your limit.');
    }
    if (offer.fees !== undefined && offer.fees > limits.maxFees + 0.5) {
      over = true;
      math.feesOverLimit = round2(offer.fees - limits.maxFees);
      parts.push(`Fees are ${money(math.feesOverLimit)} over your limit.`);
    }
  }

  const notes = notesFor(offer, deal, text);

  if (over) {
    return { kind: 'overpriced', headline: 'Real offer, but overpriced', detail: parts.join(' '), offer, scamReasons: scam.reasons, notes, math };
  }
  if (!bench && !limits) {
    return {
      kind: 'needs-info',
      headline: 'Real offer, not compared yet',
      detail: "Set your limits or get today's range to see whether this is a good price.",
      offer,
      scamReasons: scam.reasons,
      notes,
      math,
    };
  }
  if (limits && parts.length === 0) parts.push('Within your limits.');
  else if (limits) parts.push('Within your limits.');
  return { kind: 'competitive', headline: 'Competitive offer', detail: parts.join(' '), offer, scamReasons: scam.reasons, notes, math };
}

/** Short badge text for lists. */
export function badgeFor(kind: CheckResult['kind'], withinLimits?: boolean): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  switch (kind) {
    case 'scam':
      return { label: 'Scam', tone: 'danger' };
    case 'overpriced':
      return { label: 'Overpriced', tone: 'warn' };
    case 'competitive':
      return { label: withinLimits === false ? 'Fair' : 'In limits', tone: 'ok' };
    default:
      return { label: 'Needs info', tone: 'neutral' };
  }
}

/** If only a payment was quoted, estimate the amount financed so the math can still run. */
export function inferAmount(offer: Offer): number | undefined {
  const rate = effectiveRate(offer);
  if (offer.amount !== undefined) return offer.amount;
  if (offer.monthlyPayment !== undefined && rate !== undefined && offer.termMonths) {
    return Math.round(principalFromPayment(offer.monthlyPayment, rate, offer.termMonths) / 100) * 100;
  }
  return undefined;
}

/**
 * Re-runs the arithmetic for a result that is already on screen, against the deal as it is
 * now (new limits, a freshly fetched range). No model call; the decoded numbers are reused.
 */
export function rejudge(result: CheckResult, text: string, deal?: Deal): CheckResult {
  if (result.kind === 'scam' || !deal) return result;
  const fresh = judge(text, result.offer, { score: 0, isScam: false, reasons: result.scamReasons, links: [] }, deal);
  return { ...fresh, source: result.source, redacted: result.redacted };
}
