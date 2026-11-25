"""Walks through SecondLook on an Android emulator with adb + uiautomator.

Usage: python3 run.py <apk> <out-dir>

Writes numbered screenshots, results.md / results.json and a filtered, redacted log to
<out-dir>. Never fails the job on a test failure, so the evidence is always uploaded; the
result of each step is in results.md.
"""
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APK, OUT = sys.argv[1], sys.argv[2]
PKG = 'com.secondlook.app'
os.makedirs(OUT, exist_ok=True)

LENDER = ("Hi, this is Sarah from Sunwest Credit Union (NMLS 401822). You're approved for "
          "$24,000 on the Civic at 7.4% APR for 60 months, $480/mo, plus a $395 doc fee.")
SCAM = ("CONGRATS! You're pre-approved for a $50,000 loan at 2.9% APR. Pay the $250 "
        "processing fee today to release your funds: fastfunds.example/claim")
LEAK = "Honestly, the highest I can go is 6.25%."
PIN = "2580"  # made-up PIN for this throwaway emulator

results = []
shots = [0]


class Fail(Exception):
    pass


def adb(*args, timeout=90):
    return subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)


def shell(cmd, timeout=90):
    return adb('shell', cmd, timeout=timeout)


def shot(name):
    shots[0] += 1
    path = f'{OUT}/{shots[0]:02d}-{name}.png'
    data = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=60).stdout
    with open(path, 'wb') as f:
        f.write(data)
    return os.path.basename(path)


def dump():
    for _ in range(4):
        # One string: adb joins arguments, so the remote shell must get the whole command at once.
        r = adb('exec-out', 'uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml')
        s = r.stdout
        i = s.find('<hierarchy')
        if i >= 0:
            try:
                return ET.fromstring(s[i:])
            except ET.ParseError:
                pass
        time.sleep(1)
    return None


def all_nodes(root):
    return list(root.iter('node')) if root is not None else []


def label(nd):
    return (nd.get('text') or '') + ' ' + (nd.get('content-desc') or '')


def find(key, root=None, exact_only=False):
    root = dump() if root is None else root
    ns = all_nodes(root)
    for nd in ns:
        rid = nd.get('resource-id') or ''
        if rid == key or rid.endswith('/' + key):
            return nd
    for nd in ns:
        if key == (nd.get('text') or '') or key == (nd.get('content-desc') or ''):
            return nd
    if exact_only:
        return None
    k = key.lower()
    for nd in ns:
        if k in label(nd).lower():
            return nd
    return None


def subtree_text(nd):
    parts = []
    for x in nd.iter('node'):
        for v in (x.get('text'), x.get('content-desc')):
            if v and v not in parts:
                parts.append(v)
    return ' | '.join(parts)


def center(nd):
    a = list(map(int, re.findall(r'\d+', nd.get('bounds'))))
    return (a[0] + a[2]) // 2, (a[1] + a[3]) // 2


def swipe_up():
    shell('input swipe 540 1700 540 800 300')
    time.sleep(0.8)


def swipe_down():
    shell('input swipe 540 700 540 1700 300')
    time.sleep(0.8)


def wait_for(keys, timeout=30, scroll=False, exact_only=False):
    keys = [keys] if isinstance(keys, str) else keys
    end = time.time() + timeout
    tries = 0
    while time.time() < end:
        root = dump()
        for k in keys:
            nd = find(k, root, exact_only=exact_only)
            if nd is not None:
                return k, nd
        if scroll:
            tries += 1
            if tries <= 4:
                swipe_up()
            elif tries <= 9:
                swipe_down()
        else:
            time.sleep(1.5)
    return None, None


def tap(key, timeout=20, scroll=True, exact_only=False):
    k, nd = wait_for(key, timeout, scroll=scroll, exact_only=exact_only)
    if nd is None:
        raise Fail(f'could not find "{key}" on screen')
    x, y = center(nd)
    shell(f'input tap {x} {y}')
    time.sleep(1.2)
    return nd


def type_text(s):
    out = ''
    for ch in s:
        if ch == ' ':
            out += '%s'
        elif ch in '\\\'"$()&;|<>*?`~!#[]{}':
            out += '\\' + ch
        else:
            out += ch
    shell(f'input text {out}')
    time.sleep(1)


def clear_focused_field():
    shell('input keycombination 113 29')  # Ctrl+A
    shell('input keyevent 67')  # Delete
    time.sleep(0.5)


def back():
    shell('input keyevent 4')
    time.sleep(1.2)


def alive():
    return bool(shell(f'pidof {PKG}').stdout.strip())


def step(name):
    def wrap(fn):
        def run():
            entry = {'step': name, 'status': 'PASS', 'detail': '', 'shots': []}
            t0 = time.time()
            try:
                detail = fn(entry)
                entry['detail'] = detail or ''
            except Exception as e:  # noqa: BLE001
                entry['status'] = 'FAIL'
                entry['detail'] = f'{type(e).__name__}: {e}'
                try:
                    entry['shots'].append(shot('fail-' + re.sub(r'\W+', '-', name.lower())[:30]))
                except Exception:  # noqa: BLE001
                    pass
            entry['seconds'] = round(time.time() - t0, 1)
            if not alive():
                entry['detail'] += ' [app process is NOT running after this step]'
                if entry['status'] == 'PASS':
                    entry['status'] = 'FAIL'
            results.append(entry)
            print(f"{entry['status']}  {name}  {entry['detail']}", flush=True)
        return run
    return wrap


def go_tab(name):
    tap(f'nav-{name}', scroll=False, exact_only=True)


def launch_home():
    shell(f'monkey -p {PKG} -c android.intent.category.LAUNCHER 1')
    k, _ = wait_for(['screen-home', 'welcome', 'Get a second look'], 60)
    if not k:
        raise Fail('home screen did not appear')


def source_line():
    root = dump()
    parts = []
    for key in ('source-chip', 'ondevice-pill', 'cloud-pill', 'redacted-note', 'verdict-pill'):
        nd = find(key, root, exact_only=True)
        if nd is not None:
            parts.append(f'{key}: {subtree_text(nd)}')
    return '; '.join(parts) or 'no source chip found'


# ---------------------------------------------------------------- steps

@step('Install the APK')
def s_install(e):
    r = adb('install', '-r', '-g', APK, timeout=300)
    if 'Success' not in (r.stdout + r.stderr):
        raise Fail((r.stdout + r.stderr).strip()[-400:])
    v = shell(f'dumpsys package {PKG} | grep -m2 -E "versionName|targetSdk"').stdout.strip()
    return v.replace('\n', ' ')


@step('Launch: home screen appears, no crash')
def s_launch(e):
    adb('logcat', '-c')
    launch_home()
    time.sleep(3)
    e['shots'].append(shot('home'))
    return 'home visible'


@step('Settings: where answers run (on-device / cloud)')
def s_settings(e):
    tap('open-settings', scroll=False, exact_only=True)
    k, nd = wait_for('ai-status', 20, scroll=True, exact_only=True)
    e['shots'].append(shot('settings'))
    if nd is None:
        raise Fail('"Where answers run" card not found')
    # give the status checks a moment, then read again
    time.sleep(4)
    k, nd = wait_for('ai-status', 10, exact_only=True)
    e['shots'].append(shot('settings-status'))
    txt = subtree_text(nd)
    back()
    return txt


@step('Select text → SecondLook is registered in the text-selection menu')
def s_registered(e):
    r = shell('cmd package query-activities --brief -a android.intent.action.PROCESS_TEXT -t text/plain')
    out = r.stdout.strip()
    if PKG not in out:
        raise Fail('SecondLook is not listed for PROCESS_TEXT: ' + out[-300:])
    return 'listed: ' + ' '.join(l.strip() for l in out.splitlines() if PKG in l)


def send_process_text(text):
    with open('/tmp/msg.txt', 'w') as f:
        f.write(text)
    adb('push', '/tmp/msg.txt', '/data/local/tmp/msg.txt')
    return shell('am start -a android.intent.action.PROCESS_TEXT -t text/plain '
                 f'-n {PKG}/.MainActivity --es android.intent.extra.PROCESS_TEXT "$(cat /data/local/tmp/msg.txt)"')


@step('Selected lender text (app already open) → verdict')
def s_process_lender(e):
    go_tab('home') if find('nav-home', exact_only=True) is not None else None
    send_process_text(LENDER)
    time.sleep(2)
    e['shots'].append(shot('process-text-busy'))
    k, nd = wait_for(['screen-verdict', 'screen-scam', 'Start a deal from this'], 90)
    time.sleep(2)
    e['shots'].append(shot('process-text-verdict'))
    if not k:
        raise Fail('no verdict after 90 s')
    rate = find('verdict-rate', exact_only=True)
    return f'{k}; rate: {subtree_text(rate) if rate is not None else "?"}; {source_line()}'


@step('Selected scam text (app closed first, cold start) → scam warning')
def s_process_scam(e):
    shell(f'am force-stop {PKG}')
    time.sleep(1)
    send_process_text(SCAM)
    k, nd = wait_for(['screen-scam', 'screen-verdict', 'Likely a scam'], 90)
    time.sleep(2)
    e['shots'].append(shot('process-text-scam'))
    if k not in ('screen-scam', 'Likely a scam'):
        raise Fail(f'expected the scam screen, got {k}')
    return 'scam screen shown; ' + source_line()


@step('Load sample deals')
def s_samples(e):
    shell(f'am force-stop {PKG}')
    launch_home()
    time.sleep(2)
    if find('hero', exact_only=True) is None:
        tap('load-sample', exact_only=True)
        time.sleep(2)
    e['shots'].append(shot('sample-deals'))
    if find('hero', exact_only=True) is None and find('Won so far') is None:
        raise Fail('sample deals did not appear')
    return 'sample deals loaded'


@step('Lock limits with a PIN (needed for Counter)')
def s_lock(e):
    go_tab('limits')
    time.sleep(2)
    e['shots'].append(shot('limits'))
    if find('unlock', exact_only=True) is not None:
        return 'already locked'
    tap('pin-input', exact_only=True)
    type_text(PIN)
    shell('input keyevent 111')  # dismiss the soft keyboard (ESC)
    time.sleep(1)
    tap('lock-limits', exact_only=True)
    time.sleep(2)
    e['shots'].append(shot('limits-locked'))
    k, _ = wait_for(['unlock', 'limits-error'], 10, exact_only=True)
    if k != 'unlock':
        err = find('limits-error', exact_only=True)
        raise Fail('limits not locked: ' + (subtree_text(err) if err is not None else 'no message'))
    return 'limits locked'


@step('Keyboard panel: Check a lender message')
def s_kb_check(e):
    go_tab('keyboard')
    time.sleep(2)
    e['shots'].append(shot('keyboard'))
    tap('kb-sample-lender', exact_only=True)
    tap('kb-bubble', exact_only=True)
    tap('kb-check', exact_only=True)
    k, nd = wait_for(['kb-verdict', 'kb-scam', 'kb-needs-setup'], 90, exact_only=True)
    time.sleep(1)
    e['shots'].append(shot('kb-check'))
    if k != 'kb-verdict':
        raise Fail(f'got {k}: ' + (subtree_text(nd) if nd is not None else 'nothing'))
    return subtree_text(nd) + ' || ' + source_line()


@step('Keyboard panel: Counter → three replies inside the limits')
def s_kb_counter(e):
    tap('kb-counter', exact_only=True)
    k, nd = wait_for(['kb-draft-0', 'kb-needs-setup', 'kb-scam'], 120, exact_only=True)
    time.sleep(1)
    e['shots'].append(shot('kb-counter'))
    if k != 'kb-draft-0':
        raise Fail(f'got {k}: ' + (subtree_text(nd) if nd is not None else 'nothing'))
    drafts = []
    root = dump()
    for i in range(3):
        d = find(f'kb-draft-{i}', root, exact_only=True)
        if d is not None:
            drafts.append(subtree_text(d)[:220])
    leak = [d for d in drafts if '6.25' in d]
    if leak:
        raise Fail('a draft mentions the walk-away rate 6.25%: ' + leak[0])
    tap('kb-draft-0', exact_only=True)
    e['shots'].append(shot('kb-draft-filled'))
    return f'{len(drafts)} drafts; none mention 6.25%. ' + ' || '.join(drafts)


@step('Keyboard panel: Explain')
def s_kb_explain(e):
    tap('kb-globe', exact_only=True)
    tap('kb-explain', exact_only=True)
    k, nd = wait_for(['kb-explain-out', 'kb-needs-setup'], 90, exact_only=True)
    time.sleep(1)
    e['shots'].append(shot('kb-explain'))
    if k != 'kb-explain-out':
        raise Fail(f'got {k}')
    return subtree_text(nd)[:400]


@step('Keyboard panel: leak guard stops "the highest I can go is 6.25%"')
def s_kb_leak(e):
    tap('kb-globe', exact_only=True)
    tap('kb-input', exact_only=True)
    clear_focused_field()  # remove the draft that Counter filled in
    type_text(LEAK)
    shell('input keyevent 111')
    time.sleep(1)
    tap('kb-check', exact_only=True)
    k, nd = wait_for(['kb-leak', 'kb-own-ok', 'kb-needs-setup'], 90, exact_only=True)
    time.sleep(1)
    e['shots'].append(shot('kb-leak'))
    if k != 'kb-leak':
        raise Fail(f'expected the leak warning, got {k}: ' + (subtree_text(nd) if nd is not None else ''))
    out = subtree_text(nd)
    safer = find('kb-safer', exact_only=True)
    if safer is not None:
        out += ' || safer: ' + subtree_text(safer)[:200]
        if '6.25' in subtree_text(safer):
            raise Fail('the safer version still mentions 6.25%')
    return out[:500]


@step('Keyboard panel: scam message')
def s_kb_scam(e):
    tap('kb-globe', exact_only=True)
    tap('kb-sample-scam', exact_only=True)
    tap('kb-bubble', exact_only=True)
    tap('kb-check', exact_only=True)
    k, nd = wait_for(['kb-scam', 'kb-verdict'], 60, exact_only=True)
    time.sleep(1)
    e['shots'].append(shot('kb-scam'))
    if k != 'kb-scam':
        raise Fail(f'got {k}')
    return subtree_text(nd)[:300]


@step('Text-selection menu shows "SecondLook" (long-press in a text box)')
def s_selection_menu(e):
    tap('kb-globe', exact_only=True)
    tap('kb-sample-lender', exact_only=True)
    tap('kb-input', exact_only=True)
    clear_focused_field()
    type_text('Rate 7.4% APR for 60 months')
    nd = find('kb-input', exact_only=True)
    if nd is None:
        raise Fail('message box not found')
    a = list(map(int, re.findall(r'\d+', nd.get('bounds'))))
    x, y = a[0] + 60, (a[1] + a[3]) // 2
    shell(f'input swipe {x} {y} {x} {y} 900')  # long press selects a word
    time.sleep(1.5)
    root = dump()
    e['shots'].append(shot('selection-menu'))
    found = find('SecondLook', root, exact_only=True)
    if found is None:
        more = find('More options', root) or find('More', root, exact_only=True)
        if more is not None:
            x2, y2 = center(more)
            shell(f'input tap {x2} {y2}')
            time.sleep(1.2)
            root = dump()
            e['shots'].append(shot('selection-menu-more'))
            found = find('SecondLook', root, exact_only=True)
    if found is None:
        items = [n.get('text') or n.get('content-desc') for n in all_nodes(root)
                 if (n.get('text') or n.get('content-desc')) in ('Cut', 'Copy', 'Paste', 'Share', 'Select all')]
        raise Fail('menu items seen: ' + ', '.join(filter(None, items)) if items else 'no selection menu seen')
    x3, y3 = center(found)
    shell(f'input tap {x3} {y3}')
    k, _ = wait_for(['screen-verdict', 'screen-scam', 'Start a deal from this'], 90)
    time.sleep(2)
    e['shots'].append(shot('selection-menu-result'))
    return f'"SecondLook" was in the menu; tapping it opened: {k or "nothing"}'


# ---------------------------------------------------------------- run

for fn in (s_install, s_launch, s_settings, s_registered, s_process_lender, s_process_scam,
           s_samples, s_lock, s_kb_check, s_kb_counter, s_kb_explain, s_kb_leak, s_kb_scam,
           s_selection_menu):
    fn()
    if results[-1]['step'] == 'Install the APK' and results[-1]['status'] == 'FAIL':
        break

# Logs: app and Firebase lines only, with tokens, keys and ids removed.
raw = adb('logcat', '-d', '-v', 'time', timeout=120).stdout
keep = re.compile(r'ReactNativeJS|SecondLook|secondlook|Firebase|AppCheck|AICore|GenAi|genai|Gemini|AndroidRuntime|FATAL|Expo', re.I)
redact = [
    (re.compile(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'), '<id>'),
    (re.compile(r'AIza[0-9A-Za-z_\-]{30,}'), '<api-key>'),
    (re.compile(r'eyJ[\w\-]+\.[\w\-]+\.[\w\-]+'), '<token>'),
    (re.compile(r'[A-Za-z0-9_\-]{60,}'), '<long-value>'),
]
lines = []
for line in raw.splitlines():
    if keep.search(line):
        for rx, rep in redact:
            line = rx.sub(rep, line)
        lines.append(line)
with open(f'{OUT}/log-filtered-redacted.txt', 'w') as f:
    f.write('\n'.join(lines[-3000:]))
crash = adb('logcat', '-d', '-b', 'crash').stdout
with open(f'{OUT}/crash-buffer.txt', 'w') as f:
    f.write(crash or '(empty)')

passed = sum(r['status'] == 'PASS' for r in results)
with open(f'{OUT}/results.json', 'w') as f:
    json.dump(results, f, indent=2)
with open(f'{OUT}/results.md', 'w') as f:
    f.write(f'# SecondLook on an Android emulator: {passed}/{len(results)} steps passed\n\n')
    f.write('Pixel 6 profile, Android 14 (API 34), Google APIs image, x86_64. No Gemini Nano on an emulator.\n\n')
    for r in results:
        f.write(f"## {r['status']} · {r['step']} ({r['seconds']} s)\n\n{r['detail']}\n\n")
        for s in r['shots']:
            f.write(f'- {s}\n')
        f.write('\n')
    f.write(f"Crash buffer: {'empty' if not crash.strip() else 'NOT EMPTY, see crash-buffer.txt'}\n")
print(open(f'{OUT}/results.md').read())
