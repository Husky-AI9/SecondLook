"""Walks through Quotekey on an Android emulator with adb + uiautomator.

Usage: python3 run.py <apk> <out-dir>

Writes numbered screenshots, results.md / results.json and a filtered, redacted log to
<out-dir>. Never fails the job on a test failure, so the evidence is always uploaded; the
result of each step is in results.md.
"""
import json
import os
import re
import subprocess
import threading
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
shot_times = {}
ime_range = []  # today's range as the keyboard shows it, from the Check step


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
    shot_times[os.path.basename(path)] = time.time()
    return os.path.basename(path)


# ---- optional screen recording (SL_RECORD=1), for the demo video
REC = os.environ.get('SL_RECORD') == '1'
rec_log = []
rec_stop = threading.Event()
rec_thread = [None]


def _recorder():
    i = 0
    while not rec_stop.is_set():
        i += 1
        name = f'/sdcard/sl-rec-{i:02d}.mp4'
        entry = {'file': os.path.basename(name), 'start': time.time()}
        rec_log.append(entry)
        try:
            subprocess.run(['adb', 'shell', 'screenrecord', '--bit-rate', '8000000', '--time-limit', '170', name],
                           capture_output=True, timeout=200)
        except Exception as ex:  # noqa: BLE001
            entry['error'] = str(ex)[:200]
        entry['end'] = time.time()


def hold(seconds=2.5):
    """While recording, keep a result on screen long enough to read in the demo video."""
    if REC:
        time.sleep(seconds)


def rec_start():
    if REC and rec_thread[0] is None:
        rec_thread[0] = threading.Thread(target=_recorder, daemon=True)
        rec_thread[0].start()
        time.sleep(1.5)


def rec_finish():
    if not REC or rec_thread[0] is None:
        return
    rec_stop.set()
    shell('pkill -INT screenrecord')
    rec_thread[0].join(timeout=30)
    time.sleep(2)
    for r in rec_log:
        try:
            adb('pull', '/sdcard/' + r['file'], f"{OUT}/{r['file']}", timeout=180)
        except Exception as ex:  # noqa: BLE001
            r['pull_error'] = str(ex)[:200]
    with open(f'{OUT}/rec-times.json', 'w') as f:
        json.dump(rec_log, f, indent=2)


def _raw_dump():
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


system_dialogs = []


def dump():
    """UI tree, after dismissing any "X isn't responding" system dialog from a slow emulator."""
    root = _raw_dump()
    for _ in range(3):
        if root is None:
            return None
        title = next((n.get('text') for n in root.iter('node') if "isn't responding" in (n.get('text') or '')), None)
        if not title:
            return root
        system_dialogs.append(title)
        pick = 'Close app' if 'Quotekey' not in title else 'Wait'
        btn = next((n for n in root.iter('node') if (n.get('text') or '') == pick), None)
        if btn is None:
            shell('am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS')
        else:
            a = list(map(int, re.findall(r'\d+', btn.get('bounds'))))
            shell(f'input tap {(a[0] + a[2]) // 2} {(a[1] + a[3]) // 2}')
        time.sleep(2)
        root = _raw_dump()
    return root


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


def bounds(nd):
    return list(map(int, re.findall(r'\d+', nd.get('bounds') or '[0,0][0,0]')))


def subtree_text(nd, root=None):
    """Text of every node drawn inside this node's box (the tree can be flattened)."""
    root = dump() if root is None else root
    b = bounds(nd)
    parts = []
    for x in all_nodes(root):
        c = bounds(x)
        if c[0] >= b[0] and c[1] >= b[1] and c[2] <= b[2] and c[3] <= b[3]:
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


SCREEN = [1080, 2400]


def screen_size():
    m = re.search(r'(\d+)x(\d+)', shell('wm size').stdout)
    if m:
        SCREEN[0], SCREEN[1] = int(m.group(1)), int(m.group(2))


def visible(nd):
    b = bounds(nd)
    # keep clear of the status bar and of the floating tab bar at the bottom
    return b[3] > b[1] and b[1] >= 120 and b[3] <= SCREEN[1] - 330


def tap(key, timeout=20, scroll=True, exact_only=False):
    k, nd = wait_for(key, timeout, scroll=scroll, exact_only=exact_only)
    if nd is None:
        raise Fail(f'could not find "{key}" on screen')
    for _ in range(5):  # bring it into view before tapping
        if visible(nd):
            break
        if bounds(nd)[1] < 120:
            swipe_down()
        else:
            swipe_up()
        nd = find(key, exact_only=exact_only) or nd
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


def keyboard_shown():
    return 'mInputShown=true' in shell('dumpsys input_method | grep mInputShown').stdout


def hide_keyboard():
    if keyboard_shown():
        shell('input keyevent 4')  # Back closes the on-screen keyboard first
        time.sleep(1)


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
            entry['t0'], entry['t1'] = t0, time.time()
            if name != 'Install the APK' and not alive():
                entry['detail'] += ' [app process is NOT running after this step]'
                if entry['status'] == 'PASS':
                    entry['status'] = 'FAIL'
            results.append(entry)
            print(f"{entry['status']}  {name}  {entry['detail']}", flush=True)
        return run
    return wrap


def go_tab(name):
    hide_keyboard()
    for _ in range(4):
        if find(f'nav-{name}', exact_only=True) is not None:
            break
        back()  # pushed screens (Limits, Settings, verdicts) hide the tab bar
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
    screen_size()
    # Let a freshly booted emulator settle (the launcher is slow on shared CI machines).
    shell('settings put global window_animation_scale 0; settings put global transition_animation_scale 0')
    time.sleep(25)
    shell('input keyevent 82')
    dump()
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


@step('Select text → Quotekey is registered in the text-selection menu')
def s_registered(e):
    r = shell('cmd package query-activities --brief -a android.intent.action.PROCESS_TEXT -t text/plain')
    out = r.stdout.strip()
    if PKG not in out:
        raise Fail('Quotekey is not listed for PROCESS_TEXT: ' + out[-300:])
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
    hide_keyboard()  # the number pad covers the Lock limits button
    e['shots'].append(shot('limits-pin-entered'))
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
    hide_keyboard()
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


def ocr_words():
    """Words on screen with their boxes, read with Tesseract from a full-size screenshot."""
    png = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=60).stdout
    with open('/tmp/ocr.png', 'wb') as f:
        f.write(png)
    r = subprocess.run(['tesseract', '/tmp/ocr.png', 'stdout', 'tsv'], capture_output=True, text=True, timeout=120)
    words = []
    for line in r.stdout.splitlines()[1:]:
        c = line.split('\t')
        if len(c) >= 12 and c[11].strip():
            x, y, w, h = map(int, c[6:10])
            words.append((c[11].strip(), x, y, w, h))
    return words


def ocr_find(text):
    for wtxt, x, y, w, h in ocr_words():
        if wtxt.lower().startswith(text.lower()):
            return x, y, w, h
    return None


def popup_dump():
    """The selection toolbar is its own window; ask uiautomator for every window if it can."""
    r = adb('exec-out', 'uiautomator dump --windows /sdcard/w.xml >/dev/null 2>&1; cat /sdcard/w.xml')
    i = r.stdout.find('<')
    try:
        return ET.fromstring(r.stdout[i:]) if i >= 0 else None
    except ET.ParseError:
        return None


@step('Text-selection menu shows "Quotekey" (long-press in a text box)')
def s_selection_menu(e):
    tap('kb-globe', exact_only=True)
    tap('kb-sample-lender', exact_only=True)
    tap('kb-input', exact_only=True)
    clear_focused_field()
    type_text('Rate 7.4% APR for 60 months')
    nd = find('kb-input', exact_only=True)
    if nd is None:
        raise Fail('message box not found')
    a = bounds(nd)
    x, y = a[0] + 60, (a[1] + a[3]) // 2
    shell(f'input swipe {x} {y} {x} {y} 900')  # long press selects a word and opens the menu
    time.sleep(1.5)
    e['shots'].append(shot('selection-menu'))
    how = ''
    target = None
    root = popup_dump()
    if root is not None:
        n = find('Quotekey', root, exact_only=True)
        if n is not None:
            target, how = center(n), 'menu (uiautomator)'
    if target is None:
        b = ocr_find('Quotekey')
        if b:
            target, how = (b[0] + b[2] // 2, b[1] + b[3] // 2), 'menu (OCR)'
    if target is None:
        # open the overflow: the vertical dots sit just right of "Select all"
        sa = ocr_find('Select') or ocr_find('all')
        more = None
        if root is not None:
            m = find('More options', root)
            if m is not None:
                more = center(m)
        if more is None and sa:
            more = (sa[0] + sa[2] + int(0.085 * 1080), sa[1] + sa[3] // 2)
        if more is None:
            raise Fail('selection menu not found on screen')
        shell(f'input tap {more[0]} {more[1]}')
        time.sleep(1.5)
        e['shots'].append(shot('selection-menu-more'))
        root = popup_dump()
        n = find('Quotekey', root, exact_only=True) if root is not None else None
        if n is not None:
            target, how = center(n), 'overflow menu (uiautomator)'
        else:
            b = ocr_find('Quotekey')
            if b:
                target, how = (b[0] + b[2] // 2, b[1] + b[3] // 2), 'overflow menu (OCR)'
    if target is None:
        words = ' '.join(w[0] for w in ocr_words())[:300]
        raise Fail('"Quotekey" not seen in the menu. Screen text: ' + words)
    shell(f'input tap {target[0]} {target[1]}')
    k, _ = wait_for(['screen-verdict', 'screen-scam', 'Start a deal from this'], 90)
    time.sleep(2)
    e['shots'].append(shot('selection-menu-result'))
    if not k:
        raise Fail(f'"Quotekey" was in the {how}, but tapping it opened nothing')
    return f'"Quotekey" found in the {how}; tapping it opened {k}. ' + source_line()


IME = f'{PKG}/expo.modules.secondlookai.SecondLookKeyboardService'


def inside(b, r):
    return b[0] >= r[0] and b[1] >= r[1] and b[2] <= r[2] and b[3] <= r[3] and b[3] > b[1]


def ime_region(root):
    """Box of the Quotekey keyboard panel: the outermost view around its globe key."""
    parents = {c: p for p in root.iter() for c in p}
    globe = next((n for n in root.iter('node') if (n.get('content-desc') or '') == 'Switch keyboard'), None)
    if globe is None:
        return None
    top = cur = globe
    while cur in parents:
        cur = parents[cur]
        if cur.tag != 'node' or bounds(cur)[1] < SCREEN[1] * 0.3:
            break
        top = cur
    return bounds(top)


def ime_nodes():
    """Nodes of the Quotekey keyboard only (all windows dumped; app nodes left out)."""
    root = popup_dump()
    region = ime_region(root) if root is not None else None
    if not region:
        return []
    return [n for n in all_nodes(root) if inside(bounds(n), region)]


def ime_text():
    parts = []
    for n in ime_nodes():
        for v in (n.get('text'), n.get('content-desc')):
            if v and v not in parts:
                parts.append(v)
    return ' | '.join(parts)


def ime_wait(words, timeout=30):
    words = [words] if isinstance(words, str) else words
    end = time.time() + timeout
    t = ''
    while time.time() < end:
        t = ime_text()
        for w in words:
            if w.lower() in t.lower():
                return w, t
        time.sleep(1.5)
    return None, t or '(Quotekey keyboard not on screen)'


def ime_tap(label, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        nodes = ime_nodes()
        exact = [n for n in nodes if label in ((n.get('text') or ''), (n.get('content-desc') or ''))]
        loose = [n for n in nodes if (n.get('content-desc') or '').startswith(label + '.')]
        for n in exact + loose:
            x, y = center(n)
            shell(f'input tap {x} {y}')
            time.sleep(1.5)
            return
        time.sleep(1.5)
    raise Fail(f'keyboard key "{label}" not found in the Quotekey keyboard')


def open_box():
    """With something copied, Home hides its text box behind "Type or paste it instead"."""
    if find('paste-input', exact_only=True) is None and find('paste-instead', exact_only=True) is not None:
        tap('paste-instead', exact_only=True)
    tap('paste-input', exact_only=True)


def field_text():
    nd = find('paste-input', exact_only=True)
    return (nd.get('text') or '') if nd is not None else ''


def clear_field():
    open_box()
    clear_focused_field()


@step('Android keyboard: turn on, switch to Quotekey, panel appears')
def s_ime_on(e):
    shell(f'am force-stop {PKG}')
    launch_home()
    time.sleep(2)
    go_tab('keyboard')
    tap('kb-sample-lender', exact_only=True)
    tap('kb-bubble', exact_only=True)  # copies the practice lender message
    go_tab('home')
    out = shell(f'ime enable {IME}').stdout.strip() + ' / ' + shell(f'ime set {IME}').stdout.strip()
    current = shell('settings get secure default_input_method').stdout.strip()
    if current != IME:
        raise Fail(f'could not select the keyboard: {out}; current = {current}')
    open_box()
    w, t = ime_wait(['Copy their message, then pick one', 'Set your limits in the Quotekey app', 'Copy their message first'], 25)
    e['shots'].append(shot('ime-ready'))
    hold(2)
    if not w:
        raise Fail('Quotekey keyboard did not appear: ' + t[:300])
    if 'Set your limits' in w:
        raise Fail('keyboard has no limits pack from the app')
    return f'selected {current}; panel: {t[:200]}'


@step('Android keyboard: Check the copied lender message')
def s_ime_check(e):
    ime_tap('Check')
    w, t = ime_wait(['overpriced', 'Competitive offer', 'not compared yet', 'Likely a scam'], 20)
    e['shots'].append(shot('ime-check'))
    hold(3.5)
    if w != 'overpriced':
        raise Fail(f'expected "Real offer, but overpriced", got: {t[:300]}')
    m = re.search(r"today's (\d+\.\d+)%[–-](\d+\.\d+)%", t)
    if m:
        ime_range[:] = [float(m.group(1)), float(m.group(2))]
    return t[:300]


@step('Android keyboard: Counter, then tap a reply into the box')
def s_ime_counter(e):
    ime_tap('Counter')
    w, t = ime_wait(['FRIENDLY'], 20)
    e['shots'].append(shot('ime-counter'))
    hold(3.5)
    if not w:
        raise Fail('no replies: ' + t[:300])
    if '6.25' in t:
        raise Fail('a reply mentions the walk-away rate 6.25%')
    ime_tap('FRIENDLY')
    time.sleep(1)
    typed = field_text()
    e['shots'].append(shot('ime-reply-typed'))
    hold(3)
    if not typed or 'Thanks' not in typed and 'Could you' not in typed:
        raise Fail(f'reply was not typed into the box (box has: {typed!r})')
    return f'box now has: {typed}'


@step('Android keyboard: leak guard on my own reply ("highest I can go is 6.25%")')
def s_ime_leak(e):
    clear_field()
    type_text(LEAK)
    hold(2.5)
    ime_tap('Check')
    w, t = ime_wait(['Hold on before you send'], 15)
    e['shots'].append(shot('ime-leak'))
    hold(3.5)
    if not w:
        raise Fail('no leak warning: ' + t[:300])
    ime_tap('SAFER VERSION')
    time.sleep(1)
    typed = field_text()
    e['shots'].append(shot('ime-safer-typed'))
    hold(3)
    if '6.25' in typed or not typed:
        raise Fail(f'safer version not typed or still leaks: {typed!r}')
    return f'warning shown; box now has: {typed}'


@step('Android keyboard: leak guard on the walk-away rate in words ("six and a quarter", no %)')
def s_ime_leak_words(e):
    clear_field()
    type_text('The highest I can go is six and a quarter.')
    ime_tap('Check')
    w, t = ime_wait(['Hold on before you send', 'Copy their message', "Real offer", 'Competitive offer', 'Likely a scam'], 15)
    e['shots'].append(shot('ime-leak-words'))
    hold(3)
    if w != 'Hold on before you send':
        raise Fail('no leak warning for the rate in words: ' + t[:300])
    return 'warning shown for "six and a quarter"'


@step('Android keyboard: Explain (Firebase AI Logic)')
def s_ime_explain(e):
    clear_field()
    ime_tap('Explain')
    w, t = ime_wait(['Cloud · redacted', 'On-device', 'Offline rules'], 45)
    time.sleep(1)
    e['shots'].append(shot('ime-explain'))
    hold(3.5)
    if not w:
        raise Fail('no answer: ' + t[:300])
    return f'source: {w}; {t[:400]}'


@step('Android keyboard: a rate below today\'s range says "Below", not "Inside"')
def s_ime_below(e):
    if not ime_range:
        raise Fail('the Check step showed no market range to compare with')
    low = ime_range[0]
    rate = round((low - 0.5) * 8) / 8  # mortgage rates come in eighths
    msg = f'Okay Alex, I can do {rate:g}% with $1,200 in fees.'
    clear_field()
    type_text(msg)
    shell('input keycombination 113 29')  # select all
    shell('input keycombination 113 31')  # copy
    shell('input keyevent 67')
    time.sleep(1)
    ime_tap('Check')
    w, t = ime_wait(["Below today's", "Inside today's", "Above today's", 'Likely a scam'], 15)
    e['shots'].append(shot('ime-below'))
    hold(3)
    if w != "Below today's":
        raise Fail(f'{rate:g}% vs a range starting at {low}%: expected "Below today\'s", got: {t[:300]}')
    return f'{rate:g}%: {t[:300]}'


@step('Android keyboard: scam message')
def s_ime_scam(e):
    # Copy the practice scam message from the app instead of typing it: long typed text is slow
    # and flaky while the screen is being recorded.
    go_tab('keyboard')
    tap('kb-sample-scam', exact_only=True)
    tap('kb-bubble', exact_only=True)
    go_tab('home')
    clear_field()
    time.sleep(1)
    ime_tap('Check')
    w, t = ime_wait(['Likely a scam'], 15)
    e['shots'].append(shot('ime-scam'))
    hold(4)
    if not w:
        raise Fail('scam not caught: ' + t[:300])
    return t[:300]


@step('Android keyboard: globe key switches back to the normal keyboard')
def s_ime_globe(e):
    ime_tap('Switch keyboard')
    time.sleep(2)
    current = shell('settings get secure default_input_method').stdout.strip()
    e['shots'].append(shot('ime-globe'))
    shell('ime reset')
    if current == IME:
        raise Fail('still on the Quotekey keyboard')
    return f'now using {current}'


# ---------------------------------------------------------------- run

for fn in (s_install, s_launch, s_settings, s_registered, s_process_lender, s_process_scam,
           s_samples, s_lock, s_kb_check, s_kb_counter, s_kb_explain, s_kb_leak, s_kb_scam,
           s_selection_menu, s_ime_on, s_ime_check, s_ime_counter, s_ime_leak, s_ime_leak_words, s_ime_explain, s_ime_below, s_ime_scam,
           s_ime_globe):
    if fn is s_samples:
        rec_start()
    fn()
    if results[-1]['step'] == 'Install the APK' and results[-1]['status'] == 'FAIL':
        break

rec_finish()
with open(f'{OUT}/shot-times.json', 'w') as f:
    json.dump(shot_times, f, indent=2)

# Logs: app and Firebase lines only, with tokens, keys and ids removed.
raw = adb('logcat', '-d', '-v', 'time', timeout=120).stdout
keep = re.compile(r'ReactNativeJS|Quotekey|secondlook|Firebase|AppCheck|AICore|GenAi|genai|Gemini|AndroidRuntime|FATAL|Expo', re.I)
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
    f.write(f'# Quotekey on an Android emulator: {passed}/{len(results)} steps passed\n\n')
    f.write('Pixel 6 profile, Android 14 (API 34), Google APIs image, x86_64. No Gemini Nano on an emulator.\n\n')
    for r in results:
        f.write(f"## {r['status']} · {r['step']} ({r['seconds']} s)\n\n{r['detail']}\n\n")
        for s in r['shots']:
            f.write(f'- {s}\n')
        f.write('\n')
    f.write(f"Crash buffer: {'empty' if not crash.strip() else 'NOT EMPTY, see crash-buffer.txt'}\n")
    f.write(f"System 'not responding' dialogs dismissed: {len(system_dialogs)} {sorted(set(system_dialogs))}\n")
print(open(f'{OUT}/results.md').read())
