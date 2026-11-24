import type { Deal, Limits, Offer, RevealPolicy } from './types';
import { latestOffer } from './deals';
import { shortDealLabel } from './format';
import { sha256 } from './pin';

// The "pack" is the small bundle the main app prepares for the keyboard panel: locked limits,
// Deal File facts and the cached market range. The keyboard does no setup of its own.
// It is shared through the keychain; if that fails on a sideloaded build, the same pack can be
// copied as a short code and imported in the keyboard with one tap.

export interface PackDeal {
  id: string;
  label: string;
  lender: string;
  contact?: string;
  loanType: Deal['loanType'];
  amount: number;
  termMonths: number;
  limits?: Limits;
  reveal: RevealPolicy;
  quote?: { rate: number; written: boolean };
  range?: { low: number; high: number; at: string; sample?: boolean };
  last?: Offer;
}

export interface Pack {
  v: 1;
  at: string;
  activeId?: string;
  deals: PackDeal[];
}

export function buildPack(deals: Deal[], activeId?: string): Pack {
  return {
    v: 1,
    at: new Date().toISOString(),
    activeId,
    deals: deals
      .filter((d) => d.status === 'open')
      .slice(0, 6)
      .map((d) => ({
        id: d.id,
        label: shortDealLabel(d),
        lender: d.lender,
        contact: d.contact,
        loanType: d.loanType,
        amount: d.amount,
        termMonths: d.termMonths,
        limits: d.limits,
        reveal: d.reveal,
        quote: d.competingQuote ? { rate: d.competingQuote.rate, written: d.competingQuote.inWriting } : undefined,
        range: d.benchmark ? { low: d.benchmark.low, high: d.benchmark.high, at: d.benchmark.fetchedAt, sample: d.benchmark.sample } : undefined,
        last: latestOffer(d),
      })),
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function fromBytes(b: number[]): string {
  let out = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp = c;
    if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63);
    out += String.fromCodePoint(cp);
  }
  return out;
}

export function b64urlEncode(s: string): string {
  const b = toBytes(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < b.length) out += B64[(n >> 6) & 63];
    if (i + 2 < b.length) out += B64[n & 63];
  }
  return out;
}

export function b64urlDecode(s: string): string {
  const b: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('bad character');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      b.push((buf >> bits) & 255);
    }
  }
  return fromBytes(b);
}

/** "SL1.<checksum>.<payload>" for clipboard import into the keyboard. */
export function packCode(pack: Pack): string {
  const payload = b64urlEncode(JSON.stringify(pack));
  return `SL1.${sha256(payload).slice(0, 8)}.${payload}`;
}

export function readPackCode(code: string): Pack | null {
  const m = /^SL1\.([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m || sha256(m[2]).slice(0, 8) !== m[1]) return null;
  try {
    const p = JSON.parse(b64urlDecode(m[2]));
    return p && p.v === 1 && Array.isArray(p.deals) ? (p as Pack) : null;
  } catch {
    return null;
  }
}
