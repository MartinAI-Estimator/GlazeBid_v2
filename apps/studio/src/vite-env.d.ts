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
  };
}
