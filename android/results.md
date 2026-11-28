# Quotekey on an Android emulator: 23/23 steps passed

Pixel 6 profile, Android 14 (API 34), Google APIs image, x86_64. No Gemini Nano on an emulator.

## PASS · Install the APK (32.9 s)

versionCode=1 minSdk=26 targetSdk=36     versionName=1.0.0


## PASS · Launch: home screen appears, no crash (9.9 s)

home visible

- 01-home.png

## PASS · Settings: where answers run (on-device / cloud) (17.0 s)

Where answers run | The phone knows you. The cloud knows the market. | On this device | This phone has no on-device Gemini Nano. | Not on this device | Cloud (Firebase AI Logic) | Used for today's market range, and as a redacted fallback. | Connected | Allow the redacted cloud fallback | When there is no on-device model, send the message with names, numbers that identify you and links removed. Your limits and Deal File are never sent.

- 02-settings.png
- 03-settings-status.png

## PASS · Select text → Quotekey is registered in the text-selection menu (0.1 s)

listed: com.secondlook.app/.MainActivity


## PASS · Selected lender text (app already open) → verdict (46.8 s)

screen-verdict; rate: 7.4%; source-chip: Cloud · redacted; redacted-note: This phone has no on-device model, so details that identify you were removed before the cloud check. Removed: licence numbers, names.; verdict-pill: Real offer, not compared yet

- 04-process-text-busy.png
- 05-process-text-verdict.png

## PASS · Selected scam text (app closed first, cold start) → scam warning (12.0 s)

scam screen shown; source-chip: Offline rules

- 06-process-text-scam.png

## PASS · Load sample deals (21.9 s)

sample deals loaded

- 07-sample-deals.png

## PASS · Lock limits with a PIN (needed for Counter) (59.3 s)

limits locked

- 08-limits.png
- 09-limits-pin-entered.png
- 10-limits-locked.png

## PASS · Keyboard panel: Check a lender message (46.7 s)

6.40% | Real offer, but overpriced | Above today's 6.05–6.30%. The rate is over your limit. Fees are $650 over your limit. || source-chip: Cloud · redacted

- 11-keyboard.png
- 12-kb-check.png

## PASS · Keyboard panel: Counter → three replies inside the limits (19.8 s)

3 drafts; none mention 6.25%. Friendly. Hi Dana, I have a written quote for 6.15% and would love it if you could match that. Can you also do $1,200 in fees?. Reveals: nothing private. Tap to put it in the message box. | FRIENDLY | Hi Dana, I have a w || Firm. Hi Dana, I am ready to lock today at 6.15% with $1,200 in fees.. Reveals: nothing private. Tap to put it in the message box. | FIRM | Hi Dana, I am ready to lock today at 6.15% with $1,200 in fees. | Reveals: nothi || Final offer. Hi Dana, 6.20% with $1,200 in fees is as far as I can go.. Reveals: nothing private. Tap to put it in the message box. | FINAL OFFER | Hi Dana, 6.20% with $1,200 in fees is as far as I can go. | Reveals: not

- 13-kb-counter.png
- 14-kb-draft-filled.png

## PASS · Keyboard panel: Explain (15.8 s)

A lender is offering you a mortgage with a 6.40% interest rate and $1,850 in upfront fees over 30 years. | "6.40%" is the yearly cost to borrow, "30-yr fixed" means the rate never changes for 30 years, and "fees" are lender costs. | "Lock ends Friday" means you must accept this specific interest rate before this week ends. | Ask the lender if these fees include all closing costs or just the lender

- 15-kb-explain.png

## PASS · Keyboard panel: leak guard stops "the highest I can go is 6.25%" (35.1 s)

Hold on before you send | This gives away your walk-away rate. Once a lender knows the highest number you'll accept, that is usually the number you get. || safer: SAFER VERSION | I'm looking for 6.15% with $1,200 in fees. Can you get there? | Reveals: nothing private

- 16-kb-leak.png

## PASS · Keyboard panel: scam message (20.5 s)

Likely a scam. Don't reply. | Asks for a fee before any money is paid out | Pressure to pay today | No lender name or licence number | Link goes to a site that isn't a known lender

- 17-kb-scam.png

## PASS · Text-selection menu shows "Quotekey" (long-press in a text box) (46.6 s)

"Quotekey" found in the overflow menu (uiautomator); tapping it opened screen-verdict. source-chip: Cloud · redacted; redacted-note: This phone has no on-device model, so details that identify you were removed before the cloud check.; verdict-pill: Not enough to judge yet

- 18-selection-menu.png
- 19-selection-menu-more.png
- 20-selection-menu-result.png

## PASS · Android keyboard: turn on, switch to Quotekey, panel appears (78.5 s)

selected com.secondlook.app/expo.modules.secondlookai.SecondLookKeyboardService; panel: 🔒 Refi · Summit | Copy their message, then pick one. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 21-ime-ready.png

## PASS · Android keyboard: Check the copied lender message (9.9 s)

🔒 Refi · Summit | Offline rules | 6.40% · Real offer, but overpriced
Above today's 6.05%–6.30%. The rate is over your limit. Fees are $650 over your limit. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 22-ime-check.png

## PASS · Android keyboard: Counter, then tap a reply into the box (20.3 s)

box now has: Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?

- 23-ime-counter.png
- 24-ime-reply-typed.png

## PASS · Android keyboard: leak guard on my own reply ("highest I can go is 6.25%") (35.8 s)

warning shown; box now has: I'm looking for 6.15% with $1,200 in fees. Can you get there?

- 25-ime-leak.png
- 26-ime-safer-typed.png

## PASS · Android keyboard: leak guard on the walk-away rate in words ("six and a quarter", no %) (21.9 s)

warning shown for "six and a quarter"

- 27-ime-leak-words.png

## PASS · Android keyboard: Explain (Firebase AI Logic) (17.3 s)

source: Cloud · redacted; 🔒 Refi · Summit | Cloud · redacted | • A lender is offering you a mortgage with a 6.40% interest rate over 30 years and $1,850 in closing fees.
• The 6.40% rate is the yearly cost of borrowing, while the 30-year fixed term means your monthly principal and interest payment never changes.
• Fees are the upfront costs charged by the lender to process your loan, and the rate lock guarantees this offer

- 28-ime-explain.png

## PASS · Android keyboard: a rate below today's range says "Below", not "Inside" (24.5 s)

5.5%: 🔒 Refi · Summit | Offline rules | 5.50% · Competitive offer
Below today's 6.05%–6.30%. Check the fees and points. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 29-ime-below.png

## PASS · Android keyboard: scam message (75.8 s)

🔒 Refi · Summit | Offline rules | Likely a scam. Don't reply.
• Asks for a fee before any money is paid out
• Pressure to pay today
• Link goes to a site that isn't a known lender
• Prize-style language
• Rate is far below anything on the market
• No lender name or licence number | 🌐 | Switch keyboa

- 30-ime-scam.png

## PASS · Android keyboard: globe key switches back to the normal keyboard (6.4 s)

now using com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME

- 31-ime-globe.png

Crash buffer: empty
System 'not responding' dialogs dismissed: 0 []
