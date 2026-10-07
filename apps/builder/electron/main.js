/**
 * electron/main.js
 * Electron main process for GlazeBid AIQ (Builder).
 *
 * Dev mode  : loads http://localhost:5173 (Vite dev server)
 * Prod mode : loads dist/index.html (built bundle)
 *
 * Also manages the GlazeBid Studio window when the user clicks
 * "Open GlazeBid Studio" inside the Builder UI.
 */

'use strict';

const { app, BrowserWindow, shell, session, ipcMain, nativeImage, dialog, net } = require('electron');
const fs   = require('fs');
const path = require('path');

// ── Project filesystem helpers ────────────────────────────────────────────────
// User preferences (projects root path) live in Electron's userData folder,
// completely separate from any project drive — so they survive drive remaps.

const PROJECT_FILE_NAME = 'project.aiq';
const PROJECT_SUBDIRS   = ['01_Drawings', '02_Specifications', '03_Takeoffs',
                           '04_Estimates', '05_Proposals', '06_Reports'];

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'glazebid-prefs.json');
}

function readPrefs() {
  try {
    const raw = fs.readFileSync(getPrefsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePrefs(data) {
  fs.writeFileSync(getPrefsPath(), JSON.stringify(data, null, 2), 'utf8');
}

/** Sanitise a project name into a safe folder name. */
function safeFolderName(name) {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ');
}

/** Return the full path to a project's .aiq file. */
function projectAiqPath(root, projectName) {
  return path.join(root, safeFolderName(projectName), PROJECT_FILE_NAME);
}

/** Create the project folder + standard subfolders if they don't exist. */
function ensureProjectFolder(root, projectName) {
  const dir = path.join(root, safeFolderName(projectName));
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of PROJECT_SUBDIRS) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

const isDev = !app.isPackaged;

// ── Resolve app icon ─────────────────────────────────────────────────────────
// Windows requires .ico; Linux/macOS use .png.  SVG is not supported by the OS.
// Check Studio's branding assets first (sibling repo), then local AIQ assets.
const _appIcon = (() => {
  // __dirname = C:\GlazeBid_AIQ\frontend\electron
  //   ../public             → C:\GlazeBid_AIQ\frontend\public          (local copy, easiest)
  //   ../src/assets         → C:\GlazeBid_AIQ\frontend\src\assets
  //   ../../../GlazeBid_Studio/src/assets/branding → C:\GlazeBid_Studio\src\assets\branding
  const searchDirs = [
    path.join(__dirname, '../public'),                                   // AIQ public (local copy)
    path.join(__dirname, '../src/assets'),                               // AIQ src assets
    path.join(__dirname, '../../../GlazeBid_Studio/src/assets/branding'),// Studio branding (corrected)
    path.join(__dirname, '../../../GlazeBid_Studio/public/branding'),    // Studio public branding
  ];
  for (const dir of searchDirs) {
    for (const name of ['ICON_LOGO.ico', 'ICON_LOGO.png']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        console.log('[Builder] icon:', candidate);
        return candidate;
      }
    }
  }
  console.warn('[Builder] ⚠ no raster icon found — using default Electron icon');
  return undefined;
})();

// ── Studio window state ──────────────────────────────────────────────────────
let mainWindow   = null;
let studioWindow = null;
let studioReady  = false;
let pendingProject = null;

// ── IPC: CORS-safe HTTP GET for renderer (bypasses Electron's CORS restrictions) ─
ipcMain.handle('glazebid:http-get', async (_event, url) => {
  try {
    const res = await net.fetch(url, { bypassCustomProtocolHandlers: false });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
});

// ── IPC: read PDF from disk ───────────────────────────────────────────────────
ipcMain.handle('glazebid:read-pdf', async (_event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    return { ok: true, buffer: buf, name: path.basename(filePath) };
  } catch (err) {
    console.error('[Builder] glazebid:read-pdf error:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── IPC: Project filesystem — get/set projects root ───────────────────────────
ipcMain.handle('project:getRoot', () => {
  return readPrefs().projectsRoot || null;
});

ipcMain.handle('project:setRoot', async () => {
  const result = await dialog.showOpenDialog({
    title:       'Choose GlazeBid Projects Folder',
    buttonLabel: 'Set as Projects Folder',
    properties:  ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  const chosen = result.filePaths[0];
  const prefs  = readPrefs();
  prefs.projectsRoot = chosen;
  writePrefs(prefs);
  return chosen;
});

// ── IPC: Project filesystem — save ───────────────────────────────────────────
ipcMain.handle('project:save', async (_event, { projectName, payload }) => {
  const root = readPrefs().projectsRoot;
  if (!root) return { ok: false, error: 'NO_ROOT' };
  try {
    ensureProjectFolder(root, projectName);
    const aiqPath = projectAiqPath(root, projectName);
    fs.writeFileSync(aiqPath, JSON.stringify(payload, null, 2), 'utf8');
    // Update the recent-projects registry stored in prefs
    const prefs = readPrefs();
    const registry = prefs.projectRegistry || [];
    const existing = registry.find(r => r.name === projectName);
    if (existing) {
      existing.modified = new Date().toISOString();
      existing.aiqPath  = aiqPath;
    } else {
      registry.unshift({ name: projectName, modified: new Date().toISOString(), aiqPath });
    }
    prefs.projectRegistry = registry;
    writePrefs(prefs);
    return { ok: true, aiqPath };
  } catch (err) {
    console.error('[Builder] project:save error:', err);
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Project filesystem — load by name ────────────────────────────────────
ipcMain.handle('project:load', async (_event, { projectName, aiqPath: explicitPath }) => {
  try {
    let filePath = explicitPath;
    if (!filePath) {
      const root = readPrefs().projectsRoot;
      if (!root) return { ok: false, error: 'NO_ROOT' };
      filePath = projectAiqPath(root, projectName);
    }
    if (!fs.existsSync(filePath)) return { ok: false, error: 'NOT_FOUND' };
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ok: true, payload: JSON.parse(raw) };
  } catch (err) {
    console.error('[Builder] project:load error:', err);
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Project filesystem — open file dialog (.aiq picker) ─────────────────
ipcMain.handle('project:openDialog', async () => {
  const root   = readPrefs().projectsRoot;
  const result = await dialog.showOpenDialog({
    title:       'Open GlazeBid Project',
    defaultPath: root || app.getPath('documents'),
    filters:     [{ name: 'GlazeBid Project', extensions: ['aiq'] }],
    properties:  ['openFile'],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ok: true, aiqPath: filePath, payload: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Project filesystem — list all projects in root ──────────────────────
ipcMain.handle('project:list', () => {
  const prefs = readPrefs();
  const root  = prefs.projectsRoot;
  if (!root || !fs.existsSync(root)) {
    // Return the registry cached in prefs even if root is unmounted
    return { ok: true, projects: prefs.projectRegistry || [], rootMissing: true };
  }
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const aiqPath = path.join(root, entry.name, PROJECT_FILE_NAME);
      if (!fs.existsSync(aiqPath)) continue;
      const stat     = fs.statSync(aiqPath);
      const modified = stat.mtime.toISOString();
      // Try to read projectName from the file itself (may differ from folder)
      let name = entry.name;
      try {
        const raw  = fs.readFileSync(aiqPath, 'utf8');
        const data = JSON.parse(raw);
        name = data?.metadata?.projectName || name;
      } catch { /* use folder name */ }
      projects.push({ name, folderName: entry.name, aiqPath, modified });
    }
    projects.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    return { ok: true, projects, root };
  } catch (err) {
    console.error('[Builder] project:list error:', err);
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Project filesystem — delete a project folder ────────────────────────
ipcMain.handle('project:delete', async (_event, { folderName, aiqPath: explicitPath }) => {
  const root = readPrefs().projectsRoot;
  if (!root) return { ok: false, error: 'NO_ROOT' };
  try {
    // Determine folder path safely — never allow traversal outside root
    let targetDir;
    if (explicitPath) {
      targetDir = path.dirname(explicitPath);
    } else {
      targetDir = path.join(root, safeFolderName(folderName));
    }
    // Security: ensure the target is actually inside the configured root
    const rel = path.relative(root, targetDir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, error: 'PATH_TRAVERSAL' };
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    // Remove from registry
    const prefs    = readPrefs();
    prefs.projectRegistry = (prefs.projectRegistry || [])
      .filter(r => r.aiqPath !== (explicitPath || path.join(targetDir, PROJECT_FILE_NAME)));
    writePrefs(prefs);
    return { ok: true };
  } catch (err) {
    console.error('[Builder] project:delete error:', err);
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Project filesystem — export copy to user-chosen location ─────────────
ipcMain.handle('project:exportCopy', async (_event, { projectName, payload }) => {
  const result = await dialog.showSaveDialog({
    title:       'Export Project Copy',
    defaultPath: path.join(app.getPath('documents'), `${safeFolderName(projectName)}.aiq`),
    filters:     [{ name: 'GlazeBid Project', extensions: ['aiq'] }],
  });
  if (result.canceled) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, savedTo: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ── IPC: Studio renderer signals it is fully initialised ──────────────────────
ipcMain.on('studio-ready', () => {
  console.log('[Builder] studio-ready received');
  studioReady = true;
  if (studioWindow && !studioWindow.isDestroyed()) {
    if (!studioWindow.isVisible()) studioWindow.show();
    if (pendingProject !== null) {
      studioWindow.webContents.send('load-project-data', pendingProject);
      pendingProject = null;
    }
  }
});

// ── IPC: Studio takeoff complete → relay to Builder renderer ──────────────────
ipcMain.on('studio-takeoff-complete', (_event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('takeoff-update', data);
  }
});

// ── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ── IPC: Builder renderer requests Studio window ──────────────────────────────
ipcMain.on('open-studio-project', (_event, data) => {
  console.log('[Builder] open-studio-project:', data?.projectId);
  pendingProject = data;

  if (studioWindow === null || studioWindow.isDestroyed()) {
    studioReady = false;
    createStudioWindow();
  } else {
    if (studioWindow.isMinimized()) studioWindow.restore();
    studioWindow.focus();
    if (studioReady) {
      studioWindow.webContents.send('load-project-data', data);
      pendingProject = null;
    }
  }
});

// ── Create Builder window ─────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:          1400,
    height:         900,
    minWidth:       900,
    minHeight:      600,
    title:          'GlazeBid Builder',
    autoHideMenuBar: true,
    backgroundColor: '#0b162a',       // GlazeBid navy — no white flash on startup
    titleBarStyle:   'hidden',
    // titleBarOverlay removed — React CustomTitleBar provides its own controls
    ...(_appIcon !== undefined ? { icon: nativeImage.createFromPath(_appIcon) } : {}),
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  if (_appIcon) {
    const _icon = nativeImage.createFromPath(_appIcon);
    if (!_icon.isEmpty()) mainWindow.setIcon(_icon);
  }

  // Make the Builder's own header draggable to move the window
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.insertCSS(
      '.app-header, header[role="banner"], #top-bar, #app-header ' +
      '{ -webkit-app-region: drag !important; }\n' +
      '.app-header button, .app-header a, .app-header input, ' +
      '.app-header select, .app-header [role="button"], ' +
      '.app-header [data-no-drag] { -webkit-app-region: no-drag !important; }'
    );
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Studio URL is handled via IPC — all other external HTTP opens in the browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Create Studio window ───────────────────────────────────────────────────────
// Studio runs as a child BrowserWindow within this Electron process, sharing
// the same main process and IPC bus.  It uses Studio's preload.cjs so the full
// electronAPI (readPdfFile, studioReady, onLoadProjectData …) is available.
function createStudioWindow() {
  // Prefer Studio's own preload; fall back to Builder preload if not found.
  // __dirname = C:\GlazeBid_AIQ\frontend\electron
  // ../../../GlazeBid_Studio = C:\GlazeBid_Studio
  const STUDIO_PRELOAD = path.resolve(
    __dirname,
    '../../../GlazeBid_Studio/electron/preload.cjs',
  );
  const preloadToUse = fs.existsSync(STUDIO_PRELOAD)
    ? STUDIO_PRELOAD
    : path.join(__dirname, 'preload.js');

  studioWindow = new BrowserWindow({
    width:       1600,
    height:      1000,
    minWidth:    1024,
    minHeight:   700,
    autoHideMenuBar: true,
    backgroundColor: '#0b162a',
    title: 'GlazeBid Studio',
    titleBarStyle:   'hidden',
    titleBarOverlay: {
      color:       '#0b162a',
      symbolColor: '#9ea7b3',
      height:      48,
    },
    ...(_appIcon !== undefined ? { icon: nativeImage.createFromPath(_appIcon) } : {}),
    show: false,
    webPreferences: {
      preload:            preloadToUse,
      contextIsolation:   true,
      nodeIntegration:    false,
      navigateOnDragDrop: false,
    },
  });

  if (_appIcon) {
    const _icon = nativeImage.createFromPath(_appIcon);
    if (!_icon.isEmpty()) studioWindow.setIcon(_icon);
  }

  // COOP / COEP — required for SharedArrayBuffer / PDF.js WASM multi-thread
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy':   ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
        'Cross-Origin-Resource-Policy': ['same-origin'],
      },
    });
  });

  // 5 s safety show — if studio-ready never fires, reveal the window anyway
  const fallback = setTimeout(() => {
    if (studioWindow && !studioWindow.isDestroyed() && !studioWindow.isVisible()) {
      console.warn('[Builder] ⚠ studio-ready not received in 5 s — forcing show');
      studioWindow.show();
    }
  }, 5000);

  studioWindow.once('closed', () => {
    clearTimeout(fallback);
    studioWindow = null;
    studioReady  = false;
  });

  loadStudioWithRetry(studioWindow);
}

/** Retry connecting to Studio's Vite dev server every 500 ms, up to 20 times. */
function loadStudioWithRetry(win, attempt = 1) {
  win.loadURL('http://127.0.0.1:5177').catch(() => {
    if (win.isDestroyed()) return;
    if (attempt < 20) {
      setTimeout(() => loadStudioWithRetry(win, attempt + 1), 500);
    } else {
      console.error('[Builder] Studio Vite server unreachable after 20 attempts');
      win.show();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.glazebid.builder');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
