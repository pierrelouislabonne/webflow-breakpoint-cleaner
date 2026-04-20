# Webflow Breakpoint Cleaner

Chrome extension (Manifest V3) that removes Webflow's **additional breakpoints** (`xxl` 1920+, `xl` 1440+, `large` 1280+) from a site directly inside the Designer — something Webflow's UI does not let you do.

Before deletion, the extension shows, for each extra breakpoint:

- whether it is in use on the current site,
- how many elements have styles defined at this breakpoint,
- how many class variants reference it.

Removal is persisted via the private Designer API and pushed to the live Designer session over its multiplayer WebSocket, so the change appears without a manual reload. A backup snapshot is created automatically (visible in *Site settings → Backups*).

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome (or a Chromium-based browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. The extension icon appears in the toolbar.

## Usage

1. Open a project in the Webflow Designer (either `https://webflow.com/design/…` or `https://<site>.design.webflow.com/…`).
2. Click the extension icon.
3. The popup lists the additional breakpoints and their usage impact.
4. Select the ones you want to remove and click **Remove**.
5. Wait for the success screen; the Designer tab reloads automatically.

If several Designer tabs are open, the popup lets you pick which one to act on. If no Designer tab is open, the popup tells you so.

## How it works

Webflow's Designer runs entirely in the browser, authenticated via session cookies and a CSRF token. The extension injects a script into that page context so it can reuse the live session — no OAuth, no separate login.

When you click **Remove**, three things happen in sequence:

1. **REST API mutation** — the extension fetches the current site DOM, strips the target breakpoints from every style block and element, then posts the result back to Webflow's private API. This is what survives a hard refresh.

2. **Live Designer update** — the Designer's real-time state is synced through a multiplayer WebSocket (`mp.use1.webflow.com`). The extension captures that socket and sends a `siteData:update` event so the breakpoint tabs disappear immediately, without waiting for a reload.

3. **Backup snapshot** — every removal creates a named backup under *Site settings → Backups*, so you can roll back if needed.

The extension handles version conflicts automatically (HTTP 409/412): it refetches the latest DOM and retries up to three times before surfacing an error.

For the full technical breakdown (message flow, API endpoints, WebSocket frame format, module layout) see [CLAUDE.md](CLAUDE.md).

## Project layout

```
webflow-breakpoint-cleaner/
├── manifest.json          Chrome extension manifest (MV3)
├── content.js             Content script — bridges popup ↔ injected script
├── injected.js            Page-world script — talks to Webflow APIs + WebSocket
├── popup.html             Toolbar popup markup
├── popup.js               Popup controller (tab discovery, rendering, dispatch)
├── src/
│   ├── api.js             Authenticated wrappers around the Designer REST API
│   ├── constants.js       Additional-breakpoint list and UI metadata
│   ├── env.js             Reads site name / page id / CSRF / app id / session id
│   ├── multiplayer.js     WebSocket capture + Socket.io frame builder
│   └── remover.js         Breakpoint removal + retry logic
└── icons/                 Toolbar and per-breakpoint icons
```

## Credits

Made by [Pierre-Louis Design](https://www.pierrelouis.design/)

## Caveats

- Relies on Webflow's **private** Designer API and WebSocket protocol. A Webflow-side change may break the extension; re-inspecting the designer traffic is usually enough to adapt.
