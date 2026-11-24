import type { Benchmark, Deal, SourceLink } from './types';
import { amountBand, creditBandLabel, loanTypeLabel, termLabel } from './format';
import { extractJson } from './parse';

// The market range is the one thing the cloud is asked for. It gets five coarse facts and
// nothing else. `cloudSaw` is built from the same object that builds the prompt, so the
// "What the cloud saw" card cannot drift from what was actually sent.

export interface CloudQuery {
  product: string;
  amountBand: string;
  credit: string;
  state?: string;
}

export function cloudQuery(deal: Deal): CloudQuery {
  const term = termLabel(deal.termMonths, deal.rateType, deal.loanType);
  const product = deal.loanType === 'auto' ? `${term} car loan` : `${term} ${loanTypeLabel(deal.loanType).toLowerCase()}`;
  return { product, amountBand: amountBand(deal.amount), credit: creditBandLabel(deal.creditBand), state: deal.state?.trim() || undefined };
}

export function cloudSawLine(q: CloudQuery): string {
  return [q.product, q.amountBand, q.credit, q.state].filter(Boolean).join(' · ');
}

export function benchmarkPrompt(q: CloudQuery): string {
  return [
    '[task:benchmark]',
    'Use Google Search to find what lenders in the United States are charging today.',
    `Product: ${q.product}.`,
    `Loan size: ${q.amountBand}.`,
    `Borrower: ${q.credit}.`,
    q.state ? `State: ${q.state}.` : '',
    'Give the typical range of interest rates (APR for car loans) a borrower like this is being offered this week.',
    'Reply with only this JSON and nothing else: {"low": number, "high": number}',
    'Both numbers are percentages, for example {"low": 6.05, "high": 6.30}.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseBenchmark(text: string): { low: number; high: number } | null {
  const j = extractJson(text) as { low?: unknown; high?: unknown } | null;
  let low = j && typeof j.low === 'number' ? j.low : NaN;
  let high = j && typeof j.high === 'number' ? j.high : NaN;
  if (!isFinite(low) || !isFinite(high)) {
    // Models sometimes answer in a sentence even when asked for JSON.
    const m = /(\d{1,2}(?:\.\d{1,3})?)\s?%?\s?(?:-|–|to|and)\s?(\d{1,2}(?:\.\d{1,3})?)\s?%/.exec(text);
    if (!m) return null;
    low = parseFloat(m[1]);
    high = parseFloat(m[2]);
  }
  if (low > high) [low, high] = [high, low];
  if (!(low > 0.5 && high < 30 && high - low <= 6)) return null;
  return { low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100 };
}

export function buildBenchmark(deal: Deal, range: { low: number; high: number }, sources: SourceLink[], extra: Partial<Benchmark> = {}): Benchmark {
  return {
    low: range.low,
    high: range.high,
    fetchedAt: new Date().toISOString(),
    sources: dedupe(sources).slice(0, 6),
    cloudSaw: cloudSawLine(cloudQuery(deal)),
    ...extra,
  };
}

function dedupe(sources: SourceLink[]): SourceLink[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/** Clearly-labelled sample numbers so the app can be explored before Firebase is set up. */
export function sampleBenchmark(deal: Deal): Benchmark {
  const range = deal.loanType === 'auto' ? { low: 6.4, high: 7.6 } : deal.termMonths <= 180 ? { low: 5.45, high: 5.75 } : { low: 6.05, high: 6.3 };
  return { ...buildBenchmark(deal, range, []), sample: true };
}

export function isStale(b: Benchmark, now = Date.now(), maxAgeHours = 24): boolean {
  return now - new Date(b.fetchedAt).getTime() > maxAgeHours * 3600 * 1000;
}
