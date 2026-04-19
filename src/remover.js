/* ─────────────────────────────────────────────────────────────────────────── */
// Breakpoint removal logic
// Fetches the live DOM, strips the selected breakpoints from styles and DOM
// nodes, then saves back via the Designer API. Retries on version-conflict
// errors (409 / 412 / 428) and notifies the live Designer UI through the
// multiplayer WebSocket so the change is visible without a manual reload.
/* ─────────────────────────────────────────────────────────────────────────── */
import { getPageId } from "./env.js";
import { fetchDOM, updateDOM, updateStyles } from "./api.js";
import { BREAKPOINT_META } from "./constants.js";
import { sendMpDelete } from "./multiplayer.js";

export const computeImpact = (domData, bp) => {
  let nodes = 0;
  let blocks = 0;
  for (const node of domData.domNodes || []) {
    if (node.data?.style?.base?.[bp]) nodes++;
  }
  for (const block of domData.styles?.blocks || []) {
    const variant = block.data?.variants?.[bp];
    if (variant && variant.styleLess) blocks++;
  }
  return { nodes, blocks };
};

const isVersionConflict = (err) => {
  const msg = String(err?.message || "");
  return (
    /returned (409|412|428)/.test(msg) ||
    /version\s*(mismatch|conflict|stale|outdated)/i.test(msg) ||
    /conflict/i.test(msg)
  );
};

const withRetry = async (fn, { retries = 3, baseDelay = 250 } = {}) => {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isVersionConflict(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));
    }
  }
  throw lastErr;
};

const applyBreakpointDeletion = (domData, bpsToRemove) => {
  for (const bp of bpsToRemove) {
    if (domData.styles?.data?.breakpoints?.[bp]) {
      delete domData.styles.data.breakpoints[bp];
    }
    domData.styles?.blocks?.forEach((block) => {
      if (block.data?.variants?.[bp]) {
        delete block.data.variants[bp];
      }
    });
    for (const node of domData.domNodes || []) {
      if (node.data?.style?.base) {
        delete node.data.style.base[bp];
        if (Object.keys(node.data.style.base).length === 0)
          delete node.data.style.base;
        if (Object.keys(node.data.style || {}).length === 0)
          delete node.data.style;
      }
    }
  }
};


export const removeBreakpoints = async (bpsToRemove, onStatus, options = {}) => {
  const { pageId: pageIdOverride } = options;

  const currentPageId = pageIdOverride || getPageId();
  if (!currentPageId) {
    throw new Error("No page ID found. Open a page in the Designer first.");
  }

  onStatus("Updating styles…");
  await withRetry(async () => {
    const fresh = await fetchDOM(currentPageId);
    applyBreakpointDeletion(fresh, bpsToRemove);
    await updateStyles(fresh);
    const labels = bpsToRemove.map((bp) => BREAKPOINT_META[bp]?.label ?? bp).join(", ");
    await updateDOM(fresh, `[Webflow Breakpoint Cleaner] Removed ${labels}`);
  });

  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
  sendMpDelete(currentPageId, bpsToRemove);

  onStatus("Done.");
  return true;
};
