/* ─────────────────────────────────────────────────────────────────────────── */
// Breakpoint definitions
// Lists the additional (non-default) Webflow breakpoints the extension can
// remove — xxl (1920+), xl (1440+), large (1280+) — along with the UI label
// and icon asset used for each one in the popup.
/* ─────────────────────────────────────────────────────────────────────────── */
export const ADDITIONAL_BREAKPOINTS = ['xxl', 'xl', 'large'];

export const BREAKPOINT_META = {
  xxl:   { label: '1920px and up', icon: 'icons/1920-breakpoint-icon.png' },
  xl:    { label: '1440px and up', icon: 'icons/1440-breakpoint-icon.png' },
  large: { label: '1280px and up', icon: 'icons/1280-breakpoint-icon.png' },
};
