"""
Browser tests for the Quotekey screens, state and AI routing.

Runs the real app code in headless Chrome through the preview build (see ../build.mjs).
Firebase is replaced by a fake that records every call, so these tests can assert what
would and would not have left the device.

    node tools/preview/build.mjs --out dist-preview
    node tools/preview/build.mjs --out dist-preview-off --firebase off
    node tools/preview/build.mjs --out dist-preview-ios --os ios
    node tools/preview/build.mjs --out dist-preview-android --os android
    node tools/preview/build.mjs --out dist-preview-ios-kb --os ios --keyboard 1
    python3 tools/preview/tests/flows.py
"""
import json, os, sys, traceback
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SHOTS = os.environ.get('SHOTS', os.path.join(ROOT, 'dist-preview', 'shots'))
os.makedirs(SHOTS, exist_ok=True)

LENDER = 'Hi Alex, good news. I can get you 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.'
ROUND2 = 'Okay Alex, best I can do is 6.20% with $1,200 in fees. Lock ends Friday.'
DEALER = 'We can do $489/mo for 72 months at 8.9% APR. That includes the protection package.'
SCAM = "CONGRATS! You're pre-approved for a $50,000 loan at 2.9% APR. Pay the $250 processing fee today to release your funds: fastfunds.example/claim"
LEAK = 'Honestly, the highest I can go is 6.25%.'

NATIVE_FAKE = r"""
window.__native = {calls: [], shared: %(shared)s, listeners: []};
window.__nativeModules = {SecondLookAI: {
  async availability() { return {onDevice: '%(ondevice)s'}; },
  async generate(prompt, mode, grounded, cloudModel) {
    const onDev = '%(ondevice)s' === 'available';
    if (mode === 'only-on-device' && !onDev) throw new Error('unavailable');
    const source = mode === 'only-cloud' ? 'cloud' : onDev ? 'on-device' : 'cloud';
    window.__native.calls.push({prompt, mode, grounded, cloudModel, source});
    const task = (/^\[task:(\w+)\]/.exec(prompt) || [])[1];
    let text = 'ok';
    if (task === 'decode') text = /8\.9/.test(prompt) ? '{"kind":"offer","apr":8.9,"termMonths":72,"monthlyPayment":489,"addOns":["protection package"]}' : '{"kind":"offer","rate":6.4,"termMonths":360,"fees":1850,"expires":"Friday"}';
    if (task === 'counter') text = '{"friendly":"Thank you. Could you get to {ASK_RATE} with {ASK_FEES} in fees?","firm":"I will lock today at {ASK_RATE} with {ASK_FEES} in fees.","final":"{FINAL_RATE} with {ASK_FEES} in fees is my last offer."}';
    if (task === 'benchmark') return {text: '{"low": 6.05, "high": 6.3}', source: 'cloud', sources: [{title: 'Example survey', url: 'https://example.com/a'}], searchQueries: ['refi rates']};
    return {text, source, model: source === 'cloud' ? cloudModel : 'on-device'};
  },
  async remoteConfig(defaults) { return defaults; },
  consumeSharedText() { const t = window.__native.shared; window.__native.shared = null; return t; },
  sharedKeychainSet(key, value) { (window.__native.keychain ||= {})[key] = value; return {ok: !window.__native.noShare, status: window.__native.noShare ? -34018 : 0, group: 'TEAM123.secondlook.shared'}; },
  deviceInfo() { return {bundleId: 'com.secondlook.app', teamPrefix: 'TEAM123', group: 'TEAM123.secondlook.shared', os: 'Version 26.1', firebase: true}; },
  addListener(name, cb) { window.__native.listeners.push(cb); return {remove() {}}; },
}};
"""

results = []


class App:
    def __init__(self, browser, dist='dist-preview', mock=None, scheme='light', clip='', size=(390, 844), extra_init=''):
        self.ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=2)
        self.pg = self.ctx.new_page()
        self.errors = []
        self.pg.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
        self.pg.on('console', lambda m: self.errors.append('console: ' + m.text) if m.type == 'error' else None)
        m = {'onDevice': True, 'cloud': True, 'calls': []}
        m.update(mock or {})
        self.pg.add_init_script(
            "window.__insets={top:44,bottom:0,left:0,right:0};window.__scheme=%s;"
            "window.__mock=window.__mock||%s;window.__clipboard=%s;"
            "window.LanguageModel={availability:async()=>window.__mock.onDevice?'available':'unavailable'};%s"
            % (json.dumps(scheme), json.dumps(m), json.dumps(clip), extra_init)
        )
        self.url = 'file://' + os.path.join(ROOT, dist, 'index.html')
        self.pg.goto(self.url)
        self.pg.wait_for_selector('#root > *')

    def t(self, tid):
        return self.pg.locator(f'[data-testid="{tid}"]')

    def click(self, tid, nth=0):
        self.t(tid).nth(nth).click()

    def fill(self, tid, value):
        self.t(tid).fill(value)

    def wait(self, tid, timeout=6000):
        self.pg.wait_for_selector(f'[data-testid="{tid}"]', timeout=timeout)

    def gone(self, tid, timeout=6000):
        self.pg.wait_for_selector(f'[data-testid="{tid}"]', state='detached', timeout=timeout)

    def text(self, tid, nth=0):
        return self.t(tid).nth(nth).inner_text()

    def has(self, tid):
        return self.t(tid).count() > 0

    def calls(self):
        return self.pg.evaluate('window.__mock.calls || []')

    def js(self, code):
        return self.pg.evaluate(code)

    def shot(self, name):
        self.pg.wait_for_timeout(120)
        self.pg.screenshot(path=os.path.join(SHOTS, name + '.png'))

    def no_toast(self):
        try:
            self.gone('toast', 4000)
        except Exception:
            pass

    def check(self, message):
        self.wait('screen-home')
        self.fill('paste-input', message)
        self.click('check-btn')

    def finish(self):
        warn = self.pg.evaluate('window.__styleWarnings || []')
        assert not warn, f'non-React-Native style props used: {sorted(set(warn))}'
        assert not self.errors, f'browser errors: {self.errors}'
        self.ctx.close()


def scenario(fn):
    def run(browser):
        try:
            fn(browser)
            results.append((fn.__name__, True, ''))
            print('PASS', fn.__name__)
        except Exception as e:
            results.append((fn.__name__, False, str(e)))
            print('FAIL', fn.__name__, '\n   ', str(e).split('\n')[0])
            traceback.print_exc(limit=2)
    run.__name__ = fn.__name__
    return run


def no_secrets(prompt, secrets):
    for s in secrets:
        assert s not in prompt, f'"{s}" was in a prompt: {prompt[:300]}'


@scenario
def full_negotiation_on_device(browser):
    a = App(browser)
    a.wait('welcome')
    a.shot('a01-home-empty')
    a.check(LENDER)
    a.wait('screen-verdict')
    assert a.text('verdict-pill') == 'Real offer, not compared yet', a.text('verdict-pill')
    assert a.text('source-chip') == 'Read on-device'
    assert a.text('verdict-rate') == '6.40%'
    c = a.calls()
    assert len(c) == 1 and c[0]['mode'] == 'only_on_device' and c[0]['source'] == 'ON_DEVICE', c
    assert 'Hi Alex' in c[0]['prompt'], 'the on-device model gets the real message'

    a.click('start-deal')
    a.wait('screen-dealfile')
    assert a.t('df-term').input_value() == '30'
    a.fill('df-lender', 'Summit Home Loans'); a.fill('df-contact', 'Dana Ruiz'); a.fill('df-amount', '350000')
    a.click('df-credit-740+'); a.fill('df-state', 'Arizona')
    a.click('df-hasquote'); a.fill('df-quoterate', '6.15'); a.click('df-written'); a.fill('df-deadline', 'Friday')
    a.shot('a02-dealfile')
    a.click('save-deal')

    a.wait('screen-limits')
    a.click('lock-limits')
    assert 'percentages' in a.text('limits-error')
    a.fill('limit-max', '6.25'); a.fill('limit-fees', '1200'); a.fill('limit-target', '6.40')
    a.fill('pin-input', '4821'); a.click('lock-limits')
    assert 'at or below' in a.text('limits-error')
    a.fill('limit-target', '6.15'); a.click('reveal-quote')
    a.fill('pin-input', '48'); a.click('lock-limits')
    assert 'PIN' in a.text('limits-error')
    a.fill('pin-input', '4821'); a.click('lock-limits')
    a.wait('unlock')
    assert not a.has('limit-max'), 'limits are masked once locked'
    assert '6.25' not in a.t('screen-limits').inner_text()

    a.click('unlock'); a.wait('pin-sheet')
    for d in '1234': a.click(f'pin-{d}')
    assert 'not right' in a.text('pin-msg')
    a.pg.wait_for_timeout(400)
    for d in '4821': a.click(f'pin-{d}')
    a.wait('limit-max')
    assert a.t('limit-max').input_value() == '6.25' and a.t('limit-fees').input_value() == '1,200'
    a.click('back')

    a.wait('screen-home')
    row = a.pg.locator('[data-testid^="deal-"]').first
    assert 'Summit Home Loans' in row.inner_text() and 'Overpriced' in row.inner_text(), row.inner_text()
    row.click(); a.wait('screen-rounds')
    a.pg.locator('[data-testid^="round-"]').first.click()
    a.wait('screen-verdict')
    assert a.text('verdict-pill') == 'Real offer, but overpriced'
    assert a.has('range-empty')
    assert '30-yr fixed refinance · $300–400k · credit 740+ · Arizona' in a.text('range-empty')
    a.no_toast()
    a.click('get-range'); a.wait('range-card')
    assert 'Cloud · 2 sources' in a.text('range-card') and 'Theirs 6.40%' in a.text('range-card')
    assert a.has('search-suggestions'), 'Google Search suggestions are shown with a grounded result'
    assert '30-yr fixed refinance · $300–400k · credit 740+ · Arizona' in a.text('cloud-saw')
    assert 'Not sent: names, the message, your limits, your other quote.' in a.text('cloud-saw')
    bench = a.calls()[-1]
    assert bench['mode'] == 'only_in_cloud' and bench['grounded'] and bench['model'] == 'gemini-3.8-flash', bench
    no_secrets(bench['prompt'], ['Summit', 'Dana', 'Alex', '6.25', '6.15', '6.40', '1,200', '1200', '350000', '350,000', 'Friday'])
    assert "About $23/mo above the top of today's range." in a.text('verdict-detail'), a.text('verdict-detail')
    a.no_toast(); a.shot('a03-verdict')

    a.click('draft-counter'); a.wait('draft-0')
    assert a.text('source-chip') == 'Written on-device'
    d0, d1, d2 = a.text('draft-0'), a.text('draft-1'), a.text('draft-2')
    assert '6.15%' in d0 and '$1,200' in d0 and 'Reveals: your competing quote' in d0, d0
    assert '6.15%' in d1 and 'Reveals: nothing private' in d1 and 'Within your limits' in d1, d1
    assert '6.20%' in d2, d2
    for d in (d0, d1, d2): assert '6.25' not in d
    counter = a.calls()[-1]
    assert counter['mode'] == 'only_on_device', counter
    no_secrets(counter['prompt'], ['6.25', '6.15', '6.20', '1,200', '1200'])
    a.shot('a04-drafts')

    a.click('draft-1'); a.click('send-draft'); a.wait('screen-rounds')
    clip = a.js('window.__clipboard')
    assert clip.startswith('I can commit today at 6.15% with $1,200 in fees'), clip
    assert 'Copied' in a.text('toast')
    assert 'Asked for 6.15%' in a.text('rounds-list')

    a.click('add-reply'); a.fill('add-input', ROUND2); a.click('add-check')
    a.wait('screen-verdict')
    assert a.text('verdict-pill') == 'Competitive offer'
    assert 'inside the range' in a.text('range-card')
    a.click('to-rounds'); a.wait('won-hero')
    hero = a.text('won-hero')
    assert '$45.63' in hero and '~$16,400' in hero and '$650' in hero, hero
    assert 'In limits' in a.text('rounds-list') and 'Overpriced' in a.text('rounds-list')
    a.no_toast(); a.shot('a05-rounds')

    a.click('accept'); a.click('accept-confirm')
    assert 'Accepted at 6.20%' in a.t('screen-rounds').inner_text()
    a.click('back'); a.wait('hero')
    assert '$45.63' in a.text('hero') and 'About $16,400 over the loan' in a.text('hero')

    # Everything survives a reload, and the limits come back locked.
    a.pg.wait_for_timeout(400); a.pg.reload(); a.wait('hero')
    assert 'Accepted' in a.pg.locator('[data-testid^="deal-"]').first.inner_text()
    a.click('nav-limits'); a.wait('unlock')
    assert not a.has('limit-max')
    a.finish()


@scenario
def cloud_fallback_is_redacted(browser):
    a = App(browser, mock={'onDevice': False, 'cloud': True})
    a.click('load-sample')
    a.check('Hi Alex, ' + DEALER + ' Call Sam at Ridgeline Auto, 480-555-0199.')
    a.wait('screen-verdict')
    assert a.text('source-chip') == 'Cloud · redacted', a.text('source-chip')
    note = a.text('redacted-note')
    assert 'no on-device model' in note and 'names' in note and 'phone numbers' in note, note
    c = a.calls()
    assert len(c) == 1 and c[0]['mode'] == 'prefer_on_device' and c[0]['source'] == 'IN_CLOUD' and c[0]['model'] == 'gemini-3.5-flash-lite', c
    no_secrets(c[0]['prompt'], ['Alex', 'Ridgeline', 'Sam', '480-555-0199', '7.5', '6.5'])
    assert '8.9% APR' in c[0]['prompt'] and '$489' in c[0]['prompt'], 'loan numbers are kept'
    notes = a.text('verdict-notes')
    assert 'markup' in notes and 'protection package' in notes and '72 months' in notes
    a.shot('b01-verdict-cloud-redacted')

    a.click('draft-counter'); a.wait('draft-0')
    assert a.text('source-chip') == 'Cloud · redacted'
    assert '6.5%' in a.text('draft-0') and '7%' in a.text('draft-2')
    c2 = a.calls()[-1]
    assert c2['mode'] == 'prefer_on_device'
    no_secrets(c2['prompt'], ['Alex', 'Ridgeline', 'Sam', '480-555-0199', '7.5', '6.5', '7%'])
    a.finish()


@scenario
def offline_uses_rules(browser):
    a = App(browser, mock={'onDevice': False, 'cloud': False})
    a.click('load-sample')
    a.check(LENDER); a.wait('screen-verdict')
    assert a.text('source-chip') == 'Offline rules'
    assert a.text('verdict-pill') == 'Real offer, but overpriced'
    a.click('explain'); a.wait('explain-sheet')
    sheet = a.text('explain-sheet')
    assert 'Offline rules' in sheet and '$2,189' in sheet and 'Rate lock' in sheet, sheet
    a.pg.keyboard.press('Escape'); a.pg.locator('[data-testid="explain-sheet"] [aria-label="Done"]').click()
    a.click('draft-counter'); a.wait('draft-0')
    assert a.text('source-chip') == 'Offline rules'
    assert 'Thanks Dana! I have a written 6.15% elsewhere. Can you match it and bring fees to $1,200?' in a.text('draft-0')
    a.finish()


@scenario
def bad_model_output_falls_back(browser):
    a = App(browser, mock={'onDevice': True, 'badJson': True})
    a.click('load-sample')
    a.check(LENDER); a.wait('screen-verdict')
    assert a.text('source-chip') == 'Offline rules'
    assert len(a.calls()) == 2, 'one retry, then rules'
    assert a.text('verdict-pill') == 'Real offer, but overpriced'
    a.finish()


@scenario
def leaky_model_drafts_are_replaced(browser):
    a = App(browser, mock={'onDevice': True, 'leakyDrafts': True})
    a.click('load-sample')
    a.click('deal-sample-summit'); a.wait('screen-rounds')
    a.click('counter-again'); a.wait('draft-0')
    assert '2 drafts' in a.text('replaced-note'), a.text('replaced-note')
    for i in range(3):
        d = a.text(f'draft-{i}')
        assert '6.25' not in d and 'close by' not in d and 'Within your limits' in d, d
    a.finish()


@scenario
def scam_never_reaches_a_model(browser):
    a = App(browser)
    a.check(SCAM); a.wait('screen-scam')
    banner = a.text('scam-banner')
    for reason in ['Asks for a fee before any money is paid out', 'Pressure to pay today', 'No lender name or licence number', "Link goes to a site that isn't a known lender"]:
        assert reason in banner, reason
    assert a.text('source-chip') == 'Offline rules'
    assert a.calls() == [], 'no model call for a scam'
    assert not a.has('draft-counter') and not a.has('start-deal'), 'no reply is offered'
    a.shot('f01-scam')
    a.click('block-report'); a.wait('block-sheet')
    assert '7726' in a.text('block-sheet')
    a.finish()


@scenario
def own_wording_is_guarded(browser):
    a = App(browser)
    a.click('load-sample')
    a.click('deal-sample-summit'); a.click('counter-again'); a.wait('draft-0')
    a.click('own-open'); a.fill('own-input', LEAK); a.click('own-check'); a.wait('leak-block')
    assert 'Hold on before you send' in a.text('leak-block') and 'walk-away rate' in a.text('leak-block')
    assert "I'm looking for 6.15% with $1,200 in fees. Can you get there?" in a.text('safer')
    a.shot('g01-own-leak')
    a.fill('own-input', 'I am almost at the end of what I can stretch to.'); a.click('own-check'); a.wait('own-ok')
    assert 'hints' in a.text('own-ok'), a.text('own-ok')
    w = [c for c in a.calls() if c['prompt'].startswith('[task:wording]')]
    assert w and all(c['mode'] == 'only_on_device' for c in w), 'own wording never goes to the cloud'
    a.fill('own-input', LEAK); a.click('own-check'); a.wait('use-safer'); a.click('use-safer')
    a.wait('screen-rounds')
    assert a.js('window.__clipboard') == "I'm looking for 6.15% with $1,200 in fees. Can you get there?"
    a.finish()


@scenario
def cloud_fallback_can_be_switched_off(browser):
    a = App(browser, mock={'onDevice': False, 'cloud': True})
    a.click('load-sample')
    a.click('open-settings'); a.wait('screen-settings')
    assert a.text('ondevice-pill') == 'Not on this device' and a.text('cloud-pill') == 'Connected'
    a.click('cloud-fallback'); a.click('back')
    a.check(LENDER); a.wait('screen-verdict')
    assert a.text('source-chip') == 'Offline rules'
    assert a.calls() == [], 'nothing went to the cloud'
    a.finish()


@scenario
def remote_config_changes_rules_and_model(browser):
    rules = json.dumps({'threshold': 3, 'rules': [{'id': 'tax-refund', 'label': 'Mentions a tax refund advance', 'pattern': 'tax refund advance', 'weight': 3}]})
    a = App(browser, mock={'onDevice': False, 'cloud': True, 'remote': {'scam_rules': rules, 'cloud_model': 'gemini-from-remote-config'}})
    a.pg.wait_for_timeout(300)
    a.check('Get your tax refund advance now, reply YES'); a.wait('screen-scam')
    assert 'Mentions a tax refund advance' in a.text('scam-banner')
    a.click('scam-done')
    a.check(LENDER); a.wait('screen-verdict')
    assert a.calls()[-1]['model'] == 'gemini-from-remote-config'
    a.finish()


@scenario
def keyboard_panel_practice(browser):
    a = App(browser)
    a.click('nav-keyboard'); a.wait('kb-panel')
    a.click('kb-counter'); a.wait('kb-needs-setup')
    assert 'Copy their message first' in a.text('kb-needs-setup')
    a.click('kb-bubble'); assert a.text('kb-copied') == 'Copied'
    a.click('kb-globe'); a.click('kb-counter'); a.wait('kb-needs-setup')
    assert 'No deal matches' in a.text('kb-needs-setup'), a.text('kb-needs-setup')
    a.click('nav-home'); a.click('load-sample'); a.click('nav-keyboard'); a.wait('kb-panel')
    a.click('kb-bubble'); a.click('kb-counter'); a.wait('kb-needs-setup')
    assert 'Set your limits' in a.text('kb-needs-setup'), 'sample limits are not usable until a PIN locks them'
    a.click('nav-limits'); a.fill('pin-input', '4821'); a.click('lock-limits'); a.wait('unlock')
    a.no_toast()
    a.click('nav-keyboard'); a.wait('kb-panel'); a.shot('k01-ready')
    assert a.text('kb-deal') == 'Refi · Summit'
    a.click('kb-bubble'); a.click('kb-check'); a.wait('kb-verdict')
    assert 'Real offer, but overpriced' in a.text('kb-verdict') and '6.40%' in a.text('kb-verdict')
    a.click('kb-counter'); a.wait('kb-draft-0'); a.shot('k02-counter')
    chip = a.text('kb-draft-1')
    a.click('kb-draft-1'); a.wait('kb-filled')
    assert a.t('kb-input').input_value() in chip
    a.click('kb-send'); assert a.t('kb-input').input_value() == ''
    a.fill('kb-input', LEAK); a.click('kb-check', 0); a.wait('kb-leak'); a.no_toast(); a.shot('k03-leak')
    assert 'Hold on before you send' in a.text('kb-leak')
    a.click('kb-use-safer')
    assert a.t('kb-input').input_value() == "I'm looking for 6.15% with $1,200 in fees. Can you get there?"
    a.click('kb-sample-dealer'); assert a.text('kb-deal') == 'Car · Ridgeline'
    a.click('kb-bubble'); a.click('kb-explain'); a.wait('kb-explain-out')
    a.click('kb-sample-scam'); assert a.text('kb-deal') == 'No deal selected'
    a.click('kb-bubble'); a.click('kb-counter'); a.wait('kb-scam'); a.shot('k04-scam')
    assert "Likely a scam. Don't reply." in a.text('kb-scam') and not a.has('kb-draft-0')
    a.click('kb-block'); assert '7726' in a.text('kb-scam')
    a.finish()


@scenario
def judge_mode_one_click(browser):
    """?judge=1: sample deals and locked limits, so Counter and the leak guard work at once."""
    a = App(browser)
    a.pg.goto(a.url + '?judge=1')
    a.pg.wait_for_selector('#root > *')
    a.wait('judge-banner')
    assert '2468' in a.text('judge-banner'), a.text('judge-banner')
    a.wait('hero')
    a.click('nav-keyboard'); a.wait('kb-panel')
    assert a.text('kb-deal') == 'Refi · Summit'
    a.click('kb-bubble'); a.click('kb-counter'); a.wait('kb-draft-0')
    a.fill('kb-input', 'The highest I can go is six and a quarter.'); a.click('kb-check', 0); a.wait('kb-leak')
    assert 'Hold on before you send' in a.text('kb-leak')
    a.no_toast(); a.shot('j01-judge-leak')
    a.finish()


@scenario
def erase_everything(browser):
    a = App(browser)
    a.click('load-sample'); a.click('nav-limits'); a.fill('pin-input', '4821'); a.click('lock-limits'); a.wait('unlock')
    a.click('nav-home'); a.click('open-settings'); a.click('erase'); a.click('erase-confirm')
    a.wait('welcome')
    a.pg.wait_for_timeout(500)
    left = a.js("Object.keys(localStorage).filter(k => k.includes('secondlook')).map(k => localStorage.getItem(k)).join(' ')")
    for gone in ['Summit', 'Ridgeline', 'maxRate', 'hash', 'Alex', '6.25']:
        assert gone not in left, f'{gone} still stored after erase: {left[:200]}'
    a.pg.reload(); a.wait('welcome')
    a.click('nav-limits'); assert 'Add a deal first' in a.t('screen-limits').inner_text()
    a.finish()


@scenario
def erase_wins_a_race_with_a_pending_save(browser):
    a = App(browser)
    a.click('load-sample')
    # Change something (schedules a save) and erase in the same tick, many times over.
    a.js("document.querySelector('[data-testid=open-settings]').click()")
    a.wait('screen-settings')
    a.js("document.querySelector('[data-testid=settings-sample]').click()")
    a.wait('screen-home'); a.click('open-settings'); a.click('erase')
    a.js("document.querySelector('[data-testid=appearance-dark]').click(); document.querySelector('[data-testid=erase-confirm]').click()")
    a.wait('welcome'); a.pg.wait_for_timeout(600)
    left = a.js("Object.keys(localStorage).filter(k => k.includes('secondlook')).map(k => localStorage.getItem(k)).join(' ')")
    assert 'Summit' not in left and 'maxRate' not in left, left[:200]
    a.finish()


@scenario
def firebase_not_configured(browser):
    a = App(browser, dist='dist-preview-off')
    a.click('load-sample'); a.click('open-settings')
    assert a.text('cloud-pill') == 'Not set up'
    a.click('back')
    a.check(LENDER); a.wait('screen-verdict')
    assert a.text('source-chip') == 'Offline rules'
    a.click('back')
    a.click('deal-sample-ridgeline'); a.pg.locator('[data-testid^="round-"]').first.click(); a.wait('range-empty')
    a.click('get-range'); a.wait('range-card')
    assert 'Sample range' in a.text('range-card')
    assert 'What the cloud would see' in a.text('cloud-saw')
    assert a.calls() == []
    a.finish()


@scenario
def ios_native_adapter(browser):
    a = App(browser, dist='dist-preview-ios', clip=LENDER, extra_init=NATIVE_FAKE % {'shared': 'null', 'ondevice': 'available'})
    a.click('load-sample'); a.pg.wait_for_timeout(200)
    a.click('nav-keyboard'); a.click('nav-home'); a.wait('check-card')
    assert 'You copied a message' in a.text('check-card')
    assert not a.has('paste-input') and a.has('paste-instead'), 'with text copied, the card is just the button'
    a.shot('m01-ios-home')
    a.click('check-btn'); a.wait('screen-verdict')
    assert a.text('source-chip') == 'Read on-device'
    n = a.js('window.__native.calls')
    assert n[0]['mode'] == 'only-on-device' and n[0]['cloudModel'] == 'gemini-3.5-flash-lite', n[0]
    a.click('draft-counter'); a.wait('draft-0')
    assert 'Open in Messages' in a.text('send-draft')
    a.click('send-draft'); a.wait('screen-rounds')
    opened = a.js('window.__opened')
    assert opened and opened[0].startswith('sms:&body=Thank%20you.%20Could%20you%20get%20to%206.15%25'), opened
    assert 'Filled in' in a.text('toast')
    a.finish()


@scenario
def ios_keyboard_test_bench(browser):
    a = App(browser, dist='dist-preview-ios-kb', extra_init=NATIVE_FAKE % {'shared': 'null', 'ondevice': 'available'})
    a.click('load-sample'); a.pg.wait_for_timeout(400)
    pack = json.loads(a.js("window.__native.keychain['secondlook.pack.v1']"))
    assert pack['deals'][0]['label'] == 'Refi · Summit' and pack['deals'][0]['limits']['maxRate'] == 6.25, 'the limits pack goes to the shared keychain'
    a.click('open-settings'); a.wait('kb-bench')
    ids = a.text('kb-bench-ids')
    assert 'com.secondlook.app' in ids and 'TEAM123.secondlook.shared' in ids, ids
    a.click('kb-bench-t4')
    assert 'tap Tests, then T4' in a.text('kb-bench-t4-out')
    assert a.js("window.__native.keychain['secondlook.t4']").startswith('app wrote ')
    a.js('window.__native.noShare = true'); a.click('kb-bench-t4')
    assert '-34018' in a.text('kb-bench-t4-out')
    a.click('erase'); a.click('erase-confirm'); a.wait('welcome'); a.pg.wait_for_timeout(400)
    assert json.loads(a.js("window.__native.keychain['secondlook.pack.v1']"))['deals'] == [], 'erase also empties the keyboard copy'
    a.finish()


@scenario
def android_select_text_and_cloud_fallback(browser):
    a = App(browser, dist='dist-preview-android', extra_init=NATIVE_FAKE % {'shared': json.dumps(SCAM), 'ondevice': 'unavailable'})
    a.wait('screen-scam')  # launched straight into the verdict from "select text -> Quotekey"
    a.click('scam-done'); a.click('load-sample')
    a.js("window.__native.listeners.forEach(cb => cb({text: %s}))" % json.dumps(DEALER))
    a.wait('screen-verdict')
    assert a.text('source-chip') == 'Cloud · redacted', a.text('source-chip')
    n = a.js('window.__native.calls')
    assert n[-1]['mode'] == 'prefer-on-device' and n[-1]['source'] == 'cloud'
    assert a.js('window.__hardwareBack()') is True
    a.wait('screen-home')
    a.click('deal-sample-summit'); a.click('counter-again'); a.wait('draft-0'); a.click('send-draft'); a.wait('screen-rounds')
    assert a.js('window.__opened')[0].startswith('sms:?body=')
    a.finish()


@scenario
def layouts_fit_small_and_large_screens(browser):
    for size in [(320, 568), (360, 740), (430, 932), (1280, 800)]:
        a = App(browser, size=size)
        a.click('load-sample')
        def fits(where):
            w = a.js('document.documentElement.scrollWidth')
            assert w <= size[0], f'{where} overflows sideways at {size}: {w}'
            bad = a.js("""[...document.querySelectorAll('.rn-view,.rn-text,.rn-input')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => (e.dataset.testid || e.innerText || e.className).slice(0, 40)).slice(0, 5)""")
            assert not bad, f'{where} has clipped content at {size}: {bad}'
        fits('home')
        a.click('deal-sample-summit'); a.wait('screen-rounds'); fits('rounds')
        a.pg.locator('[data-testid^="round-"]').first.click(); a.wait('screen-verdict'); fits('verdict')
        a.click('draft-counter'); a.wait('draft-0'); fits('drafts')
        a.click('back'); a.click('back'); a.click('back')
        a.click('nav-limits'); fits('limits')
        a.click('back') if a.has('back') else None
        a.click('nav-keyboard') if a.has('nav-keyboard') else None
        if a.has('kb-panel'):
            a.click('kb-bubble'); a.click('kb-check'); a.wait('kb-verdict'); fits('keyboard')
        a.finish()


@scenario
def every_control_has_a_name(browser):
    a = App(browser)
    a.click('load-sample')
    def audit(where):
        bad = a.js("""[...document.querySelectorAll('.rn-pressable, .rn-input')].filter(e => !(e.getAttribute('aria-label') || '').trim() && !(e.innerText || '').trim()).map(e => e.dataset.testid || e.outerHTML.slice(0, 80))""")
        assert not bad, f'{where}: controls with no accessible name: {bad}'
    audit('home')
    a.click('deal-sample-summit'); audit('rounds')
    a.click('counter-again'); a.wait('draft-0'); audit('drafts')
    a.click('back'); a.click('edit-deal'); audit('deal file')
    a.click('back'); a.click('back'); a.click('nav-limits'); audit('limits')
    a.click('back'); a.click('nav-keyboard'); audit('keyboard')
    a.click('nav-home'); a.click('open-settings'); audit('settings')
    a.finish()


@scenario
def dark_mode_screens(browser):
    a = App(browser, scheme='dark', clip=LENDER)
    a.click('load-sample'); a.pg.wait_for_timeout(200)
    bg = a.js("getComputedStyle(document.querySelector('[data-testid=screen-home]').parentElement).backgroundColor")
    assert bg == 'rgb(35, 38, 35)', bg
    a.shot('d01-home-dark')
    a.click('nav-limits'); a.shot('d02-limits-dark')
    a.fill('pin-input', '4821'); a.click('lock-limits'); a.wait('unlock'); a.no_toast()
    a.click('nav-home'); a.click('deal-sample-summit'); a.shot('d03-rounds-dark')
    a.pg.locator('[data-testid^="round-"]').first.click(); a.wait('screen-verdict'); a.shot('d04-verdict-dark')
    a.click('draft-counter'); a.wait('draft-0'); a.shot('d05-drafts-dark')
    a.click('back'); a.click('back'); a.click('back'); a.click('nav-keyboard'); a.click('kb-bubble'); a.click('kb-counter'); a.wait('kb-draft-0'); a.shot('d06-keyboard-dark')
    a.click('nav-home'); a.check(SCAM); a.wait('screen-scam'); a.shot('d07-scam-dark')
    a.finish()


def main():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for s in [full_negotiation_on_device, cloud_fallback_is_redacted, offline_uses_rules, bad_model_output_falls_back, leaky_model_drafts_are_replaced,
                  scam_never_reaches_a_model, own_wording_is_guarded, cloud_fallback_can_be_switched_off, remote_config_changes_rules_and_model,
                  keyboard_panel_practice, judge_mode_one_click, erase_everything, erase_wins_a_race_with_a_pending_save, firebase_not_configured, ios_native_adapter, ios_keyboard_test_bench, android_select_text_and_cloud_fallback,
                  layouts_fit_small_and_large_screens, every_control_has_a_name, dark_mode_screens]:
            if only and s.__name__ not in only:
                continue
            s(browser)
        browser.close()
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)} of {len(results)} browser scenarios passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
