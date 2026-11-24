"""Quick look: open the preview, optionally load samples, and screenshot each main screen."""
import asyncio, os, sys
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist-preview', 'shots')
SCHEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
os.makedirs(OUT, exist_ok=True)

INIT = """
window.__insets = {top: 44, bottom: 0, left: 0, right: 0};
window.__scheme = '%s';
window.__mock = {onDevice: true, cloud: true, calls: []};
window.LanguageModel = {availability: async () => window.__mock.onDevice ? 'available' : 'unavailable'};
""" % SCHEME

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script(INIT)
        await pg.goto('file://' + os.path.join(ROOT, 'dist-preview', 'index.html'))
        tid = lambda t: pg.locator(f'[data-testid="{t}"]')
        shot = lambda n: pg.screenshot(path=os.path.join(OUT, f'{n}-{SCHEME}.png'))
        await pg.wait_for_selector('[data-testid="screen-home"]')
        await shot('00-home-empty')
        await tid('load-sample').click()
        await pg.evaluate("window.__clipboard = 'Hi Alex, good news. I can get you 6.40% on a 30-yr fixed, $1,850 in fees. Lock ends Friday.'")
        await pg.wait_for_timeout(200)
        await shot('01-home')
        await tid('nav-limits').click(); await pg.wait_for_timeout(150); await shot('02-limits-new')
        await tid('pin-input').fill('4821'); await tid('lock-limits').click(); await pg.wait_for_timeout(200); await shot('03-limits-locked')
        await tid('nav-home').click()
        await tid('deal-sample-summit').click(); await pg.wait_for_timeout(150); await shot('04-rounds')
        await tid('round-r1').click(); await pg.wait_for_timeout(150); await shot('05-verdict')
        await tid('draft-counter').click(); await pg.wait_for_selector('[data-testid="draft-0"]'); await shot('06-drafts')
        await tid('back').click(); await tid('back').click(); await tid('back').click()
        await tid('nav-keyboard').click(); await pg.wait_for_timeout(150); await shot('07-kb-ready')
        await tid('kb-bubble').click(); await tid('kb-counter').click(); await pg.wait_for_selector('[data-testid="kb-draft-0"]'); await shot('08-kb-counter')
        await tid('kb-globe').click(); await tid('kb-input').fill('Honestly, the highest I can go is 6.25%.'); await tid('kb-check').click(); await pg.wait_for_selector('[data-testid="kb-leak"]'); await shot('09-kb-leak')
        await tid('kb-sample-scam').click(); await tid('kb-bubble').click(); await tid('kb-check').click(); await pg.wait_for_selector('[data-testid="kb-scam"]'); await shot('10-kb-scam')
        await tid('nav-home').click(); await tid('open-settings').click(); await pg.wait_for_timeout(300); await shot('11-settings')
        warn = await pg.evaluate('window.__styleWarnings || []')
        print('errors:', errors)
        print('style warnings:', sorted(set(warn)))
        await b.close()

asyncio.run(main())
