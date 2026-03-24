/**
 * electron/main.ts — GlazeBid v2 Main Process
 *
 * Manages two BrowserWindows:
 *   Builder  (legacy JSX UI, port 5173 in dev)
 *   Studio   (TypeScript takeoff engine, port 5174 in dev)
 *
 * IPC surface
 * ─────────────────────────────────────────────────────────
 * Builder ← → Studio:
 *   open-studio-project  Builder renderer → open Studio with a project
 *   studio-ready         Studio renderer → signals it finished initialising
 *   load-project-data    Main → Studio renderer after studio-ready fires
 *   studio-takeoff-complete  Studio renderer → sends completed takeoff bundle
 *   takeoff-update           Main → Builder renderer (relays studio-takeoff-complete)
 *   inbox-sync           Studio renderer → live inbox update while Studio is open
 *   inbox-update         Main → Builder renderer (relays inbox-sync)
 *   custom-cards-sync    Studio renderer → custom system cards update
 *   custom-cards-update  Main → Builder renderer (relays custom-cards-sync)
 *   frame-builder-send   Studio renderer → "Open in Frame Builder" from right-click
 *   frame-builder-receive Main → Builder renderer (relays frame-builder-send)
 *
 * File I/O:
 *   glazebid:read-pdf    Read a PDF file from disk → Uint8Array
 *   gbid:save            Save a .gbid project file
 *   gbid:open            Open a .gbid project file
 *   pdf:open             Open-file dialog → PDF Uint8Array
 *   pdf:save             Save a PDF buffer to a user-chosen path
 *   studio:open-with-pdf Open Studio then inject a PDF by role
 *   pdf:inject           Main → Studio (sent after studio:open-with-pdf)
 *
 * Misc:
 *   open-studio          Simple Studio open (no project data, for back-compat)
 */

// electron.d.ts is loaded by VS Code as a global ambient file, so
// `import('electron')` gives TS2306 "not a module" in that context.
// Cast using an inline object type whose members come from the global
// `Electron` ambient namespace — works in every TS project context.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app, BrowserWindow, ipcMain, dialog, session, nativeImage, shell, Menu } =
  require('electron') as {
    app:         Electron.App;
    BrowserWindow: typeof Electron.BrowserWindow;
    ipcMain:     Electron.IpcMain;
    dialog:      Electron.Dialog;
    session:     typeof Electron.Session;
    nativeImage: { createFromPath(path: string): Electron.NativeImage };
    shell:       Electron.Shell;
    Menu:        typeof Electron.Menu;
  };

/** Instance type of Electron.BrowserWindow – used for variable/param annotations. */
type BW = InstanceType<typeof BrowserWindow>;
import path from 'path';
import fs from 'fs';

// ── Window references ──────────────────────────────────────────────────────────
let builderWindow: BW | null = null;
let studioWindow:  BW | null = null;

// Studio readiness state (matches legacy protocol)
let studioReady    = false;
let pendingProject: unknown = null;

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// ── App icon (Windows .ico, fallback to .png) ──────────────────────────────────
const _appIcon = (() => {
  const searchDirs = [
    path.join(__dirname, '../assets'),
    path.join(__dirname, '../apps/builder/public'),
    path.join(__dirname, '../apps/studio/public'),
  ];
  for (const dir of searchDirs) {
    for (const name of ['ICON_LOGO.ico', 'ICON_LOGO.png', 'icon.ico', 'icon.png']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
})();

// ── Create Builder window ──────────────────────────────────────────────────────
function createBuilderWindow(): void {
  const win = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        900,
    minHeight:       600,
    title:           'GlazeBid Builder',
    autoHideMenuBar: true,
    backgroundColor: '#0b162a',
    titleBarStyle:   'hidden',
    // titleBarOverlay removed — React CustomTitleBar provides window controls
    ...(_appIcon ? { icon: nativeImage.createFromPath(_appIcon) } : {}),
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, '../apps/builder/dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });
  builderWindow = win;

  // Draggable chrome only on the title area
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(
      '.app-header, header[role="banner"], #top-bar, #app-header ' +
      '{ -webkit-app-region: drag !important; }\n' +
      '.app-header button, .app-header a, .app-header input, ' +
      '.app-header select, .app-header [role="button"], ' +
      '.app-header [data-no-drag] { -webkit-app-region: no-drag !important; }'
    );
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    const builderUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
    win.loadURL(builderUrl);
    // DevTools only if explicitly requested (set GLAZEBID_DEVTOOLS=1)
    if (process.env.GLAZEBID_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '../apps/builder/dist/index.html'));
  }

  // Intercept window.open — Studio uses IPC; other HTTP → browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.on('closed', () => { builderWindow = null; });
}

// ── Create Studio window ───────────────────────────────────────────────────────
function createStudioWindow(projectData?: unknown): void {
  if (studioWindow && !studioWindow.isDestroyed()) {
    if (studioWindow.isMinimized()) studioWindow.restore();
    studioWindow.focus();
    if (projectData) {
      if (studioReady) {
        studioWindow.webContents.send('load-project-data', projectData);
        // Auto-load drawings PDF when Studio is already open
        const pd = projectData as Record<string, unknown>;
        const filePath = typeof pd.filePath === 'string' ? pd.filePath : null;
        if (filePath && fs.existsSync(filePath)) {
          try {
            const buf = fs.readFileSync(filePath);
            const buffer = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            studioWindow.webContents.send('pdf:inject', 'drawings', buffer, path.basename(filePath));
          } catch { /* ignore */ }
        }
      } else {
        pendingProject = projectData;
      }
    }
    return;
  }

  studioReady = false;

  // COOP/COEP headers required for PDF.js SharedArrayBuffer / WASM threading
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

  const sWin = new BrowserWindow({
    width:           1600,
    height:          1000,
    minWidth:        1024,
    minHeight:       700,
    title:           'GlazeBid Studio',
    backgroundColor: '#09090b',
    frame:           true,
    titleBarStyle:   'hidden',
    resizable:       true,
    ...(_appIcon ? { icon: nativeImage.createFromPath(_appIcon) } : {}),
    show: false,
    webPreferences: {
      preload:            path.join(__dirname, '../apps/studio/dist-electron/preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
      navigateOnDragDrop: false,
    },
  });

  studioWindow = sWin;

  // Hide native menu bar — Studio uses a custom React title bar
  sWin.setMenu(null);

  if (projectData) pendingProject = projectData;

  // 5 s safety fallback — show Studio even if studio-ready never fires
  const fallbackTimer = setTimeout(() => {
    if (!sWin.isDestroyed() && !sWin.isVisible()) sWin.show();
  }, 5000);

  sWin.once('closed', () => {
    clearTimeout(fallbackTimer);
    studioWindow = null;
    studioReady  = false;
  });

  // Load Studio — retry until Vite dev server is up (dev) or load file (prod)
  loadStudioWithRetry(sWin);
}

function loadStudioWithRetry(win: BW, attempt = 1): void {
  if (isDev) {
    win.loadURL('http://localhost:5174').catch(() => {
      if (win.isDestroyed()) return;
      if (attempt < 20) {
        setTimeout(() => loadStudioWithRetry(win, attempt + 1), 500);
      } else {
        console.error('[GlazeBid v2] Studio Vite server unreachable after 20 attempts');
        win.show();
      }
    });
  } else {
    win.loadFile(path.join(__dirname, '../apps/studio/dist/index.html'));
    win.once('ready-to-show', () => win.show());
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.glazebid.v2');
  }

  // In dev:studio mode start Studio directly; otherwise start Builder
  if (isDev && process.env.VITE_DEV_SERVER_URL?.includes('5174')) {
    createStudioWindow();
  } else {
    createBuilderWindow();
  }

  // ── window controls (from Builder CustomTitleBar) ────────────────────────────
  ipcMain.on('window-minimize', () => builderWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (builderWindow?.isMaximized()) builderWindow.unmaximize();
    else builderWindow?.maximize();
  });
  ipcMain.on('window-close', () => builderWindow?.close());

  // ── Studio window controls (from StudioTitleBar) ──────────────────────────────
  ipcMain.on('studio-window-minimize', () => studioWindow?.minimize());
  ipcMain.on('studio-window-maximize', () => {
    if (studioWindow?.isMaximized()) studioWindow.unmaximize();
    else studioWindow?.maximize();
  });
  ipcMain.on('studio-window-close', () => studioWindow?.close());

  // ── open-studio (simple, no args — back-compat with old preload) ────────────
  ipcMain.on('open-studio', () => {
    createStudioWindow();
  });

  // ── open-studio-project (legacy Builder protocol) ───────────────────────────
  //    data: { projectId, filePath, calibrationData?, sheetId? }
  ipcMain.on('open-studio-project', (_event, data: unknown) => {
    createStudioWindow(data);
  });

  // ── studio-ready: Studio renderer has finished mounting ─────────────────────
  ipcMain.on('studio-ready', () => {
    studioReady = true;
    if (studioWindow && !studioWindow.isDestroyed()) {
      if (!studioWindow.isVisible()) studioWindow.show();
      if (pendingProject !== null) {
        const pd = pendingProject as Record<string, unknown>;
        studioWindow.webContents.send('load-project-data', pendingProject);
        pendingProject = null;
        // Auto-load drawings PDF into Studio canvas
        const filePath = typeof pd.filePath === 'string' ? pd.filePath : null;
        if (filePath && fs.existsSync(filePath)) {
          try {
            const buf = fs.readFileSync(filePath);
            const buffer = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            studioWindow.webContents.send('pdf:inject', 'drawings', buffer, path.basename(filePath));
          } catch (err) {
            console.error('[GlazeBid v2] auto-inject PDF failed:', err);
          }
        }
      }
    }
  });

  // ── studio-takeoff-complete: relay full takeoff bundle to Builder ────────────
  ipcMain.on('studio-takeoff-complete', (_event, data: unknown) => {
    if (builderWindow && !builderWindow.isDestroyed()) {
      builderWindow.webContents.send('takeoff-update', data);
    }
  });

  // ── inbox-sync: live RawTakeoff[] update while Studio is open ───────────────
  //    Studio calls window.electron.syncInbox(inbox) whenever inbox changes.
  //    Main relays to Builder so it can update its inbox panel in real time.
  ipcMain.on('inbox-sync', (_event, inbox: unknown) => {
    if (builderWindow && !builderWindow.isDestroyed()) {
      builderWindow.webContents.send('inbox-update', inbox);
    }
  });

  // ── custom-cards-sync: CustomSystemCard[] from Studio → Builder ─────────────
  ipcMain.on('custom-cards-sync', (_event, cards: unknown) => {
    if (builderWindow && !builderWindow.isDestroyed()) {
      builderWindow.webContents.send('custom-cards-update', cards);
    }
  });

  // ── frame-builder-send: Studio right-click "Open in Frame Builder" ───────────
  ipcMain.on('frame-builder-send', (_event, payload: unknown) => {
    if (builderWindow && !builderWindow.isDestroyed()) {
      builderWindow.webContents.send('frame-builder-receive', payload);
    }
  });

  // ── glazebid:read-pdf: read a PDF from disk ──────────────────────────────────
  ipcMain.handle('glazebid:read-pdf', async (_event, filePath: string) => {
    try {
      const buf = fs.readFileSync(filePath);
      return { ok: true, buffer: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), name: path.basename(filePath) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ── gbid:save ────────────────────────────────────────────────────────────────
  ipcMain.handle('gbid:save', async (_event, jsonPayload: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title:       'Save GlazeBid Project',
      defaultPath: 'project.gbid',
      filters:     [{ name: 'GlazeBid Project', extensions: ['gbid'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    try {
      fs.writeFileSync(filePath, jsonPayload, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── gbid:open ────────────────────────────────────────────────────────────────
  ipcMain.handle('gbid:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title:      'Open GlazeBid Project',
      filters:    [{ name: 'GlazeBid Project', extensions: ['gbid'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };
    try {
      const data = fs.readFileSync(filePaths[0], 'utf-8');
      return { success: true, data, filePath: filePaths[0] };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── pdf:open ─────────────────────────────────────────────────────────────────
  ipcMain.handle('pdf:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title:      'Open PDF for Takeoff',
      filters:    [{ name: 'PDF Files', extensions: ['pdf'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };
    try {
      const nodeBuffer = fs.readFileSync(filePaths[0]);
      const buffer = new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength);
      return { success: true, buffer, fileName: path.basename(filePaths[0]) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── pdf:save ─────────────────────────────────────────────────────────────────
  ipcMain.handle('pdf:save', async (_event, buffer: Uint8Array, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title:       'Save PDF',
      defaultPath: defaultName,
      filters:     [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    try {
      fs.writeFileSync(filePath, Buffer.from(buffer));
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── studio:open-with-pdf: open Studio then inject a PDF by role ──────────────
  ipcMain.handle('studio:open-with-pdf', async (_event, role: string, buffer: Uint8Array, fileName: string) => {
    createStudioWindow();
    const tryDeliver = (attempt: number) => {
      if (!studioWindow || studioWindow.isDestroyed()) return;
      if (studioWindow.webContents.isLoading()) {
        if (attempt < 40) setTimeout(() => tryDeliver(attempt + 1), 250);
        return;
      }
      studioWindow.webContents.send('pdf:inject', role, buffer, fileName);
    };
    tryDeliver(0);
    return { success: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBuilderWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
