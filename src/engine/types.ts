// Shared data model. Nothing in this folder imports React, React Native or Firebase,
// so the same engine runs in the app, in unit tests, and can be ported to the keyboard.

export type LoanType = 'mortgage' | 'refinance' | 'auto';
export type CreditBand = '740+' | '670-739' | '580-669' | 'under-580' | 'unknown';
export type InferenceSource = 'on-device' | 'cloud' | 'cloud-redacted' | 'offline-rules';
export type VerdictKind = 'scam' | 'needs-info' | 'overpriced' | 'competitive';
export type DraftTone = 'friendly' | 'firm' | 'final' | 'own' | 'safer';

export interface Offer {
  rate?: number; // note rate, percent
  apr?: number; // percent
  termMonths?: number;
  rateType?: 'fixed' | 'arm';
  amount?: number;
  fees?: number;
  points?: number;
  monthlyPayment?: number;
  addOns: string[];
  expires?: string;
}

/** Locked behind the PIN. maxRate is the walk-away number and must never appear in a reply. */
export interface Limits {
  maxRate: number;
  maxFees: number;
  targetRate: number;
}

export interface RevealPolicy {
  competingQuote: boolean;
  creditBand: boolean;
  deadline: boolean;
}

export interface CompetingQuote {
  rate: number;
  fees?: number;
  inWriting: boolean;
}

export interface SourceLink {
  title: string;
  url: string;
}

export interface Benchmark {
  low: number;
  high: number;
  fetchedAt: string; // ISO
  sources: SourceLink[];
  /** Exactly what was sent to the cloud, shown to the user as "What the cloud saw". */
  cloudSaw: string;
  /** True when this is bundled sample data, not a live lookup. */
  sample?: boolean;
  searchQueries?: string[];
  /** Google Search suggestions HTML that must be shown with a grounded result. */
  searchHtml?: string;
}

export interface Round {
  id: string;
  who: 'them' | 'you';
  text: string;
  at: string; // ISO
  offer?: Offer;
  verdict?: VerdictKind;
  source?: InferenceSource;
  tone?: DraftTone;
  reveals?: string[];
  /** For "you" rounds: the rate and fees that were asked for. */
  askRate?: number;
  askFees?: number;
}

export interface Deal {
  id: string;
  lender: string;
  contact?: string;
  loanType: LoanType;
  amount: number;
  termMonths: number;
  rateType: 'fixed' | 'arm';
  state?: string;
  creditBand: CreditBand;
  competingQuote?: CompetingQuote;
  deadline?: string;
  limits?: Limits;
  reveal: RevealPolicy;
  rounds: Round[];
  benchmark?: Benchmark;
  status: 'open' | 'accepted';
  createdAt: string;
}

export interface ScamReason {
  id: string;
  label: string;
  weight: number;
}

export interface CheckResult {
  kind: VerdictKind;
  headline: string;
  /** One line with the money first. */
  detail: string;
  offer: Offer;
  scamReasons: ScamReason[];
  notes: string[];
  source: InferenceSource;
  math?: {
    payment?: number;
    totalInterest?: number;
    aboveRangeMonthly?: number;
    feesOverLimit?: number;
    rateOverLimit?: number;
  };
  /** What was stripped before a cloud call, if one happened. */
  redacted?: string[];
}

export interface Draft {
  tone: DraftTone;
  label: string;
  text: string;
  withinLimits: boolean;
  reveals: string[];
  /** True when the model's wording was blocked and replaced by a rule-based draft. */
  replaced?: boolean;
  askRate?: number;
  askFees?: number;
}

export type ViolationKind =
  | 'walk-away'
  | 'exceeds-limits'
  | 'unheld-quote'
  | 'reveal-quote'
  | 'reveal-credit'
  | 'reveal-deadline';

export interface Violation {
  kind: ViolationKind;
  title: string;
  why: string;
}

export interface GuardResult {
  ok: boolean;
  violations: Violation[];
  reveals: string[];
}
