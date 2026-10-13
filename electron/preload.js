const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notebookDesktop', {
  load: () => ipcRenderer.sendSync('store:load'),
  save: (json) => ipcRenderer.sendSync('store:save', json),
});
