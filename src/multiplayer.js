/* ─────────────────────────────────────────────────────────────────────────── */
// Multiplayer WebSocket helpers
// Captures the Designer's live Socket.io connection (wss://mp.*.webflow.com)
// via two complementary monkey-patches, then builds and sends the
// "siteData:update / remove" frame that removes breakpoints from the live UI.
// Without this the breakpoint tabs remain visible until a manual page reload.
/* ─────────────────────────────────────────────────────────────────────────── */
const bpMinWidth = { xxl: 1920, xl: 1440, large: 1280 };

let _socket = null;

export const captureSocket = () => {
  let captured = false;
  const OrigSend = WebSocket.prototype.send;

  WebSocket.prototype.send = function(...args) {
    if (!captured && this.url?.includes('mp.')) {
      _socket = this;
      captured = true;
      WebSocket.prototype.send = OrigSend;
    }
    return OrigSend.apply(this, args);
  };

  const OrigWS = window.WebSocket;
  window.WebSocket = function(...args) {
    const ws = new OrigWS(...args);
    if (args[0]?.includes('mp.')) {
      _socket = ws;
      if (!captured) { captured = true; WebSocket.prototype.send = OrigSend; }
    }
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
};

export const sendMpDelete = (pageId, bpsToRemove) => {
  if (!_socket || _socket.readyState !== 1) {
    console.warn('[Breakpoint Remover] Multiplayer WebSocket unavailable — reload the page manually if breakpoints still appear');
    return false;
  }
  const messageId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  const operations = bpsToRemove.map(bp => ({
    type: 'remove',
    value: { type: 'Breakpoint', value: { [bp]: { minWidth: bpMinWidth[bp] } } },
    path: [{ in: 'ImmutableRecord', at: 'breakpoints' }, { in: 'Object', at: bp }]
  }));
  _socket.send('42' + JSON.stringify(['siteData:update', {
    messageId,
    pageId,
    operations: { styles: operations },
    actionType: 'BREAKPOINT_REMOVED'
  }]));
  return true;
};
