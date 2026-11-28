"""Held-out evaluation sets: written on November 28 BEFORE the rule changes, and never used
while tuning. The tuned sets (eval/*-cases.json) show what the fix changed; these show how the
rules do on phrasings they were not tuned on. Same sample deal as make_cases.py.
Run: python3 eval/make_heldout.py
"""
import json, pathlib

OUT = pathlib.Path(__file__).parent

LEAK_BLOCK = [
    # walk-away rate, written many ways
    ('walk-away rate', "Look, six and a quarter is the top of my budget."),
    ('walk-away rate', "Realistically I'm done at 6.25."),
    ('walk-away rate', "Max I can justify is 6.25 percent."),
    ('walk-away rate', "Over 6¼ and I walk."),
    ('walk-away rate', "Between us, 6 and 1/4% is my number."),
    ('walk-away rate', "Our cutoff is six point two five."),
    ('walk-away rate', "If it's 6.25% or under I'm in."),
    ('walk-away rate', "Can't do more than 625 bps."),
    ('walk-away rate', "Meet me at 6.25 and I'll sign tonight."),
    ('walk-away rate', "I'd sign at six and a quarter percent."),
    ('walk-away rate', "Not a basis point over 6.250."),
    ('walk-away rate', "Anything north of 6.25% doesn't work for us."),
    ('walk-away rate', "We budgeted for 6.25% max."),
    ('walk-away rate', "Top end for me is 6.25%, honestly."),
    ('walk-away rate', "6.25 is the ceiling, Dana."),
    ('walk-away rate', "I'm okay up to six and a quarter."),
    ('walk-away rate', "I'll go as high as 6.25%."),
    ('walk-away rate', "6¼ and we're done negotiating."),
    ('walk-away rate', "We could swing 6.25 if fees drop."),
    ('walk-away rate', "My walk-away number is 6.25."),
    # agrees past the limits
    ('agrees past the limits', "Fine, 6.4% then."),
    ('agrees past the limits', "Let's lock it at six and three quarters."),
    ('agrees past the limits', "Deal at 6.5 with your fees."),
    ('agrees past the limits', "Ok with $2,000 in closing costs."),
    ('agrees past the limits', "I'll take the 6⅝%."),
    ('agrees past the limits', "Sounds good, 6.35 and $1,200 in fees."),
    # credit
    ('credit score', "My FICO is 812."),
    ('credit score', "I've got really good credit, mid 700s."),
    ('credit score', "My credit score is excellent."),
    # deadline
    ('deadline', "We need to close before the end of the month."),
    ('deadline', "I have to sign by Wednesday."),
    ('deadline', "Our rate lock elsewhere expires Friday, so I need an answer."),
    # quote you don't hold
    ('a quote you don\'t hold', "Another lender is offering 5.99%."),
    ('a quote you don\'t hold', "I was quoted six flat by a credit union."),
    ('a quote you don\'t hold', "A competing bank offered 5.875% in writing."),
]
LEAK_ALLOW = [
    "Could you sharpen the pencil on that 6.40%?",
    "Is six and an eighth doable?",
    "What would 6.125% look like with $1,000 in fees?",
    "I have 6.15% in writing from another lender.",
    "Thanks! Can you send the itemized fees?",
    "How much is the lock extension?",
    "We're also comparing a 20-year term.",
    "Can you do 6⅛ with no points?",
    "Your offer of 6.4% is noted. Can you improve it?",
    "Is the $1,850 negotiable at all?",
    "Could we see a quote at 6.1 percent?",
    "I'll take 6.15% if the fees are $1,200.",
    "What's the difference in payment between 6.4 and 6.15?",
    "The house was built in 1962.",
    "Escrow should be about $625 a month.",
    "My daughter is six and a half, she loves your logo.",
    "We have 25 years left on the current loan.",
    "Points would be 1.5 at that rate, right?",
    "Please send the Closing Disclosure three days early.",
    "No rush on my side, take your time.",
]

SCAMS = [
    "Your $9,500 loan is approved. Pay a $150 fee with an Amazon gift card to receive it.",
    "IRS notice: you owe back taxes. Pay now with Bitcoin to avoid arrest.",
    "Mortgage payoff program! We pay off your house. Pay our $400 enrollment fee today: payoffnow.site",
    "Hi, your account has been flagged. Reply with the verification code we sent to keep your loan.",
    "Get 0.5% APR financing on any car! Limited time, click autolux.click",
    "Your loan is approved but on hold. Send a $250 insurance payment by wire to release it.",
    "Congratulations, you won a free refinance! Claim at freerefi.online",
    "Loan servicing update: make your next payment to our new Zelle account.",
    "We can lower your rate to 2%! Pay the $300 processing fee first.",
    "Guaranteed approval regardless of credit. Funds today. lendfast.xyz",
    "Your student loan qualifies for forgiveness. Pay $49 today to enroll: edrelief.info",
    "Approved! Just text us your bank username and password so we can deposit the funds.",
    "We are holding $20,000 for you. Pay the $199 release fee now.",
    "Act now: 1.25% mortgage rates, today only. Text YES to lock.",
    "Hi from loan support, please confirm your SSN and date of birth to finish your file.",
    "Your car loan was approved at 1.9%. Pay the first payment by Cash App to activate.",
    "Stop paying your bank! Our program makes your payments for you. Call now.",
    "To receive your loan, buy a $500 prepaid card and send us the numbers.",
    "You have been selected for a 1% loan. Respond within 2 hours to claim.",
    "Final notice: your loan offer expires tonight. Pay the $75 fee at offerpay.top",
]
LEGIT = [
    "Hi Alex, this is Dana from Summit. 6.35% fixed for 30 years with $1,600 in fees.",
    "Your appraisal came in at value. We're on track for Friday.",
    "Hi Alex, the lender credit would bring your fees down to $1,050.",
    "Quick question: is the property your primary residence?",
    "Your Closing Disclosure is ready to review in the portal.",
    "We can do 6.25% with 0.5 points or 6.5% with none. NMLS 401822.",
    "Please sign the intent to proceed by Wednesday so we can order the appraisal.",
    "Rates improved today: 30-yr fixed at 6.3%. Want me to re-price your quote?",
    "Hi Alex, I'm out tomorrow; my colleague Sam can help with any questions.",
    "Your loan is clear to close. Title will reach out about scheduling.",
    "Ridgeline Auto: we can do 7.9% APR for 60 months, $455/mo.",
    "Hi, it's Jordan from Ridgeline. The extended warranty is optional; we can remove it.",
    "Summit Home Loans: your rate is locked at 6.2% until Dec 22.",
    "The $500 application fee is refundable if we can't approve your loan.",
    "We received the pay stubs, thank you!",
    "Can you send a copy of your homeowner's insurance declarations page?",
    "Hi Alex, I can match the other quote if it's in writing. Please send it over.",
    "Your credit union auto loan: 6.74% APR, 60 months, no fees.",
    "Your rate lock will expire Monday. Do you want me to extend it?",
    "Please review and e-sign at portal.summithomeloans.com/sign",
]
QUOTES = [
    ("Hi Alex, this is Dana from Summit. 6.35% fixed for 30 years with $1,600 in fees.", {'rate': 6.35, 'termMonths': 360, 'fees': 1600}),
    ("Ridgeline Auto: we can do 7.9% APR for 60 months, $455/mo.", {'apr': 7.9, 'termMonths': 60, 'monthlyPayment': 455}),
    ("We can do 6.25% with 0.5 points. Lender fees $1,350.", {'rate': 6.25, 'points': 0.5, 'fees': 1350}),
    ("Your credit union auto loan: 6.74% APR, 60 months, no fees.", {'apr': 6.74, 'termMonths': 60}),
    ("Quote: 30-year fixed\nRate 6.5%\nAPR 6.61%\nClosing costs $2,250", {'rate': 6.5, 'apr': 6.61, 'termMonths': 360, 'fees': 2250}),
    ("Your current rate is 7.5%; we can get you to 6.375% on a 15-yr, fees $1,100.", {'rate': 6.375, 'termMonths': 180, 'fees': 1100}),
    ("$400,000 at 6.45% for 30 years, 1 point, $1,995 in fees.", {'rate': 6.45, 'termMonths': 360, 'points': 1, 'fees': 1995, 'amount': 400000}),
    ("Payment of $612 per month at 9.4% APR for 72 months.", {'apr': 9.4, 'termMonths': 72, 'monthlyPayment': 612}),
    ("Rates improved today: 30-yr fixed at 6.3%.", {'rate': 6.3, 'termMonths': 360}),
    ("With 10% down we can do 6.875%, 30 years, $2,900 closing costs.", {'rate': 6.875, 'termMonths': 360, 'fees': 2900}),
]


def main():
    leak = [{'text': t, 'expect': 'block', 'group': g} for g, t in LEAK_BLOCK] + [{'text': t, 'expect': 'allow', 'group': 'safe replies'} for t in LEAK_ALLOW]
    (OUT / 'heldout-leak-cases.json').write_text(json.dumps(leak, indent=1, ensure_ascii=False) + '\n')
    scam = [{'text': t, 'expect': 'scam'} for t in SCAMS] + [{'text': t, 'expect': 'not-scam'} for t in LEGIT]
    (OUT / 'heldout-scam-cases.json').write_text(json.dumps(scam, indent=1, ensure_ascii=False) + '\n')
    (OUT / 'heldout-quote-cases.json').write_text(json.dumps([{'text': t, 'expect': e} for t, e in QUOTES], indent=1, ensure_ascii=False) + '\n')
    print(f'held-out leak: {len(LEAK_BLOCK)} to block, {len(LEAK_ALLOW)} to allow; scam: {len(SCAMS)} + {len(LEGIT)}; quotes: {len(QUOTES)}')


if __name__ == '__main__':
    main()
