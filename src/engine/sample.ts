import type { Deal } from './types';

// Fictional sample content from the design, so the app can be explored (and the demo video
// recorded) without real quotes. Names, numbers and lenders are made up.

export const SAMPLE_MESSAGES = {
  lender: 'Hi Alex, good news. I can get you 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.',
  lenderRound2: 'Okay Alex, best I can do is 6.20% with $1,200 in fees. Lock ends Friday.',
  dealer: 'We can do $489/mo for 72 months at 8.9% APR. That includes the protection package.',
  scam: "CONGRATS! You're pre-approved for a $50,000 loan at 2.9% APR. Pay the $250 processing fee today to release your funds: fastfunds.example/claim",
  leak: 'Honestly, the highest I can go is 6.25%.',
};

export function sampleDeals(now = new Date()): Deal[] {
  const t = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString();
  const refi: Deal = {
    id: 'sample-summit',
    lender: 'Summit Home Loans',
    contact: 'Dana Ruiz',
    loanType: 'refinance',
    amount: 350000,
    termMonths: 360,
    rateType: 'fixed',
    state: 'Arizona',
    creditBand: '740+',
    competingQuote: { rate: 6.15, inWriting: true },
    deadline: 'Friday',
    limits: { maxRate: 6.25, maxFees: 1200, targetRate: 6.15 },
    reveal: { competingQuote: true, creditBand: false, deadline: false },
    benchmark: {
      low: 6.05,
      high: 6.3,
      fetchedAt: t(180),
      sources: [
        { title: 'Sample source A (not a live lookup)', url: 'https://example.com/rates-a' },
        { title: 'Sample source B (not a live lookup)', url: 'https://example.com/rates-b' },
      ],
      cloudSaw: '30-yr fixed refinance · $300–400k · credit 740+ · Arizona',
      sample: true,
    },
    rounds: [
      {
        id: 'r1',
        who: 'them',
        text: SAMPLE_MESSAGES.lender,
        at: t(120),
        offer: { rate: 6.4, termMonths: 360, rateType: 'fixed', fees: 1850, addOns: [], expires: 'Friday' },
        verdict: 'overpriced',
        source: 'on-device',
      },
      {
        id: 'r2',
        who: 'you',
        text: 'Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?',
        at: t(110),
        tone: 'friendly',
        reveals: ['your competing quote'],
        askRate: 6.15,
        askFees: 1200,
        source: 'on-device',
      },
      {
        id: 'r3',
        who: 'them',
        text: SAMPLE_MESSAGES.lenderRound2,
        at: t(30),
        offer: { rate: 6.2, fees: 1200, addOns: [], expires: 'Friday' },
        verdict: 'competitive',
        source: 'on-device',
      },
    ],
    status: 'open',
    createdAt: t(200),
  };
  const auto: Deal = {
    id: 'sample-ridgeline',
    lender: 'Ridgeline Auto',
    contact: 'Finance desk',
    loanType: 'auto',
    amount: 27200,
    termMonths: 72,
    rateType: 'fixed',
    state: 'Arizona',
    creditBand: '670-739',
    limits: { maxRate: 7.5, maxFees: 500, targetRate: 6.5 },
    reveal: { competingQuote: false, creditBand: false, deadline: false },
    rounds: [
      {
        id: 'a1',
        who: 'them',
        text: SAMPLE_MESSAGES.dealer,
        at: t(60),
        offer: { apr: 8.9, termMonths: 72, monthlyPayment: 489, addOns: ['protection package'] },
        verdict: 'overpriced',
        source: 'cloud-redacted',
      },
    ],
    status: 'open',
    createdAt: t(90),
  };
  return [refi, auto];
}
