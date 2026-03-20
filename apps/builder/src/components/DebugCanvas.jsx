import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Phase 1 — Baseline 2D Canvas Test
 *
 * Zero WebGL.  Zero tiles.  Zero workers.
 * One page, one canvas, one ctx.scale(dpr, dpr).
 * If THIS is blurry or squished, the problem is upstream of our code.
 */
const DebugCanvas = ({ fileUrl }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    let pdfDoc = null;

    const render = async () => {
      const canvas = canvasRef.current;
      console.warn('🔴 DEBUG CANVAS MOUNTED — fileUrl:', fileUrl, '— canvas:', !!canvas);
      if (!canvas || !fileUrl) return;

      try {
        console.warn('🔴 LOADING PDF FROM:', fileUrl);
        // 1. Load the PDF
        pdfDoc = await pdfjsLib.getDocument(fileUrl).promise;
        console.warn('🔴 PDF LOADED — pages:', pdfDoc.numPages);
        if (cancelled) return;

        // 2. Get Page 1
        const page = await pdfDoc.getPage(1);

        // ── RAW PDF METADATA DUMP ──────────────────────────────────
        console.log('--- PDF.JS PAGE METADATA ---');
        console.log('Viewport (Scale 1):', page.getViewport({ scale: 1 }));
        console.log('Page View (CropBox):', page.view);          // [x1, y1, x2, y2]
        console.log('UserUnit:', page.userUnit);                  // default 1; CAD exports may use 2–6
        console.log('Rotation:', page.rotate);                    // 0 | 90 | 180 | 270

        // Derived dimensions at scale 1 (what pdf.js *thinks* the page is)
        const vp1 = page.getViewport({ scale: 1 });
        console.log(`Scale-1 size: ${vp1.width.toFixed(2)} × ${vp1.height.toFixed(2)} pts`);
        console.log(`Aspect ratio (w/h): ${(vp1.width / vp1.height).toFixed(4)}`);

        // CropBox raw aspect (before rotation)
        const [x1, y1, x2, y2] = page.view;
        const rawW = x2 - x1;
        const rawH = y2 - y1;
        console.log(`Raw CropBox: ${rawW} × ${rawH}  aspect ${(rawW / rawH).toFixed(4)}`);

        // Dig into internals for MediaBox / other boxes
        try {
          const pageDict = page._pageInfo || page.pageDict || page._transport?.pageInfos?.[0];
          console.log('Internal _pageInfo:', pageDict);
        } catch { /* swallow */ }
        try {
          const ref = page.ref;
          console.log('Page ref:', ref);
        } catch { /* swallow */ }
        console.log('--- END METADATA ---');
        // ────────────────────────────────────────────────────────────

        // 3. Calculate the viewport — factoring in UserUnit if present
        const userUnit = page.userUnit || 1;
        const effectiveScale = 1.5 * userUnit;
        console.log(`Effective render scale: ${effectiveScale} (1.5 × userUnit ${userUnit})`);
        const viewport = page.getViewport({ scale: effectiveScale });

        // 4. Get the monitor's exact pixel density
        const dpr = window.devicePixelRatio || 1;

        // 5. Physical canvas size  (actual backing-store pixels)
        canvas.width  = Math.floor(viewport.width  * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        // 6. CSS display size  (what the user sees on screen)
        canvas.style.width  = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // 7. Scale the 2D context so pdf.js draws at native resolution
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // 8. Render the page — no transform array, just the scaled context
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;

        console.log(
          `[Phase 1] Baseline rendered.  ` +
          `viewport ${viewport.width.toFixed(0)}×${viewport.height.toFixed(0)}  ` +
          `canvas ${canvas.width}×${canvas.height}  dpr ${dpr}`
        );
      } catch (err) {
        if (!cancelled) console.error('[Phase 1] render error:', err);
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
      if (pdfDoc) pdfDoc.destroy();
    };
  }, [fileUrl]);

  return (
    <div
      style={{
        overflow: 'auto',
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        backgroundColor: '#222',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: 'none',
          maxHeight: 'none',
          margin: '0 auto',
          backgroundColor: '#fff',
        }}
      />
    </div>
  );
};

export default DebugCanvas;

// Example usage:
// <DebugCanvas fileUrl={yourPdfUrl} />
