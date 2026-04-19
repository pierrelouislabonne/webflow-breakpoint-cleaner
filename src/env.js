/* ─────────────────────────────────────────────────────────────────────────── */
// Webflow Designer environment helpers
// Reads identifiers required to talk to the private Designer API
// (site name, page id, CSRF token, app id, session id) from the URL,
// the DOM and the globals Webflow exposes on `window`.
/* ─────────────────────────────────────────────────────────────────────────── */

export const getSiteName = () => {
  const { host, pathname } = window.location;
  const match = host.match(/(.*).design.webflow.com/);
  if (match) return match[1];

  const pathMatch = pathname.match(/\/design\/([^\/]+)/);
  if (pathMatch) return pathMatch[1];

  return null;
};

export const getPageId = () => {
  // 1. URL query param (classic designer: ?pageId=xxx)
  const urlPageId = new URL(window.location.href).searchParams.get('pageId');
  if (urlPageId) return urlPageId;

  // 2. URL path pattern (new designer: /pages/pageId)
  const pathPageMatch = window.location.pathname.match(/\/pages?\/([a-f0-9]{24})/i);
  if (pathPageMatch) return pathPageMatch[1];

  // 3. window.webflow.designer
  try {
    if (window.webflow?.designer) {
      const designer = window.webflow.designer;
      if (designer.currentPage?._id) return designer.currentPage._id;
      if (designer.currentPage?.id) return designer.currentPage.id;
      if (typeof designer.getCurrentPage === 'function') {
        const p = designer.getCurrentPage();
        if (p?._id) return p._id;
        if (p?.id) return p.id;
      }
    }
  } catch (e) {
    console.warn('[Breakpoint Cleaner] Could not read page from window.webflow.designer');
  }

  // 4. window.__INITIAL_STATE__
  try {
    const state = window.__INITIAL_STATE__;
    if (state) {
      if (state.page?._id) return state.page._id;
      if (state.page?.id) return state.page.id;
      if (state.pageId) return state.pageId;
      if (state.currentPage?._id) return state.currentPage._id;
      if (state.currentPage?.id) return state.currentPage.id;
    }
  } catch (e) {
    console.warn('[Breakpoint Cleaner] Could not read page from __INITIAL_STATE__');
  }

  return null;
};

export const getCSRFToken = () => {
  return document.head.querySelector('meta[name="_csrf"]')?.getAttribute('content');
};

export const getWebflowAppId = () => {
  try {
    if (window.webflow && window.webflow.env) {
      if (window.webflow.env.appId) return window.webflow.env.appId;
      if (window.webflow.env.clientId) return window.webflow.env.clientId;
    }
    if (window.webflow && window.webflow.designer) {
      const designer = window.webflow.designer;
      if (designer.appId) return designer.appId;
      if (designer.clientId) return designer.clientId;
    }
  } catch (e) {
    console.warn('[Breakpoint Cleaner] Could not read app id from window.webflow');
  }
  return 'designer';
};

export const getSessionId = async () => {
  try {
    if (window.webflow && window.webflow.designer?.clientLeaderInstance) {
      return window.webflow.designer.clientLeaderInstance;
    }
  } catch (e) { /* ignore */ }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
