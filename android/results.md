# SecondLook on an Android emulator: 22/22 steps passed

Pixel 6 profile, Android 14 (API 34), Google APIs image, x86_64. No Gemini Nano on an emulator.

## PASS · Install the APK (29.8 s)

versionCode=1 minSdk=26 targetSdk=36     versionName=1.0.0


## PASS · Launch: home screen appears, no crash (7.5 s)

home visible

- 01-home.png

## PASS · Settings: where answers run (on-device / cloud) (16.1 s)

Where answers run | The phone knows you. The cloud knows the market. | On this device | This phone has no on-device Gemini Nano. | Not on this device | Cloud (Firebase AI Logic) | Used for today's market range, and as a redacted fallback. | Connected | Allow the redacted cloud fallback | When there is no on-device model, send the message with names, numbers that identify you and links removed. Your limits and Deal File are never sent.

- 02-settings.png
- 03-settings-status.png

## PASS · Select text → SecondLook is registered in the text-selection menu (0.0 s)

listed: com.secondlook.app/.MainActivity


## PASS · Selected lender text (app already open) → verdict (43.6 s)

screen-verdict; rate: 7.4%; source-chip: Cloud · redacted; redacted-note: This phone has no on-device model, so details that identify you were removed before the cloud check. Removed: licence numbers, names.; verdict-pill: Real offer, not compared yet

- 04-process-text-busy.png
- 05-process-text-verdict.png

## PASS · Selected scam text (app closed first, cold start) → scam warning (11.6 s)

scam screen shown; source-chip: Offline rules

- 06-process-text-scam.png

## PASS · Load sample deals (20.8 s)

sample deals loaded

- 07-sample-deals.png

## PASS · Lock limits with a PIN (needed for Counter) (56.6 s)

limits locked

- 08-limits.png
- 09-limits-pin-entered.png
- 10-limits-locked.png

## PASS · Keyboard panel: Check a lender message (46.2 s)

6.40% | Real offer, but overpriced | Above today's 6.05–6.30%. The rate is over your limit. Fees are $650 over your limit. || source-chip: Cloud · redacted

- 11-keyboard.png
- 12-kb-check.png

## PASS · Keyboard panel: Counter → three replies inside the limits (19.5 s)

3 drafts; none mention 6.25%. Friendly. Hi Dana, I have a written quote for 6.15%. Can you match that rate and offer $1,200 in fees?. Reveals: nothing private. Tap to put it in the message box. | FRIENDLY | Hi Dana, I have a written quote for 6.15%.  || Firm. Hi Dana, I am ready to lock today at 6.15% with $1,200 in fees.. Reveals: nothing private. Tap to put it in the message box. | FIRM | Hi Dana, I am ready to lock today at 6.15% with $1,200 in fees. | Reveals: nothi || Final offer. Hi Dana, 6.20% with $1,200 in fees is as far as I can go.. Reveals: nothing private. Tap to put it in the message box. | FINAL OFFER | Hi Dana, 6.20% with $1,200 in fees is as far as I can go. | Reveals: not

- 13-kb-counter.png
- 14-kb-draft-filled.png

## PASS · Keyboard panel: Explain (15.7 s)

A lender is offering you a mortgage with a fixed 6.40% interest rate over 30 years for $1,850 in upfront fees. | The 6.40% rate is the yearly interest cost, and the 30-year term is how long you have to pay it back. | Fees are the lender's charges to set up the loan, and the lock guarantees your rate until Friday. | Ask the lender if the $1,850 in fees includes any "discount points" to lower the in

- 15-kb-explain.png

## PASS · Keyboard panel: leak guard stops "the highest I can go is 6.25%" (31.6 s)

Hold on before you send | This gives away your walk-away rate. Once a lender knows the highest number you'll accept, that is usually the number you get. || safer: SAFER VERSION | I'm looking for 6.15% with $1,200 in fees. Can you get there? | Reveals: nothing private

- 16-kb-leak.png

## PASS · Keyboard panel: scam message (20.2 s)

Likely a scam. Don't reply. | Asks for a fee before any money is paid out | Pressure to pay today | No lender name or licence number | Link goes to a site that isn't a known lender

- 17-kb-scam.png

## PASS · Text-selection menu shows "SecondLook" (long-press in a text box) (42.9 s)

"SecondLook" found in the overflow menu (uiautomator); tapping it opened screen-verdict. source-chip: Cloud · redacted; redacted-note: This phone has no on-device model, so details that identify you were removed before the cloud check.; verdict-pill: Not enough to judge yet

- 18-selection-menu.png
- 19-selection-menu-more.png
- 20-selection-menu-result.png

## PASS · Android keyboard: turn on, switch to SecondLook, panel appears (74.1 s)

selected com.secondlook.app/expo.modules.secondlookai.SecondLookKeyboardService; panel: 🔒 Refi · Summit | Copy their message, then pick one. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 21-ime-ready.png

## PASS · Android keyboard: Check the copied lender message (9.8 s)

🔒 Refi · Summit | Offline rules | 6.40% · Real offer, but overpriced
Above today's 6.05%–6.30%. The rate is over your limit. Fees are $650 over your limit. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 22-ime-check.png

## PASS · Android keyboard: Counter, then tap a reply into the box (20.1 s)

box now has: Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?

- 23-ime-counter.png
- 24-ime-reply-typed.png

## PASS · Android keyboard: leak guard on my own reply ("highest I can go is 6.25%") (33.5 s)

warning shown; box now has: I'm looking for 6.15% with $1,200 in fees. Can you get there?

- 25-ime-leak.png
- 26-ime-safer-typed.png

## PASS · Android keyboard: Explain (Firebase AI Logic) (16.9 s)

source: Cloud · redacted; 🔒 Refi · Summit | Cloud · redacted | • A lender is offering you a mortgage with a fixed 6.40% interest rate to buy a home over 30 years.
• The 6.40% rate stays the same the entire time, and the $1,850 covers the lender's setup fees.
• "Lock" means your rate is safely guaranteed until Friday, after which it might go up or down.
• Ask the lender if these upfront fees include all closing costs or jus

- 27-ime-explain.png

## PASS · Android keyboard: a rate below today's range says "Below", not "Inside" (22.2 s)

5.5%: 🔒 Refi · Summit | Offline rules | 5.50% · Competitive offer
Below today's 6.05%–6.30%. Check the fees and points. | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input method

- 28-ime-below.png

## PASS · Android keyboard: scam message (74.4 s)

🔒 Refi · Summit | Offline rules | Likely a scam. Don't reply.
• Asks for a fee before any money is paid out
• Pressure to pay today
• Link goes to a site that isn't a known lender
• Rate is far below anything on the market | 🌐 | Switch keyboard | Check | Counter | Explain | Back | Switch input metho

- 29-ime-scam.png

## PASS · Android keyboard: globe key switches back to the normal keyboard (6.2 s)

now using com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME

- 30-ime-globe.png

Crash buffer: empty
System 'not responding' dialogs dismissed: 0 []
