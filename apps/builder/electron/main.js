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

const { app, BrowserWindow, shell, session, ipcMain, nativeImage } = require('electron');
const fs   = require('fs');
const path = require('path');

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
