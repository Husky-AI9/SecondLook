// SecondLook for Chrome: the right-click menu, the side panel, and typing a reply into the page.
//
// The side panel hosts the SecondLook web app (panel.html → iframe). This worker only moves
// text: what the user selected goes to the panel, and a reply the user taps comes back and is
// typed into the page's reply box. Nothing is ever sent on the user's behalf.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'theirs', title: 'SecondLook: check their message', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'own', title: 'SecondLook: check my reply before sending', contexts: ['selection', 'editable'] });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Open first: sidePanel.open() must run inside the click handler, before any await.
  if (tab && tab.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  handle(info, tab);
});

// Reads the reply box the user right-clicked in, when nothing was selected.
function readFocused() {
  const el = document.activeElement;
  if (!el) return '';
  if ('value' in el && typeof el.value === 'string') return el.value;
  return el.isContentEditable ? el.innerText : '';
}

async function handle(info, tab) {
  const kind = info.menuItemId === 'own' ? 'own' : 'theirs';
  let text = (info.selectionText || '').trim();
  if (!text && kind === 'own' && tab && tab.id !== undefined) {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [info.frameId || 0] }, func: readFocused });
      text = ((r && r.result) || '').trim();
    } catch (e) {
      /* no access to this page */
    }
  }
  if (!text) return;
  await chrome.storage.session.set({
    pending: { kind, text: text.slice(0, 4000), tabId: tab ? tab.id : undefined, frameId: info.frameId || 0, at: Date.now() },
  });
}
// Lets the automated test drive the menu without a real right-click.
self.secondlookHandle = handle;

// Runs in the page. Types the reply into the focused reply box, or the most likely one.
function typeInto(text) {
  const usable = (el) => {
    if (!el || el === document.body || el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return ['text', 'search', ''].includes(el.type);
    return el.isContentEditable;
  };
  let el = document.activeElement;
  if (!usable(el)) {
    // Chats keep the reply box at the bottom: take the lowest visible text box on the page.
    const all = [...document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable=""], [role="textbox"]')].filter(usable);
    all.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    el = all[0];
  }
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text); // works with React-controlled inputs
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return document.execCommand('insertText', false, text);
}

async function insert(text) {
  const { pending } = await chrome.storage.session.get('pending');
  let tabId = pending && pending.tabId;
  if (tabId === undefined) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tabId = tab && tab.id;
  }
  if (tabId === undefined) return { ok: false, why: 'no tab' };
  const frames = [...new Set([(pending && pending.frameId) || 0, 0])];
  for (const frameId of frames) {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func: typeInto, args: [text] });
      if (r && r.result) return { ok: true };
    } catch (e) {
      /* try the next frame */
    }
  }
  return { ok: false, why: 'no reply box' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'insert' || typeof msg.text !== 'string') return undefined;
  if (sender.id !== chrome.runtime.id) return undefined;
  insert(msg.text.slice(0, 2000)).then(sendResponse);
  return true;
});
