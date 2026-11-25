# SecondLook for Chrome

The SecondLook keyboard panel for the web: Check · Counter · Explain next to any page.

1. On any page (Gmail, Google Messages for web, Facebook Marketplace…), select the lender's
   message, right-click → **SecondLook: check their message**. The side panel opens with the
   verdict.
2. Tap **Counter**, then tap a reply. SecondLook types it into the reply box on the page.
   You read it and press send yourself.
3. Before sending your own words, select them (or right-click in the reply box) →
   **SecondLook: check my reply before sending**. The leak guard stops anything that gives
   away your walk-away rate and offers a safer version.

The panel is the SecondLook web app (https://secondlook-7b7d5.web.app) in a frame, so limits,
the PIN and deals live in this browser only. With Chrome's built-in Gemini Nano the message is
read on this computer (Firebase AI Logic hybrid inference); without it, only a redacted copy
goes to the cloud, and only if you allow that in Settings.

## Install (developer mode, about 30 seconds)

1. Download this repository (or pull it in GitHub Desktop).
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Pin SecondLook from the puzzle-piece menu. Clicking the icon also opens the panel.

Needs Chrome 138 or newer. The extension id is fixed by the `key` in `manifest.json`
(`koogiofpinglcgjiaonpllmbdhcbndcl`); the web app only accepts messages from that id.

## What it can touch

- `contextMenus`, `sidePanel`: the right-click items and the panel.
- `activeTab` + `scripting`: after you right-click on a page, SecondLook may type the reply
  you picked into that page's reply box. No access to other tabs or sites.
- `storage`: holds the selected text for the panel during this browser session only.
