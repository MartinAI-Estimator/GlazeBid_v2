/**
 * useRegionTakeoff — the request layer behind Box & Snap.
 *
 * Owns endpoint submission, loading state and errors for CanvasOverlay's
 * onRegionSelected(pdfBounds), per Astra's integration note #4.
 *
 * Flow:
 *   drag box on overlay
 *     → onRegionSelected([x0,y0,x1,y1])            fitz page space, this page
 *     → runRegion()                                 this hook
 *     → window.electronAPI.runRegionTakeoff(...)    apps/builder/electron/preload.js
 *     → ipcMain 'glazierai:runRegion'               electron/main.ts (attaches API key)
 *     → POST /drawing-intelligence/run-region       sidecar (Claude Vision on the crop)
 *     ← { detections: [{ system_type, bbox, confidence, description }] }
 *     → merged into per-page results → CanvasOverlay repaints
 *
 * Why not /drawing-intelligence/run?  That endpoint takes a whole PDF set and
 * returns a semantic BOM (marks, systems, SF) with no geometry — nothing an
 * overlay can draw, and no way to scope it to a box.  run-region is the
 * per-region, geometry-returning counterpart.
 *
 * Results are keyed by page number so switching pages never shows the wrong
 * boxes; CanvasOverlay is remounted per page by its parent.
 */
import { useCallback, useMemo, useRef, useState } from "react";

const EMPTY = Object.freeze({ detections: [] });

/**
 * @param {object}   opts
 * @param {*}        opts.file        PDFViewer's `file` prop (path, URL, or data)
 * @param {object}   opts.pdfDocRef   ref holding the PDFDocumentProxy (for getData())
 * @param {number}   opts.pageNumber  1-based page currently displayed
 * @param {string}   opts.projectName
 * @param {(detections:Array, meta:object)=>void} [opts.onDetections]  hook for
 *                   converting detections into markups / bid items later
 */
export default function useRegionTakeoff({
  file,
  pdfDocRef,
  pageNumber,
  projectName,
  onDetections,
}) {
  const [byPage, setByPage] = useState({});          // { [pageNumber]: {detections:[...]} }
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(0);

  const results = byPage[pageNumber] ?? EMPTY;

  /** Resolve what to send: a filesystem path if we have one, else the bytes. */
  const buildSource = useCallback(async () => {
    if (typeof file === "string" && !/^(blob:|data:|https?:)/i.test(file)) {
      return { pdfPath: file };
    }
    const doc = pdfDocRef?.current;
    if (!doc || typeof doc.getData !== "function") {
      throw new Error("No PDF document available to send.");
    }
    const bytes = await doc.getData();               // Uint8Array
    // Blob+FileReader handles large sets without blowing the call stack.
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([bytes], { type: "application/pdf" }));
    });
    return { pdfBase64: b64 };
  }, [file, pdfDocRef]);

  const runRegion = useCallback(
    async (pdfBounds) => {
      const api = window.electronAPI;
      if (!api?.runRegionTakeoff) {
        setError("Box & Snap needs the desktop app (AiQ sidecar).");
        return;
      }

      const myTicket = ++inFlight.current;
      setIsRunning(true);
      setError(null);

      try {
        const source = await buildSource();
        const res = await api.runRegionTakeoff({
          ...source,
          pageIndex: pageNumber - 1,                 // sidecar is 0-based
          region: pdfBounds,                         // [x0,y0,x1,y1] fitz space
          projectName: projectName ?? "",
        });

        if (!res?.ok) throw new Error(res?.error || "Region takeoff failed.");

        const detections = Array.isArray(res.data?.detections) ? res.data.detections : [];

        // Newer requests win; a stale response never overwrites a fresh one.
        if (myTicket !== inFlight.current) return;

        setByPage((prev) => {
          const existing = prev[pageNumber]?.detections ?? [];
          return {
            ...prev,
            [pageNumber]: { detections: [...existing, ...detections] },
          };
        });
        onDetections?.(detections, { pageNumber, region: pdfBounds, raw: res.data });
      } catch (err) {
        if (myTicket === inFlight.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (myTicket === inFlight.current) setIsRunning(false);
      }
    },
    [buildSource, pageNumber, projectName, onDetections]
  );

  const clearPage = useCallback((page = pageNumber) => {
    setByPage((prev) => {
      if (!(page in prev)) return prev;
      const next = { ...prev };
      delete next[page];
      return next;
    });
  }, [pageNumber]);

  return useMemo(
    () => ({ results, isRunning, error, runRegion, clearPage }),
    [results, isRunning, error, runRegion, clearPage]
  );
}
