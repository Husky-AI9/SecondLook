import type { Offer } from './types';

// Reads the numbers out of a lender's message with plain patterns. This runs before and
// after the model: before, so offline mode still works; after, as a cross-check so a number
// the model invented never reaches the screen.

const ADD_ONS: [RegExp, string][] = [
  [/protection (package|plan)/i, 'protection package'],
  [/\bgap\b( insurance| coverage)?/i, 'GAP insurance'],
  [/extended warranty/i, 'extended warranty'],
  [/service contract/i, 'service contract'],
  [/paint (protection|sealant)/i, 'paint protection'],
  [/tire (and|&) wheel/i, 'tire and wheel cover'],
  [/credit (life|disability)/i, 'credit insurance'],
  [/vin etch/i, 'VIN etching'],
  [/maintenance (plan|package)/i, 'maintenance plan'],
  [/rate lock fee/i, 'rate lock fee'],
];

function num(s: string, suffix?: string): number {
  let v = parseFloat(s.replace(/,/g, ''));
  if (suffix && /k/i.test(suffix)) v *= 1000;
  if (suffix && /m/i.test(suffix)) v *= 1000000;
  return v;
}

export function extractOffer(text: string): Offer {
  const offer: Offer = { addOns: [] };
  const t = text.replace(/ /g, ' ');

  // Percentages: "8.9% APR" is an APR, anything else is the note rate. Emails often mention
  // other percentages first ("your current rate is 7.125%", "20% down", "75% LTV"): those
  // are not the offer, so they are skipped.
  const pctRe = /(\d{1,2}(?:\.\d{1,3})?)\s?(?:%|percent)(\s*(?:apr|a\.p\.r\.))?/gi;
  let m: RegExpExecArray | null;
  while ((m = pctRe.exec(t))) {
    const v = parseFloat(m[1]);
    if (!(v > 0 && v < 40)) continue;
    const before = t.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    const line = t.slice(Math.max(0, m.index - 40), m.index).split('\n').pop()!.toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24).toLowerCase();
    if (/\b(current(ly)?|existing|old|previous|prior|average|paying( about)?)( (interest )?rate| loan| mortgage| apr)?( is| was| of| at| sits at|:)?( (about|around|roughly))?\s*$/.test(line)) continue;
    if (/^\s*(down|ltv|loan[- ]to[- ]value|of (the )?(home|purchase|price|value)|equity|cash back|off)\b/.test(after)) continue;
    if (/(down payment|ltv|loan[- ]to[- ]value)( of| is| at|:)?\s*$/.test(line)) continue;
    const isApr = !!m[2] || /apr( of| is| at)?\s*$/.test(before);
    if (isApr) {
      if (offer.apr === undefined) offer.apr = v;
    } else if (offer.rate === undefined) {
      offer.rate = v;
    }
  }

  // Term.
  const yr = /(\d{1,2})[\s-]?(?:yr|year)s?\b/i.exec(t);
  const mo = /(\d{2,3})[\s-]?(?:months?|mos?\b)(?!\s*(?:ago))/i.exec(t);
  if (yr) offer.termMonths = parseInt(yr[1], 10) * 12;
  else if (mo) offer.termMonths = parseInt(mo[1], 10);
  if (/\barm\b|adjustable/i.test(t)) offer.rateType = 'arm';
  else if (/\bfixed\b/i.test(t)) offer.rateType = 'fixed';

  // Dollar amounts, classified by the words around them.
  const moneyRe = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s?([kKmM]\b)?/g;
  while ((m = moneyRe.exec(t))) {
    const v = num(m[1] + (m[2] || ''), m[3]);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 28).toLowerCase();
    const before = t.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
    if (/^\s?(\/\s?mo|per month|a month|monthly|\/month)/.test(after) || /(payment of|payments of)\s*$/.test(before)) {
      if (offer.monthlyPayment === undefined) offer.monthlyPayment = v;
    } else if (
      /^\s?(in |of )?(total )?(lender |closing |origination |doc(ument)? )?(fees?|closing costs?|costs)/.test(after) ||
      /(fees?|closing costs?|origination)( of| are| is| at|:| to)?\s*$/.test(before)
    ) {
      if (offer.fees === undefined) offer.fees = v;
    } else if (/^\s?(loan|financed|mortgage|refi|principal)/.test(after) || /(loan( amount)?( of)?|financ(e|ing)|borrow(ing)?)\s*$/.test(before)) {
      if (offer.amount === undefined) offer.amount = v;
    } else if (v >= 10000 && offer.amount === undefined) {
      offer.amount = v;
    }
  }

  const pts = /(\d(?:\.\d{1,3})?)\s?(?:discount )?points?\b/i.exec(t) || /\b(?:discount )?points?\s*[:=]\s*(\d(?:\.\d{1,3})?)\b/i.exec(t);
  if (pts) offer.points = parseFloat(pts[1]);
  else if (/\bno points\b|\bzero points\b/i.test(t)) offer.points = 0;

  for (const [re, label] of ADD_ONS) if (re.test(t) && !offer.addOns.includes(label)) offer.addOns.push(label);

  const exp =
    /(?:lock|offer|rate|quote|deal|pricing)\s+(?:ends|expires|is good (?:until|through|thru|till)|good (?:until|through|thru|till)|valid (?:until|through|thru|till))\s+(?:on\s+)?((?:mon|tues|wednes|thurs|fri|satur|sun)day|today|tomorrow|tonight|eod|end of (?:day|week|month)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Z][a-z]{2,8}\.? \d{1,2}(?:st|nd|rd|th)?)/i.exec(
      t,
    );
  if (exp) offer.expires = exp[1].charAt(0).toUpperCase() + exp[1].slice(1);

  return offer;
}

/** True when a number can be found in the message text, in any common spelling. */
export function evidenced(text: string, n: number, kind: 'pct' | 'money' | 'months' | 'points' = 'money'): boolean {
  const flat = text.replace(/,/g, '').toLowerCase();
  const variants = new Set<string>();
  variants.add(String(n));
  variants.add(n.toFixed(1));
  variants.add(n.toFixed(2));
  variants.add(n.toFixed(3));
  if (Number.isInteger(n)) variants.add(String(n));
  if (kind === 'money' && n >= 1000) {
    if (n % 1000 === 0) variants.add(n / 1000 + 'k');
    variants.add((n / 1000).toString() + 'k');
  }
  if (kind === 'months' && n % 12 === 0) {
    const y = n / 12;
    if (new RegExp(`\\b${y}[\\s-]?(yr|year)`).test(flat)) return true;
  }
  for (const v of variants) {
    const re = new RegExp(`(^|[^\\d.])${v.replace('.', '\\.')}(?![\\d])`);
    if (re.test(flat)) return true;
  }
  return false;
}

/**
 * Combines what the model read with what the patterns read.
 * Patterns win where both have a value; a model-only value is kept only if the number
 * really appears in the message.
 */
export function mergeOffers(text: string, fromRules: Offer, fromModel?: Partial<Offer> | null): Offer {
  const out: Offer = { ...fromRules, addOns: [...fromRules.addOns] };
  if (!fromModel) return out;
  const take = <K extends 'rate' | 'apr' | 'amount' | 'fees' | 'points' | 'monthlyPayment' | 'termMonths'>(
    key: K,
    kind: 'pct' | 'money' | 'months' | 'points',
  ) => {
    const v = fromModel[key];
    if (out[key] === undefined && typeof v === 'number' && isFinite(v) && v >= 0 && evidenced(text, v, kind)) {
      out[key] = v;
    }
  };
  take('rate', 'pct');
  take('apr', 'pct');
  take('amount', 'money');
  take('fees', 'money');
  take('points', 'points');
  take('monthlyPayment', 'money');
  take('termMonths', 'months');
  if (!out.rateType && (fromModel.rateType === 'fixed' || fromModel.rateType === 'arm')) out.rateType = fromModel.rateType;
  if (!out.expires && typeof fromModel.expires === 'string' && fromModel.expires.length < 40) {
    if (text.toLowerCase().includes(fromModel.expires.toLowerCase())) out.expires = fromModel.expires;
  }
  if (Array.isArray(fromModel.addOns)) {
    for (const a of fromModel.addOns) {
      if (typeof a === 'string' && a.length < 60 && text.toLowerCase().includes(a.toLowerCase()) && !out.addOns.some((x) => x.toLowerCase() === a.toLowerCase())) {
        out.addOns.push(a);
      }
    }
  }
  return out;
}

/** The rate to use for payment math: the note rate if given, else the APR. */
export function effectiveRate(o: Offer): number | undefined {
  return o.rate ?? o.apr;
}

export function hasPricing(o: Offer): boolean {
  return effectiveRate(o) !== undefined || o.monthlyPayment !== undefined;
}
