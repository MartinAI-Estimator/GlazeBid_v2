/// <reference types="vite/client" />

type PdfOpenResult =
  | { success: true; buffer: Uint8Array; fileName: string }
  | { success: false };

type ProjectOpenResult =
  | { success: true; data: string }
  | { success: false };

interface Window {
  electron: {
    studioReady: () => void;
    onLoadProjectData: (cb: (data: unknown) => () => void) => () => void;
    syncInbox: (inbox: unknown) => void;
    syncCustomCards: (cards: unknown) => void;
    sendToFrameBuilder: (payload: unknown) => void;
    syncFrameTypes: (payload: unknown) => void;
    openStudio: () => void;
    saveProject: (json: string) => Promise<unknown>;
    openProject: () => Promise<ProjectOpenResult>;
    openPdf: () => Promise<PdfOpenResult>;
    savePdf: (buffer: Uint8Array, defaultName: string) => Promise<unknown>;
    onPdfInject: (cb: (role: string, buffer: Uint8Array, fileName: string) => void) => void;
    windowMinimize: () => void;
    windowMaximize: () => void;
    windowClose: () => void;

    // Citation Store
    writeCitation:          (raw: unknown) => Promise<{ ok: boolean; citation?: unknown; error?: string }>;
    getCitationsByProject:  (projectId: string) => Promise<{ ok: boolean; citations: unknown[]; error?: string }>;
    getCitationsBySheet:    (projectId: string, sheetNumber: string) => Promise<{ ok: boolean; citations: unknown[]; error?: string }>;
    verifyCitation:         (citationId: string) => Promise<{ ok: boolean; error?: string }>;
    getImplications:        (params: { systemType?: string; specSections?: string[]; keywords?: string[] }) => Promise<{ ok: boolean; suggestions: unknown[]; error?: string }>;
    recordImplicationUsage: (implId: string) => Promise<{ ok: boolean; error?: string }>;

    // Box & Snap — vision detection on one region of one page.
    // `region` is [x0,y0,x1,y1] in fitz page space == Studio PAGE space.
    runRegionTakeoff?: (payload: {
      pdfPath?: string;
      pdfBase64?: string;
      pageIndex: number;
      region: [number, number, number, number];
      projectName?: string;
    }) => Promise<{
      ok: boolean;
      error?: string;
      data?: {
        status?: string;
        page_index?: number;
        region?: number[];
        tokens_used?: number;
        detections?: Array<{
          system_type?: string;
          bbox?: number[];
          confidence?: number;
          description?: string;
          mark?: string | null;
          /** Lites across / high — geometry ⊕ vision, ≥ 1 (see geometry_anchoring.py). */
          bay_count?: number | null;
          row_count?: number | null;
          grid_source?: string;
        }>;
      };
    }>;

    // AiQ Sidecar
    aiq?: {
      health: () => Promise<{ healthy: boolean; port?: number }>;
      restartSidecar: () => Promise<{ healthy: boolean }>;
    };
  };
}
