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
 *
 * AI Chat (Anthropic claude-haiku-3-5):
 *   ai:key-save          Encrypt + persist Anthropic API key via safeStorage
 *   ai:key-check         Returns { hasKey: boolean }
 *   ai:key-clear         Remove stored key
 *   ai:chat              Stream a single assistant turn; returns { ok, text, error }
 */

// electron.d.ts is loaded by VS Code as a global ambient file, so
// `import('electron')` gives TS2306 "not a module" in that context.
// Cast using an inline object type whose members come from the global
// `Electron` ambient namespace — works in every TS project context.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app, BrowserWindow, ipcMain, dialog, session, nativeImage, shell, Menu, screen } =
  require('electron') as {
    app:         Electron.App;
    BrowserWindow: typeof Electron.BrowserWindow;
    ipcMain:     Electron.IpcMain;
    dialog:      Electron.Dialog;
    session:     typeof Electron.Session;
    nativeImage: { createFromPath(path: string): Electron.NativeImage };
    shell:       Electron.Shell;
    Menu:        typeof Electron.Menu;
    screen:      Electron.Screen;
  };

/** Instance type of Electron.BrowserWindow – used for variable/param annotations. */
type BW = InstanceType<typeof BrowserWindow>;
import path from 'path';
import fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';
import {
  initCitationStore,
  writeCitation,
  getCitationsByProject,
  getCitationsBySheet,
  verifyCitation,
  getImplicationSuggestions,
  recordImplicationUsage,
} from '../apps/builder/src/db/citationStore';

// ── Auto-Updater ──────────────────────────────────────────────────────────────
// Only active in production builds — not in dev mode
function setupAutoUpdater(mainWindow: BW): void {
  if (!app.isPackaged) return; // skip in dev

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });
}

// ── AiQ Sidecar Process Manager ───────────────────────────────────────────────

let sidecarProcess: ChildProcess | null = null;
const SIDECAR_PORT = 8100;
const SIDECAR_HEALTH_URL = `http://localhost:${SIDECAR_PORT}/health`;

/** Read ANTHROPIC_API_KEY from ~/.env_glazierai (dev fallback). */
function readEnvGlazierai(): string | null {
  try {
    const envPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.env_glazierai');
    if (!fs.existsSync(envPath)) return null;
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}
function getSidecarPythonPath(): string {
  const candidates = [
    path.join(__dirname, '../.venv/Scripts/python.exe'),
    path.join(__dirname, '../.venv/bin/python'),
    path.join(process.cwd(), '.venv/Scripts/python.exe'),
    path.join(process.cwd(), '.venv/bin/python'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getSidecarDir(): string {
  return path.join(__dirname, '../sidecar');
}

async function checkSidecarHealth(): Promise<boolean> {
  try {
    const http = await import('http');
    return new Promise((resolve) => {
      const req = http.get(SIDECAR_HEALTH_URL, { timeout: 2000 }, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

async function startSidecar(): Promise<void> {
  const alreadyRunning = await checkSidecarHealth();
  if (alreadyRunning) {
    console.log('[AiQ] Sidecar already running on port', SIDECAR_PORT);
    return;
  }

  const pythonPath = getSidecarPythonPath();
  const sidecarDir = getSidecarDir();
  const mainPy = path.join(sidecarDir, 'main.py');

  if (!fs.existsSync(mainPy)) {
    console.warn('[AiQ] Sidecar script not found at:', mainPy);
    return;
  }

  console.log('[AiQ] Starting sidecar:', pythonPath, 'in', sidecarDir);

  const envKey = readEnvGlazierai();
  sidecarProcess = spawn(
    pythonPath,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(SIDECAR_PORT), '--log-level', 'warning'],
    {
      cwd: sidecarDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, ...(envKey ? { ANTHROPIC_API_KEY: envKey } : {}) },
    }
  );

  sidecarProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[AiQ sidecar]', data.toString().trim());
  });

  sidecarProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.warn('[AiQ sidecar]', msg);
  });

  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[AiQ] Sidecar exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
  });

  sidecarProcess.on('error', (err) => {
    console.error('[AiQ] Failed to start sidecar:', err.message);
    sidecarProcess = null;
  });

  // Wait up to 15 seconds for the sidecar to become healthy
  const maxWait = 15000;
  const interval = 500;
  let waited = 0;
  while (waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, interval));
    waited += interval;
    if (await checkSidecarHealth()) {
      console.log(`[AiQ] Sidecar healthy after ${waited}ms`);
      return;
    }
  }
  console.warn('[AiQ] Sidecar did not become healthy within', maxWait, 'ms');
}

function stopSidecar(): void {
  if (sidecarProcess && !sidecarProcess.killed) {
    console.log('[AiQ] Stopping sidecar process');
    sidecarProcess.kill('SIGTERM');
    setTimeout(() => {
      if (sidecarProcess && !sidecarProcess.killed) {
        sidecarProcess.kill('SIGKILL');
      }
    }, 3000);
    sidecarProcess = null;
  }
}

// ── Project filesystem helpers ──────────────────────────────────────────────────
const PROJECT_FILE_NAME = 'project.aiq';
const PROJECT_SUBDIRS   = ['01_Drawings', '02_Specifications', '03_Takeoffs',
                           '04_Estimates', '05_Proposals', '06_Reports'];

function getPrefsPath(): string {
  return path.join(app.getPath('userData'), 'glazebid-prefs.json');
}

function readPrefs(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(getPrefsPath(), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writePrefs(data: Record<string, unknown>): void {
  fs.writeFileSync(getPrefsPath(), JSON.stringify(data, null, 2), 'utf8');
}

function safeFolderName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ');
}

function projectAiqPath(root: string, projectName: string): string {
  return path.join(root, safeFolderName(projectName), PROJECT_FILE_NAME);
}

function ensureProjectFolder(root: string, projectName: string): string {
  const dir = path.join(root, safeFolderName(projectName));
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of PROJECT_SUBDIRS) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

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
  // Use work area (excludes taskbar) so the window is never hidden behind it
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const winW = Math.min(1400, screenW);
  const winH = Math.min(900,  screenH);

  const win = new BrowserWindow({
    width:           winW,
    height:          winH,
    minWidth:        900,
    minHeight:       600,
    center:          true,   // always opens fully within the work area
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

  win.once('ready-to-show', () => {
    win.show();
    setupAutoUpdater(win);
  });

  if (isDev) {
    const builderUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
    win.loadURL(builderUrl);
    // DevTools only if explicitly requested (set GLAZEBID_DEVTOOLS=1)
    if (process.env.GLAZEBID_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    // Ctrl+Shift+I toggles DevTools in dev mode
    win.webContents.on('before-input-event', (_ev, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.toggleDevTools();
      }
    });
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

  // Ctrl+Shift+I toggles DevTools in dev mode
  if (isDev) {
    sWin.webContents.on('before-input-event', (_ev, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        sWin.webContents.toggleDevTools();
      }
    });
  }

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
app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.glazebid.v2');
  }

  // ── Start AiQ sidecar (non-blocking — windows open even if sidecar fails) ──
  startSidecar().catch(err => console.warn('[AiQ] Sidecar start failed:', err));

  // ── Initialize Citation SQLite store ──────────────────────────────────────
  try {
    const userDataPath = app.getPath('userData');
    const citationDbPath = path.join(userDataPath, 'glazebid-citations.db');
    initCitationStore(citationDbPath);
    console.log('[GlazeBid v2] Citation store initialized at', citationDbPath);
  } catch (err) {
    console.error('[GlazeBid v2] Failed to initialize citation store:', err);
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

  // ── citation:write — validate + persist a citation ────────────────────────
  ipcMain.handle('citation:write', async (_event, raw: unknown) => {
    try {
      const citation = writeCitation(raw);
      return { ok: true, citation };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── citation:getByProject — all citations for a project ──────────────────
  ipcMain.handle('citation:getByProject', async (_event, projectId: string) => {
    try {
      return { ok: true, citations: getCitationsByProject(projectId) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── citation:getBySheet — citations for one sheet ────────────────────────
  ipcMain.handle('citation:getBySheet', async (_event, projectId: string, sheetNumber: string) => {
    try {
      return { ok: true, citations: getCitationsBySheet(projectId, sheetNumber) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── citation:verify — human-verify a citation ────────────────────────────
  ipcMain.handle('citation:verify', async (_event, citationId: string) => {
    try {
      verifyCitation(citationId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── citation:getImplications — fetch matching implications from library ──
  ipcMain.handle('citation:getImplications', async (_event, params: {
    systemType?: string; specSections?: string[]; keywords?: string[];
  }) => {
    try {
      return { ok: true, suggestions: getImplicationSuggestions(params) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── citation:recordUsage — track implication usage ──────────────────────
  ipcMain.handle('citation:recordUsage', async (_event, implicationId: string) => {
    try {
      recordImplicationUsage(implicationId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── spec:saveSections — write extracted spec PDFs to disk in main process ───
  // Renderer cannot use fs directly (Vite externalises Node built-ins to stubs).
  ipcMain.handle('spec:saveSections', async (_event,
    sections: Array<{ sectionNumber: string; sectionTitle: string; buffer: Uint8Array }>,
    folderPath: string,
  ) => {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
      const savedPaths: string[] = [];
      for (const section of sections) {
        const safeName = `${section.sectionNumber} - ${section.sectionTitle || 'Section'}.pdf`
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
        const fullPath = path.join(folderPath, safeName);
        fs.writeFileSync(fullPath, Buffer.from(section.buffer));
        savedPaths.push(fullPath);
      }
      return { ok: true, savedPaths };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── dialog:selectFolder — folder picker for spec section save ──────────────
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ── dialog:openPdf — PDF file picker for Drawing Intelligence ────────────
  ipcMain.handle('dialog:openPdf', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ── AiQ sidecar IPC ─────────────────────────────────────────────────────────
  ipcMain.handle('aiq:health', async () => {
    const healthy = await checkSidecarHealth();
    return { healthy, port: SIDECAR_PORT };
  });

  ipcMain.handle('aiq:restart-sidecar', async () => {
    stopSidecar();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await startSidecar();
    const healthy = await checkSidecarHealth();
    return { healthy };
  });

  // ── Drawing Intelligence: run full takeoff pipeline ───────────────────────
  ipcMain.handle('glazierai:runTakeoff', async (_event, payload: {
    pdfPath: string;
    projectName: string;
    routingOverrides?: Record<string, string>;
    sheetModes?: Record<string, string>;
  }) => {
    const apiKey = loadAiKey();
    const body = {
      pdf_path: payload.pdfPath,
      project_name: payload.projectName,
      routing_overrides: payload.routingOverrides ?? null,
      sheet_modes: payload.sheetModes ?? null,
      anthropic_api_key: apiKey ?? null,
    };
    try {
      const res = await fetch(`http://localhost:${SIDECAR_PORT}/drawing-intelligence/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Sidecar returned ${res.status}: ${text}` };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── AI Chat (Anthropic Haiku) ─────────────────────────────────────────────
  // Key is encrypted at rest via Electron safeStorage so it never sits in
  // plain text in localStorage or the app bundle.
  const AI_KEY_PATH = path.join(app.getPath('userData'), '.ai_key');

  function loadAiKey(): string | null {
    try {
      if (!fs.existsSync(AI_KEY_PATH)) return null;
      const { safeStorage } = require('electron') as { safeStorage: Electron.SafeStorage };
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: plain text (dev machines without keychain)
        return fs.readFileSync(AI_KEY_PATH, 'utf-8').trim() || null;
      }
      const enc = fs.readFileSync(AI_KEY_PATH);
      return safeStorage.decryptString(enc);
    } catch { return null; }
  }

  ipcMain.handle('ai:key-save', (_event, rawKey: string) => {
    try {
      const { safeStorage } = require('electron') as { safeStorage: Electron.SafeStorage };
      if (safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(rawKey.trim());
        fs.writeFileSync(AI_KEY_PATH, enc);
      } else {
        fs.writeFileSync(AI_KEY_PATH, rawKey.trim(), 'utf-8');
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ai:key-check', () => {
    return { hasKey: !!loadAiKey() };
  });

  ipcMain.handle('ai:key-clear', () => {
    try { if (fs.existsSync(AI_KEY_PATH)) fs.unlinkSync(AI_KEY_PATH); } catch {}
    return { ok: true };
  });

  ipcMain.handle('ai:chat', async (_event, payload: {
    // content: plain string OR Anthropic content-block array (text/image blocks)
    // — image blocks power the elevation vision import.
    messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }>;
    systemPrompt: string;
    /** 'haiku' (default, extraction) | 'sonnet' (vision/reasoning) — routed here, never a raw model string from the renderer */
    model?: 'haiku' | 'sonnet';
    /** clamped 256–8192; default 4096 (1024 truncated multi-frame JSON) */
    maxTokens?: number;
    /**
     * Repeatable extraction mode — disables thinking.
     *
     * NOTE: do NOT send `temperature` here. It is deprecated on claude-sonnet-5
     * and the API rejects the request with a 400 ("`temperature` is deprecated
     * for this model"). Sampling is controlled by the model itself now, so
     * run-to-run repeatability comes from the extraction cache in
     * scheduleParser.js, not from a sampling parameter.
     */
    deterministic?: boolean;
  }) => {
    const apiKey = loadAiKey();
    if (!apiKey) return { ok: false, error: 'No API key configured. Add your Anthropic key in Settings → AI.' };
    try {
      // Dynamic require keeps the cold-start fast when AI is not used
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default({ apiKey });
      // NOTE: 'claude-haiku-3-5-20241022' (the old hardcoded string) is not a
      // valid Anthropic model ID and 404s. Current IDs:
      const isSonnet = payload.model === 'sonnet';
      const model = isSonnet
        ? 'claude-sonnet-5'              // vision / reasoning (elevation import)
        : 'claude-haiku-4-5-20251001';   // fast extraction (schedule text)
      // Sonnet 5 thinks by default and can burn the whole budget reasoning
      // (observed: stop_reason max_tokens with only thinking blocks). This
      // model family controls thinking via adaptive mode + output effort —
      // fixed budget_tokens is rejected with a 400.
      const maxTokens = Math.max(256, Math.min(32768, payload.maxTokens ?? (isSonnet ? 16384 : 4096)));
      // Deterministic mode turns thinking OFF — that alone removes most of the
      // per-run variance and is the bulk of the speedup. Temperature is NOT set
      // (deprecated on this model family; sending it 400s).
      const samplingOpts = payload.deterministic
        ? (isSonnet ? { thinking: { type: 'disabled' } } : {})
        : (isSonnet ? { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } } : {});
      // Calls now run in parallel, which makes 429 / 529 far more likely. A
      // dropped call silently loses whole elevations, so retry with backoff
      // rather than letting the batch fail.
      const request = {
        model,
        max_tokens: maxTokens,
        system:     payload.systemPrompt,
        messages:   payload.messages,
        ...samplingOpts,
      } as Parameters<typeof client.messages.create>[0];

      let response;
      for (let attempt = 0; ; attempt++) {
        try {
          response = await client.messages.create(request);
          break;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
          if (!retryable || attempt >= 4) throw err;
          const waitMs = Math.min(16000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
          console.warn(`[ai:chat] ${status} — retry ${attempt + 1}/4 in ${waitMs}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      const text = response.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
      if (!text) {
        // Surface WHY instead of returning silent emptiness (e.g. token budget
        // exhausted before any text, or non-text-only content blocks).
        const blockTypes = response.content.map((b: { type: string }) => b.type).join(',') || 'none';
        return {
          ok: false,
          error: `Model returned no text (stop_reason: ${response.stop_reason ?? 'unknown'}; blocks: ${blockTypes}). Try fewer pages per drop.`,
        };
      }
      return { ok: true, text };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });

  // ── updater:install-now — quit and install pending update ───────────────────
  ipcMain.handle('updater:install-now', () => {
    autoUpdater.quitAndInstall();
  });

  // ── glazebid:http-get — CORS-safe HTTP GET for renderer ─────────────────────
  ipcMain.handle('glazebid:http-get', async (_event, url: string) => {
    try {
      const { net } = require('electron') as { net: { fetch(url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }> } };
      const res = await net.fetch(url);
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text };
    } catch (err) {
      return { ok: false, status: 0, error: String(err) };
    }
  });

  // ── project:getRoot ────────────────────────────────────────────────────────────
  ipcMain.handle('project:getRoot', () => {
    return (readPrefs().projectsRoot as string) || null;
  });

  // ── project:setRoot ────────────────────────────────────────────────────────────
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

  // ── project:save ───────────────────────────────────────────────────────────────
  ipcMain.handle('project:save', async (_event, { projectName, payload }: { projectName: string; payload: unknown }) => {
    const root = readPrefs().projectsRoot as string | undefined;
    if (!root) return { ok: false, error: 'NO_ROOT' };
    try {
      ensureProjectFolder(root, projectName);
      const aiqPath = projectAiqPath(root, projectName);
      fs.writeFileSync(aiqPath, JSON.stringify(payload, null, 2), 'utf8');
      const prefs    = readPrefs();
      const registry = (prefs.projectRegistry as Array<Record<string, string>>) ?? [];
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

  // ── project:load ───────────────────────────────────────────────────────────────
  ipcMain.handle('project:load', async (_event, { projectName, aiqPath: explicitPath }: { projectName?: string; aiqPath?: string }) => {
    try {
      let filePath = explicitPath;
      if (!filePath) {
        const root = readPrefs().projectsRoot as string | undefined;
        if (!root) return { ok: false, error: 'NO_ROOT' };
        filePath = projectAiqPath(root, projectName!);
      }
      if (!fs.existsSync(filePath)) return { ok: false, error: 'NOT_FOUND' };
      const raw = fs.readFileSync(filePath, 'utf8');
      return { ok: true, payload: JSON.parse(raw) };
    } catch (err) {
      console.error('[Builder] project:load error:', err);
      return { ok: false, error: String(err) };
    }
  });

  // ── project:openDialog ─────────────────────────────────────────────────────────
  ipcMain.handle('project:openDialog', async () => {
    const root   = readPrefs().projectsRoot as string | undefined;
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

  // ── project:list ───────────────────────────────────────────────────────────────
  ipcMain.handle('project:list', () => {
    const prefs = readPrefs();
    const root  = prefs.projectsRoot as string | undefined;
    if (!root || !fs.existsSync(root)) {
      return { ok: true, projects: prefs.projectRegistry ?? [], rootMissing: true };
    }
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const projects: Array<Record<string, string>> = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const aiqPath = path.join(root, entry.name, PROJECT_FILE_NAME);
        if (!fs.existsSync(aiqPath)) continue;
        const stat     = fs.statSync(aiqPath);
        const modified = stat.mtime.toISOString();
        let name = entry.name;
        try {
          const raw  = fs.readFileSync(aiqPath, 'utf8');
          const data = JSON.parse(raw) as Record<string, unknown>;
          const meta = data?.metadata as Record<string, string> | undefined;
          name = meta?.projectName || name;
        } catch { /* use folder name */ }
        projects.push({ name, folderName: entry.name, aiqPath, modified });
      }
      projects.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
      return { ok: true, projects, root };
    } catch (err) {
      console.error('[Builder] project:list error:', err);
      return { ok: false, error: String(err) };
    }
  });

  // ── project:delete ─────────────────────────────────────────────────────────────
  ipcMain.handle('project:delete', async (_event, { folderName, aiqPath: explicitPath }: { folderName?: string; aiqPath?: string }) => {
    const root = readPrefs().projectsRoot as string | undefined;
    if (!root) return { ok: false, error: 'NO_ROOT' };
    try {
      let targetDir: string;
      if (explicitPath) {
        targetDir = path.dirname(explicitPath);
      } else {
        targetDir = path.join(root, safeFolderName(folderName!));
      }
      const rel = path.relative(root, targetDir);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { ok: false, error: 'PATH_TRAVERSAL' };
      }
      // ASYNC delete — fs.rmSync blocks the main process, which freezes input
      // for EVERY window (Electron dispatches input from the browser process).
      // A large or network/OneDrive-backed folder made the whole app hang.
      await fs.promises.rm(targetDir, { recursive: true, force: true, maxRetries: 3 });
      const prefs = readPrefs();
      prefs.projectRegistry = ((prefs.projectRegistry as Array<Record<string, string>>) ?? [])
        .filter(r => r.aiqPath !== (explicitPath || path.join(targetDir, PROJECT_FILE_NAME)));
      writePrefs(prefs);
      return { ok: true };
    } catch (err) {
      console.error('[Builder] project:delete error:', err);
      return { ok: false, error: String(err) };
    }
  });

  // ── project:exportCopy ─────────────────────────────────────────────────────────
  ipcMain.handle('project:exportCopy', async (_event, { projectName, payload }: { projectName: string; payload: unknown }) => {
    const result = await dialog.showSaveDialog({
      title:       'Export Project Copy',
      defaultPath: path.join(app.getPath('documents'), `${safeFolderName(projectName)}.aiq`),
      filters:     [{ name: 'GlazeBid Project', extensions: ['aiq'] }],
    });
    if (result.canceled) return { ok: false };
    try {
      fs.writeFileSync(result.filePath!, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true, savedTo: result.filePath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBuilderWindow();
  });
});

app.on('before-quit', () => {
  stopSidecar();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
