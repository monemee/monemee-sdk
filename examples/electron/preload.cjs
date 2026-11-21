const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('license', {
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  check: () => ipcRenderer.invoke('license:check'),
  deactivate: () => ipcRenderer.invoke('license:deactivate')
});
