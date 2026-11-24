// Strips anything that identifies a person or a company before text may go to the cloud.
// Loan numbers (rates, dollar amounts, terms) are kept, because the cloud needs them to help.

export interface RedactContext {
  names?: (string | undefined)[];
}

export interface Redacted {
  text: string;
  removed: string[];
}

const NAME_STOP = new Set(['home', 'loans', 'loan', 'auto', 'bank', 'mortgage', 'credit', 'union', 'finance', 'financial', 'lending', 'the', 'and', 'group', 'desk', 'capital', 'first', 'national']);

/** Capitalised words that are loan vocabulary or dates, not names. */
const KEEP = new Set(
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december loan estimate rate lock closing disclosure fixed points apr arm gap fha va usda pmi vin nmls ok okay yes no hi hello hey thanks thank dear congrats'.split(
    ' ',
  ),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redact(text: string, ctx: RedactContext = {}): Redacted {
  const removed = new Set<string>();
  let t = text;
  const sub = (re: RegExp, to: string, label: string) => {
    const next = t.replace(re, to);
    if (next !== t) removed.add(label);
    t = next;
  };

  sub(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[email]', 'email addresses');
  sub(/\b(?:https?:\/\/|www\.)[^\s)]+/gi, '[link]', 'links');
  sub(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|info|biz|us|loans?|finance|xyz|top|site|online|click|link|example|app)\b(?:\/[^\s)]*)?/gi, '[link]', 'links');
  sub(/\b\d{3}-\d{2}-\d{4}\b/g, '[id number]', 'ID numbers');
  sub(/\bnmls\s*(?:id|no\.?|number)?\s*#?\s*:?\s*\d{3,}/gi, '[licence]', 'licence numbers');
  sub(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]', 'phone numbers');
  sub(/\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\b\.?/g, '[address]', 'addresses');
  // Long digit runs that are not dollar amounts: account, loan or reference numbers.
  sub(/(?<![$\d.,])\b\d{8,}\b/g, '[number]', 'account numbers');

  // Full names and company names from the Deal File, then their individual words.
  const names = (ctx.names || []).filter((n): n is string => !!n && n.trim().length >= 2);
  for (const full of names) {
    sub(new RegExp(`\\b${escapeRe(full.trim())}\\b`, 'gi'), '[name]', 'names');
  }
  for (const full of names) {
    for (const w of full.trim().split(/\s+/)) {
      if (w.length < 3 || NAME_STOP.has(w.toLowerCase())) continue;
      sub(new RegExp(`\\b${escapeRe(w)}\\b`, 'gi'), '[name]', 'names');
    }
  }
  // Greetings and sign-offs usually carry a first name even when we were not told it.
  sub(/\b([Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Tt]hanks|[Tt]hank you)[ ,]+(?!\[)([A-Z][a-z]{1,15})(?=[\s,.!])/g, '$1 [name]', 'names');
  sub(/(^|\n)\s*[-–—]\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s*$/g, '$1- [name]', 'names');
  sub(/\b([Tt]his is|[Ii]t's|[Ii]ts|[Ii] am|[Ii]'m)\s+(?!\[)([A-Z][a-z]{1,15})(\s+(?:from|at|with)\b)/g, '$1 [name]$3', 'names');
  sub(/\b(from|at|with)\s+(?!\[)((?:[A-Z][A-Za-z&]+\s){1,3}(?:Bank|Loans|Lending|Mortgage|Auto|Motors|Credit Union|Financial|Finance|Capital|Home Loans))\b/g, '$1 [name]', 'names');

  // Last sweep: any other Capitalised word in the middle of a sentence is treated as a name
  // or a place. Over-removing is fine here; the cloud only needs the loan numbers.
  const swept = t.replace(/\b[A-Z][a-z]{1,15}\b/g, (word: string, offset: number, whole: string) => {
    if (KEEP.has(word.toLowerCase())) return word;
    const before = whole.slice(0, offset);
    if (before.trim() === '' || /([.!?:]\s+|\n\s*|\]\s*)$/.test(before)) return word;
    return '[name]';
  });
  if (swept !== t) removed.add('names');
  t = swept;

  t = t.replace(/(\[name\])(\s+\[name\])+/g, '[name]');
  return { text: t, removed: [...removed] };
}

/** Human list for the "Not sent:" line. */
export function notSentLine(hasLimits: boolean, hasQuote: boolean): string {
  const parts = ['names', 'the message'];
  if (hasLimits) parts.push('your limits');
  if (hasQuote) parts.push('your other quote');
  return 'Not sent: ' + parts.join(', ') + '.';
}
