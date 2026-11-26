import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlyPayment, round2, savings, finalOfferRate, breakEvenMonths,
  sha256, makePin, checkPin, isValidPin,
  extractOffer, mergeOffers, evidenced,
  checkScam, compileRules, DEFAULT_RULES,
  redact,
  guardDraft, ruleDrafts, finalizeDrafts, saferVersion, planDrafts, templateProblem, fillTemplate,
  judge, wonSoFar, matchDeal, latestOffer, dealListLine,
  cloudQuery, cloudSawLine, benchmarkPrompt, parseBenchmark, sampleBenchmark,
  extractJson, explainOffline, parseExplain,
  buildPack, packCode, readPackCode,
  checkMessage, draftCounter, explainMessage, checkOwnDraft,
  sampleDeals, SAMPLE_MESSAGES, money, pct, roundAbout, amountBand, shortDealLabel,
  decodePrompt, counterPrompt,
  type AiRouterLike, type Deal,
} from '../index';

const [refi, auto] = sampleDeals(new Date('2026-11-21T12:00:00Z'));

// ---------- loan math: the numbers written in the implementation plan ----------
test('payment at 6.40% and 6.20% on $350,000 matches the plan', () => {
  assert.equal(round2(monthlyPayment(350000, 6.4, 360)), 2189.27);
  assert.equal(round2(monthlyPayment(350000, 6.2, 360)), 2143.64);
});
test('savings after round 2: $45.63/mo, about $16,400 over the loan, $650 in fees', () => {
  const s = savings(350000, 360, 6.4, 6.2);
  assert.equal(s.monthly, 45.63);
  assert.equal(roundAbout(s.lifetime), 16400);
  const won = wonSoFar(refi)!;
  assert.equal(won.monthly, 45.63);
  assert.equal(won.fees, 650);
  assert.equal(won.roundNumber, 2);
});
test('zero-rate and bad inputs do not blow up', () => {
  assert.equal(monthlyPayment(12000, 0, 12), 1000);
  assert.equal(monthlyPayment(0, 5, 12), 0);
  assert.equal(breakEvenMonths(1000, 0), undefined);
  assert.equal(breakEvenMonths(1000, 50), 20);
});
test('final offer sits between target and walk-away, never on the walk-away', () => {
  assert.equal(finalOfferRate(6.15, 6.25), 6.2);
  assert.equal(finalOfferRate(6.5, 7.5), 7);
  assert.equal(finalOfferRate(6.2, 6.25), 6.2);
  assert.equal(finalOfferRate(6.25, 6.25), 6.25);
  for (const [t, m] of [[5.9, 6.0], [6.125, 6.375], [6.0, 6.05]] as const) {
    const f = finalOfferRate(t, m);
    assert.ok(f >= t && f < m, `${t}..${m} -> ${f}`);
  }
});

// ---------- formatting ----------
test('formatting', () => {
  assert.equal(money(350000), '$350,000');
  assert.equal(money(45.63, { cents: true }), '$45.63');
  assert.equal(pct(6.4), '6.40%');
  assert.equal(pct(8.9, true), '8.9%');
  assert.equal(pct(6.15, true), '6.15%');
  assert.equal(pct(6.375), '6.375%');
  assert.equal(pct(6.375, true), '6.375%');
  assert.equal(amountBand(350000), '$300–400k');
  assert.equal(amountBand(27200), '$20–30k');
  assert.equal(shortDealLabel(refi), 'Refi · Summit');
});

// ---------- PIN ----------
test('sha256 known vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});
test('PIN set and check', () => {
  const rec = makePin('4821', 'salt-1');
  assert.ok(checkPin('4821', rec));
  assert.ok(!checkPin('4822', rec));
  assert.ok(!checkPin('', rec));
  assert.ok(!isValidPin('12a4'));
  assert.notEqual(makePin('4821', 'salt-2').hash, rec.hash);
});

// ---------- extraction ----------
test('reads the sample lender text', () => {
  const o = extractOffer(SAMPLE_MESSAGES.lender);
  assert.equal(o.rate, 6.4);
  assert.equal(o.termMonths, 360);
  assert.equal(o.rateType, 'fixed');
  assert.equal(o.fees, 1850);
  assert.equal(o.expires, 'Friday');
  assert.equal(o.apr, undefined);
});
test('reads the sample dealer text', () => {
  const o = extractOffer(SAMPLE_MESSAGES.dealer);
  assert.equal(o.apr, 8.9);
  assert.equal(o.rate, undefined);
  assert.equal(o.termMonths, 72);
  assert.equal(o.monthlyPayment, 489);
  assert.deepEqual(o.addOns, ['protection package']);
});
test('reads other common phrasings', () => {
  const a = extractOffer('Rate 5.875% (APR 6.02%) on $412,500, 1 point, closing costs of $3,200. Offer good through 12/5.');
  assert.equal(a.rate, 5.875);
  assert.equal(a.apr, 6.02);
  assert.equal(a.amount, 412500);
  assert.equal(a.points, 1);
  assert.equal(a.fees, 3200);
  assert.equal(a.expires, '12/5');
  const b = extractOffer('7/1 ARM at 5.5%, no points, $300k loan');
  assert.equal(b.rateType, 'arm');
  assert.equal(b.amount, 300000);
  assert.equal(b.points, 0);
  const c = extractOffer('Call me back when you get a chance.');
  assert.equal(c.rate, undefined);
  assert.deepEqual(c.addOns, []);
});
test('reads a quote that arrives as an email', () => {
  const o = extractOffer(SAMPLE_MESSAGES.lenderEmail);
  assert.equal(o.rate, 6.375); // not the 7.125% current rate mentioned first
  assert.equal(o.apr, 6.512);
  assert.equal(o.termMonths, 360);
  assert.equal(o.rateType, 'fixed');
  assert.equal(o.amount, 360000);
  assert.equal(o.points, 0.5);
  assert.equal(o.fees, 1295);
  assert.equal(o.monthlyPayment, 2246);
  assert.equal(o.expires, 'Friday');
  assert.equal(checkScam(SAMPLE_MESSAGES.lenderEmail).isScam, false); // a signature link is not a scam
  // Redacted for the cloud with no Deal File to go on: the signature name and licence go too.
  const red = redact(SAMPLE_MESSAGES.lenderEmail).text;
  assert.ok(!/Dana|Ruiz|Alex|Summit|NMLS|summithomeloans/.test(red), red);
  assert.ok(red.includes('6.375%') && red.includes('$1,295'), red);
});
test('skips percentages that are not the offer', () => {
  assert.equal(extractOffer('With 20% down, I can do 6.25% on a 30-year fixed.').rate, 6.25);
  assert.equal(extractOffer("You're currently paying 7.1%. I can get you 6.3%.").rate, 6.3);
  assert.equal(extractOffer('At 35% LTV the rate is 6.05%.').rate, 6.05);
  assert.equal(extractOffer('Rates were up this week, but I can get you 6.40%.').rate, 6.4);
});
test('a number the model invented is dropped; a real one it found is kept', () => {
  const text = 'I can do 6.40% and the origination comes to 1850 dollars';
  const fromRules = extractOffer(text);
  assert.equal(fromRules.fees, undefined);
  const merged = mergeOffers(text, fromRules, { fees: 1850, points: 2, amount: 999999, addOns: ['unicorn cover'] });
  assert.equal(merged.fees, 1850);
  assert.equal(merged.points, undefined);
  assert.equal(merged.amount, undefined);
  assert.deepEqual(merged.addOns, []);
  assert.ok(evidenced('30-yr fixed', 360, 'months'));
  assert.ok(!evidenced('6.40%', 6.4 + 1, 'pct'));
});

// ---------- scam rules ----------
test('sample scam text is a scam with the four reasons from the design', () => {
  const s = checkScam(SAMPLE_MESSAGES.scam);
  assert.ok(s.isScam);
  const ids = s.reasons.map((r) => r.id);
  for (const id of ['upfront-fee', 'pressure', 'no-licence', 'link']) assert.ok(ids.includes(id), id);
});
test('real offers are not flagged', () => {
  for (const t of [SAMPLE_MESSAGES.lender, SAMPLE_MESSAGES.lenderRound2, SAMPLE_MESSAGES.dealer, 'Rate 5.875% (APR 6.02%), closing costs of $3,200. NMLS #123456']) {
    const s = checkScam(t, DEFAULT_RULES, { knownNames: ['Dana'] });
    assert.ok(!s.isScam, t);
  }
  assert.equal(checkScam(SAMPLE_MESSAGES.lender).reasons.length, 0);
});
test('other scam shapes', () => {
  assert.ok(checkScam('Your loan is approved! Send $150 in gift cards to activate. Guaranteed approval, no credit check.').isScam);
  assert.ok(checkScam('URGENT: verify your account. Reply with your SSN and bank login now to release funds http://bit.ly/x').isScam);
});
test('Remote Config can add, re-weight and disable rules; bad JSON is ignored', () => {
  const rs = compileRules(JSON.stringify({ threshold: 3, rules: [{ id: 'tax-refund', label: 'Mentions a tax refund advance', pattern: 'tax refund advance', weight: 3 }, { id: 'shouting', disabled: true }, { id: 'pressure', weight: 5 }, { id: 'broken', label: 'x', pattern: '(' }] }));
  assert.equal(rs.threshold, 3);
  assert.ok(rs.rules.some((r) => r.id === 'tax-refund'));
  assert.ok(!rs.rules.some((r) => r.id === 'shouting'));
  assert.ok(!rs.rules.some((r) => r.id === 'broken'));
  assert.equal(rs.rules.find((r) => r.id === 'pressure')!.weight, 5);
  assert.ok(checkScam('Get your tax refund advance now', rs).isScam);
  assert.equal(compileRules('{not json'), DEFAULT_RULES);
});

// ---------- redaction ----------
test('redaction removes identity and keeps loan numbers', () => {
  const r = redact('Hi Alex, this is Dana Ruiz from Summit Home Loans (NMLS #445566). 6.40% on $350,000, $1,850 in fees. Call 480-555-0142 or dana@summit.example, see summithomeloans.example/quote. Loan no 1234567890.', { names: ['Summit Home Loans', 'Dana Ruiz', 'Alex'] });
  for (const gone of ['Alex', 'Dana', 'Ruiz', 'Summit', '480-555-0142', 'dana@', 'summithomeloans', '445566', '1234567890']) assert.ok(!r.text.includes(gone), `${gone} still in: ${r.text}`);
  for (const kept of ['6.40%', '$350,000', '$1,850']) assert.ok(r.text.includes(kept), kept);
  assert.ok(r.removed.includes('names') && r.removed.includes('phone numbers') && r.removed.includes('links'));
});
test('redaction catches a greeting name it was never told', () => {
  const r = redact('Hey Jordan, I can do 7.1% for 60 months.');
  assert.ok(!r.text.includes('Jordan'));
  assert.ok(r.text.includes('7.1%'));
});

// ---------- leak guard ----------
test('blocks the walk-away number (the design example)', () => {
  const g = guardDraft(SAMPLE_MESSAGES.leak, refi, latestOffer(refi));
  assert.ok(!g.ok);
  assert.equal(g.violations[0].kind, 'walk-away');
  assert.equal(g.violations[0].title, 'Hold on before you send');
});
test('allows the three design drafts and reports what they reveal', () => {
  const first = refi.rounds[0].offer;
  const ok = [
    ['Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?', 'your competing quote'],
    ["I'm ready to lock today at 6.15% with $1,200 in fees. Can you do that?", 'nothing private'],
    ['6.20% with $1,200 in fees is as far as I can go. If that works, send the lock.', 'nothing private'],
  ];
  for (const [text, reveal] of ok) {
    const g = guardDraft(text, refi, first);
    assert.ok(g.ok, text + ' -> ' + JSON.stringify(g.violations));
    assert.deepEqual(g.reveals, [reveal]);
  }
});
test('blocks agreeing past the limits, unheld quotes, and switched-off reveals', () => {
  assert.equal(guardDraft('Fine, I can do 6.5% then.', refi).violations[0].kind, 'exceeds-limits');
  assert.equal(guardDraft('Okay with $2,000 in fees.', refi).violations[0].kind, 'exceeds-limits');
  assert.ok(guardDraft('6.40% is too high for me.', refi, refi.rounds[0].offer).ok, 'quoting their rate back is fine');
  assert.equal(guardDraft('Another lender offered me 5.9%.', refi).violations[0].kind, 'unheld-quote');
  assert.equal(guardDraft('Another dealer offered me 6%.', auto).violations[0].kind, 'unheld-quote');
  const noReveal: Deal = { ...refi, reveal: { ...refi.reveal, competingQuote: false } };
  assert.equal(guardDraft('I have a written 6.15% elsewhere.', noReveal).violations[0].kind, 'reveal-quote');
  const notWritten: Deal = { ...refi, competingQuote: { rate: 6.15, inWriting: false } };
  assert.equal(guardDraft('I have a written 6.15% elsewhere.', notWritten).violations[0].kind, 'unheld-quote');
  assert.equal(guardDraft('My credit score is 780, so I expect better.', refi).violations[0].kind, 'reveal-credit');
  assert.equal(guardDraft('I need to close by Friday so please hurry.', refi).violations[0].kind, 'reveal-deadline');
  const open: Deal = { ...refi, reveal: { competingQuote: true, creditBand: true, deadline: true } };
  const g = guardDraft('My credit score is 780 and I need to close by Friday.', open);
  assert.ok(g.ok);
  assert.deepEqual(g.reveals, ['your credit score band', 'your deadline']);
});

// ---------- drafts ----------
test('rule drafts reproduce the three replies in the design', () => {
  const d = ruleDrafts(refi, refi.rounds[0].offer);
  assert.equal(d[0].text, 'Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?');
  assert.equal(d[1].text, "I'm ready to lock today at 6.15% with $1,200 in fees. Can you do that?");
  assert.equal(d[2].text, '6.20% with $1,200 in fees is as far as I can go. If that works, send the lock.');
  assert.ok(d.every((x) => x.withinLimits));
  assert.deepEqual(d.map((x) => x.reveals[0]), ['your competing quote', 'nothing private', 'nothing private']);
  assert.equal(saferVersion(refi, refi.rounds[0].offer)!.text, "I'm looking for 6.15% with $1,200 in fees. Can you get there?");
});
test('no draft ever contains the walk-away number, across many limit settings', () => {
  for (const target of [5.5, 6, 6.15, 6.875]) {
    for (const gap of [0.05, 0.1, 0.125, 0.25, 0.5, 1]) {
      const maxRate = Math.round((target + gap) * 1000) / 1000;
      const deal: Deal = { ...refi, limits: { targetRate: target, maxRate, maxFees: 900 }, competingQuote: undefined };
      const all = [...ruleDrafts(deal, { rate: maxRate + 0.3, fees: 2000, addOns: [] }), saferVersion(deal, { rate: 7, fees: 2000, addOns: [] })!];
      for (const d of all) {
        assert.ok(d.withinLimits, `${target}/${maxRate}: ${d.text}`);
        assert.ok(!d.text.includes(pct(maxRate)), `${d.text} leaks ${maxRate}`);
      }
    }
  }
});
test('car loan drafts ask for APR and to drop the add-on; no quote is cited when none is held', () => {
  const d = ruleDrafts(auto, auto.rounds[0].offer);
  assert.equal(d[0].text, 'Thanks! Could you get the APR to 6.5% and take off the protection package?');
  assert.ok(d[1].text.includes('6.5% APR without the protection package'));
  assert.ok(d[2].text.startsWith('7% APR, no add-ons,'));
  assert.ok(d.every((x) => x.withinLimits && x.reveals[0] === 'nothing private'));
});
test('when the offer already meets the target, drafts accept and ask for it in writing', () => {
  const d = ruleDrafts(refi, { rate: 6.1, fees: 1000, addOns: [] });
  assert.ok(d[0].text.includes('6.10% works for me'));
  assert.ok(d.every((x) => x.withinLimits));
});
test('no limits means no drafts', () => {
  assert.deepEqual(ruleDrafts({ ...refi, limits: undefined }, refi.rounds[0].offer), []);
  assert.equal(planDrafts({ ...refi, limits: undefined }), null);
});
test('model templates are validated, filled on the phone, and replaced when unsafe', () => {
  const offer = refi.rounds[0].offer;
  const p = planDrafts(refi, offer)!;
  assert.equal(templateProblem('firm', 'Ready to lock at {ASK_RATE} today with {ASK_FEES} in fees.', p), null);
  assert.equal(templateProblem('firm', 'Ready to lock at 6.25% today.', p), 'missing placeholder');
  assert.equal(templateProblem('firm', 'Lock at {ASK_RATE}, or 6.3% at worst.', p), 'contains its own numbers');
  assert.equal(templateProblem('final', '{FINAL_RATE} or I walk. {SECRET}', p), 'unknown placeholder');
  assert.equal(fillTemplate('Hi {NAME}, {ASK_RATE} with {ASK_FEES}?', p), 'Hi Dana, 6.15% with $1,200?');
  const { drafts, replacedCount } = finalizeDrafts(
    {
      friendly: 'Appreciate it {NAME}. I hold a written {QUOTE_RATE} from another lender. Could you match that and get fees to {ASK_FEES}?',
      firm: 'I can lock today at {ASK_RATE}, though honestly 6.25% is my ceiling.',
      final: 'My last number is {FINAL_RATE} with {ASK_FEES} in fees. I need to close by Friday.',
    },
    refi,
    offer,
  );
  assert.equal(replacedCount, 2);
  assert.ok(drafts[0].text.startsWith('Appreciate it Dana. I hold a written 6.15%'));
  assert.ok(!drafts[0].replaced && drafts[1].replaced && drafts[2].replaced);
  assert.ok(drafts.every((d) => d.withinLimits && !d.text.includes('6.25')));
});

// ---------- verdict ----------
test('sample lender offer: real but overpriced, fees $650 over', () => {
  const o = extractOffer(SAMPLE_MESSAGES.lender);
  const v = judge(SAMPLE_MESSAGES.lender, o, checkScam(SAMPLE_MESSAGES.lender), refi);
  assert.equal(v.kind, 'overpriced');
  assert.equal(v.headline, 'Real offer, but overpriced');
  assert.equal(v.detail, "Above today's 6.05–6.30%. The rate is over your limit. Fees are $650 over your limit.");
  assert.equal(v.math!.payment, 2189.27);
  assert.equal(v.math!.feesOverLimit, 650);
  assert.ok(v.math!.aboveRangeMonthly! > 20 && v.math!.aboveRangeMonthly! < 25);
});
test('round 2 offer is competitive and within limits', () => {
  const o = extractOffer(SAMPLE_MESSAGES.lenderRound2);
  const v = judge(SAMPLE_MESSAGES.lenderRound2, o, checkScam(SAMPLE_MESSAGES.lenderRound2), refi);
  assert.equal(v.kind, 'competitive');
  assert.equal(v.detail, "Inside today's 6.05–6.30%. Within your limits.");
});
test('dealer offer gets the three plain-word notes from the design', () => {
  const o = extractOffer(SAMPLE_MESSAGES.dealer);
  const v = judge(SAMPLE_MESSAGES.dealer, o, checkScam(SAMPLE_MESSAGES.dealer), auto);
  assert.equal(v.kind, 'overpriced');
  assert.deepEqual(v.notes.slice(0, 3), [
    "Dealers can add their own markup to the rate. Ask for the lender's base rate.",
    'An add-on is bundled in: the protection package. You can decline it.',
    '72 months keeps the payment low and the total cost high.',
  ]);
});
test('needs-info when there is no price, or nothing to compare to', () => {
  assert.equal(judge('Call me', extractOffer('Call me'), checkScam('Call me')).kind, 'needs-info');
  const bare = judge(SAMPLE_MESSAGES.lender, extractOffer(SAMPLE_MESSAGES.lender), checkScam(SAMPLE_MESSAGES.lender));
  assert.equal(bare.kind, 'needs-info');
  assert.equal(bare.headline, 'Real offer, not compared yet');
});

// ---------- deals ----------
test('messages are matched to the right deal', () => {
  const deals = [refi, auto];
  assert.equal(matchDeal(SAMPLE_MESSAGES.dealer, deals, refi.id)!.id, auto.id);
  assert.equal(matchDeal(SAMPLE_MESSAGES.lender, deals, auto.id)!.id, refi.id);
  assert.equal(matchDeal('Dana here, 6.3% is my best', deals, auto.id)!.id, refi.id);
  assert.equal(matchDeal('hello', [], undefined), undefined);
  assert.equal(dealListLine(refi), 'Refinance · 6.20% offered');
  assert.equal(dealListLine(auto), 'Car loan · 8.9% APR, 72 months');
});

// ---------- benchmark ----------
test('the cloud query carries five coarse facts and nothing private', () => {
  const q = cloudQuery(refi);
  assert.equal(cloudSawLine(q), '30-yr fixed refinance · $300–400k · credit 740+ · Arizona');
  const prompt = benchmarkPrompt(q);
  for (const secret of ['Summit', 'Dana', 'Alex', '6.25', '6.15', '1,200', '1200', '350000', '350,000', 'Friday', '6.40']) assert.ok(!prompt.includes(secret), secret);
});
test('benchmark answers are parsed and sanity-checked', () => {
  assert.deepEqual(parseBenchmark('```json\n{"low": 6.05, "high": 6.3}\n```'), { low: 6.05, high: 6.3 });
  assert.deepEqual(parseBenchmark('Rates run from 6.1% to 6.45% this week.'), { low: 6.1, high: 6.45 });
  assert.deepEqual(parseBenchmark('{"low": 6.4, "high": 6.1}'), { low: 6.1, high: 6.4 });
  assert.equal(parseBenchmark('{"low": 0.06, "high": 0.07}'), null);
  assert.equal(parseBenchmark('{"low": 2, "high": 19}'), null);
  assert.equal(parseBenchmark('no idea'), null);
  // A grounded answer: notes from the search, then the JSON line. Ranges in the notes are ignored.
  assert.deepEqual(parseBenchmark('Bankrate shows 7.10% to 7.19% for top credit.\n\n{"low": 6.875, "high": 7.5}'), { low: 6.88, high: 7.5 });
  const p = benchmarkPrompt(cloudQuery(refi));
  assert.ok(/Search Google now/.test(p) && /Do not answer from memory/.test(p) && /End your answer with one line of JSON/.test(p), p);
  assert.ok(sampleBenchmark(refi).sample);
});

// ---------- parsing ----------
test('extractJson tolerates fences, chatter and trailing commas', () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"a": 1, "b": "x}y",}\n``` hope that helps'), { a: 1, b: 'x}y' });
  assert.equal(extractJson('nothing here'), null);
  assert.equal(extractJson('{"a": '), null);
});
test('explain falls back to a glossary and trims model bullets', () => {
  const pts = explainOffline(SAMPLE_MESSAGES.lender, extractOffer(SAMPLE_MESSAGES.lender), 350000, 360);
  assert.ok(pts[0].includes('$2,189'));
  assert.ok(pts.some((p) => p.startsWith('Rate lock:')));
  assert.deepEqual(parseExplain('- **First** point here\n2) Second point here\n\n• Third point here'), ['First point here', 'Second point here', 'Third point here']);
});

// ---------- pack ----------
test('the keyboard pack round-trips through a clipboard code and detects tampering', () => {
  const pack = buildPack([refi, auto], refi.id);
  assert.equal(pack.deals[0].label, 'Refi · Summit');
  assert.equal(pack.deals[0].last!.rate, 6.2);
  const code = packCode(pack);
  assert.deepEqual(readPackCode(code), JSON.parse(JSON.stringify(pack)));
  assert.equal(readPackCode(code.slice(0, -2) + 'AA'), null);
  assert.equal(readPackCode('hello'), null);
});

// ---------- pipeline with fake models ----------
function fakeAi(reply: (prompt: string) => string | null, source: 'on-device' | 'cloud-redacted' = 'on-device') {
  const seen: { privatePrompt: string; redactedPrompt: string | null }[] = [];
  const ai: AiRouterLike = {
    async runPrivate(a) {
      seen.push(a);
      const used = source === 'on-device' ? a.privatePrompt : a.redactedPrompt;
      if (used === null) return null;
      const text = reply(used);
      return text === null ? null : { text, source };
    },
  };
  return { ai, seen };
}

test('check: no model -> offline rules, same verdict', async () => {
  const r = await checkMessage(SAMPLE_MESSAGES.lender, { deal: refi });
  assert.equal(r.kind, 'overpriced');
  assert.equal(r.source, 'offline-rules');
});
test('check: on-device model output is merged and labelled on-device', async () => {
  const { ai, seen } = fakeAi(() => '{"kind":"offer","rate":6.4,"apr":null,"termMonths":360,"amount":null,"fees":1850,"points":null,"monthlyPayment":null,"addOns":[],"expires":"Friday"}');
  const r = await checkMessage(SAMPLE_MESSAGES.lender, { deal: refi, ai, userName: 'Alex' });
  assert.equal(r.source, 'on-device');
  assert.equal(r.kind, 'overpriced');
  assert.equal(seen.length, 1);
  assert.ok(seen[0].privatePrompt.includes('Hi Alex'));
  assert.ok(!seen[0].redactedPrompt!.includes('Alex'), 'the cloud copy has no name');
});
test('check: cloud fallback is labelled redacted and says what was removed', async () => {
  const { ai } = fakeAi(() => '{"kind":"offer","apr":8.9,"termMonths":72,"monthlyPayment":489,"addOns":["protection package"]}', 'cloud-redacted');
  const r = await checkMessage('Hi Alex, ' + SAMPLE_MESSAGES.dealer, { deal: auto, ai, userName: 'Alex' });
  assert.equal(r.source, 'cloud-redacted');
  assert.ok(r.redacted!.includes('names'));
});
test('check: bad JSON is retried once, then rules take over', async () => {
  let calls = 0;
  const { ai } = fakeAi(() => (++calls, 'I think this is a fine offer!'));
  const r = await checkMessage(SAMPLE_MESSAGES.lender, { deal: refi, ai });
  assert.equal(calls, 2);
  assert.equal(r.source, 'offline-rules');
  assert.equal(r.kind, 'overpriced');
});
test('check: a scam never reaches any model', async () => {
  const { ai, seen } = fakeAi(() => '{}');
  const r = await checkMessage(SAMPLE_MESSAGES.scam, { ai });
  assert.equal(r.kind, 'scam');
  assert.equal(r.source, 'offline-rules');
  assert.equal(seen.length, 0);
});
test('check: a model crash is survived', async () => {
  const ai: AiRouterLike = { runPrivate: async () => { throw new Error('throttled'); } };
  const r = await checkMessage(SAMPLE_MESSAGES.lender, { deal: refi, ai });
  assert.equal(r.source, 'offline-rules');
});
test('counter: the prompt never contains a limit, even on-device', async () => {
  const { ai, seen } = fakeAi(() => '{"friendly":"Thanks {NAME}! I have a written {QUOTE_RATE} in hand. Could you match it and take fees to {ASK_FEES}?","firm":"I am ready to lock today at {ASK_RATE} with {ASK_FEES} in fees.","final":"{FINAL_RATE} with {ASK_FEES} in fees is my last offer."}');
  const r = await draftCounter(refi, refi.rounds[0].offer, SAMPLE_MESSAGES.lender, { ai, userName: 'Alex' });
  assert.equal(r.source, 'on-device');
  assert.equal(r.replaced, 0);
  assert.equal(r.drafts[0].text, 'Thanks Dana! I have a written 6.15% in hand. Could you match it and take fees to $1,200?');
  for (const p of [seen[0].privatePrompt, seen[0].redactedPrompt!]) for (const secret of ['6.25', '6.15', '6.20', '1,200', '1200']) assert.ok(!p.includes(secret), secret);
  assert.ok(!seen[0].redactedPrompt!.includes('Alex') && !seen[0].redactedPrompt!.includes('Dana'));
});
test('counter: unusable model output falls back to rule drafts; no limits asks for setup', async () => {
  const { ai } = fakeAi(() => '{"friendly":"ok","firm":"6.25% is fine","final":""}');
  const r = await draftCounter(refi, refi.rounds[0].offer, SAMPLE_MESSAGES.lender, { ai });
  assert.equal(r.source, 'offline-rules');
  assert.equal(r.drafts.length, 3);
  const none = await draftCounter({ ...refi, limits: undefined }, refi.rounds[0].offer, SAMPLE_MESSAGES.lender, { ai });
  assert.ok(none.needsLimits);
});
test('explain: model bullets when good, glossary otherwise', async () => {
  const good = fakeAi(() => '- They offer a fixed rate for thirty years.\n- Fees are charged at closing.\n- Ask which fees are theirs.');
  assert.equal((await explainMessage(SAMPLE_MESSAGES.lender, { ai: good.ai })).source, 'on-device');
  const bad = fakeAi(() => 'ok');
  assert.equal((await explainMessage(SAMPLE_MESSAGES.lender, { ai: bad.ai })).source, 'offline-rules');
});
test('own wording: code blocks first; the model is only a second opinion and never the cloud', async () => {
  const { ai, seen } = fakeAi(() => '{"leaks": true, "why": "It says you are nearly out of room."}');
  const blocked = await checkOwnDraft(SAMPLE_MESSAGES.leak, refi, latestOffer(refi), { ai });
  assert.ok(!blocked.guard.ok);
  assert.equal(seen.length, 0);
  const soft = await checkOwnDraft('I am almost at the end of what I can stretch to.', refi, latestOffer(refi), { ai });
  assert.ok(soft.guard.ok);
  assert.equal(soft.advisory, 'It says you are nearly out of room.');
  assert.equal(seen[0].redactedPrompt, null);
});
test('prompts stay well inside the on-device limit (about 4,000 tokens)', () => {
  const long = 'x '.repeat(5000);
  assert.ok(decodePrompt(long).length < 6000);
  assert.ok(counterPrompt({ message: long, isAuto: false, hasQuote: true, quoteWritten: true, hasFees: true, hasName: true }).length < 6000);
});
test('redaction sweeps up names it was never told, mid-sentence', () => {
  const r = redact('Hi Alex, we can do 8.9% APR. Call Sam at Ridgeline Auto in Tempe by Friday, 480-555-0199.', { names: ['Ridgeline Auto', 'Alex'] });
  for (const gone of ['Alex', 'Sam', 'Ridgeline', 'Tempe', '480-555-0199']) assert.ok(!r.text.includes(gone), `${gone} still in: ${r.text}`);
  for (const kept of ['8.9% APR', 'Friday', 'Call']) assert.ok(r.text.includes(kept), `${kept} missing from: ${r.text}`);
});
