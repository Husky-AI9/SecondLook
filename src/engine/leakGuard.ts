import type { Deal, GuardResult, Offer, Violation } from './types';
import { rateMentions } from './rates';

// The leak guard is code. It checks every reply (ours or the user's own wording) against the
// PIN-locked limits before it can be sent. A model may add a second opinion on wording, but a
// model is never the only thing standing between the walk-away number and the lender.

const ACCEPT = /\b(i can do|i could do|i'?ll take|i will take|i accept|we accept|accept(ed)?\b|works for me|that works|ok(ay)? with|fine with|agree(d)? to|let'?s (do|lock|go)|go ahead|deal at|i'?m good with|sounds good|happy with|i'?d take|would take)\b/i;
const CEILING = /\b(highest|most|max(imum)?|top|ceiling|walk[- ]?away|limit|cap|no higher than|can'?t go (above|over|higher)|won'?t go (above|over|higher))\b/i;
const QUOTE = /\b(another|other|different|competing|second) (lender|bank|offer|quote|dealer|broker|credit union)|\belsewhere\b|\boffered me\b|\bquote from\b|\bquoted me\b|\bpre-?approv(ed|al)\b.{0,30}\b(at|for)\b|\bbeat(s|ing)? (it|that|you)/i;
const CREDIT = /\b(credit score|credit rating|fico|my credit|our credit|my score|our scores?)\b/i;
// "excellent credit" says your band even without a number.
const CREDIT_BAND_WORDS = /\b(excellent|great|perfect|strong|solid|good|fair|poor|bad) (credit|fico)\b/i;
const CREDIT_NUMBER = /\b[3-8]\d{2}s?\b|\b(high|mid|low)[- ]?[5-8]00s\b/i;
const DEADLINE = /\b(need|have|must|got|want)( to)? (close|decide|sign|lock|buy|move|be done)\b[^.!?]{0,30}\bby\b|\bmy deadline\b|\bclosing (date )?(is|on)\b|\blease (is up|ends|expires)\b|\b(need|want) (it|this|the car|the loan|to close) by\b|\bbefore (my|our) (closing|lease|move)\b|\brunning out of time\b|\bin a hurry\b/i;

// Rates however they are written: "6.25%", "6.25", "six and a quarter", "6¼%", "625 bps".
const percents = rateMentions;

function dollars(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(parseFloat(m[1].replace(/,/g, '')));
  return out;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0);
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

export function guardDraft(text: string, deal: Deal, latestOffer?: Offer): GuardResult {
  const violations: Violation[] = [];
  const reveals: string[] = [];
  const limits = deal.limits;
  const theirRate = latestOffer ? latestOffer.rate ?? latestOffer.apr : undefined;
  const all = percents(text);

  if (limits) {
    // 1. The walk-away number itself.
    const namesWalkAway = all.some((p) => same(p, limits.maxRate)) && !same(limits.maxRate, limits.targetRate);
    const quotingThem = theirRate !== undefined && same(theirRate, limits.maxRate);
    if (namesWalkAway && !quotingThem) {
      violations.push({
        kind: 'walk-away',
        title: 'Hold on before you send',
        why: "This gives away your walk-away rate. Once a lender knows the highest number you'll accept, that is usually the number you get.",
      });
    }

    // 2. Agreeing to more than the limits.
    for (const s of sentences(text)) {
      if (!ACCEPT.test(s) && !CEILING.test(s)) continue;
      const overRate = percents(s).some((p) => p > limits.maxRate + 0.0005);
      const feeTalk = /\bfees?\b|\bclosing costs?\b|\borigination\b/i.test(s);
      const overFees = feeTalk && dollars(s).some((d) => d > limits.maxFees + 0.5 && d < 100000);
      if ((overRate || overFees) && !violations.some((v) => v.kind === 'exceeds-limits')) {
        violations.push({
          kind: 'exceeds-limits',
          title: 'This agrees to more than your limits',
          why: 'You locked the most you would accept. This reply goes past it. Change the limits with your PIN if you mean to.',
        });
      }
    }
  }

  // 3. Competing quotes: only cite one you hold, and only if you allowed it.
  const citing = sentences(text).filter((s) => QUOTE.test(s));
  if (citing.length > 0) {
    const cq = deal.competingQuote;
    if (!cq) {
      violations.push({
        kind: 'unheld-quote',
        title: "You don't hold that quote",
        why: 'Your Deal File has no competing quote. Citing an offer you cannot show can end a negotiation the moment they ask to see it.',
      });
    } else if (!deal.reveal.competingQuote) {
      violations.push({
        kind: 'reveal-quote',
        title: 'You chose not to mention this',
        why: 'Your limits say a reply may not mention your competing quote.',
      });
    } else {
      const cited = citing.flatMap(percents);
      const better = cited.some((p) => p < cq.rate - 0.0005);
      const claimsWritten = /\b(in writing|written)\b/i.test(citing.join(' ')) && !cq.inWriting;
      if (better || claimsWritten) {
        violations.push({
          kind: 'unheld-quote',
          title: "That isn't the quote you hold",
          why: better
            ? 'This cites a better rate than the quote in your Deal File. Only cite what you can show.'
            : 'Your Deal File says the other quote is not in writing. Only say "written" if it is.',
        });
      } else {
        reveals.push('your competing quote');
      }
    }
  }

  // 4. Credit score.
  const credit = (CREDIT.test(text) && (CREDIT_NUMBER.test(text) || /\b(excellent|great|good|fair|poor|bad)\b/i.test(text) || /\bcredit('s| is| score is)\b/i.test(text))) || CREDIT_BAND_WORDS.test(text);
  if (credit) {
    if (!deal.reveal.creditBand) {
      violations.push({ kind: 'reveal-credit', title: 'You chose not to mention this', why: 'Your limits say a reply may not mention your credit score band.' });
    } else {
      reveals.push('your credit score band');
    }
  }

  // 5. Deadline. Telling a lender you are short of time is giving away leverage.
  const mentionsDeadline = DEADLINE.test(text) || (!!deal.deadline && deal.deadline.length >= 3 && text.toLowerCase().includes(deal.deadline.toLowerCase()) && /\b(my|our|i|we)\b/i.test(text));
  if (mentionsDeadline) {
    if (!deal.reveal.deadline) {
      violations.push({ kind: 'reveal-deadline', title: 'You chose not to mention this', why: 'Your limits say a reply may not mention your deadline.' });
    } else {
      reveals.push('your deadline');
    }
  }

  return { ok: violations.length === 0, violations, reveals: reveals.length ? reveals : ['nothing private'] };
}

export function revealsLine(reveals: string[]): string {
  return 'Reveals: ' + reveals.join(', ');
}
