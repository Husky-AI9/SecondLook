import type { Deal, LoanType, Offer, Round, VerdictKind } from './types';
import { judge } from './verdict';
import { effectiveRate } from './extract';
import { savings } from './loanMath';
import { firstName, loanTypeLabel, money, pct, termLabel } from './format';

export interface Won {
  monthly: number;
  lifetime: number;
  fees: number;
  fromRate: number;
  toRate: number;
  roundNumber: number;
}

export function theirRounds(deal: Deal): Round[] {
  return deal.rounds.filter((r) => r.who === 'them' && r.offer && effectiveRate(r.offer) !== undefined);
}

export function latestOffer(deal: Deal): Offer | undefined {
  const t = theirRounds(deal);
  return t.length ? t[t.length - 1].offer : undefined;
}

/** What the negotiation has won so far: first offer against the latest one. */
export function wonSoFar(deal: Deal): Won | null {
  const t = theirRounds(deal);
  if (t.length < 2) return null;
  const first = t[0].offer as Offer;
  const last = t[t.length - 1].offer as Offer;
  const fromRate = effectiveRate(first) as number;
  const toRate = effectiveRate(last) as number;
  const s = savings(deal.amount, deal.termMonths, fromRate, toRate);
  const fees = first.fees !== undefined && last.fees !== undefined ? first.fees - last.fees : 0;
  if (s.monthly <= 0 && fees <= 0) return null;
  return { monthly: s.monthly, lifetime: s.lifetime, fees, fromRate, toRate, roundNumber: t.length };
}

/** True when the latest offer is inside the deal's locked limits (undefined if no limits). */
export function guardLatest(deal: Deal): boolean | undefined {
  const o = latestOffer(deal);
  if (!o || !deal.limits) return undefined;
  const r = effectiveRate(o);
  if (r !== undefined && r > deal.limits.maxRate + 0.0005) return false;
  if (o.fees !== undefined && o.fees > deal.limits.maxFees + 0.5) return false;
  return true;
}

export function dealSubtitle(deal: Deal): string {
  return `${loanTypeLabel(deal.loanType)} · ${money(deal.amount)} · ${termLabel(deal.termMonths, deal.rateType, deal.loanType)}`;
}

export function dealListLine(deal: Deal): string {
  const o = latestOffer(deal);
  const kind = loanTypeLabel(deal.loanType);
  if (!o) return `${kind} · no offer yet`;
  if (deal.loanType === 'auto') {
    const r = effectiveRate(o);
    return `${kind} · ${r !== undefined ? pct(r, true) + ' APR' : 'payment quoted'}${o.termMonths ? `, ${o.termMonths} months` : ''}`;
  }
  const r = effectiveRate(o);
  return `${kind} · ${r !== undefined ? pct(r) : '—'} ${deal.status === 'accepted' ? 'accepted' : 'offered'}`;
}

export function guessLoanType(text: string): LoanType | undefined {
  if (/\b(car|vehicle|dealer(ship)?|auto|trade[- ]in|truck|suv|msrp)\b/i.test(text)) return 'auto';
  if (/\brefi(nance)?\b/i.test(text)) return 'refinance';
  if (/\b(mortgage|home loan|closing|escrow|30[- ]?(yr|year)|15[- ]?(yr|year)|purchase)\b/i.test(text)) return 'mortgage';
  return undefined;
}

/** Picks the deal a message most likely belongs to: by name, then by loan type. */
export function matchDeal(text: string, deals: Deal[], activeId?: string): Deal | undefined {
  const open = deals.filter((d) => d.status === 'open');
  const lower = text.toLowerCase();
  const byName = open.find((d) => {
    const names = [d.lender, d.contact].filter(Boolean) as string[];
    return names.some((n) => n.split(/\s+/).some((w) => w.length >= 4 && lower.includes(w.toLowerCase())));
  });
  if (byName) return byName;
  const type = guessLoanType(text);
  const o = /\bapr\b/i.test(text) && /\b\d{2,3}\s?months?\b/i.test(text) ? 'auto' : type;
  if (o) {
    const same = open.filter((d) => (o === 'auto' ? d.loanType === 'auto' : d.loanType !== 'auto'));
    if (same.length === 1) return same[0];
    const active = same.find((d) => d.id === activeId);
    if (active) return active;
  }
  return open.find((d) => d.id === activeId) ?? (open.length === 1 ? open[0] : undefined);
}

export function roundTitle(r: Round): string {
  if (r.who === 'you') return r.askRate !== undefined ? `Asked for ${pct(r.askRate)}` : 'Your reply';
  const rate = r.offer ? effectiveRate(r.offer) : undefined;
  return rate !== undefined ? pct(rate) : 'Message';
}

export function roundSubtitle(r: Round, deal: Deal): string {
  const who = r.who === 'you' ? 'You' : `${firstName(deal.contact) ?? deal.lender.split(/\s+/)[0]} offered`;
  const bits = [who];
  if (r.who === 'them') {
    if (r.offer?.fees !== undefined) bits.push(`${money(r.offer.fees)} in fees`);
    else if (r.offer?.monthlyPayment !== undefined) bits.push(`${money(r.offer.monthlyPayment)}/mo`);
  } else {
    if (r.askFees !== undefined) bits.push(`${money(r.askFees)} in fees`);
    if (r.reveals && r.reveals.includes('your competing quote')) bits.push('named your other quote');
  }
  return bits.join(' · ');
}

/**
 * The verdict for a stored round, worked out again from its numbers and the deal as it is
 * now. A badge is never stale after the user changes their limits or fetches a new range.
 */
export function roundKind(round: Round, deal: Deal): VerdictKind | undefined {
  if (round.who !== 'them' || !round.offer) return undefined;
  if (round.verdict === 'scam') return 'scam';
  return judge(round.text, round.offer, { score: 0, isScam: false, reasons: [], links: [] }, deal).kind;
}
