import type { Offer } from './types';
import { money, pct } from './format';
import { monthlyPayment } from './loanMath';

// Plain-words glossary used when no model is available, and to seed the model when one is.

const GLOSSARY: { re: RegExp; term: string; plain: string }[] = [
  { re: /\bapr\b/i, term: 'APR', plain: 'The yearly cost of the loan with most fees folded in. Compare APR to APR, not APR to rate.' },
  { re: /\bpoints?\b/i, term: 'Points', plain: 'A fee paid upfront to get a lower rate. One point is 1% of the loan.' },
  { re: /\block\b/i, term: 'Rate lock', plain: 'A promise to hold this rate until a set date. If it lapses, the rate can change.' },
  { re: /\bfixed\b/i, term: 'Fixed', plain: 'The rate stays the same for the whole loan.' },
  { re: /\barm\b|adjustable/i, term: 'ARM', plain: 'The rate is fixed for a few years, then moves with the market.' },
  { re: /\borigination\b/i, term: 'Origination fee', plain: 'What the lender charges to make the loan. It is negotiable.' },
  { re: /closing costs?/i, term: 'Closing costs', plain: 'All fees due at signing: the lender, title, appraisal and prepaid items.' },
  { re: /\bfees?\b/i, term: 'Fees', plain: 'Ask which fees are the lender\'s own. Those are the ones you can negotiate.' },
  { re: /\bgap\b/i, term: 'GAP insurance', plain: 'Covers the gap if the car is totalled and you owe more than it is worth. Optional, and often cheaper from your insurer.' },
  { re: /protection (package|plan)|extended warranty|service contract/i, term: 'Add-ons', plain: 'Extras sold with the loan. They are optional and raise the amount you finance.' },
  { re: /pre-?approv/i, term: 'Pre-approved', plain: 'A lender has looked at your credit and named terms. A real one never needs a fee to "release" it.' },
  { re: /\bpmi\b|mortgage insurance/i, term: 'PMI', plain: 'Insurance you pay when the down payment is under 20%. It protects the lender, not you.' },
  { re: /\bescrow\b/i, term: 'Escrow', plain: 'An account the lender uses to pay your taxes and insurance from your monthly payment.' },
  { re: /\b(72|84|96)\s?months?\b/i, term: 'Long term', plain: 'A longer loan lowers the payment and raises the total interest you pay.' },
];

export function explainOffline(text: string, offer: Offer, amount?: number, termMonths?: number): string[] {
  const out: string[] = [];
  const rate = offer.rate ?? offer.apr;
  const term = offer.termMonths ?? termMonths;
  const amt = offer.amount ?? amount;
  if (rate !== undefined && amt && term) {
    const p = monthlyPayment(amt, rate, term);
    out.push(`${pct(rate)} on ${money(amt)} over ${term} months is about ${money(p)} a month, and ${money(p * term - amt)} in interest in total.`);
  }
  for (const g of GLOSSARY) {
    if (g.re.test(text) && out.length < 5) out.push(`${g.term}: ${g.plain}`);
  }
  if (out.length === 0) out.push('There are no loan terms in this message to explain yet. Ask for the rate, APR, fees and term in writing.');
  return out;
}

/** Turns a model's free-text answer into at most four short bullets. */
export function parseExplain(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length > 8 && l.length < 320 && !/^\[task:/.test(l))
    .slice(0, 4);
}
