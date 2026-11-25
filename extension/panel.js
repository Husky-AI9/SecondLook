// The side panel: the SecondLook web app in a frame, plus the hand-off of page text and replies.
const APP = 'https://secondlook-7b7d5.web.app/';

// The automated test points the panel at a local build; nothing else may change the address.
const override = new URLSearchParams(location.search).get('src');
const src = override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(override) ? override : APP;
const origin = new URL(src).origin;
const frame = document.getElementById('app');
frame.src = src + (src.includes('?') ? '&' : '?') + 'ext=1';

let ready = false;
let lastSent = 0;

async function sendPending() {
  if (!ready) return;
  const { pending } = await chrome.storage.session.get('pending');
  if (!pending || pending.at <= lastSent) return;
  lastSent = pending.at;
  frame.contentWindow.postMessage({ type: 'secondlook:text', kind: pending.kind, text: pending.text }, origin);
}

window.addEventListener('message', async (e) => {
  if (e.origin !== origin || e.source !== frame.contentWindow) return;
  const d = e.data || {};
  if (d.type === 'secondlook:ready') {
    ready = true;
    sendPending();
  } else if (d.type === 'secondlook:insert' && typeof d.text === 'string') {
    let ok = false;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'insert', text: d.text });
      ok = !!(res && res.ok);
    } catch (err) {
      ok = false;
    }
    frame.contentWindow.postMessage({ type: 'secondlook:inserted', id: d.id, ok }, origin);
  }
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.pending) sendPending();
});
