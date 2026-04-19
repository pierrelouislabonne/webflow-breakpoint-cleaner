/* ─────────────────────────────────────────────────────────────────────────── */
// Webflow internal API client
// Authenticated fetch wrappers around Webflow's private Designer API.
//   - fetchDOM   : GET the live DOM + styles for a given page
//   - updateDOM  : POST the modified DOM nodes back (optionally a snapshot)
//   - updateStyles : POST the modified styles / breakpoints back
// Auth is the Designer's own session: CSRF meta + x-webflow-app-id header.
/* ─────────────────────────────────────────────────────────────────────────── */
import { getSiteName, getCSRFToken, getWebflowAppId, getSessionId } from './env.js';

const authHeaders = (csrf, appId) => ({
  'content-type': 'application/json; charset=UTF-8',
  'x-xsrf-token': csrf,
  'x-webflow-app-id': appId
});

export const fetchDOM = async (pageId) => {
  const siteName = getSiteName();
  if (!siteName) throw new Error('Could not determine site name');

  const url = new URL(`/api/sites/${siteName}/dom`, window.location.origin);
  url.searchParams.append('t', new Date().getTime().toString());
  if (pageId) url.searchParams.append('pageId', pageId);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json();
};

export const updateDOM = async (domData, description) => {
  const siteName = getSiteName();
  const csrf = getCSRFToken();
  const appId = getWebflowAppId();

  if (!siteName || !csrf) throw new Error('Missing site name or CSRF token');

  const sessionId = await getSessionId();
  const { pageId, version, domNodes, symbols } = domData;
  const domNodesVersion = domData.domNodesVersion || domData.version;

  if (!domNodesVersion) throw new Error('No domNodesVersion found in DOM data');

  const url = new URL(`/api/pages/${pageId}/dom`, window.location.origin);

  const payload = {
    siteName,
    symbols,
    sessionId,
    description,
    clientAppVersion: version,
    nodes: domNodes,
    domNodesVersion,
    snapshot: !!description
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(csrf, appId),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DOM API returned ${response.status}: ${errorText}`);
  }
  return true;
};

export const updateStyles = async (domData) => {
  const siteName = getSiteName();
  const csrf = getCSRFToken();
  const appId = getWebflowAppId();

  if (!siteName || !csrf) throw new Error('Missing site name or CSRF token');

  const sessionId = await getSessionId();
  const { pageId, version, styles } = domData;
  const { data, blocks } = styles;

  const stylesVersion = data.version || domData.stylesVersion;
  if (!stylesVersion) throw new Error('No stylesVersion found in styles data');

  const url = new URL(`/api/sites/${siteName}/styles`, window.location.origin);

  const payload = {
    data,
    styles: blocks,
    stylesVersion,
    pageId,
    clientLeaderInstance: sessionId,
    clientAppVersion: version
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(csrf, appId),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Styles API returned ${response.status}: ${errorText}`);
  }
  return true;
};

