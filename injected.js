/* ─────────────────────────────────────────────────────────────────────────── */
// Page-world entry point
// Runs inside the Designer's own JS context (injected as a <script type="module">
// by content.js) so it can reach Webflow's globals and the multiplayer socket.
// Initialises WebSocket capture, then routes window.postMessage commands from
// the content script to the appropriate src/ handler.
/* ─────────────────────────────────────────────────────────────────────────── */
import { captureSocket } from './src/multiplayer.js';
import { getPageId, getSiteName } from './src/env.js';
import { fetchDOM } from './src/api.js';
import { computeImpact, removeBreakpoints } from './src/remover.js';
import { ADDITIONAL_BREAKPOINTS, BREAKPOINT_META } from './src/constants.js';

captureSocket();

window.postMessage({ type: 'WF_READY' }, '*');

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'WF_GET_BREAKPOINTS') {
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: Math.random() * 100, clientY: Math.random() * 100 }));
    try {
      const siteName = getSiteName();
      if (!siteName) {
        window.postMessage({ type: 'WF_ERROR', message: 'No designer open' }, '*');
        return;
      }
      const pageId = getPageId();
      const domData = await fetchDOM(pageId);
      const actualPageId = pageId || domData.pageId;
      if (!actualPageId) {
        window.postMessage({ type: 'WF_ERROR', message: 'No page open' }, '*');
        return;
      }
      const present = Object.keys(domData.styles?.data?.breakpoints || {});
      const breakpoints = ADDITIONAL_BREAKPOINTS.map(bp => ({
        id: bp,
        ...BREAKPOINT_META[bp],
        inSite: present.includes(bp),
        impact: present.includes(bp) ? computeImpact(domData, bp) : null,
      }));
      window.postMessage({ type: 'WF_BREAKPOINTS_DATA', breakpoints, siteName, pageId: actualPageId }, '*');
    } catch (err) {
      window.postMessage({ type: 'WF_ERROR', message: err.message }, '*');
    }
  }

  if (event.data?.type === 'WF_REMOVE_BREAKPOINTS') {
    try {
      await removeBreakpoints(event.data.breakpoints, (msg) => {
        window.postMessage({ type: 'WF_REMOVE_PROGRESS', message: msg }, '*');
      }, { pageId: event.data.pageId });
      window.postMessage({ type: 'WF_REMOVE_DONE' }, '*');
    } catch (err) {
      window.postMessage({ type: 'WF_ERROR', message: err.message }, '*');
    }
  }
});
