# CLAUDE.md

Technical reference for the Webflow Breakpoint Cleaner extension. Read this before editing the code.

## Purpose

Webflow ships three "additional" desktop breakpoints — `xxl` (≥1920px), `xl` (≥1440px), `large` (≥1280px) — that can be enabled but **not removed from the Designer UI**. This extension performs that removal by talking directly to Webflow's private Designer API and its multiplayer WebSocket.

## Architecture

Chrome MV3 extension with three execution contexts:

```
┌──────────────────┐        chrome.runtime.sendMessage         ┌──────────────────┐
│   popup.html     │  ◀──────────────────────────────────────▶ │   content.js     │
│   popup.js       │                                            │ (content script) │
└──────────────────┘                                            └──────────────────┘
                                                                         │
                                                          window.postMessage
                                                                         ▼
                                                              ┌──────────────────┐
                                                              │   injected.js    │
                                                              │  (page world)    │
                                                              │   + src/*.js     │
                                                              └──────────────────┘
                                                                         │
                                                   fetch() /  WebSocket.send()
                                                                         ▼
                                                              Webflow Designer
                                                              API + mp.* socket
```

- **popup.js** (extension context): UI + tab discovery. Sends `WF_GET_BREAKPOINTS` / `WF_REMOVE_BREAKPOINTS` via `chrome.tabs.sendMessage`.
- **content.js** (isolated content-script context): bridges the two message channels. Injects `injected.js` as a `<script type="module">`; queues the first message until injected.js signals `WF_READY` (module scripts load asynchronously).
- **injected.js** (page JS context): runs inside the Designer's own realm, so it can read `window.webflow`, `window.__INITIAL_STATE__`, use the already-open CSRF-authenticated session, and access the existing multiplayer WebSocket. It imports the modules under `src/`.

### Message protocol

| Direction                            | Type                       | Payload                                                   |
| ------------------------------------ | -------------------------- | --------------------------------------------------------- |
| popup → content → page               | `WF_GET_BREAKPOINTS`       | —                                                         |
| popup → content → page               | `WF_REMOVE_BREAKPOINTS`    | `{ breakpoints: string[], pageId: string }`               |
| page → content → popup               | `WF_READY`                 | —                                                         |
| page → content → popup               | `WF_BREAKPOINTS_DATA`      | `{ breakpoints: [...], siteName, pageId }`                |
| page → content → popup               | `WF_REMOVE_PROGRESS`       | `{ message: string }`                                     |
| page → content → popup               | `WF_REMOVE_DONE`           | —                                                         |
| page → content → popup               | `WF_ERROR`                 | `{ message: string }`                                     |

`WF_READY` is consumed by content.js only (it signals that the page-world module graph has finished loading) and is not forwarded to the popup.

## How breakpoint deletion actually works

Webflow's designer uses **two separate systems** that must both be updated:

**1. REST API** (`/api/sites/{name}/styles` — POST)
Persists the change to Webflow's database. The payload includes `data.breakpoints` with the target breakpoints removed, plus `styles` (blocks) with their variants cleaned. This is what survives a hard refresh.

**2. Multiplayer WebSocket** (`mp.use1.webflow.com` — Socket.io)
Controls the **live designer UI**. The designer initializes its state from this WebSocket on load, which overrides the REST API data. Without updating it, the breakpoint tabs remain visible in the toolbar even though the data is correct server-side.

The WebSocket message format for deletion:

```json
42["siteData:update", {
  "messageId": "<uuid>",
  "pageId": "<pageId>",
  "operations": {
    "styles": [{
      "type": "remove",
      "value": { "type": "Breakpoint", "value": { "xl": { "minWidth": 1440 } } },
      "path": [{ "in": "ImmutableRecord", "at": "breakpoints" }, { "in": "Object", "at": "xl" }]
    }]
  },
  "actionType": "BREAKPOINT_REMOVED"
}]
```

The `42` prefix is Socket.io framing (engine.io message type `4`, Socket.io event type `2`). The `remove` operation requires a `value` field with the breakpoint definition. Discovered by intercepting WebSocket traffic during a native breakpoint creation in the designer.

## Removal flow

`src/remover.js` → `removeBreakpoints(bps, onStatus, { pageId })`:

1. **Resolve `pageId`** — caller-supplied override first, then `getPageId()` from `src/env.js` (URL query → URL path → `window.webflow.designer` → `window.__INITIAL_STATE__`).
2. **Fetch fresh DOM** — `GET /api/sites/{siteName}/dom?pageId=…&t=…` via `fetchDOM()`.
3. **Mutate** (`applyBreakpointDeletion`), for each breakpoint `bp` in the request:
   - `delete domData.styles.data.breakpoints[bp]`
   - For every style block: `delete block.data.variants[bp]`
   - For every DOM node: `delete node.data.style.base[bp]` (and collapse empty parents).
4. **Persist styles** — `POST /api/sites/{siteName}/styles` (carries `stylesVersion`, `clientLeaderInstance`, etc.).
5. **Persist DOM** — `POST /api/pages/{pageId}/dom` with a `description` ⇒ Webflow creates a **named backup** (`snapshot: true`).
6. **Retry on conflict** — steps 2–5 are wrapped in `withRetry()`: on HTTP 409/412/428 or any error whose message matches `/conflict|version (mismatch|conflict|stale|outdated)/i` it refetches and re-applies, up to 3 attempts with linear backoff (250 ms × attempt).
7. **Notify the live UI** — `window.__wfSendMpDelete(pageId, bps)` emits a Socket.io frame on the captured multiplayer socket (see below). Without this step the Designer would still show the deleted breakpoints until a manual reload.

After success, the popup reloads the tab (`chrome.tabs.reload`, see `popup.js`).

### Multiplayer WebSocket capture

The designer's live state (cursors, edits, breakpoint list…) is synced through `wss://mp.use1.webflow.com/…`. Two capture strategies are installed at the top of `injected.js`, both ultimately storing the socket on `window.__wfMpSocket`:

1. **Outgoing-message patch** — `WebSocket.prototype.send` is monkey-patched; the first call on a socket whose URL contains `mp.` captures `this`. Useful when the socket is opened **before** our script runs. To force a send, the extension dispatches a synthetic `mousemove` on `document` (cursor position is broadcast through this socket).
2. **Constructor patch** — `window.WebSocket` is replaced; any later-constructed `mp.*` socket is captured immediately.

Once captured, the patches self-disarm (`captured = true`, original `send` restored).

### `siteData:update` remove frame — implementation notes

`window.__wfSendMpDelete(pageId, bps)` builds the frame described in *How breakpoint deletion actually works* above, with a few implementation details:

- `bp` ∈ `{ xxl, xl, large }`; the `minWidth` map lives in `injected.js` as `{ xxl: 1920, xl: 1440, large: 1280 }`.
- `messageId` is a fresh UUID v4 generated per call.
- If `__wfMpSocket` is missing or not open (`readyState !== 1`), the function logs a warning and returns `false`. The REST mutation still succeeds; a manual reload will reveal the change.

## Module responsibilities

| File                 | Responsibility                                                                     |
| -------------------- | ---------------------------------------------------------------------------------- |
| `manifest.json`      | MV3 manifest. Host permissions: `webflow.com/design*`, `*.design.webflow.com/*`.   |
| `content.js`         | Script injection + message bridge (`WF_READY` queueing).                           |
| `injected.js`        | Page-world entry point. Initialises socket capture, routes messages.               |
| `popup.html` / `.js` | Popup UI. Tab picker when multiple Designer tabs are open.                         |
| `src/api.js`         | `fetchDOM`, `updateDOM`, `updateStyles` — authenticated via CSRF meta + app id.    |
| `src/constants.js`   | `ADDITIONAL_BREAKPOINTS` array + `BREAKPOINT_META` (label + icon).                 |
| `src/env.js`         | Resolves `siteName`, `pageId`, CSRF token, app id, session id from page state.     |
| `src/multiplayer.js` | `captureSocket` (WebSocket monkey-patch), `sendMpDelete` (Socket.io frame builder). |
| `src/remover.js`     | `computeImpact`, `removeBreakpoints`, retry wrapper.                               |

`src/` modules are ES modules imported by `injected.js`; `web_accessible_resources` in `manifest.json` exposes them so the page can `import()` them via `chrome.runtime.getURL`.

## Auth model

No OAuth / Bearer tokens. Because the code runs inside the Designer session, requests reuse the session cookie plus:

- `x-xsrf-token`: value of `<meta name="_csrf">`.
- `x-webflow-app-id`: from `window.webflow.env.appId` / `.clientId` (fallback: `"designer"`).
- `clientLeaderInstance`: from `window.webflow.designer.clientLeaderInstance` (fallback: random UUID v4) — used by the styles endpoint to identify the multiplayer leader.
- `clientAppVersion`: carried through from the fetched DOM payload.

## Impact calculation

`computeImpact(domData, bp)` in `src/remover.js`:

- `nodes`: number of `domNodes` with a `data.style.base[bp]` entry.
- `blocks`: number of style `blocks` that own a `variants[bp]` with a non-empty `styleLess` body.

Shown in the popup under each breakpoint as `N elements, M styles`.

## Known failure modes

- **Stale `stylesVersion` / `domNodesVersion`** → surfaces as HTTP 409/412/428 or a "version mismatch" error string. `withRetry` handles this transparently.
- **Multiplayer socket not captured** → REST update still works; user sees the deleted breakpoints until the Designer tab reloads. The popup triggers `chrome.tabs.reload` after success, so this only matters if that reload is disabled/blocked.
- **Page id not resolvable** → the removal throws before any mutation (`"No page ID found. Open a page in the Designer first."`).
- **CSRF / session expired** → `updateDOM` / `updateStyles` reject with the API response text; surfaced to the user via `WF_ERROR`.

## Development notes

- Every source file must start with a `/* ─── … ─── */` block header (3–6 lines) describing what the file owns and any non-obvious constraint (e.g. why it runs in the page world, what side-effect it installs). Keep it updated when the responsibility of a file changes.
- No build step — plain ES modules + Chrome MV3. Reload the extension after changes (`chrome://extensions → ↻` on the tile).
- To trace live traffic: open the Designer, DevTools → Network → WS tab, look at `wss://mp.use1.webflow.com/socket.io/?EIO=4&transport=websocket`. Frames starting with `42[` are application events.
- When editing `src/*.js`, keep them ES-module compatible (the page imports them as modules). No `require`, no top-level `await` where the target browsers do not support it.
- The extension writes a named backup on every removal (see `updateDOM` with `description` → `snapshot: true`), which shows up under *Site settings → Backups* in Webflow. Rely on it rather than ad-hoc safety nets.

## Things to keep an eye on

- Webflow occasionally renames internal fields (`domNodes`, `styles.blocks`, `variants`, `data.style.base`). If the deletion silently no-ops, start by logging the structure of `fetchDOM()`'s response.
- The `42[…]` Socket.io format is version-dependent. If the multiplayer handshake ever upgrades past engine.io v4, the prefix may change.
- `minWidth` values in `__wfSendMpDelete` are hardcoded. If Webflow adds or renames breakpoints, update both `ADDITIONAL_BREAKPOINTS` / `BREAKPOINT_META` in `src/constants.js` and the `bpMinWidth` map in `injected.js`.
