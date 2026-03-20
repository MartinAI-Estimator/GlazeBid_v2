/**
 * usePdfLoader.ts
 *
 * Orchestrates the full PDF ingestion pipeline:
 *   1. Electron native file dialog (via studioElectron IPC)
 *   2. PDF.js document parse
 *   3. Build Zustand PageState[] from PDF page viewports (at 72 DPI)
 *   4. Load pages into the store (replaces the blank default page)
 *   5. Generate thumbnails in the background, storing them per-page
 */
import { useCallback, useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { loadPdfFromBuffer } from '../engine/pdfLoader';
type PdfOpenResult =
  | { success: true; buffer: Uint8Array; fileName: string }
  | { success: false };

/**
 * Type-safe accessor for the Electron IPC bridge injected by the preload script.
 * We cast through `unknown` to avoid a naming collision with Electron's own
 * `window.Electron` (capital-E) namespace type on Windows.
 */
type IpcBridge = { openPdf: () => Promise<PdfOpenResult> };
function getIpcBridge(): IpcBridge | undefined {
  return (window as unknown as { electron?: IpcBridge }).electron;
}

export function usePdfLoader() {
  const [loading, setLoading] = useState(false);

  const openPdf = useCallback(async () => {
    const bridge = getIpcBridge();
    if (!bridge?.openPdf) {
      console.warn('[usePdfLoader] window.electron.openPdf not available');
      return;
    }

    setLoading(true);
    try {
      const result = await bridge.openPdf();
      if (!result.success) return; // user canceled or IPC error

      // Load PDF and build page states via the canonical pdfLoader
      const loaded = await loadPdfFromBuffer(result.buffer, result.fileName);

      // Swap into store
      useStudioStore.getState().loadPdfPages(loaded.pages, result.fileName);
    } catch (err) {
      console.error('[usePdfLoader] Failed to load PDF:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { openPdf, loading };
}
