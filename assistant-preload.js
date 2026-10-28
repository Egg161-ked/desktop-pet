const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('assistantBridge', {
  getState: () => ipcRenderer.invoke('assistant-get-state'),
  sendMessage: (text) => ipcRenderer.invoke('assistant-send', text),
  cancel: () => ipcRenderer.send('assistant-cancel'),
  cancelReminder: (id) => ipcRenderer.invoke('assistant-cancel-reminder', id),
  close: () => ipcRenderer.send('assistant-close'),
  onProgress: (callback) => subscribe('assistant-progress', callback),
  onNotice: (callback) => subscribe('assistant-notice', callback),
  onRemindersUpdated: (callback) => subscribe('assistant-reminders-updated', callback),
});
