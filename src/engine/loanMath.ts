// Plain arithmetic. No model is ever asked to do this.

/** Standard amortising payment. Rate is an annual percentage, e.g. 6.4. */
export function monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
  if (!(principal > 0) || !(termMonths > 0)) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  const f = Math.pow(1 + r, termMonths);
  return (principal * r * f) / (f - 1);
}

export function totalInterest(principal: number, annualRatePct: number, termMonths: number): number {
  return monthlyPayment(principal, annualRatePct, termMonths) * termMonths - principal;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** How much less the second rate costs each month and over the whole loan. */
export function savings(principal: number, termMonths: number, fromRate: number, toRate: number) {
  const a = round2(monthlyPayment(principal, fromRate, termMonths));
  const b = round2(monthlyPayment(principal, toRate, termMonths));
  const monthly = round2(a - b);
  return { monthly, lifetime: round2(monthly * termMonths) };
}

/** Months until paying `upfront` (points or fees) is repaid by a lower monthly payment. */
export function breakEvenMonths(upfront: number, monthlySaving: number): number | undefined {
  if (!(monthlySaving > 0) || !(upfront > 0)) return undefined;
  return Math.ceil(upfront / monthlySaving);
}

/** Works a principal back out of a quoted payment, for dealer quotes that give only $/mo. */
export function principalFromPayment(payment: number, annualRatePct: number, termMonths: number): number {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return payment * termMonths;
  const f = Math.pow(1 + r, termMonths);
  return (payment * (f - 1)) / (r * f);
}

/** Midpoint between target and walk-away, rounded down to 0.05 and kept strictly below walk-away. */
export function finalOfferRate(targetRate: number, maxRate: number): number {
  if (maxRate <= targetRate) return targetRate;
  let mid = Math.floor(((targetRate + maxRate) / 2) * 20 + 1e-9) / 20;
  if (mid >= maxRate) mid = targetRate;
  if (mid < targetRate) mid = targetRate;
  return Math.round(mid * 100) / 100;
}
