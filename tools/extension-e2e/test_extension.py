"""SecondLook for Chrome, end to end, in a real Chromium with the extension loaded.

The side panel is opened as a tab (same page, same code); the right-click is replaced by a call
to the extension's own menu handler. A real right-click grants the extension access to the tab
it was made in; this test copy gets that access to localhost from its manifest instead.
"""
import json
import pathlib
import shutil
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'ext-out')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:8081'
EXPECTED_ID = 'koogiofpinglcgjiaonpllmbdhcbndcl'
LEAK = 'Honestly, the highest I can go is 6.25%.'

tmp = pathlib.Path(tempfile.mkdtemp())
ext = tmp / 'extension'
shutil.copytree(ROOT / 'extension', ext)
manifest = json.loads((ext / 'manifest.json').read_text())
manifest['host_permissions'] = ['http://localhost/*']
(ext / 'manifest.json').write_text(json.dumps(manifest))

results = []
n = [0]


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)[:400]))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(detail)[:400] if detail else ''), flush=True)


def shot(pg, name):
    n[0] += 1
    pg.screenshot(path=str(OUT / f'{n[0]:02d}-{name}.png'))


def wait_text(loc, needle, timeout=60):
    """Waits until a locator's text contains `needle`; returns the text."""
    import time
    end = time.time() + timeout
    txt = ''
    while time.time() < end:
        try:
            txt = loc.inner_text(timeout=2000)
            if needle in txt:
                return txt
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.5)
    return txt


SEND = """async ([kind, text]) => {
  const [tab] = await chrome.tabs.query({ url: 'http://localhost:8081/__e2e/*' });
  await self.secondlookHandle({ menuItemId: kind, selectionText: text, frameId: 0 }, tab);
  return tab.id;
}"""

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        str(tmp / 'profile'), channel='chromium', headless=True,
        args=[f'--disable-extensions-except={ext}', f'--load-extension={ext}'],
    )
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=30000)
    ext_id = sw.url.split('/')[2]
    check('extension loads with its fixed id', ext_id == EXPECTED_ID, ext_id)

    page = ctx.new_page()
    page.set_viewport_size({'width': 900, 'height': 700})
    page.goto(BASE + '/__e2e/page.html')
    message = page.inner_text('#msg')

    panel = ctx.new_page()
    panel.set_viewport_size({'width': 400, 'height': 820})
    panel.goto(f'chrome-extension://{ext_id}/panel.html?src={BASE}/')
    app = panel.frame_locator('#app')
    tid = lambda t: app.locator(f'[data-testid="{t}"]')

    try:
        tid('screen-keyboard').wait_for(timeout=60000)
        shot(panel, 'panel-opens-on-keyboard')
        check('side panel opens the app on the keyboard panel', True)

        # Set up as a user would: sample deals, then limits locked with a PIN.
        tid('nav-home').click()
        tid('load-sample').click()
        tid('nav-limits').click()
        tid('pin-input').fill('2580')
        tid('lock-limits').click()
        tid('unlock').wait_for(timeout=10000)
        check('limits locked in the panel', True)

        sw.evaluate(SEND, ['theirs', message])
        tid('kb-verdict').wait_for(timeout=60000)
        verdict = tid('kb-verdict').inner_text()
        shot(panel, 'their-message-checked')
        check('right-click "check their message" → verdict in the panel', '6.40' in verdict, verdict.replace('\n', ' '))

        tid('kb-counter').click()
        tid('kb-draft-0').wait_for(timeout=60000)
        drafts = [tid(f'kb-draft-{i}').inner_text() for i in range(3)]
        shot(panel, 'three-replies')
        check('Counter: three replies, none reveal 6.25%', len(drafts) == 3 and not any('6.25' in d for d in drafts), ' || '.join(d.replace('\n', ' ') for d in drafts))

        tid('kb-draft-0').click()
        page.wait_for_function("document.querySelector('#reply').value.length > 10", timeout=15000)
        typed = page.input_value('#reply')
        shot(page, 'reply-typed-into-page')
        shot(panel, 'panel-after-typing')
        check('tapping a reply types it into the page reply box', typed and typed in drafts[0].replace('\n', ' ') or typed in drafts[0], typed)

        sw.evaluate(SEND, ['own', LEAK])
        tid('kb-leak').wait_for(timeout=30000)
        shot(panel, 'leak-guard')
        check('right-click "check my reply" → leak guard stops the walk-away rate', True, tid('kb-leak').inner_text().replace('\n', ' '))

        if tid('kb-use-safer').count():
            tid('kb-use-safer').click()
            page.wait_for_function("!document.querySelector('#reply').value.includes('6.25')", timeout=15000)
            safer = page.input_value('#reply')
            shot(page, 'safer-version-typed')
            check('safer version replaces it in the page, without 6.25%', '6.25' not in safer and len(safer) > 10, safer)

        # A quote that arrives by email: a webmail-style page with a rich reply box that already
        # holds a signature and the quoted thread. Chrome's selection text loses line breaks.
        page.goto(BASE + '/__e2e/email.html')
        email = ' '.join(page.inner_text('#mail').split())
        page.click('#reply-btn')
        sw.evaluate(SEND, ['theirs', email])
        verdict = wait_text(tid('kb-verdict'), '6.375')
        shot(panel, 'email-checked')
        check('email quote → the offered 6.375%, not the 7.125% current rate', '6.375' in verdict and '7.125' not in verdict, verdict.replace('\n', ' '))
        tid('kb-counter').click()
        tid('kb-draft-0').wait_for(timeout=60000)
        first = tid('kb-draft-0').inner_text()
        tid('kb-draft-0').click()
        page.wait_for_function("!document.querySelector('#compose').innerText.trim().startsWith('--')", timeout=15000)
        body = page.inner_text('#compose')
        shot(page, 'email-reply-typed')
        check('email reply typed above the signature; signature and quoted email kept',
              'Alex' in body and 'wrote:' in body and body.index('wrote:') > 20 and not body.strip().startswith('--'),
              body.replace('\n', ' | '))
    except Exception as e:  # noqa: BLE001
        shot(panel, 'failure')
        check('no errors', False, f'{type(e).__name__}: {e}')

    ctx.close()

passed = sum(ok for _, ok, _ in results)
md = [f'# SecondLook for Chrome: {passed}/{len(results)} checks passed', '']
md += [f"- {'PASS' if ok else 'FAIL'} · {name}{(' — ' + d) if d else ''}" for name, ok, d in results]
(OUT / 'results.md').write_text('\n'.join(md) + '\n')
print('\n'.join(md))
sys.exit(0 if passed == len(results) else 1)
