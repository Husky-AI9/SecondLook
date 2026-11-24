// Preview-only fake of the Firebase JS SDK surface that src/ai/platform.web.ts calls.
// It lets the browser tests drive every routing case (on-device, cloud fallback, offline,
// bad JSON) and records each call so the tests can assert what would have left the device.
// window.__mock controls it:
//   { onDevice: boolean, cloud: boolean, badJson?: boolean, leakyDrafts?: boolean, remote?: {...}, calls: [] }
import { extractOffer } from '../../../src/engine/extract';

const w = globalThis as any;
const mock = () => (w.__mock ||= { onDevice: false, cloud: true, calls: [] });

export function initializeApp(cfg: unknown) {
  return { cfg };
}
export function getApps() {
  return [];
}
export class GoogleAIBackend {}
export const InferenceMode = { PREFER_ON_DEVICE: 'prefer_on_device', ONLY_ON_DEVICE: 'only_on_device', ONLY_IN_CLOUD: 'only_in_cloud', PREFER_IN_CLOUD: 'prefer_in_cloud' } as const;
export type AI = { app: unknown };
export type GenerationConfig = { temperature?: number; responseMimeType?: string; [k: string]: unknown };
export type FirebaseApp = { cfg: unknown };
export function getAI(app: unknown, _opts: unknown): AI {
  return { app };
}

function between(prompt: string): string {
  const parts = prompt.split('-----');
  return parts.length >= 3 ? parts[1].trim() : '';
}

function brain(prompt: string): string {
  const m = mock();
  const task = /^\[task:(\w+)\]/.exec(prompt)?.[1];
  if (m.badJson && task !== 'explain') return 'Sure, happy to help with that!';
  const msg = between(prompt);
  switch (task) {
    case 'decode': {
      const o = extractOffer(msg);
      return JSON.stringify({ kind: 'offer', rate: o.rate ?? null, apr: o.apr ?? null, termMonths: o.termMonths ?? null, amount: o.amount ?? null, fees: o.fees ?? null, points: o.points ?? null, monthlyPayment: o.monthlyPayment ?? null, addOns: o.addOns, expires: o.expires ?? null });
    }
    case 'counter': {
      const fees = prompt.includes('{ASK_FEES}');
      const quote = prompt.includes('{QUOTE_RATE} =');
      const name = prompt.includes('{NAME} =') ? ' {NAME}' : '';
      if (m.leakyDrafts) return JSON.stringify({ friendly: `Thanks${name}, could you do {ASK_RATE}?`, firm: 'Honestly 6.25% is the most I could ever pay, so {ASK_RATE} please.', final: '{FINAL_RATE} is it. I need to close by Friday.' });
      return JSON.stringify({
        friendly: quote ? `Appreciate it${name}. I'm holding a written {QUOTE_RATE} from another lender. Could you match that${fees ? ' and get fees down to {ASK_FEES}' : ''}?` : `Appreciate it${name}. Is there room to get to {ASK_RATE}${fees ? ' with fees at {ASK_FEES}' : ''}?`,
        firm: `I can commit today at {ASK_RATE}${fees ? ' with {ASK_FEES} in fees' : ''}. Does that work on your side?`,
        final: `My best and last number is {FINAL_RATE}${fees ? ' with {ASK_FEES} in fees' : ''}. If you can do it, send it over.`,
      });
    }
    case 'explain':
      return '- They are offering a loan at the rate shown, held until the date they give.\n- Fees are what you pay the lender at signing, on top of interest.\n- Ask which of the fees are their own and can be reduced.';
    case 'wording':
      return JSON.stringify(/end of what i can|almost at my|running out/i.test(msg) ? { leaks: true, why: 'It hints that you are close to your ceiling.' } : { leaks: false, why: '' });
    case 'benchmark':
      return 'Here is what I found.\n```json\n{"low": 6.05, "high": 6.30}\n```';
    case 'glossary':
      return 'APR: the yearly cost with fees.\nPoints: a fee paid upfront for a lower rate.';
    default:
      return 'ok';
  }
}

export function getGenerativeModel(_ai: AI, params: any) {
  return {
    async generateContent(prompt: string) {
      const m = mock();
      if (m.delayMs) await new Promise((r) => setTimeout(r, m.delayMs));
      const mode = params.mode as string;
      let source: 'ON_DEVICE' | 'IN_CLOUD';
      if (mode === 'only_on_device') {
        if (!m.onDevice) throw new Error('on-device model unavailable');
        source = 'ON_DEVICE';
      } else if (mode === 'only_in_cloud') {
        if (!m.cloud) throw new Error('offline');
        source = 'IN_CLOUD';
      } else {
        if (m.onDevice) source = 'ON_DEVICE';
        else if (m.cloud) source = 'IN_CLOUD';
        else throw new Error('offline and no on-device model');
      }
      const tools = params.inCloudParams?.tools;
      (m.calls ||= []).push({ mode, source, prompt, model: params.inCloudParams?.model, grounded: !!tools });
      const text = brain(prompt);
      const grounded = source === 'IN_CLOUD' && tools;
      return {
        response: {
          text: () => text,
          inferenceSource: source,
          candidates: [
            grounded
              ? {
                  groundingMetadata: {
                    webSearchQueries: ['30 year fixed refinance rates today'],
                    searchEntryPoint: { renderedContent: '<div>search suggestions</div>' },
                    groundingChunks: [{ web: { uri: 'https://example.com/rates-today', title: 'Example rate survey' } }, { web: { uri: 'https://example.org/weekly', title: 'Example weekly average' } }],
                  },
                }
              : {},
          ],
        },
      };
    },
  };
}

// firebase/app-check
export class ReCaptchaEnterpriseProvider {
  constructor(public key: string) {}
}
export function initializeAppCheck(_app: unknown, opts: unknown) {
  mock().appCheck = opts;
}

// firebase/remote-config
export function getRemoteConfig(_app: unknown) {
  return { settings: {} as Record<string, unknown>, defaultConfig: {} as Record<string, string> };
}
export async function fetchAndActivate(_rc: unknown) {
  return true;
}
export function getValue(rc: { defaultConfig: Record<string, string> }, key: string) {
  return { asString: () => (mock().remote && mock().remote[key]) ?? rc.defaultConfig[key] ?? '' };
}

// firebase/auth
export function getAuth(_app: unknown) {
  return {};
}
export async function signInAnonymously(_auth: unknown) {
  mock().signedIn = true;
  return { user: { uid: 'anon' } };
}
