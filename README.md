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

See [CLAUDE.md](CLAUDE.md) for the full technical breakdown (message flow, API endpoints, WebSocket frame format, module layout).

## Project layout

```
manifest.json      Chrome extension manifest (MV3)
content.js         Content script — bridges popup ↔ injected script
injected.js        Page-world script — talks to Webflow APIs + WebSocket
popup.html         Toolbar popup markup
popup.js           Popup controller (tab discovery, rendering, dispatch)
src/
  api.js           Authenticated wrappers around the Designer REST API
  constants.js     Additional-breakpoint list and UI metadata
  env.js           Reads site name / page id / CSRF / app id / session id
  remover.js       Breakpoint removal + retry logic
icons/             Toolbar and per-breakpoint icons
```

## Caveats

- Relies on Webflow's **private** Designer API and WebSocket protocol. A Webflow-side change may break the extension; re-inspecting the designer traffic is usually enough to adapt.
- Only acts inside the Designer — it will not work on the public site or the dashboard.
- A backup is saved automatically, but a deleted breakpoint cannot be recreated without restoring that backup.
