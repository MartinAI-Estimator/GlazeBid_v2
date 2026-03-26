import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  /** Signal main process that Studio has fully initialised (legacy protocol). */
  studioReady: () => ipcRenderer.send('studio-ready'),
  /** Receive project data from main (open-studio-project flow). */
  onLoadProjectData: (cb: (data: unknown) => void) => {
    const handler = (_ev: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('load-project-data', handler);
    return () => ipcRenderer.off('load-project-data', handler);
  },
  /**
   * Push live RawTakeoff[] to Builder.  Called by useProjectStore whenever the
   * inbox changes.  Main forwards it to Builder as 'inbox-update'.
   */
  syncInbox: (inbox: unknown) => ipcRenderer.send('inbox-sync', inbox),
  /**
   * Push CustomSystemCard[] to Builder.  Called by useProjectStore whenever
   * custom system cards change.  Main forwards to Builder as 'custom-cards-update'.
   */
  syncCustomCards: (cards: unknown) => ipcRenderer.send('custom-cards-sync', cards),
  /**
   * Send a Studio frame highlight to Builder's "Needs Work" import card.
   * Builder receives this as 'frame-builder-receive'.
   */
  sendToFrameBuilder: (payload: unknown) => ipcRenderer.send('frame-builder-send', payload),
  /**
   * Send Studio frame-type library snapshot to Builder.
   * Builder receives this as 'frame-types-update'.
   */
  syncFrameTypes: (payload: unknown) => ipcRenderer.send('frame-types-sync', payload),
  openStudio:  () => ipcRenderer.send('open-studio'),
  saveProject: (json: string) => ipcRenderer.invoke('gbid:save', json),
  openProject: () => ipcRenderer.invoke('gbid:open'),
  openPdf:     () => ipcRenderer.invoke('pdf:open'),
  savePdf:     (buffer: Uint8Array, defaultName: string) => ipcRenderer.invoke('pdf:save', buffer, defaultName),
  // Listen for PDF injected by Builder (drawings / specs auto-load)
  onPdfInject: (cb: (role: string, buffer: Uint8Array, fileName: string) => void) => {
    ipcRenderer.on('pdf:inject', (_ev, role, buffer, fileName) => cb(role, buffer, fileName));
  },
  // Window controls (for custom title bar)
  windowMinimize: () => ipcRenderer.send('studio-window-minimize'),
  windowMaximize: () => ipcRenderer.send('studio-window-maximize'),
  windowClose:    () => ipcRenderer.send('studio-window-close'),

  // ── Citation Store ──────────────────────────────────────────────────────
  /** Write a validated citation to the SQLite store. */
  writeCitation:        (raw: unknown) => ipcRenderer.invoke('citation:write', raw),
  /** Get all citations for a project. */
  getCitationsByProject:(projectId: string) => ipcRenderer.invoke('citation:getByProject', projectId),
  /** Get citations for a specific sheet within a project. */
  getCitationsBySheet:  (projectId: string, sheetNumber: string) => ipcRenderer.invoke('citation:getBySheet', projectId, sheetNumber),
  /** Mark a citation as human-verified. */
  verifyCitation:       (citationId: string) => ipcRenderer.invoke('citation:verify', citationId),
  /** Get matching implication suggestions from the library. */
  getImplications:      (params: { systemType?: string; specSections?: string[]; keywords?: string[] }) => ipcRenderer.invoke('citation:getImplications', params),
  /** Record usage of an implication (for usage-based ranking). */
  recordImplicationUsage: (implId: string) => ipcRenderer.invoke('citation:recordUsage', implId),
});

