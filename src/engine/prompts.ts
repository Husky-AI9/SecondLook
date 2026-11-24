// Every prompt the app sends, in one place. Each is a single call that returns everything
// the screen needs, because on-device models are throttled when called repeatedly.
// The [task:...] tag on the first line is for logs and tests; models ignore it.

const FENCE = '-----';

export function decodePrompt(message: string): string {
  return [
    '[task:decode]',
    'You read loan offers that lenders and car dealers send by text message.',
    'Read the message between the dashed lines and reply with only JSON, no other words:',
    '{"kind":"offer"|"scam"|"unclear","rate":number|null,"apr":number|null,"termMonths":number|null,"amount":number|null,"fees":number|null,"points":number|null,"monthlyPayment":number|null,"addOns":[string],"expires":string|null}',
    'Rules: use only numbers that appear in the message. Percentages are plain numbers (6.4, not 0.064).',
    'Use null when the message does not say. "kind" is "scam" if it asks for money, codes or personal details before any loan is paid out.',
    FENCE,
    message.slice(0, 1800),
    FENCE,
  ].join('\n');
}

export interface CounterPromptInput {
  message: string;
  isAuto: boolean;
  hasQuote: boolean;
  quoteWritten: boolean;
  hasFees: boolean;
  hasName: boolean;
  addOn?: string;
}

export function counterPrompt(c: CounterPromptInput): string {
  const rateWord = c.isAuto ? 'APR' : 'rate';
  const lines = [
    '[task:counter]',
    `You help a borrower reply by text message to a ${c.isAuto ? 'car dealer' : 'mortgage lender'}. Write three short replies to the message between the dashed lines.`,
    'Use these placeholders exactly as written. Never write a number, a percentage or a dollar amount yourself.',
    `{ASK_RATE} = the ${rateWord} the borrower is asking for`,
    `{FINAL_RATE} = the borrower's last and final ${rateWord}`,
  ];
  if (c.hasFees) lines.push('{ASK_FEES} = the fees the borrower is asking for');
  if (c.hasQuote) lines.push(`{QUOTE_RATE} = a competing quote the borrower holds. ${c.quoteWritten ? 'It is in writing.' : 'It is not in writing, so do not call it written.'}`);
  if (c.hasName) lines.push("{NAME} = the first name of the person who sent the message");
  lines.push(
    `"friendly": warm. ${c.hasQuote ? 'Mentions the competing quote {QUOTE_RATE} and asks them to match it.' : 'Asks whether they can get to {ASK_RATE}.'}${c.hasFees ? ' Asks for fees of {ASK_FEES}.' : ''}`,
    `"firm": direct. Says the borrower is ready to ${c.isAuto ? 'sign' : 'lock'} today at {ASK_RATE}${c.hasFees ? ' with {ASK_FEES} in fees' : ''}.`,
    `"final": says {FINAL_RATE}${c.hasFees ? ' with {ASK_FEES} in fees' : ''} is as far as the borrower can go.`,
  );
  if (c.addOn) lines.push(`Each reply also asks to remove the ${c.addOn}.`);
  lines.push(
    'Each reply is one or two sentences in plain words. No sign-off, no emojis.',
    `Do not mention deadlines, credit scores, budgets${c.hasQuote ? '' : ', other lenders'} or anything else about the borrower.`,
    'Reply with only JSON: {"friendly":"...","firm":"...","final":"..."}',
    FENCE,
    c.message.slice(0, 1200),
    FENCE,
  );
  return lines.join('\n');
}

export function explainPrompt(message: string): string {
  return [
    '[task:explain]',
    'Explain this loan message to someone with no finance background.',
    'Write three or four short lines, each under 25 words, each starting with "- ".',
    'Say what is being offered, what each term means, and one question worth asking.',
    'Do not say whether to accept it.',
    FENCE,
    message.slice(0, 1800),
    FENCE,
  ].join('\n');
}

export function wordingPrompt(draft: string): string {
  return [
    '[task:wording]',
    'A borrower is about to send this reply to a lender.',
    'Does it state or strongly hint at the highest rate or cost the borrower would accept, or that the borrower is in a hurry?',
    'Reply with only JSON: {"leaks": true|false, "why": "one short sentence"}',
    FENCE,
    draft.slice(0, 800),
    FENCE,
  ].join('\n');
}

/** Terms only, no message text: safe for any model, so this one uses true hybrid routing. */
export function glossaryPrompt(terms: string[]): string {
  return [
    '[task:glossary]',
    'In one plain sentence each, say what these loan terms mean for a borrower:',
    terms.slice(0, 6).join(', '),
    'One line per term, starting with the term and a colon.',
  ].join('\n');
}
