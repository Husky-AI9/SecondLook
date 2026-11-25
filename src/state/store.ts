import { useSyncExternalStore } from 'react';
import type { Benchmark, CheckResult, Deal, Limits, PinRecord, RevealPolicy, Round } from '../engine';
import { buildPack, checkPin, isValidPin, makePin, sampleDeals, uid } from '../engine';
import { nativeAi } from '../../modules/secondlook-ai';
import { getItem, getSecret, removeItem, removeSecret, setItem, setSecret } from '../platform/storage';

// One small store, no library. Screens subscribe with useStore(selector).

export type Route =
  | { name: 'home' }
  | { name: 'limits'; dealId?: string }
  | { name: 'keyboard' }
  | { name: 'settings' }
  | { name: 'dealFile'; dealId?: string; fromCheck?: boolean }
  | { name: 'verdict' }
  | { name: 'drafts'; dealId: string }
  | { name: 'rounds'; dealId: string };

export interface CheckSession {
  id: string;
  text: string;
  result: CheckResult;
  dealId?: string;
  roundId?: string;
}

export interface AiStatusView {
  configured: boolean;
  onDevice: string;
  reason?: string;
  checkedAt?: string;
}

export interface AppState {
  ready: boolean;
  profile: { name: string };
  deals: Deal[];
  activeDealId?: string;
  pin: PinRecord | null;
  settings: { appearance: 'system' | 'light' | 'dark'; cloudFallback: boolean };
  remote: Record<string, string>;
  // Session only (never saved):
  stack: Route[];
  unlocked: boolean;
  check: CheckSession | null;
  busy: string | null;
  toast: string | null;
  ai: AiStatusView;
  packShared: boolean | null;
  /** Chrome extension: the latest text the user sent from a web page (see src/platform/extension.ts). */
  page: { kind: 'theirs' | 'own'; text: string; at: number } | null;
}

const MAIN_KEY = 'secondlook.v1';
const SECRET_KEY = 'secondlook.secret.v1';
export const PACK_KEY = 'secondlook.pack.v1';

let state: AppState = {
  ready: false,
  profile: { name: '' },
  deals: [],
  activeDealId: undefined,
  pin: null,
  settings: { appearance: 'system', cloudFallback: true },
  remote: {},
  stack: [{ name: 'home' }],
  unlocked: false,
  check: null,
  busy: null,
  toast: null,
  ai: { configured: false, onDevice: 'unknown' },
  packShared: null,
  page: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

function set(patch: Partial<AppState>, persist = false) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (persist) schedulePersist();
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
    () => selector(state),
  );
}

// ---------- persistence ----------
let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void persistNow(), 150);
}

// All writes and erases go through one queue, so an erase can never be overtaken by a save
// that started just before it.
let queue: Promise<void> = Promise.resolve();
function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job, job);
  return queue;
}

export function persistNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  return enqueue(async () => {
    const s = state;
    // Limits and the PIN record live in the secure drawer; everything else in the ordinary one.
    const limits: Record<string, { limits?: Limits; reveal: RevealPolicy }> = {};
    const deals = s.deals.map((d) => {
      limits[d.id] = { limits: d.limits, reveal: d.reveal };
      const { limits: _l, ...rest } = d;
      return rest;
    });
    await setItem(MAIN_KEY, JSON.stringify({ profile: s.profile, deals, activeDealId: s.activeDealId, settings: s.settings, remote: s.remote }));
    await setSecret(SECRET_KEY, JSON.stringify({ pin: s.pin, limits }));
    // The keyboard also needs to know whether the redacted cloud fallback is allowed.
    const packJson = JSON.stringify({ ...buildPack(s.deals, s.activeDealId), cloudFallback: s.settings.cloudFallback });
    // iOS: the keyboard reads the pack from a keychain group shared with the app. The group
    // depends on who signed the build, so the native module works it out at run time.
    let shared = await setSecret(PACK_KEY, packJson);
    try {
      if (nativeAi?.sharedKeychainSet) shared = nativeAi.sharedKeychainSet(PACK_KEY, packJson).ok;
    } catch {
      shared = false;
    }
    if (shared !== state.packShared) set({ packShared: shared });
  });
}

async function load(): Promise<void> {
  const main = await getItem(MAIN_KEY);
  const secret = await getSecret(SECRET_KEY);
  const patch: Partial<AppState> = { ready: true };
  try {
    if (main) {
      const m = JSON.parse(main);
      const sec = secret ? JSON.parse(secret) : { pin: null, limits: {} };
      patch.profile = m.profile ?? state.profile;
      patch.settings = { ...state.settings, ...(m.settings ?? {}) };
      patch.remote = m.remote ?? {};
      patch.activeDealId = m.activeDealId;
      patch.pin = sec.pin ?? null;
      patch.deals = (m.deals ?? []).map((d: Deal) => ({
        ...d,
        limits: sec.limits?.[d.id]?.limits,
        reveal: sec.limits?.[d.id]?.reveal ?? d.reveal ?? { competingQuote: false, creditBand: false, deadline: false },
      }));
    }
  } catch {
    // Unreadable data: start clean rather than crash on launch.
  }
  set(patch);
}

// ---------- actions ----------
function mapDeal(id: string, fn: (d: Deal) => Deal) {
  set({ deals: state.deals.map((d) => (d.id === id ? fn(d) : d)) }, true);
}

export const actions = {
  load,

  // navigation
  go(route: Route) {
    set({ stack: [...state.stack, route] });
  },
  back() {
    if (state.stack.length > 1) set({ stack: state.stack.slice(0, -1) });
    else set({ stack: [{ name: 'home' }] });
  },
  tab(name: 'home' | 'limits' | 'keyboard') {
    set({ stack: [{ name }], unlocked: name === 'limits' ? state.unlocked : false });
  },
  resetTo(...routes: Route[]) {
    set({ stack: routes.length ? routes : [{ name: 'home' }] });
  },
  replace(route: Route) {
    set({ stack: [...state.stack.slice(0, -1), route] });
  },

  setBusy(busy: string | null) {
    set({ busy });
  },
  setPage(kind: 'theirs' | 'own', text: string) {
    set({ page: { kind, text, at: Date.now() }, stack: [{ name: 'keyboard' }] });
  },
  toast(msg: string | null) {
    set({ toast: msg });
    if (msg) setTimeout(() => state.toast === msg && set({ toast: null }), 2600);
  },
  setCheck(check: CheckSession | null) {
    set({ check });
  },
  setAi(ai: AiStatusView) {
    set({ ai });
  },
  setRemote(remote: Record<string, string>) {
    set({ remote: { ...state.remote, ...remote } }, true);
  },

  setName(name: string) {
    set({ profile: { name: name.slice(0, 40) } }, true);
  },
  setSettings(patch: Partial<AppState['settings']>) {
    set({ settings: { ...state.settings, ...patch } }, true);
  },

  setActive(id: string) {
    set({ activeDealId: id }, true);
  },
  upsertDeal(deal: Deal) {
    const exists = state.deals.some((d) => d.id === deal.id);
    set({ deals: exists ? state.deals.map((d) => (d.id === deal.id ? deal : d)) : [deal, ...state.deals], activeDealId: deal.id }, true);
  },
  removeDeal(id: string) {
    const deals = state.deals.filter((d) => d.id !== id);
    set({ deals, activeDealId: state.activeDealId === id ? deals[0]?.id : state.activeDealId }, true);
  },
  addRound(dealId: string, round: Omit<Round, 'id' | 'at'> & { id?: string; at?: string }): string {
    const id = round.id ?? uid('r');
    mapDeal(dealId, (d) => ({ ...d, rounds: [...d.rounds, { ...round, id, at: round.at ?? new Date().toISOString() }] }));
    return id;
  },
  updateRound(dealId: string, roundId: string, patch: Partial<Round>) {
    mapDeal(dealId, (d) => ({ ...d, rounds: d.rounds.map((r) => (r.id === roundId ? { ...r, ...patch } : r)) }));
  },
  setBenchmark(dealId: string, benchmark: Benchmark | undefined) {
    mapDeal(dealId, (d) => ({ ...d, benchmark }));
  },
  setStatus(dealId: string, status: Deal['status']) {
    mapDeal(dealId, (d) => ({ ...d, status }));
  },

  // limits + PIN
  unlock(pin: string): boolean {
    if (!state.pin) return false;
    const ok = checkPin(pin, state.pin);
    if (ok) set({ unlocked: true });
    return ok;
  },
  lock() {
    set({ unlocked: false });
  },
  /** Saves limits for a deal. Needs the screen to be unlocked, or a first PIN to be supplied. */
  saveLimits(dealId: string, limits: Limits, reveal: RevealPolicy, newPin?: string): 'ok' | 'need-pin' | 'bad-pin' {
    if (!state.pin) {
      if (!newPin || !isValidPin(newPin)) return 'bad-pin';
      set({ pin: makePin(newPin, uid('s')) });
    } else if (!state.unlocked) {
      return 'need-pin';
    } else if (newPin) {
      if (!isValidPin(newPin)) return 'bad-pin';
      set({ pin: makePin(newPin, uid('s')) });
    }
    mapDeal(dealId, (d) => ({ ...d, limits, reveal }));
    set({ unlocked: false });
    return 'ok';
  },

  loadSample() {
    const samples = sampleDeals();
    const keep = state.deals.filter((d) => !d.id.startsWith('sample-'));
    set({ deals: [...samples, ...keep], activeDealId: samples[0].id, profile: state.profile.name ? state.profile : { name: 'Alex' } }, true);
  },
  eraseAll(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    // Memory first, then storage, in the same queue as saves.
    set({ profile: { name: '' }, deals: [], activeDealId: undefined, pin: null, check: null, unlocked: false, remote: {}, stack: [{ name: 'home' }] });
    return enqueue(async () => {
      await removeItem(MAIN_KEY);
      await removeSecret(SECRET_KEY);
      await removeSecret(PACK_KEY);
      try {
        // Overwrite the keyboard's copy too, so nothing is left behind.
        nativeAi?.sharedKeychainSet?.(PACK_KEY, JSON.stringify(buildPack([], undefined)));
      } catch {
        /* no shared keychain in this build */
      }
    });
  },
};

export function currentRoute(s: AppState): Route {
  return s.stack[s.stack.length - 1];
}

export function findDeal(s: AppState, id?: string): Deal | undefined {
  return s.deals.find((d) => d.id === id);
}

export function activeDeal(s: AppState): Deal | undefined {
  return findDeal(s, s.activeDealId) ?? s.deals.find((d) => d.status === 'open') ?? s.deals[0];
}
