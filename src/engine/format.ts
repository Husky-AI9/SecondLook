import type { CreditBand, Deal, LoanType } from './types';

export function money(n: number, opts: { cents?: boolean } = {}): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const fixed = opts.cents ? v.toFixed(2) : Math.round(v).toString();
  const [int, dec] = fixed.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + '$' + withCommas + (dec ? '.' + dec : '');
}

/** 6.4 -> "6.40%", 8.9 -> "8.9%" when short is true. */
export function pct(n: number, short = false): string {
  // Mortgage rates come in eighths: 6.375% stays 6.375%, not 6.38%.
  const places = Math.round(n * 1000) % 10 !== 0 ? 3 : 2;
  if (short) {
    const s = n.toFixed(places).replace(/0$/, '');
    return s.replace(/\.0$/, '') + '%';
  }
  return n.toFixed(places) + '%';
}

/** Rounds to a friendly "about" figure: 16426.8 -> 16400. */
export function roundAbout(n: number): number {
  const a = Math.abs(n);
  const step = a >= 10000 ? 100 : a >= 1000 ? 50 : a >= 100 ? 10 : 1;
  return Math.round(n / step) * step;
}

export function termLabel(months: number, rateType: 'fixed' | 'arm' = 'fixed', loanType?: LoanType): string {
  if (loanType === 'auto' || months % 12 !== 0 || months < 120) return `${months} months`;
  return `${months / 12}-yr ${rateType === 'arm' ? 'ARM' : 'fixed'}`;
}

export function loanTypeLabel(t: LoanType): string {
  return t === 'mortgage' ? 'Mortgage' : t === 'refinance' ? 'Refinance' : 'Car loan';
}

export function shortDealLabel(d: Pick<Deal, 'loanType' | 'lender'>): string {
  const kind = d.loanType === 'mortgage' ? 'Mortgage' : d.loanType === 'refinance' ? 'Refi' : 'Car';
  const first = d.lender.trim().split(/\s+/)[0] || 'Deal';
  return `${kind} · ${first}`;
}

export function amountBand(amount: number): string {
  if (amount < 50000) {
    const lo = Math.floor(amount / 10000) * 10;
    return `$${lo}–${lo + 10}k`;
  }
  const lo = Math.floor(amount / 100000) * 100;
  return `$${lo}–${lo + 100}k`;
}

export function creditBandLabel(b: CreditBand): string {
  switch (b) {
    case '740+':
      return 'credit 740+';
    case '670-739':
      return 'credit 670–739';
    case '580-669':
      return 'credit 580–669';
    case 'under-580':
      return 'credit under 580';
    default:
      return 'credit not given';
  }
}

/** A person's first name, or undefined for a role such as "Finance desk" or "Sales team". */
export function firstName(full?: string): string | undefined {
  const name = (full || '').trim();
  if (!name || /\b(desk|team|dept|department|office|sales|support|service|manager|group|center|centre|line)\b/i.test(name)) return undefined;
  const f = name.split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'’-]{1,20}$/.test(f) ? f : undefined;
}

export function initial(name?: string): string {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
