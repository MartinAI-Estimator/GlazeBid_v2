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
  /** Prompt user to choose a target folder for saved section PDFs. */
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  /** Write extracted spec section PDFs to disk via main process (fs unavailable in renderer). */
  saveSections: (sections, folderPath, options) => ipcRenderer.invoke('spec:saveSections', sections, folderPath, options),
  /** Reveal a saved folder in Explorer. */
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  /** Company playbook (app settings dir, shared across projects). */
  loadPlaybook: () => ipcRenderer.invoke('playbook:load'),
  savePlaybook: (playbook) => ipcRenderer.invoke('playbook:save', playbook),
  /** Default "Save my scope" root: <projects root>\<project>\Specs. */
  defaultScopeFolder: (projectName) => ipcRenderer.invoke('spec:defaultScopeFolder', projectName),
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
  /** Frame payloads from Studio (Finalize / "Open in Frame Builder") → Frame Builder Incoming. */
  onFrameTakeoffReceive: (callback) => {
    const handler = (_event, packet) => callback(packet);
    ipcRenderer.on('frame-takeoff-receive', handler);
    return () => ipcRenderer.off('frame-takeoff-receive', handler);
  },
  /** Frame Builder "Show in Studio": open the item's sheets in Studio. */
  showInStudio: (req) => ipcRenderer.send('studio-trace-send', req),
  /** Tell Studio which frame types are built / need input / their quantities. */
  sendFrameStatus: (status) => ipcRenderer.send('frame-status-send', status),

  onFrameBuilderReceive: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('frame-builder-receive', handler);
    return () => ipcRenderer.off('frame-builder-receive', handler);
  },

  // ── Window controls ────────────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  /** CORS-safe HTTP GET via main process (use instead of fetch() for external APIs). */
  httpGet: (url) => ipcRenderer.invoke('glazebid:http-get', url),

  // ── AI (Anthropic via main process — key never touches the renderer) ───────
  /** Check whether an API key is configured. Returns { hasKey }. */
  aiKeyCheck: () => ipcRenderer.invoke('ai:key-check'),
  /** Encrypt + persist the Anthropic API key. */
  aiKeySave: (key) => ipcRenderer.invoke('ai:key-save', key),
  /** Remove the stored API key. */
  aiKeyClear: () => ipcRenderer.invoke('ai:key-clear'),
  /**
   * Single assistant turn. payload = { systemPrompt, messages, model?, maxTokens? }.
   * messages[].content may be a string OR an Anthropic content-block array
   * (text + base64 image blocks) — used by the elevation vision import.
   * model: 'haiku' (default) | 'sonnet'. Returns { ok, text, error }.
   */
  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),

  // ── Citation Store ──────────────────────────────────────────────────────
  /** Save extracted spec section PDFs to a folder on disk (main-process fs). */
  saveSections: (sections, folderPath, options) => ipcRenderer.invoke('spec:saveSections', sections, folderPath, options),
  /** Reveal a saved folder in Explorer. */
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  /** Company playbook (app settings dir, shared across projects). */
  loadPlaybook: () => ipcRenderer.invoke('playbook:load'),
  savePlaybook: (playbook) => ipcRenderer.invoke('playbook:save', playbook),
  /** Default "Save my scope" root: <projects root>\<project>\Specs. */
  defaultScopeFolder: (projectName) => ipcRenderer.invoke('spec:defaultScopeFolder', projectName),
  /** Write a validated citation to the SQLite store. */
  writeCitation:        (raw) => ipcRenderer.invoke('citation:write', raw),
  /** Get all citations for a project. */
  getCitationsByProject:(projectId) => ipcRenderer.invoke('citation:getByProject', projectId),
  /** Get citations for a specific sheet within a project. */
  getCitationsBySheet:  (projectId, sheetNumber) => ipcRenderer.invoke('citation:getBySheet', projectId, sheetNumber),
  /** Mark a citation as human-verified. */
  verifyCitation:       (citationId) => ipcRenderer.invoke('citation:verify', citationId),
  /** Get matching implication suggestions from the library. */
  getImplications:      (params) => ipcRenderer.invoke('citation:getImplications', params),
  /** Record usage of an implication (for usage-based ranking). */
  recordImplicationUsage: (implId) => ipcRenderer.invoke('citation:recordUsage', implId),

  // ── Drawing Intelligence ───────────────────────────────────────────────────
  /**
   * Open a native file-open dialog filtered to PDFs and return the chosen path.
   * Returns null if the user cancels.
   */
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),

  /**
   * Run the full Drawing Intelligence pipeline on a PDF.
   * Returns { ok: true, data: TakeoffResult } or { ok: false, error: string }.
   */
  runTakeoff: (payload) => ipcRenderer.invoke('glazierai:runTakeoff', payload),

  /**
   * Box & Snap — run vision detection on ONE region of ONE page.
   * payload: { pdfPath?|pdfBase64?, pageIndex (0-based), region: [x0,y0,x1,y1] (fitz pts), projectName }
   * Returns { ok: true, data: { detections: [...] } } or { ok: false, error }.
   */
  runRegionTakeoff: (payload) => ipcRenderer.invoke('glazierai:runRegion', payload),

  // ── Project filesystem ─────────────────────────────────────────────────────
  /**
   * Get the configured projects root path (e.g. "Z:\\GlazeBid Projects").
   * Returns null if the user has not chosen one yet.
   */
  getProjectsRoot: () => ipcRenderer.invoke('project:getRoot'),

  /**
   * Open a folder-picker dialog and save the chosen path as the projects root.
   * Returns the chosen path, or null if cancelled.
   */
  setProjectsRoot: () => ipcRenderer.invoke('project:setRoot'),

  /**
   * Save the full project payload to <root>/<projectName>/project.aiq.
   * Creates the folder + standard subfolders automatically.
   * Returns { ok, aiqPath } or { ok: false, error }.
   *   error === 'NO_ROOT' means the user hasn't set a projects root yet.
   */
  saveProject: (projectName, payload) =>
    ipcRenderer.invoke('project:save', { projectName, payload }),

  /**
   * Load a project by name from the projects root, or by explicit aiqPath.
   * Returns { ok, payload } or { ok: false, error }.
   *   error === 'NOT_FOUND' | 'NO_ROOT'
   */
  loadProject: (projectName, aiqPath) =>
    ipcRenderer.invoke('project:load', { projectName, aiqPath }),

  /**
   * Show a native Open dialog filtered to .aiq files.
   * Returns { ok, aiqPath, payload } or null if cancelled.
   */
  openProjectDialog: () => ipcRenderer.invoke('project:openDialog'),

  /**
   * List all projects found in the projects root.
   * Returns { ok, projects: [{ name, folderName, aiqPath, modified }], root }.
   * If the drive is unmounted, rootMissing=true is set and cached registry is returned.
   */
  listProjects: () => ipcRenderer.invoke('project:list'),

  /**
   * Permanently delete a project folder from disk.
   * Pass { folderName } or { aiqPath } — at least one is required.
   * Returns { ok } or { ok: false, error }.
   */
  deleteProject: (opts) => ipcRenderer.invoke('project:delete', opts),

  /**
   * Export a standalone copy of the project payload to a user-chosen location.
   * Returns { ok, savedTo } or { ok: false }.
   */
  exportProjectCopy: (projectName, payload) =>
    ipcRenderer.invoke('project:exportCopy', { projectName, payload }),
});
