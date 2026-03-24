import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

// ── Resolve app icon (Windows needs .ico; macOS/Linux use .png) ───────────────
const _appIcon = (() => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  for (const name of ['ICON_LOGO.ico', 'ICON_LOGO.png']) {
    const candidate = path.join(publicDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
})();

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    ...(_appIcon !== undefined ? { icon: nativeImage.createFromPath(_appIcon) } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
