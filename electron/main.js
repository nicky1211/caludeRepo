const {
  app, BrowserWindow, ipcMain, Menu, shell, dialog, Notification, nativeTheme, systemPreferences, screen,
} = require('electron');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';
const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'notebook-data.json');
const backupFile = () => path.join(dataDir(), 'notebook-data.backup.json');
const windowStateFile = () => path.join(dataDir(), 'window-state.json');

let win = null;
let menuState = { sidebarHidden: false };

// ---------- Data ----------

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

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file); // a crash never leaves a half-written file
}

ipcMain.on('store:load', (e) => { e.returnValue = readData(); });

ipcMain.on('store:save', (e, json) => {
  try {
    JSON.parse(json);
    writeAtomic(dataFile(), json);
    e.returnValue = { ok: true };
  } catch (err) {
    e.returnValue = { ok: false, error: String((err && err.message) || err) };
  }
});

// ---------- System integration ----------

function accentColor() {
  try {
    return (isMac || process.platform === 'win32') ? systemPreferences.getAccentColor() : null;
  } catch (e) {
    return null;
  }
}

ipcMain.on('system:info', (e) => {
  e.returnValue = { platform: process.platform, accentColor: accentColor() };
});

function sendSystem(info) {
  if (win && !win.isDestroyed()) win.webContents.send('system:update', info);
}

const parentWindow = (e) => BrowserWindow.fromWebContents(e.sender);

// Sheets on macOS (attached to the window); modal dialogs elsewhere.
ipcMain.handle('dialog:confirm', async (e, { message, detail, okLabel, destructive }) => {
  const { response } = await dialog.showMessageBox(parentWindow(e), {
    type: 'warning',
    message: String(message || ''),
    detail: String(detail || ''),
    buttons: [String(okLabel || 'OK'), 'Cancel'],
    defaultId: destructive ? 1 : 0, // destructive actions default to Cancel
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
});

ipcMain.handle('dialog:alert', async (e, { message, detail }) => {
  await dialog.showMessageBox(parentWindow(e), {
    type: 'info', message: String(message || ''), detail: String(detail || ''), buttons: ['OK'],
  });
});

ipcMain.handle('file:export', async (e, { json, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow(e), {
    title: 'Export Notebooks',
    defaultPath: path.join(app.getPath('documents'), String(defaultName || 'Notebook Export.json')),
    filters: [{ name: 'Notebook Export (JSON)', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  writeAtomic(filePath, String(json));
  return filePath;
});

ipcMain.handle('file:import', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow(e), {
    title: 'Import Notebooks',
    properties: ['openFile'],
    filters: [{ name: 'Notebook Export (JSON)', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return null;
  return { name: path.basename(filePaths[0]), text: fs.readFileSync(filePaths[0], 'utf8') };
});

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', bmp: 'image/bmp', svg: 'image/svg+xml' };

ipcMain.handle('file:images', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow(e), {
    title: 'Insert Image',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: Object.keys(IMAGE_TYPES) }],
  });
  if (canceled) return [];
  return filePaths.map((p) => ({
    name: path.basename(p),
    type: IMAGE_TYPES[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream',
    data: fs.readFileSync(p).toString('base64'),
  }));
});

ipcMain.on('notify', (e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title: String(title || ''), body: String(body || ''), silent: true }).show();
});

// Context menus built by the page: native menus with the page's labels, checkmarks and shortcuts.
ipcMain.handle('menu:popup', (e, template, x, y) => new Promise((resolve) => {
  let done = false;
  const finish = (value) => { if (!done) { done = true; resolve(value); } };
  const build = (items) => (Array.isArray(items) ? items : []).map((it) => {
    if (it.type === 'separator') return { type: 'separator' };
    if (it.submenu) return { label: String(it.label || ''), submenu: build(it.submenu) };
    return {
      label: String(it.label || ''),
      type: it.type === 'checkbox' ? 'checkbox' : 'normal',
      checked: !!it.checked,
      enabled: it.enabled !== false,
      accelerator: typeof it.accelerator === 'string' ? it.accelerator : undefined,
      registerAccelerator: false,
      click: () => {
        // Commands that open pickers need a user gesture in the page.
        if (typeof it.command === 'string') runCommand(it.command);
        finish(it.id);
      },
    };
  });
  const menu = Menu.buildFromTemplate(build(template));
  menu.popup({
    window: parentWindow(e),
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    callback: () => setTimeout(() => finish(null), 50),
  });
}));

ipcMain.on('menu:state', (e, state) => {
  const next = { ...menuState, ...state };
  if (JSON.stringify(next) === JSON.stringify(menuState)) return;
  menuState = next;
  buildMenu(); // menu labels can't be changed in place on macOS
});

function runCommand(cmd) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  // Runs as a user gesture so file and colour pickers are allowed to open.
  win.webContents.executeJavaScript(`window.__notebookCommand && window.__notebookCommand(${JSON.stringify(cmd)})`, true)
    .catch(() => {});
}

// ---------- Window ----------

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
    const area = screen.getDisplayMatching(s).workArea;
    const visible = s.x < area.x + area.width - 100 && s.x + s.width > area.x + 100 &&
      s.y >= area.y - 20 && s.y < area.y + area.height - 100;
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch (e) {
    return { width: 1240, height: 820 };
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try {
    writeAtomic(windowStateFile(), JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }));
  } catch (e) { /* not critical */ }
}

function createWindow() {
  const s = loadWindowState();
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width || 1240,
    height: s.height || 820,
    minWidth: 720,
    minHeight: 460,
    show: false,
    title: 'Notebook',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 20, y: 19 } : undefined,
    vibrancy: isMac ? 'sidebar' : undefined,
    visualEffectState: isMac ? 'followWindow' : undefined,
    backgroundColor: isMac ? '#00000000' : (dark ? '#1e1e1e' : '#ffffff'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  if (s.maximized) win.maximize();
  if (s.fullscreen) win.setFullScreen(true);
  win.once('ready-to-show', () => win.show()); // no blank flash on launch

  // Links open in the default browser; the window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Editing context menu with spelling suggestions (lists build their own menus).
  win.webContents.on('context-menu', (e, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const items = [];
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
      }
      if (!params.dictionarySuggestions.length) items.push({ label: 'No Guesses Found', enabled: false });
      items.push({ label: 'Learn Spelling', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (isMac && params.selectionText.trim()) {
      const word = params.selectionText.trim();
      items.push({ label: `Look Up “${word.length > 24 ? word.slice(0, 24) + '…' : word}”`, click: () => win.webContents.showDefinitionForSelection() });
      items.push({ type: 'separator' });
    }
    items.push({ role: 'cut', enabled: params.editFlags.canCut });
    items.push({ role: 'copy', enabled: params.editFlags.canCopy });
    items.push({ role: 'paste', enabled: params.editFlags.canPaste });
    if (params.isEditable) items.push({ role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste });
    items.push({ type: 'separator' }, { role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on('enter-full-screen', () => sendSystem({ fullscreen: true }));
  win.on('leave-full-screen', () => sendSystem({ fullscreen: false }));
  let stateTimer = null;
  const queueSave = () => { clearTimeout(stateTimer); stateTimer = setTimeout(saveWindowState, 400); };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', saveWindowState);
  win.on('closed', () => { win = null; });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

// ---------- Menu bar ----------

function buildMenu() {
  const cmd = (id) => () => runCommand(id);
  const ifMac = (macValue, otherValue) => (isMac ? macValue : otherValue);
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Page', accelerator: 'CmdOrCtrl+N', click: cmd('newPage') },
        { label: 'New Subpage', accelerator: ifMac('Alt+Cmd+N', undefined), click: cmd('newSubpage') }, // Ctrl+Alt is AltGr on Windows
        { label: 'New Section', accelerator: 'Shift+CmdOrCtrl+N', click: cmd('newSection') },
        { label: 'New Notebook…', click: cmd('newNotebook') },
        { type: 'separator' },
        { label: 'Import…', accelerator: 'CmdOrCtrl+O', click: cmd('import') },
        { label: 'Export…', accelerator: 'Shift+CmdOrCtrl+E', click: cmd('export') },
        { type: 'separator' },
        { label: ifMac('Show Data in Finder', 'Open Data Folder'), click: () => shell.openPath(dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: cmd('find') },
        ...(isMac ? [
          { type: 'separator' },
          { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
        ] : []),
      ],
    },
    {
      label: 'Format',
      submenu: [
        // Bold/italic/underline are handled natively by the editor; the menu only shows the shortcut.
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', registerAccelerator: false, click: cmd('bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', registerAccelerator: false, click: cmd('italic') },
        { label: 'Underline', accelerator: 'CmdOrCtrl+U', registerAccelerator: false, click: cmd('underline') },
        { label: 'Strikethrough', accelerator: 'Shift+CmdOrCtrl+X', click: cmd('strike') },
        { type: 'separator' },
        { label: 'Title', accelerator: ifMac('Alt+Cmd+1', 'Ctrl+Shift+1'), click: cmd('h1') },
        { label: 'Heading', accelerator: ifMac('Alt+Cmd+2', 'Ctrl+Shift+2'), click: cmd('h2') },
        { label: 'Body', accelerator: ifMac('Alt+Cmd+0', 'Ctrl+Shift+0'), click: cmd('body') },
        { type: 'separator' },
        { label: 'Bulleted List', accelerator: 'Shift+CmdOrCtrl+7', click: cmd('bullets') },
        { label: 'Numbered List', accelerator: 'Shift+CmdOrCtrl+8', click: cmd('numbers') },
        { label: 'To-Do Checkbox', accelerator: 'CmdOrCtrl+1', click: cmd('todo') },
        { type: 'separator' },
        { label: 'Highlight', accelerator: 'Shift+CmdOrCtrl+H', click: cmd('highlight') },
        { label: 'Text Colour…', click: cmd('colorPicker') },
        { label: 'Add Link…', accelerator: 'CmdOrCtrl+K', click: cmd('link') },
        { label: 'Insert Table…', click: cmd('table') },
        { label: 'Insert Image…', accelerator: 'Shift+CmdOrCtrl+I', click: cmd('image') },
        { type: 'separator' },
        { label: 'Clear Formatting', click: cmd('clear') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: menuState.sidebarHidden ? 'Show Sidebar' : 'Hide Sidebar', accelerator: ifMac('Ctrl+Cmd+S', 'Ctrl+Shift+L'), click: cmd('toggleSidebar') },
        { type: 'separator' },
        { label: 'Make Text Bigger', accelerator: 'CmdOrCtrl+Plus', click: cmd('textBigger') },
        { label: 'Make Text Smaller', accelerator: 'CmdOrCtrl+-', click: cmd('textSmaller') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: cmd('textActual') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Notebook Help', click: () => shell.openExternal('https://github.com/nicky1211/caludeRepo#readme') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- App lifecycle ----------

// One instance only, so two windows never overwrite each other's data.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.setAboutPanelOptions({
    applicationName: 'Notebook',
    applicationVersion: app.getVersion(),
    copyright: 'Notes organised in notebooks, sections and pages.',
  });

  app.whenReady().then(() => {
    // Keep a copy of the last good data from the previous session.
    try { if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), backupFile()); } catch (e) { /* ignore */ }
    buildMenu();
    createWindow();

    // Follow the system accent colour when it changes.
    if (isMac) {
      systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', () => sendSystem({ accentColor: accentColor() }));
    } else if (process.platform === 'win32') {
      systemPreferences.on('accent-color-changed', () => sendSystem({ accentColor: accentColor() }));
    }

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (!isMac) app.quit(); });
}
