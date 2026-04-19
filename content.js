/* ─────────────────────────────────────────────────────────────────────────── */
// Content script — bridge between the popup and the page
// Injects injected.js into the page's own JS context (so it can access
// Webflow's globals and the multiplayer WebSocket) and relays messages
// between chrome.runtime (popup) and window.postMessage (page world).
/* ─────────────────────────────────────────────────────────────────────────── */
(function() {
  'use strict';

  const script = document.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('injected.js');
  script.id = 'webflow-breakpoint-cleaner-script';
  (document.head || document.documentElement).appendChild(script);

  let injectedReady = false;
  let pendingMessage = null;

  // Forward popup → page world (queue until injected.js is ready)
  chrome.runtime.onMessage.addListener((message) => {
    if (['WF_GET_BREAKPOINTS', 'WF_REMOVE_BREAKPOINTS'].includes(message.type)) {
      if (injectedReady) {
        window.postMessage(message, '*');
      } else {
        pendingMessage = message;
      }
    }
  });

  // Forward page world → popup
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'WF_READY') {
      injectedReady = true;
      if (pendingMessage) {
        window.postMessage(pendingMessage, '*');
        pendingMessage = null;
      }
      return;
    }

    const fwd = ['WF_BREAKPOINTS_DATA', 'WF_REMOVE_PROGRESS', 'WF_REMOVE_DONE', 'WF_ERROR'];
    if (fwd.includes(event.data?.type)) {
      chrome.runtime.sendMessage(event.data);
    }
  });
})();
