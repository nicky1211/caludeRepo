const { contextBridge, ipcRenderer } = require('electron');

const system = ipcRenderer.sendSync('system:info');

contextBridge.exposeInMainWorld('notebookDesktop', {
  platform: system.platform,
  accentColor: system.accentColor,
  load: () => ipcRenderer.sendSync('store:load'),
  save: (json) => ipcRenderer.sendSync('store:save', json),
  confirm: (opts) => ipcRenderer.invoke('dialog:confirm', opts),
  alert: (opts) => ipcRenderer.invoke('dialog:alert', opts),
  exportFile: (opts) => ipcRenderer.invoke('file:export', opts),
  importFile: () => ipcRenderer.invoke('file:import'),
  openImages: () => ipcRenderer.invoke('file:images'),
  notify: (opts) => ipcRenderer.send('notify', opts),
  popupMenu: (template, x, y) => ipcRenderer.invoke('menu:popup', template, x, y),
  setMenuState: (state) => ipcRenderer.send('menu:state', state),
  onCommand: (fn) => ipcRenderer.on('command', (e, cmd) => fn(cmd)),
  onSystem: (fn) => ipcRenderer.on('system:update', (e, info) => fn(info)),
});
