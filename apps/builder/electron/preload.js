/**
 * electron/preload.js
 * Runs in a privileged context before the renderer page loads.
 * Exposes the full GlazeBid IPC surface so the Builder renderer can:
 *  - Open Studio with a project (openStudioProject)
 *  - Receive takeoff results back from Studio (onTakeoffUpdate)
 *  - Read PDF files from disk (readPdfFile)
 */

'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Current platform string: 'win32' | 'darwin' | 'linux' */
  platform:  process.platform,
  /** True when running inside Electron (lets the renderer detect desktop mode) */
  isDesktop: true,
  /** Electron version string */
  getVersion: () => process.versions.electron,

  // ── File I/O ──────────────────────────────────────────────────────────────
  /** Read a PDF from disk and return its ArrayBuffer + basename. */
  readPdfFile: (filePath) => ipcRenderer.invoke('glazebid:read-pdf', filePath),
  /** Get the real filesystem path from a File object (contextIsolation-safe). */
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // ── Builder → Studio ───────────────────────────────────────────────────────
  /**
   * Ask the main process to open (or focus) the Studio window with a project.
   * data: { projectId: string, filePath: string, calibrationData?: {...} }
   */
  openStudioProject: (data) => ipcRenderer.send('open-studio-project', data),

  // ── Studio renderer lifecycle ─────────────────────────────────────────────
  /**
   * Called by Studio renderer once all IPC listeners are registered.
   * Triggers the main process to show the Studio window and flush any
   * pending load-project-data payload.
   */
  studioReady: () => ipcRenderer.send('studio-ready'),

  /**
   * Studio renderer subscribes to this to receive project load requests.
   * Returns a cleanup function that removes the listener.
   */
  onLoadProjectData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('load-project-data', handler);
    return () => ipcRenderer.off('load-project-data', handler);
  },

  // ── Studio → Builder ───────────────────────────────────────────────────────
  /** Studio emits takeoff results when its session ends. */
  studioTakeoffComplete: (data) => ipcRenderer.send('studio-takeoff-complete', data),

  /**
   * Builder subscribes to receive takeoff results from Studio.
   * Returns a cleanup function that removes the listener.
   */
  onTakeoffUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('takeoff-update', handler);
    return () => ipcRenderer.off('takeoff-update', handler);
  },

  /**
   * Live inbox sync — called whenever Studio adds/removes a takeoff.
   * Main process forwards Studio's inbox-sync IPC as an inbox-update event.
   * Returns a cleanup function.
   */
  onInboxUpdate: (callback) => {
    const handler = (_event, inbox) => callback(inbox);
    ipcRenderer.on('inbox-update', handler);
    return () => ipcRenderer.off('inbox-update', handler);
  },

  /**
   * Receive CustomSystemCard[] pushed from Studio.
   * Fired when the estimator sends a highlight to a custom system.
   * Returns a cleanup function.
   */
  onCustomCardsUpdate: (callback) => {
    const handler = (_event, cards) => callback(cards);
    ipcRenderer.on('custom-cards-update', handler);
    return () => ipcRenderer.off('custom-cards-update', handler);
  },

  /**
   * Receive a frame shape payload when the estimator right-clicks a highlight
   * in Studio and chooses "Open in Frame Builder".
   * Returns a cleanup function.
   */
  onFrameBuilderReceive: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('frame-builder-receive', handler);
    return () => ipcRenderer.off('frame-builder-receive', handler);
  },

  // ── Window controls ────────────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose:    () => ipcRenderer.send('window-close'),
});
