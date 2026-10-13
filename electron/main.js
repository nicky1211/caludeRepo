const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'notebook-data.json');
const backupFile = () => path.join(dataDir(), 'notebook-data.backup.json');

let win = null;

function readData() {
  for (const file of [dataFile(), backupFile()]) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      JSON.parse(raw); // only hand back data that parses
      return raw;
    } catch (e) { /* missing or corrupt: try the next one */ }
  }
  return null;
}

function writeData(json) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, dataFile()); // atomic replace so a crash never leaves a half-written file
}

ipcMain.on('store:load', (e) => { e.returnValue = readData(); });

ipcMain.on('store:save', (e, json) => {
  try {
    JSON.parse(json);
    writeData(json);
    e.returnValue = { ok: true };
  } catch (err) {
    e.returnValue = { ok: false, error: String(err && err.message || err) };
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 700,
    minHeight: 500,
    title: 'Notebook',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Links open in the system browser; the app window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Data Folder', click: () => shell.openPath(dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One instance only, so two windows never overwrite each other's data.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    // Keep a copy of the last good data from the previous session.
    try { if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), backupFile()); } catch (e) { /* ignore */ }
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
