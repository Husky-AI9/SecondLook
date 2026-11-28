import type { ScamReason } from './types';
import { extractOffer } from './extract';

// Scam checks are code, not a model, so they work with no model and no network.
// The list can be extended or re-weighted from Firebase Remote Config (key: scam_rules).

export interface ScamRule {
  id: string;
  label: string;
  weight: number;
  pattern?: string;
  flags?: string;
  /** Built-in checks that need more than one pattern. */
  builtin?: 'no-licence' | 'too-good' | 'link';
}

export interface ScamRuleSet {
  threshold: number;
  tooGoodApr: number;
  knownDomains: string[];
  rules: ScamRule[];
}

export const DEFAULT_RULES: ScamRuleSet = {
  threshold: 5,
  tooGoodApr: 3.5,
  knownDomains: [],
  rules: [
    {
      id: 'upfront-fee',
      label: 'Asks for a fee before any money is paid out',
      weight: 4,
      // Appraisal and credit-report fees are often paid up front to real lenders, so they don't count.
      pattern:
        '(pay|send|wire|deposit|remit|purchase|buy|need|requires?|required)\\b.{0,50}\\b(?<!appraisal |credit report )(fee|deposit|insurance|bond|tax|charge)s?\\b.{0,70}\\b(release|unlock|receive|claim|activate|proceed|process|fund|funding|hold|before|to get|first)' +
        '|\\b(processing|advance|insurance|release|activation|verification|transfer|reservation|enrollment)\\s+fee\\b.{0,50}\\b(today|now|first|before|release|upfront|up front)' +
        '|\\b(fee|deposit)s?\\b.{0,20}\\b(is |are )?(due|required|needed)\\b.{0,30}\\b(before|to (release|unlock|fund|lock|receive))' +
        '|\\b(pay|send|wire|deposit)\\s+(a |the |an )?\\$\\s?\\d[\\d,]*.{0,40}\\bto (activate|release|unlock|receive|get|claim)\\b' +
        '|upfront (fee|payment)|up-front (fee|payment)|payments? in advance',
      flags: 'is',
    },
    {
      id: 'pressure',
      label: 'Pressure to pay today',
      weight: 2,
      pattern:
        '\\b(pay|send|act|respond|claim|confirm|click)\\b.{0,40}\\b(today|now|immediately|right away|within \\d+ ?(hours?|hrs?|minutes?|mins?))|expires in \\d+ ?(min|hour)|before it expires|expires (soon|today|tonight)|(today|tonight|this week) only|limited (time|spots)|last chance|final notice|act fast|urgent',
      flags: 'is',
    },
    { id: 'no-licence', label: 'No lender name or licence number', weight: 1, builtin: 'no-licence' },
    { id: 'link', label: "Link goes to a site that isn't a known lender", weight: 2, builtin: 'link' },
    {
      id: 'guaranteed',
      label: 'Promises approval with no credit check',
      weight: 3,
      pattern: 'guaranteed approval|no credit check|100% approv|approval guaranteed|bad credit ok|everyone (is )?approved',
      flags: 'i',
    },
    {
      id: 'payment-method',
      label: 'Wants payment by gift card, crypto or wire',
      weight: 4,
      pattern: 'gift ?cards?|bitcoin|\\bcrypto|\\busdt\\b|western union|moneygram|\\bzelle\\b|cash ?app|wire transfer|\\b(by|via) wire\\b|prepaid (debit )?card',
      flags: 'i',
    },
    {
      id: 'sensitive',
      label: 'Asks for your SSN, PIN or bank login by text',
      weight: 4,
      pattern:
        '(send|reply with|text|confirm|verify|provide|share|enter|need|give us|what is|what\'s|photo of)\\b.{0,40}\\b(ssn|social security|bank (login|password|username)|(username|login) and password|online banking|routing number|account number|debit card|\\bpin\\b|one[- ]time (code|passcode)|verification code|\\botp\\b)',
      flags: 'is',
    },
    { id: 'too-good', label: 'Rate is far below anything on the market', weight: 2, builtin: 'too-good' },
    {
      id: 'foreclosure-rescue',
      label: 'Offers to stop a foreclosure if you pay them instead',
      weight: 4,
      pattern: '(stop|save|prevent) (your )?foreclosure|payments? to us instead|instead of (paying )?your (lender|bank|servicer)|stop (making |paying )?your (mortgage |bank )?payments|stop paying your (bank|lender|mortgage)',
      flags: 'i',
    },
    {
      id: 'shouting',
      label: 'Prize-style language',
      weight: 1,
      pattern: "\\bCONGRAT|\\bWINNER\\b|YOU('| HA)VE WON|you(’|'| ha)ve been selected|you (were|are) selected|pre-?approved.{0,40}(claim|click|release)",
      flags: 'i',
    },
  ],
};

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|info|biz|us|loans?|finance|xyz|top|site|online|click|link|example|app)\b(?:\/[^\s)]*)?/gi;

export function findLinks(text: string): string[] {
  return text.match(URL_RE) || [];
}

function domainOf(link: string): string {
  return link
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

/** Merges a Remote Config JSON string over the defaults. Bad JSON or bad patterns are ignored. */
export function compileRules(json?: string | null, base: ScamRuleSet = DEFAULT_RULES): ScamRuleSet {
  if (!json) return base;
  try {
    const raw = JSON.parse(json);
    const out: ScamRuleSet = {
      threshold: typeof raw.threshold === 'number' ? raw.threshold : base.threshold,
      tooGoodApr: typeof raw.tooGoodApr === 'number' ? raw.tooGoodApr : base.tooGoodApr,
      knownDomains: Array.isArray(raw.knownDomains) ? raw.knownDomains.filter((d: unknown) => typeof d === 'string') : base.knownDomains,
      rules: base.rules.map((r) => ({ ...r })),
    };
    if (Array.isArray(raw.rules)) {
      for (const r of raw.rules) {
        if (!r || typeof r.id !== 'string') continue;
        const existing = out.rules.find((x) => x.id === r.id);
        if (r.disabled && existing) {
          out.rules = out.rules.filter((x) => x.id !== r.id);
          continue;
        }
        if (typeof r.pattern === 'string') {
          try {
            new RegExp(r.pattern, typeof r.flags === 'string' ? r.flags : 'i');
          } catch {
            continue;
          }
        }
        if (existing) {
          if (typeof r.weight === 'number') existing.weight = r.weight;
          if (typeof r.label === 'string') existing.label = r.label;
          if (typeof r.pattern === 'string') {
            existing.pattern = r.pattern;
            existing.flags = typeof r.flags === 'string' ? r.flags : 'i';
          }
        } else if (typeof r.pattern === 'string' && typeof r.label === 'string') {
          out.rules.push({ id: r.id, label: r.label, weight: typeof r.weight === 'number' ? r.weight : 2, pattern: r.pattern, flags: typeof r.flags === 'string' ? r.flags : 'i' });
        }
      }
    }
    return out;
  } catch {
    return base;
  }
}

export interface ScamContext {
  /** Lender and contact names the user has on file; a message from them is less suspicious. */
  knownNames?: string[];
  /** Lowest rate in today's range, if we have one. */
  marketLow?: number;
}

export interface ScamCheck {
  score: number;
  isScam: boolean;
  reasons: ScamReason[];
  links: string[];
}

// "We will never ask for a gift card" is a warning, not a request. A match counts only if the
// words just before it, in the same sentence, don't say never / do not / won't.
function matchesNotNegated(re: RegExp, text: string): boolean {
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index).split(/[.!?\n]/).pop() ?? '';
    if (!/\b(never|not|no one|nobody|won'?t|don'?t|doesn'?t)\b/i.test(before)) return true;
    if (m[0].length === 0) re.lastIndex++;
  }
  return false;
}

export function checkScam(text: string, rules: ScamRuleSet = DEFAULT_RULES, ctx: ScamContext = {}): ScamCheck {
  const reasons: ScamReason[] = [];
  const links = findLinks(text);
  const lower = text.toLowerCase();
  const fromKnown = (ctx.knownNames || []).some((n) => n && n.length >= 3 && lower.includes(n.toLowerCase()));

  for (const r of rules.rules) {
    let hit = false;
    if (r.builtin === 'link') {
      hit = links.some((l) => !rules.knownDomains.includes(domainOf(l)));
    } else if (r.builtin === 'no-licence') {
      const hasLicence = /\bnmls\b|licen[cs]e\s*(no\.?|number|#)?\s*:?\s*\d{3,}/i.test(text);
      hit = !hasLicence && !fromKnown;
    } else if (r.builtin === 'too-good') {
      const o = extractOffer(text);
      const rate = o.apr ?? o.rate;
      const floor = ctx.marketLow !== undefined ? Math.min(rules.tooGoodApr, ctx.marketLow - 2) : rules.tooGoodApr;
      hit = (rate !== undefined && rate <= floor) || /\b0(?:\.0+)?\s?%\s*(apr|interest|financing)\b/i.test(text);
    } else if (r.pattern) {
      try {
        hit = matchesNotNegated(new RegExp(r.pattern, (r.flags ?? 'i').replace('g', '') + 'g'), text);
      } catch {
        hit = false;
      }
    }
    if (hit) reasons.push({ id: r.id, label: r.label, weight: r.weight });
  }

  // "No licence number" alone is normal for a text from a loan officer. It only counts
  // alongside another warning sign.
  const strong = reasons.filter((r) => r.id !== 'no-licence');
  const score = strong.length === 0 ? 0 : reasons.reduce((s, r) => s + r.weight, 0);
  const shown = strong.length === 0 ? [] : reasons;
  return { score, isScam: score >= rules.threshold, reasons: shown, links };
}

/** Plain guidance shown instead of a reply. */
export const BLOCK_AND_REPORT: string[] = [
  "Don't reply and don't tap the link.",
  'Block the number in your messaging app.',
  'In the US, forward the text to 7726 (SPAM) so your carrier can act on it.',
  'Report it at reportfraud.ftc.gov, and to the CFPB if it names a real lender.',
  'If you already paid or shared details, call your bank now using the number on your card.',
];
