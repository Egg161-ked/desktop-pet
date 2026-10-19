const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (_e, cfg) => cb(cfg)),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', { dx, dy }),
});
