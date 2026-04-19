/* ─────────────────────────────────────────────────────────────────────────── */
// Popup UI controller
// Discovers the active Designer tab (or lets the user pick one when several
// are open), requests the list of breakpoints for that page and renders the
// selection UI that dispatches the removal request to the content script.
/* ─────────────────────────────────────────────────────────────────────────── */
const DESIGNER_PATTERNS = [
  /^https:\/\/webflow\.com\/design/,
  /^https:\/\/[^.]+\.design\.webflow\.com\//,
];

const isDesigner = (url) => url && DESIGNER_PATTERNS.some((re) => re.test(url));

const VIEWS = ['loading', 'select', 'success', 'error', 'no-designer', 'tab-list'];

const showView = (name) => {
  for (const v of VIEWS) document.getElementById(`view-${v}`).hidden = v !== name;
};

const extensionBaseUrl = chrome.runtime.getURL('');

let activeTabId = null;
let discoveredPageId = null;

const updateConfirmState = () => {
  const selected = document.querySelectorAll('#bp-list .bp-item.selected');
  const btn = document.getElementById('confirm');
  btn.disabled = selected.length === 0;
  btn.textContent = selected.length > 0 ? `Remove ${selected.length}` : 'Remove';
};

const renderBreakpoints = (breakpoints) => {
  const bpList = document.getElementById('bp-list');
  bpList.innerHTML = '';
  document.getElementById('reload-btn')?.remove();
  document.querySelector('.subtitle').textContent = 'Select breakpoints to permanently remove.';
  document.querySelector('.footer .hint').textContent = '\u2139 A backup is created automatically.';
  document.getElementById('confirm').hidden = false;
  let hasAny = false;

  for (const bp of breakpoints) {
    const li = document.createElement('li');
    li.className = 'bp-item' + (bp.inSite ? '' : ' disabled');
    li.dataset.bp = bp.id;

    const iconEl = document.createElement('img');
    iconEl.className = 'bp-icon';
    if (bp.icon) iconEl.src = extensionBaseUrl + bp.icon;
    iconEl.alt = '';

    const info = document.createElement('div');
    info.className = 'bp-info';

    const name = document.createElement('span');
    name.className = 'bp-name';
    name.textContent = bp.label || bp.id;

    const impactEl = document.createElement('span');
    impactEl.className = 'bp-impact';
    impactEl.textContent = bp.inSite
      ? `${bp.impact.nodes} element${bp.impact.nodes !== 1 ? 's' : ''}, ${bp.impact.blocks} style${bp.impact.blocks !== 1 ? 's' : ''}`
      : 'Not in use';

    info.appendChild(name);
    info.appendChild(impactEl);
    li.appendChild(iconEl);
    li.appendChild(info);

    if (bp.inSite) {
      li.addEventListener('click', () => {
        li.classList.toggle('selected');
        updateConfirmState();
      });
      hasAny = true;
    }

    bpList.appendChild(li);
  }

  if (!hasAny) {
    document.querySelector('.subtitle').textContent = 'No additional breakpoints found on this site.';
    document.querySelector('.footer .hint').textContent = "Can't see your breakpoint?";
    document.getElementById('confirm').hidden = true;
    const btn = document.createElement('button');
    btn.id = 'reload-btn';
    btn.className = 'btn btn-reload';
    btn.textContent = 'Refresh';
    btn.addEventListener('click', () => {
      if (activeTabId) loadBreakpoints(activeTabId);
    });
    document.querySelector('.footer').appendChild(btn);
  }
};

const loadBreakpoints = (tabId) => {
  showView('loading');
  document.getElementById('loading-msg').textContent = 'Fetching breakpoints…';
  chrome.tabs.sendMessage(tabId, { type: 'WF_GET_BREAKPOINTS' }).catch(() => {
    document.getElementById('error-msg').textContent = 'Could not connect to the Designer. Try reloading the page.';
    showView('error');
  });
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'WF_BREAKPOINTS_DATA') {
    discoveredPageId = message.pageId || null;
    document.getElementById('site-name').textContent = message.siteName || '';
    renderBreakpoints(message.breakpoints);
    updateConfirmState();
    showView('select');
  }
  if (message.type === 'WF_REMOVE_PROGRESS') {
    document.getElementById('loading-msg').textContent = message.message;
  }
  if (message.type === 'WF_REMOVE_DONE') {
    showView('success');
    if (activeTabId) setTimeout(() => chrome.tabs.reload(activeTabId), 2000);
  }
  if (message.type === 'WF_ERROR') {
    document.getElementById('error-msg').textContent = message.message;
    showView('error');
  }
});

document.getElementById('confirm').addEventListener('click', () => {
  if (!activeTabId) return;
  const selected = [...document.querySelectorAll('#bp-list .bp-item.selected')].map(li => li.dataset.bp);
  if (selected.length === 0) return;

  showView('loading');
  document.getElementById('loading-msg').textContent = `Removing ${selected.join(', ')}…`;

  chrome.tabs.sendMessage(activeTabId, { type: 'WF_REMOVE_BREAKPOINTS', breakpoints: selected, pageId: discoveredPageId });
});

const renderTabList = (tabs) => {
  const list = document.getElementById('tab-list');
  list.innerHTML = '';

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'tab-item';

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || 'icons/icon-16.png';
    favicon.onerror = () => { favicon.src = 'icons/icon-16.png'; };

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url;

    btn.appendChild(favicon);
    btn.appendChild(title);
    btn.addEventListener('click', () => {
      activeTabId = tab.id;
      chrome.tabs.update(tab.id, { active: true });
      loadBreakpoints(tab.id);
    });
    list.appendChild(btn);
  }

  showView('tab-list');
};

chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
  if (activeTab && isDesigner(activeTab.url)) {
    activeTabId = activeTab.id;
    loadBreakpoints(activeTab.id);
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    const designerTabs = tabs.filter((t) => isDesigner(t.url));
    if (designerTabs.length >= 1) {
      renderTabList(designerTabs);
    } else {
      showView('no-designer');
    }
  });
});
