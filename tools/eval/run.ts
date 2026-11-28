// Measures the code that always runs on the phone: the leak guard, the scam rules and the
// rule-based quote reader. Run: npx tsx tools/eval/run.ts [file.json]   (EVAL_SET=heldout for the held-out set)
// The model paths (on-device or cloud) are not measured here: they need a device or a key.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkScam, extractOffer, guardDraft, sampleDeals } from '../../src/engine';
import type { Offer } from '../../src/engine';

const dir = join(__dirname, '..', '..', 'eval');
// EVAL_SET=heldout reads eval/heldout-*.json: cases written before the rule changes, never used for tuning.
const prefix = process.env.EVAL_SET === 'heldout' ? 'heldout-' : '';
const load = (f: string) => JSON.parse(readFileSync(join(dir, prefix + f), 'utf8'));

type LeakCase = { text: string; expect: 'block' | 'allow'; group: string; form?: string };
type ScamCase = { text: string; expect: 'scam' | 'not-scam' };
type QuoteCase = { text: string; expect: Partial<Record<keyof Offer, number>> };

const deal = sampleDeals(new Date('2026-11-28T12:00:00Z'))[0];
const theirOffer: Offer = { rate: 6.4, fees: 1850, termMonths: 360, rateType: 'fixed', addOns: [] };

// ---- leak guard
const leak: LeakCase[] = load('leak-cases.json');
const byGroup: Record<string, { n: number; right: number; misses: string[] }> = {};
const byForm: Record<string, { n: number; right: number }> = {};
for (const c of leak) {
  const g = guardDraft(c.text, deal, theirOffer);
  const blocked = !g.ok;
  const right = (c.expect === 'block') === blocked;
  const key = `${c.expect === 'block' ? 'leak' : 'safe'} · ${c.group}`;
  (byGroup[key] ??= { n: 0, right: 0, misses: [] }).n++;
  if (right) byGroup[key].right++;
  else byGroup[key].misses.push(c.text + (blocked ? `  [stopped: ${g.violations.map((v) => v.kind).join(', ')}]` : ''));
  if (c.form) {
    (byForm[c.form] ??= { n: 0, right: 0 }).n++;
    if (right) byForm[c.form].right++;
  }
}
const leaks = leak.filter((c) => c.expect === 'block');
const safes = leak.filter((c) => c.expect === 'allow');
const caught = leaks.filter((c) => !guardDraft(c.text, deal, theirOffer).ok).length;
const wrongly = safes.filter((c) => !guardDraft(c.text, deal, theirOffer).ok).length;

// ---- scam rules
const scam: ScamCase[] = load('scam-cases.json');
const scams = scam.filter((c) => c.expect === 'scam');
const legit = scam.filter((c) => c.expect === 'not-scam');
const scamMissed = scams.filter((c) => !checkScam(c.text).isScam).map((c) => c.text);
const falseAlarms = legit.filter((c) => checkScam(c.text).isScam).map((c) => c.text + `  [${checkScam(c.text).reasons.map((r) => r.id).join(', ')}]`);

// ---- quote reading
const quotes: QuoteCase[] = load('quote-cases.json');
const fields: Record<string, { n: number; right: number }> = {};
let allRight = 0;
const quoteMisses: string[] = [];
for (const q of quotes) {
  const o = extractOffer(q.text) as unknown as Record<string, number | undefined>;
  let ok = true;
  for (const [k, v] of Object.entries(q.expect)) {
    (fields[k] ??= { n: 0, right: 0 }).n++;
    const got = o[k];
    if (got !== undefined && Math.abs(got - (v as number)) < 1e-6) fields[k].right++;
    else {
      ok = false;
      quoteMisses.push(`${k}: expected ${v}, got ${got ?? 'nothing'} · ${q.text.replace(/\n/g, ' / ').slice(0, 90)}`);
    }
  }
  if (ok) allRight++;
}

const results = {
  leakGuard: { leaks: leaks.length, caught, safe: safes.length, wronglyStopped: wrongly, byGroup, byForm },
  scamRules: { scams: scams.length, caught: scams.length - scamMissed.length, legit: legit.length, falseAlarms: falseAlarms.length, missed: scamMissed, falseAlarmTexts: falseAlarms },
  quoteReading: { quotes: quotes.length, fullyRight: allRight, fields, misses: quoteMisses },
};
// Optional: a file name under eval/results/ to save the numbers to.
if (process.argv[2]) writeFileSync(join(dir, 'results', process.argv[2]), JSON.stringify(results, null, 1) + '\n');

const pct = (a: number, b: number) => `${a}/${b} (${Math.round((1000 * a) / b) / 10}%)`;
console.log(`Leak guard: stopped ${pct(caught, leaks.length)} leaks; wrongly stopped ${pct(wrongly, safes.length)} safe replies`);
for (const [k, v] of Object.entries(byGroup)) console.log(`  ${k}: ${v.right}/${v.n}` + (v.misses.length ? `\n    - ${v.misses.slice(0, 12).join('\n    - ')}` : ''));
console.log('  walk-away rate, by how it is written:');
for (const [k, v] of Object.entries(byForm)) console.log(`    ${k}: ${v.right}/${v.n}`);
console.log(`Scam rules: caught ${pct(scams.length - scamMissed.length, scams.length)} scams; false alarms on ${pct(falseAlarms.length, legit.length)} lender texts`);
for (const t of scamMissed) console.log('  missed: ' + t);
for (const t of falseAlarms) console.log('  false alarm: ' + t);
console.log(`Quote reading: ${pct(allRight, quotes.length)} quotes fully right`);
for (const [k, v] of Object.entries(fields)) console.log(`  ${k}: ${v.right}/${v.n}`);
for (const t of quoteMisses) console.log('  ' + t);
