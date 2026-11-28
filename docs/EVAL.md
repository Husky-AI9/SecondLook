# Measured: the leak guard, the scam rules and the quote reader

Measured on November 28, 2026. These three parts are plain code that always runs on the phone,
with or without a model, so they can be measured exactly. Every number here comes from
`tools/eval/run.ts`. A unit test (`src/engine/__tests__/eval.test.ts`) fails if today's code
stops matching the numbers in `eval/results/`.

## Results

**Held-out set.** Written before the changes and never used to tune the rules. These are the
numbers to quote.

| | Before Nov 28 | After |
|---|---|---|
| Leak guard: leaks stopped | 13 of 35 (37%) | **32 of 35 (91%)** |
| Leak guard: safe replies wrongly stopped | 0 of 20 | **0 of 20** |
| Scam rules: scams caught | 14 of 20 (70%) | **19 of 20 (95%)** |
| Scam rules: real lender texts flagged | 0 of 20 | **0 of 20** |
| Quote reader: quotes read fully right | 9 of 10 | **10 of 10** |

**Tuned set.** Also written before the changes, but then used to find and fix the misses, so
100% here is expected and says less than the held-out numbers.

| | Before Nov 28 | After |
|---|---|---|
| Leak guard: leaks stopped | 109 of 257 (42%) | 257 of 257 |
| Leak guard: safe replies wrongly stopped | 0 of 104 | 0 of 104 |
| Scam rules: scams caught | 30 of 50 (60%) | 50 of 50 |
| Scam rules: real lender texts flagged | 2 of 50 | 0 of 50 |
| Quote reader: quotes read fully right | 26 of 30 | 30 of 30 |

### The walk-away rate, by how it was written (tuned set, 20 sentences each)

| Written as | Before | After |
|---|---|---|
| `6.25%`, `6.25 %`, `6.25 percent`, `6.250%` | 80 of 80 | 80 of 80 |
| `6.25` (no %) | 0 of 20 | 20 of 20 |
| `six and a quarter percent` | 0 of 20 | 20 of 20 |
| `six and a quarter` | 0 of 20 | 20 of 20 |
| `six point two five percent` | 0 of 20 | 20 of 20 |
| `6¼%` | 0 of 20 | 20 of 20 |
| `6 1/4%` | 0 of 20 | 20 of 20 |
| `625 basis points` | 0 of 20 | 20 of 20 |

## What still gets through (held-out)

- "Fine, 6.4% then." This agrees to their rate, which is over the limit. The guard doesn't read
  "Fine, … then" as agreeing.
- "We need to close before the end of the month." This gives away a deadline in words the
  deadline rule doesn't cover.
- "I was quoted six flat by a credit union." This cites a better quote than the one on file.
  "six flat" without "percent" isn't read as a rate.
- Scam: "Congratulations, you won a free refinance! Claim at freerefi.online". It has only a
  link and prize wording, which adds up to 4 of the 5 points needed.

These stay in the set on purpose. Fixing them now would turn the held-out set into a tuned one.

## What changed

- **Leak guard** (`src/engine/rates.ts`, `src/engine/leakGuard.ts`):
  - It now reads a rate however it is written: no %, in words, spoken decimals, fraction
    characters, typed fractions or basis points.
  - It catches "excellent credit" and "high 700s".
  - It catches "I must decide by …".
- **Scam rules** (`src/engine/scamRules.ts`):
  - It now catches:
    - advance fees that aren't called "processing fees";
    - requests for an SSN or bank login;
    - foreclosure-rescue offers;
    - "by wire";
    - 0% APR bait;
    - "this week only".
  - These no longer count as scams:
    - a warning like "we will never ask for a gift card";
    - appraisal and credit-report fees paid up front, which real lenders charge.
- **Quote reader** (`src/engine/extract.ts`):
  - "Rate:" and "APR:" on separate lines are no longer mixed up.
  - "points 0" and "Monthly payment $2,190" are now read.
- **Keyboards.** The Android and iPhone keyboards carry ports of the same rate reader and
  scam rules. The Android emulator test types "The highest I can go is six and a quarter."
  into the keyboard and expects the warning.

## How the sets were made, and their limits

- **The deal is the sample refinance:**
  - walk-away rate 6.25%, fees up to $1,200, target 6.15%;
  - a written competing quote at 6.15% that may be mentioned;
  - credit band and deadline not to be mentioned;
  - their offer is 6.40% with $1,850 in fees.
- **Leak cases:**
  - 20 sentence shapes × 11 ways of writing 6.25%;
  - plus replies that agree past the limits, mention credit or a deadline, or cite a quote
    you don't hold;
  - safe replies ask for a lower rate (5 ways of writing it × 10 shapes), cite the quote you
    do hold, quote the lender's own numbers, or ask questions.
- **Scam cases:** advance-fee, gift-card, crypto, SSN and bank-login, foreclosure-rescue and
  prize texts. The lender texts include links, deadlines, fees and lock reminders, which is
  where false alarms come from.
- **Every message is made up and in English.** Claude wrote both sets on the same day, so
  they aren't a substitute for real messages from real lenders.
- **Only the code paths are measured.** The on-device and cloud models aren't measured here.
  They need a device or a key, and the code above is what decides in the end: a model can add
  a warning but can never remove one.
- **The keyboards are checked separately.** Their ports of these rules are covered by the
  Android emulator test and the iPhone build, not by this harness.

## Run it

```bash
npx tsx tools/eval/run.ts                       # tuned set
EVAL_SET=heldout npx tsx tools/eval/run.ts      # held-out set
python3 eval/make_cases.py                      # rebuild the tuned set (eval/*-cases.json)
python3 eval/make_heldout.py                    # rebuild the held-out set
```

Each run prints every miss, so you can see which messages are still wrong.
