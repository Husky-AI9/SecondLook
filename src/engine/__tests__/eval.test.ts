import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkScam, extractOffer, guardDraft, latestOffer, rateMentions, sampleDeals } from '../index';

const [refi] = sampleDeals(new Date('2026-11-28T12:00:00Z'));
const offer = latestOffer(refi);

// ---------- the four leaks the Nov 28 competitor report found ----------
test('leak guard: the walk-away rate written without %, in words, as ¼ or in basis points', () => {
  for (const text of [
    'The highest I can go is 6.25.',
    'Anything above six and a quarter percent is a no for me.',
    "I'm capped at 6¼%.",
    'Get me to 625 basis points and we have a deal.',
    'My walk-away number is six point two five.',
    'Between us, 6 and 1/4% is my number.',
  ]) {
    const g = guardDraft(text, refi, offer);
    assert.equal(g.ok, false, text);
    assert.equal(g.violations[0].kind, 'walk-away', text);
  }
});

test('leak guard: numbers that are not the walk-away rate stay allowed', () => {
  for (const text of [
    "That's only $6.25 a month difference.",
    'Can we do six months of escrow?',
    'Can you cover a quarter point of the fees?',
    'Is six and an eighth doable?',
    'My unit number is 625.',
    'Is 0.5 points worth it at this amount?',
    'Can we talk at six tomorrow?',
  ]) {
    assert.ok(guardDraft(text, refi, offer).ok, text);
  }
});

test('rate reader: every common way of writing a rate', () => {
  assert.deepEqual(rateMentions('6.25%'), [6.25]);
  assert.deepEqual(rateMentions('6.25 percent'), [6.25]);
  assert.deepEqual(rateMentions('six and three-eighths'), [6.375]);
  assert.deepEqual(rateMentions('6⅜%'), [6.375]);
  assert.deepEqual(rateMentions('6 3/8%'), [6.375]);
  assert.deepEqual(rateMentions('640 bps'), [6.4]);
  assert.deepEqual(rateMentions('seven point one two five percent'), [7.125]);
  assert.deepEqual(rateMentions('six percent flat'), [6]);
  assert.deepEqual(rateMentions('$6.25 a month, 2.5 years, 1.5 points, six months'), []);
});

test('scam rules: a warning about scams is not itself a scam', () => {
  assert.equal(checkScam('Note from Summit: we will never ask for your password or a gift card.').isScam, false);
  assert.equal(checkScam('Please pay the $650 appraisal fee before we order the appraisal: pay.summithomeloans.com').isScam, false);
  assert.equal(checkScam('To finalize your loan, buy $300 in Google Play gift cards and text us the codes.').isScam, true);
  assert.equal(checkScam('We can stop your foreclosure. Make all payments to us instead of your lender.').isScam, true);
});

test('quote reader: "Rate:" and "APR:" on separate lines are read separately', () => {
  const o = extractOffer('Here is your quote:\nRate: 6.375%\nAPR: 6.49%\nTerm: 30 years\nLender fees: $1,295\nPoints: 0');
  assert.equal(o.rate, 6.375);
  assert.equal(o.apr, 6.49);
  assert.equal(o.points, 0);
  assert.equal(o.fees, 1295);
});

// ---------- the published numbers (docs/EVAL.md) stay true ----------
function measure(set: 'tuned' | 'heldout') {
  const out = execFileSync(process.execPath, ['--import', 'tsx', join(__dirname, '..', '..', '..', 'tools', 'eval', 'run.ts')], {
    env: { ...process.env, EVAL_SET: set === 'heldout' ? 'heldout' : '' },
    encoding: 'utf8',
  });
  return out;
}
const published = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'eval', 'results', f), 'utf8'));

test('eval: today\'s code matches the published numbers in eval/results', () => {
  for (const [set, file] of [['tuned', 'tuned-after.json'], ['heldout', 'heldout-after.json']] as const) {
    const out = measure(set);
    const p = published(file);
    assert.match(out, new RegExp(`stopped ${p.leakGuard.caught}/${p.leakGuard.leaks} `), `${set} leak guard`);
    assert.match(out, new RegExp(`wrongly stopped ${p.leakGuard.wronglyStopped}/${p.leakGuard.safe} `), `${set} safe replies`);
    assert.match(out, new RegExp(`caught ${p.scamRules.caught}/${p.scamRules.scams} `), `${set} scams`);
    assert.match(out, new RegExp(`false alarms on ${p.scamRules.falseAlarms}/${p.scamRules.legit} `), `${set} false alarms`);
    assert.match(out, new RegExp(`${p.quoteReading.fullyRight}/${p.quoteReading.quotes} \\(`), `${set} quotes`);
  }
});
