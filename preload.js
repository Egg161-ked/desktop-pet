const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (_e, cfg) => cb(cfg)),
  onCursorPosition: (cb) => ipcRenderer.on('cursor-position', (_e, point) => cb(point)),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', { dx, dy }),
  setMousePassthrough: (ignore) => ipcRenderer.send('set-mouse-passthrough', !!ignore),
});
