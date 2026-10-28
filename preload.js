const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),
  getActivityState: () => ipcRenderer.invoke('get-activity-state'),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', (_e, cfg) => cb(cfg)),
  onCursorPosition: (cb) => ipcRenderer.on('cursor-position', (_e, point) => cb(point)),
  onAssistantSay: (cb) => ipcRenderer.on('assistant-say', (_e, message) => cb(message)),
  onActivityUpdated: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('activity-updated', listener);
    return () => ipcRenderer.removeListener('activity-updated', listener);
  },
  onRoamStarted: (cb) => {
    const listener = (_e, durationMs) => cb(durationMs);
    ipcRenderer.on('roam-started', listener);
    return () => ipcRenderer.removeListener('roam-started', listener);
  },
  onRoamEnded: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('roam-ended', listener);
    return () => ipcRenderer.removeListener('roam-ended', listener);
  },
  requestRoam: () => ipcRenderer.send('request-roam'),
  cancelRoam: () => ipcRenderer.send('cancel-roam'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', { dx, dy }),
  setMousePassthrough: (ignore) => ipcRenderer.send('set-mouse-passthrough', !!ignore),
  feedFile: (file) => {
    try {
      const filePath = webUtils.getPathForFile(file);
      return ipcRenderer.invoke('feed-file', filePath);
    } catch {
      return Promise.resolve({ ok: false, reason: 'invalid-file' });
    }
  },
  pickAndFeedFolder: () => ipcRenderer.invoke('pick-and-feed-folder'),
});
