"""Builds the evaluation sets in eval/*.json. Run: python3 eval/make_cases.py

Written before the November 28 leak-guard fix, so the "before" numbers are honest.
Every name, number and message here is made up.

The deal for the leak-guard cases is the sample refinance (src/engine/sample.ts):
walk-away rate 6.25%, fees up to $1,200, target 6.15%, a written competing quote at 6.15%
that may be mentioned, credit band and deadline (Friday) not to be mentioned.
Their latest offer is 6.40% with $1,850 in fees.
"""
import json, pathlib

OUT = pathlib.Path(__file__).parent

# ---------------------------------------------------------------- leak guard
# Ways people write the walk-away rate, 6.25%.
WALKAWAY_FORMS = [
    ('6.25%', 'digits with %'),
    ('6.25 %', 'digits, space, %'),
    ('6.25 percent', 'digits + "percent"'),
    ('6.250%', 'three decimals'),
    ('6.25', 'digits, no %'),
    ('six and a quarter percent', 'words + "percent"'),
    ('six and a quarter', 'words, no "percent"'),
    ('six point two five percent', 'spoken decimals'),
    ('6¼%', 'fraction character'),
    ('6 1/4%', 'typed fraction'),
    ('625 basis points', 'basis points'),
]
CEILING_TEMPLATES = [
    'Honestly, the highest I can go is {r}.',
    "The most I'll pay is {r}.",
    'My max is {r}.',
    "I can't go above {r}.",
    "I won't go over {r}.",
    'Anything above {r} is a no for me.',
    '{r} is my absolute limit.',
    "I'm capped at {r}.",
    "If you can get to {r} I'll sign.",
    'Get me to {r} and we have a deal.',
    'I could live with {r}, but nothing more.',
    'My ceiling is {r}.',
    "I'd walk away at anything over {r}.",
    '{r} is where I draw the line.',
    "Bring it down to {r} and it's yours.",
    'I can stretch to {r}.',
    'We set our limit at {r}.',
    "Do {r} and I'll lock.",
    "I'll accept {r} if that's the best you can do.",
    'Okay, {r} works for me.',
]

OVER_LIMITS = [
    "I'd take 6.3% if you drop the fees.",
    '6.375% works for me.',
    'Okay, I can do 6.5% with $1,200 in fees.',
    'Fine with $1,500 in fees if the rate is 6.2%.',
    "Let's lock at 6.4%.",
    'Sounds good, 6.40% it is.',
    'I accept 6.3% and $1,400 in closing costs.',
    'Happy with 6.15% if fees are $1,850.',
    'Go ahead and lock 6.375%.',
    "I'm good with six and three-eighths.",
    'Agreed to 6⅜% with your fees.',
    'We accept the $1,850 in fees.',
    'That works, 6.45% and $1,100 in fees.',
    "I'd take six and a half percent.",
    "Let's do 6.3 then.",
]
CREDIT = [
    'My credit score is 790.',
    'FICO is 805, so I expect your best rate.',
    'I have excellent credit.',
    'My score is 760.',
    'My credit is great, around 780.',
    'With my 750 credit score you should do better.',
    "My credit's in the high 700s.",
    'Our FICO scores are both above 780.',
]
DEADLINE = [
    'I need to lock by Friday.',
    'We have to close by the 15th.',
    'My lease ends next month, so I need this done.',
    "I'm in a hurry, can we finish this week?",
    "We're running out of time on this.",
    'Our closing date is December 12.',
    'I must decide by tomorrow.',
    'I need it done by Friday.',
]
UNHELD_QUOTE = [
    'I have a quote at 5.9% from another lender.',
    'Another bank offered me 6.0%.',
    'A credit union quoted me 5.875%.',
    "I've got 6.1% elsewhere.",
    'My other lender is at six percent flat.',
    'Another lender offered 6%.',
]

# Safe replies: none of these should be stopped.
ASK_FORMS = ['6.15%', '6.125%', 'six and an eighth percent', '6⅛%', '6.1%']
ASK_TEMPLATES = [
    'Can you do {r}?',
    'Could you get me to {r}?',
    'Is {r} possible?',
    'Would you match {r}?',
    'What would it take to get {r}?',
    "I'm hoping for {r}.",
    'Can we talk about {r}?',
    'Any chance of {r}?',
    "I'd like to see {r}.",
    'Please price it at {r}.',
]
SAFE = [
    # citing the quote you hold (allowed, 6.15% in writing)
    'I have a written quote at 6.15% from another lender. Can you match it?',
    'Another lender offered me 6.15% in writing.',
    "I've got 6.15% elsewhere, in writing. Can you beat it?",
    'A credit union quoted me 6.15%. Can you match that?',
    'I have a competing offer at 6.15%.',
    # quoting their own offer back
    'You quoted 6.40%, which is above the range I am seeing.',
    'Your 6.40% with $1,850 in fees is high.',
    'Why is it 6.4% when rates are lower this week?',
    'Can you beat 6.40%?',
    'The $1,850 in fees seems high for a refinance.',
    # within the limits
    "I'd take 6.15% with $1,200 in fees.",
    "If you can do 6.125% and $1,000 in fees, let's lock.",
    '6.2% with $1,200 in fees works for me.',
    'Happy with 6.1% and $900 in fees.',
    'Okay, 6.15% and $1,150 in closing costs works.',
    # questions
    'Can you send the Loan Estimate?',
    'What are your lender fees versus third-party fees?',
    'Is the rate locked yet?',
    'How many points is that?',
    'Is there a prepayment penalty?',
    'Can you waive the application fee?',
    "What's the APR on that?",
    'Does that include the appraisal?',
    'Can you itemize the $1,850?',
    'Is that rate with or without points?',
    'What is the rate with zero points?',
    'How long is the lock good for?',
    'Can you send that in writing?',
    'Who is the underwriter?',
    'Is the origination fee negotiable?',
    # neutral replies
    'Thanks, let me think about it.',
    "I'm comparing a few offers.",
    "I'm not ready to lock yet.",
    "Thanks Dana, I'll get back to you.",
    "Appreciate the quick reply. I'll review the numbers tonight.",
    'Please hold off until I review the Loan Estimate.',
    'Sounds good, send the details by email.',
    'Got it, thanks.',
    # numbers that are not the walk-away rate
    "It's a 30-year fixed on $350,000.",
    'I plan to stay about 6 years.',
    'We put 25 percent down when we bought.',
    'My current rate is 7.125%.',
    'Can we do six months of escrow?',
    'Can you cover a quarter point of the fees?',
    'My unit number is 625.',
    'The appraisal was $625.',
    "That's only $6.25 a month difference.",
    'Can we talk at six tomorrow?',
    'The house is 2,500 square feet.',
    'I can pay 1 point if it brings the rate down.',
    "Let's compare the 15-year and the 30-year.",
    'Is 0.5 points worth it at this amount?',
    'Our loan balance is about $347,000.',
    'Payment would be around $2,150 a month, right?',
]


def leak_cases():
    cases = []
    for form, how in WALKAWAY_FORMS:
        for t in CEILING_TEMPLATES:
            text = t.format(r=form)
            text = text[0].upper() + text[1:]
            cases.append({'text': text, 'expect': 'block', 'group': 'walk-away rate', 'form': how})
    cases += [{'text': t, 'expect': 'block', 'group': 'agrees past the limits'} for t in OVER_LIMITS]
    cases += [{'text': t, 'expect': 'block', 'group': 'credit score'} for t in CREDIT]
    cases += [{'text': t, 'expect': 'block', 'group': 'deadline'} for t in DEADLINE]
    cases += [{'text': t, 'expect': 'block', 'group': "a quote you don't hold"} for t in UNHELD_QUOTE]
    for form in ASK_FORMS:
        for t in ASK_TEMPLATES:
            text = t.format(r=form)
            cases.append({'text': text[0].upper() + text[1:], 'expect': 'allow', 'group': 'asks for a lower rate'})
    cases += [{'text': t, 'expect': 'allow', 'group': 'other safe replies'} for t in SAFE]
    return cases


# ---------------------------------------------------------------- scam rules
SCAMS = [
    "CONGRATS! You're pre-approved for a $50,000 loan at 2.9% APR. Pay the $250 processing fee today to release your funds: fastfunds.example/claim",
    'Your loan of $25,000 is approved! Pay a $199 processing fee to release funds: quickcash-now.info',
    'To finalize your loan, buy $300 in Google Play gift cards and text us the codes.',
    'Send the $400 insurance deposit in Bitcoin to activate your loan today.',
    'Guaranteed approval, no credit check! Get up to $10,000 now: loans4all.xyz',
    'Reply with your SSN and bank login to verify your refinance application.',
    'Refinance today at 1.9% APR! Limited spots. Click rate-drop.info now.',
    'FINAL NOTICE: your mortgage is in default. Pay $480 by Zelle within 24 hours to stop foreclosure.',
    'You have been selected for student loan forgiveness. Pay the $99 activation fee today: forgive-now.org',
    'Debt relief approved! Wire the $350 transfer fee first and we cancel your balance.',
    'URGENT: confirm your account number to receive your $15,000 loan deposit.',
    'Your personal loan is ready. A $150 verification fee is required before release. Pay via Cash App.',
    'Bad credit OK! Everyone approved. Apply now: easymoney.click',
    'WINNER! You have won a 0.99% mortgage rate. Claim now at bestrate.top',
    'Loan approved for $8,000. Send a $200 refundable deposit to unlock your funds.',
    'Pay the release fee of $299 today and your $30,000 loan funds tonight. Text YES.',
    'Hi, your $5,000 advance is approved. Upfront fee of $120 is required. Pay with a prepaid card.',
    'Mortgage relief program: stop your payments now. Send $500 via MoneyGram to enroll.',
    'Your refinance at 2.5% APR is locked. Confirm with the one-time code we just sent you.',
    'Get a $20,000 loan in 1 hour, no credit check. Visit fastloan.biz',
    'Act now! 1.5% APR auto loans for everyone. Click autodeal.site',
    'Your account is suspended. Verify your online banking password to keep your loan: secure-verify.online',
    'You qualify for a government grant loan. Pay $75 processing fee by gift card to receive it.',
    'Congratulations, pre-approved for $40,000! Claim at loanoffer.top before it expires.',
    'Send your debit card number and PIN to receive the loan deposit.',
    'Last chance: lock 1.75% on your mortgage today, pay the $250 lock fee in USDT.',
    'Approved! To release your $12,000, deposit the $300 insurance fee first.',
    'Pay $99 now to activate your credit line of $5,000. Reply STOP to opt out.',
    'Your student loan is in default. Pay $199 today to avoid wage garnishment: studentaid-help.net',
    'Easy cash: guaranteed approval, funds today. Fee of $50 via Cash App.',
    'Hello, your loan application is approved at 2.2% APR. Please wire the $500 transfer fee to proceed.',
    'Final notice from loan services: respond now or lose your approved $25,000. lnk.example/r',
    'We buy your house for cash! Pay a $250 inspection fee first: cashhomes.xyz',
    'You were selected for a 0% APR loan. Click to claim: promo-loans.site',
    'Your auto loan has been approved at 1.9%. Send the $350 delivery fee by Zelle.',
    "This is the bank. We need your account number and routing number to send your refund.",
    'Get approved today, no credit check, money in minutes: quickloans.online',
    'Pay your $180 activation fee today with Apple gift cards to receive your loan.',
    'You won a $5,000 loan bonus! Claim now: winloan.click',
    'Refinance grant approved. Send $125 processing fee before we release the grant.',
    # harder ones (no link, polite tone, smaller asks)
    'Hi Alex, Mark from Pinnacle Lending. Your pre-approval at 4.1% is ready. A $95 application fee is due before we can lock.',
    'Good news, your loan is approved. We just need a $300 good-faith deposit before funding.',
    'Hi, this is Sarah with loan services. Can you verify your Social Security number so we can finish your refi?',
    'Your rate of 2.75% is reserved for 24 hours. Pay the $199 reservation fee to hold it.',
    'Approved for $15,000 at 3.2% APR. Please purchase a $200 insurance bond to release funds.',
    'We can stop your foreclosure. Make all payments to us instead of your lender.',
    'Your loan is ready to fund. Please send a photo of your debit card, front and back.',
    'Hi! Loan officer here. Rates as low as 1.99% this week only, text back to lock.',
    'To unlock your loan, pay the first two payments in advance by wire.',
    'Pre-approved home equity line, 2.49% APR. Confirm your bank login to fund it.',
]
LEGIT = [
    'Hi Alex, good news. I can get you 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.',
    'Okay Alex, best I can do is 6.20% with $1,200 in fees. Lock ends Friday.',
    'Hello, we are from Summit Home Loans. You requested a refinance quote, and here is our rate: 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.',
    'Hi Alex, Dana at Summit Home Loans (NMLS 401822). Your Loan Estimate is in your portal. Rate 6.375%, APR 6.52%.',
    'Your Loan Estimate is ready. Log in at portal.summithomeloans.com to review it.',
    'Rates moved up a bit today. If you want to lock at 6.25%, let me know by 5pm.',
    'Please upload your last two pay stubs and W-2s to the portal when you can.',
    'Hi Alex, the appraisal is scheduled for Tuesday at 10am. The $650 appraisal fee is paid at closing.',
    'We can do 6.125% with 1 discount point, or 6.5% with no points. Fees are $1,495 either way.',
    'Your rate is locked at 6.25% through Dec 19. Next step is underwriting.',
    'Thanks for applying with Desert Valley Credit Union. Your auto loan is approved at 6.49% APR for 60 months.',
    'Ridgeline Auto finance desk: 8.9% APR for 72 months, $489/mo with the protection package.',
    'Hi, this is Jordan at Ridgeline Auto. We can do 7.4% APR for 60 months if you skip the add-ons.',
    'Reminder: your closing is scheduled for Friday at 2pm at Copper Title.',
    'Hi Alex, I have you pre-approved for up to $400,000. Let me know when you find a home.',
    'Our rate today for a 30-year fixed is 6.5% with $2,100 in lender fees. Happy to walk you through it.',
    'The underwriter needs a letter explaining the large deposit on March 3. Can you send it?',
    'Rate sheet for today: 30-yr fixed 6.375%, 15-yr fixed 5.75%, 5/6 ARM 5.875%. NMLS 552190.',
    'Hi Alex, Dana again. I talked to my manager and we can waive the $495 application fee.',
    "Here's your quote: $350,000 refinance, 6.30% fixed, 30 years, $1,650 closing costs.",
    'Hi, please e-sign the disclosures at docs.summithomeloans.com by Wednesday so we stay on schedule.',
    'Your rate lock expires Monday. Do you want to extend it for $250 or let it float?',
    'Good afternoon, I can offer 6.35% with lender credits covering $800 of your closing costs.',
    'We received your documents. The file goes to underwriting tomorrow.',
    'Hi Alex, our credit union can do 6.2% APR on a 30-year fixed. No points, $975 in fees.',
    'Thanks for reaching out. Can you tell me your estimated home value and loan balance?',
    'To lock today we need your signed intent to proceed. Reply here or sign in the portal.',
    'Your monthly payment would be about $2,190 at 6.40% on $350,000.',
    'Quick update: the title report came back clean.',
    'Hi Alex, congrats on your approval! Your clear-to-close should come Thursday.',
    'This is Copper Title. Please do not wire any funds based on an email. Call our office to confirm instructions.',
    'Your auto refinance: 5.99% APR, 48 months, no prepayment penalty. NMLS 77821.',
    'Hi Alex, I can match 6.15% if you can show me the written quote.',
    'For a 15-year fixed we are at 5.625% today with $1,300 in fees.',
    'Rate is 6.4%, APR 6.55%, points 0, lender fees $1,850. Lock good through Friday.',
    'Please pay the $650 appraisal fee before we order the appraisal: pay.summithomeloans.com',
    'Hello from Summit Home Loans. A reminder that your rate lock ends Friday.',
    'Hi Alex, can we schedule a call to go over the Closing Disclosure? Takes 15 minutes.',
    'Your HELOC is approved: prime + 0.5%, currently 8.0%, $100,000 line.',
    "We'd love to earn your business. 6.3% fixed with $1,400 fees, valid until Friday.",
    'Note from Summit: we will never ask for your password or a gift card.',
    'Hi Alex, the payoff statement from your current lender has arrived.',
    'Your car loan offer: 6.9% APR for 66 months, $512/mo, $0 down.',
    'Hi, following up on the quote I sent. Any questions?',
    "Lock confirmation: 6.25% fixed, 30 years, locked until 12/19.",
    'Hi Alex, if you can confirm today we can still get the 6.20% lock.',
    'Our application fee is $500, credited back at closing.',
    'Hey Alex, Dana here. I can do 6.30% with $1,500 in fees if you lock this week.',
    'Here is a link to compare your options: summithomeloans.com/compare',
    'Thanks for your patience. Your loan funded this morning. Congratulations!',
]


# ---------------------------------------------------------------- quote reading
QUOTES = [
    ('Hi Alex, good news. I can get you 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.', {'rate': 6.4, 'termMonths': 360, 'fees': 1850}),
    ('Okay Alex, best I can do is 6.20% with $1,200 in fees. Lock ends Friday.', {'rate': 6.2, 'fees': 1200}),
    ('Ridgeline Auto finance desk: 8.9% APR for 72 months, $489/mo with the protection package.', {'apr': 8.9, 'termMonths': 72, 'monthlyPayment': 489}),
    ('Rate 6.375%, APR 6.52%, 30-year fixed, lender fees $1,495.', {'rate': 6.375, 'apr': 6.52, 'termMonths': 360, 'fees': 1495}),
    ('We can do 6.125% with 1 discount point. Fees are $1,495.', {'rate': 6.125, 'points': 1, 'fees': 1495}),
    ("Here's your quote: $350,000 refinance, 6.30% fixed, 30 years, $1,650 closing costs.", {'rate': 6.3, 'termMonths': 360, 'fees': 1650, 'amount': 350000}),
    ('Your auto loan is approved at 6.49% APR for 60 months.', {'apr': 6.49, 'termMonths': 60}),
    ('Our rate today for a 30-year fixed is 6.5% with $2,100 in lender fees.', {'rate': 6.5, 'termMonths': 360, 'fees': 2100}),
    ('Your current rate is 7.125%. We can refinance you to 6.25% on a 30-year, $1,300 in fees.', {'rate': 6.25, 'termMonths': 360, 'fees': 1300}),
    ('With 20% down, the rate is 6.625% on a 30-yr fixed. Closing costs $3,200.', {'rate': 6.625, 'termMonths': 360, 'fees': 3200}),
    ('Rate is 6.4%, APR 6.55%, points 0, lender fees $1,850.', {'rate': 6.4, 'apr': 6.55, 'points': 0, 'fees': 1850}),
    ('Points: 0.5. Rate: 6.25%. Term: 30 years. Origination fee: $995.', {'rate': 6.25, 'points': 0.5, 'termMonths': 360, 'fees': 995}),
    ('6.9% APR for 66 months, $512/mo, $0 down.', {'apr': 6.9, 'termMonths': 66, 'monthlyPayment': 512}),
    ('15-year fixed at 5.625% with $1,300 in fees.', {'rate': 5.625, 'termMonths': 180, 'fees': 1300}),
    ('Your auto refinance: 5.99% APR, 48 months, no prepayment penalty.', {'apr': 5.99, 'termMonths': 48}),
    ('I can offer 6.35% on a 30-year fixed. No points.', {'rate': 6.35, 'termMonths': 360, 'points': 0}),
    ('Our credit union can do 6.2% APR on a 30-year fixed. No points, $975 in fees.', {'apr': 6.2, 'termMonths': 360, 'points': 0, 'fees': 975}),
    ('Loan amount $350,000 at 6.40% for 30 years. Monthly payment $2,190.', {'rate': 6.4, 'termMonths': 360, 'amount': 350000, 'monthlyPayment': 2190}),
    ('6.3% fixed with $1,400 fees, valid until Friday.', {'rate': 6.3, 'fees': 1400}),
    ('Payment of $2,150 per month at 6.25% on a 30-year loan.', {'rate': 6.25, 'termMonths': 360, 'monthlyPayment': 2150}),
    ('Your existing rate is 7.25%. New offer: 6.5%, 30-yr, fees $1,750.', {'rate': 6.5, 'termMonths': 360, 'fees': 1750}),
    ('We are at 7.4% APR for 60 months on the car if you skip the add-ons.', {'apr': 7.4, 'termMonths': 60}),
    ('Rate 6.75% / 30 yr fixed / 0.25 points / $1,100 lender fees', {'rate': 6.75, 'termMonths': 360, 'points': 0.25, 'fees': 1100}),
    ('Good afternoon, quote for you: 6.45%, 30 years, closing costs of $2,400.', {'rate': 6.45, 'termMonths': 360, 'fees': 2400}),
    ('The HELOC rate is 8.0% on a $100,000 line.', {'rate': 8.0, 'amount': 100000}),
    ('Monthly payment would be $489 at 8.9% APR over 72 months.', {'apr': 8.9, 'termMonths': 72, 'monthlyPayment': 489}),
    ('Hi Alex,\n\nThanks for applying. Here is your quote:\nRate: 6.375%\nAPR: 6.49%\nTerm: 30 years\nLender fees: $1,295\nPoints: 0\n\nBest,\nDana Ruiz\nSummit Home Loans, NMLS 401822', {'rate': 6.375, 'apr': 6.49, 'termMonths': 360, 'fees': 1295, 'points': 0}),
    ('With 75% LTV you qualify for 6.25% on a 20-year fixed, $1,000 fees.', {'rate': 6.25, 'termMonths': 240, 'fees': 1000}),
    ('6.875% on a 30-year, 2 points, $3,000 in closing costs.', {'rate': 6.875, 'termMonths': 360, 'points': 2, 'fees': 3000}),
    ('Average rate is 6.9% but we can do 6.6%, 30-yr fixed, $1,200 fees.', {'rate': 6.6, 'termMonths': 360, 'fees': 1200}),
]


def main():
    leak = leak_cases()
    (OUT / 'leak-cases.json').write_text(json.dumps(leak, indent=1, ensure_ascii=False) + '\n')
    scam = [{'text': t, 'expect': 'scam'} for t in SCAMS] + [{'text': t, 'expect': 'not-scam'} for t in LEGIT]
    (OUT / 'scam-cases.json').write_text(json.dumps(scam, indent=1, ensure_ascii=False) + '\n')
    quotes = [{'text': t, 'expect': e} for t, e in QUOTES]
    (OUT / 'quote-cases.json').write_text(json.dumps(quotes, indent=1, ensure_ascii=False) + '\n')
    nb = sum(c['expect'] == 'block' for c in leak)
    print(f'leak: {nb} to block, {len(leak) - nb} to allow; scam: {len(SCAMS)} scams, {len(LEGIT)} lender texts; quotes: {len(QUOTES)}')


if __name__ == '__main__':
    main()
