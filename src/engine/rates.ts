// Every way a rate tends to be written in a text, read into numbers: "6.25%", "6.25 percent",
// "6.25" on its own, "six and a quarter", "six point two five", "6¼%", "6 1/4%", "625 bps".
// Used by the leak guard, which must recognize the walk-away rate however it is typed.
// The Android and iPhone keyboards carry the same rules (KRules.rateMentions, Rules.rateMentions).

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};
const DIGITS: Record<string, number> = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const FRACTION_WORDS: Record<string, number> = {
  'a quarter': 0.25, 'one quarter': 0.25, 'a half': 0.5, 'one half': 0.5, 'three quarters': 0.75,
  'an eighth': 0.125, 'one eighth': 0.125, 'three eighths': 0.375, 'five eighths': 0.625, 'seven eighths': 0.875,
};
const FRACTION_CHARS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

const ONES_RE = Object.keys(ONES).join('|');
const DIGIT_RE = Object.keys(DIGITS).join('|');
const FRACTION_RE = 'a quarter|one quarter|a half|one half|three[- ]quarters|an eighth|one[- ]eighth|three[- ]eighths|five[- ]eighths|seven[- ]eighths';
const PERCENT = String.raw`\s?(?:%|percent\b|per cent\b)`;
// A number followed by one of these is not a rate.
const NOT_RATE_AFTER = String.raw`\s?(?:k\b|dollars?|bucks|a month|per month|\/\s?mo|months?|mos?\b|years?|yrs?|points?|pts?\b|square|sq\b|miles?|hours?|hrs?|days?|weeks?|minutes?|mins?|am\b|pm\b|o'?clock)`;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const plausible = (n: number) => n > 0 && n < 30;

/** Every rate-like number in the text, in percent. */
export function rateMentions(text: string): number[] {
  const t = text.replace(/[‐-―]/g, '-');
  const out: number[] = [];
  const add = (n: number) => {
    if (plausible(n)) out.push(round3(n));
  };
  let m: RegExpExecArray | null;

  // Digits with a fraction character: "6¼%", "6 ¼".
  const fracChar = /(\d{1,2})\s?([¼½¾⅛⅜⅝⅞])/g;
  while ((m = fracChar.exec(t))) add(parseInt(m[1], 10) + FRACTION_CHARS[m[2]]);

  // Digits with a typed fraction: "6 1/4%", "6 and 1/4".
  const typedFrac = /(?<![\d/])(\d{1,2})\s+(?:and\s+)?([1357])\/([248])(?![\d/])/g;
  while ((m = typedFrac.exec(t))) add(parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10));

  // Basis points: "625 basis points", "625 bps".
  const bps = /(?<![\d.,$])(\d{3,4})\s?(?:basis points?|bps|bp)\b/gi;
  while ((m = bps.exec(t))) add(parseInt(m[1], 10) / 100);

  // Words: "six and a quarter", "six point two five", "six percent". A whole number in words
  // ("six") only counts with "percent", so "six months" and "at six" are left alone.
  const words = new RegExp(
    String.raw`\b(${ONES_RE})(?:\s+and\s+(${FRACTION_RE})|\s+point\s+((?:${DIGIT_RE})(?:[\s-]+(?:${DIGIT_RE})){0,2}))?(${PERCENT})?`,
    'gi',
  );
  while ((m = words.exec(t))) {
    const whole = ONES[m[1].toLowerCase()];
    if (m[2]) add(whole + FRACTION_WORDS[m[2].toLowerCase().replace('-', ' ')]);
    else if (m[3]) {
      const ds = m[3].toLowerCase().split(/[\s-]+/).map((d) => DIGITS[d]);
      add(whole + parseFloat('0.' + ds.join('')));
    } else if (m[4]) add(whole);
  }

  // Digits: "6.25%", "6.25 percent", "6%", and a decimal on its own ("6.25") unless it is
  // money ("$6.25") or has a unit after it ("1.5 points", "2.5 years").
  const digits = new RegExp(String.raw`(?<![\d.,$/])(\d{1,2}(?:\.\d{1,3})?)(?![\d¼½¾⅛⅜⅝⅞]|\s?\/)(${PERCENT})?`, 'gi');
  while ((m = digits.exec(t))) {
    const hasPercent = !!m[2];
    const isDecimal = m[1].includes('.');
    if (!hasPercent && !isDecimal) continue;
    if (!hasPercent && new RegExp('^' + NOT_RATE_AFTER, 'i').test(t.slice(m.index + m[0].length))) continue;
    add(parseFloat(m[1]));
  }
  return out;
}
