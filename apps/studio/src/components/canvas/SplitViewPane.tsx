/**
 * SplitViewPane — a second sheet beside the main one (elevation next to its
 * details, plan next to the schedule).  Own page picker, wheel zoom, drag pan,
 * the markups on that sheet drawn read-only.  Double-click opens the sheet in
 * the main view.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useNavStore } from '../../store/useNavStore';
import { useStudioStore } from '../../store/useStudioStore';
import { drawShape } from '../../engine/renderEngine';
import { DEFAULT_PDF_PPI } from '../../engine/coordinateSystem';

type Cam = { scale: number; tx: number; ty: number };

export default function SplitViewPane({ engine }: { engine: CanvasEngineAPI | null }) {
  const pageId  = useNavStore(s => s.splitPageId);
  const pages   = useStudioStore(s => s.pages);
  const shapes  = useStudioStore(s => s.shapes);
  const cals    = useStudioStore(s => s.calibrations);
  const showExt = useNavStore(s => s.showExternal);
  const focus   = useNavStore(s => s.splitFocus);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ scale: 0.2, tx: 0, ty: 0 });
  const bmp = useRef<{ pageId: string; scale: number; bitmap: ImageBitmap } | null>(null);
  const pending = useRef(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [, force] = useState(0);
  const page = pages.find(p => p.id === pageId) ?? null;

  const draw = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!page) return;
    const c = cam.current;
    ctx.setTransform(c.scale * dpr, 0, 0, c.scale * dpr, c.tx * dpr, c.ty * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.widthPx, page.heightPx);
    const b = bmp.current;
    if (b && b.pageId === page.id) ctx.drawImage(b.bitmap, 0, 0, page.widthPx, page.heightPx);
    const ppi = cals[page.id]?.pixelsPerInch ?? DEFAULT_PDF_PPI;
    for (const s of shapes) {
      if (s.pageId !== page.id || (s.author === 'external' && !showExt)) continue;
      drawShape(ctx, s, c.scale, false, ppi);
    }
    // sharper sheet once zoomed in past the bitmap's resolution
    const want = Math.min(4, c.scale * dpr * 1.25);
    if (engine && !pending.current && (!b || b.pageId !== page.id || want > b.scale * 1.3)) {
      pending.current = true;
      const pid = page.id;
      const sc = Math.max(want, 0.6);
      void engine.renderPageBitmap(pid, sc).then(nb => {
        pending.current = false;
        if (!nb) return;
        if (bmp.current) bmp.current.bitmap.close();
        bmp.current = { pageId: pid, scale: sc, bitmap: nb };
        force(n => n + 1);
      }).catch(() => { pending.current = false; });
    }
  }, [page, shapes, cals, showExt, engine]);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !page) return;
    const s = Math.min(wrap.clientWidth / page.widthPx, wrap.clientHeight / page.heightPx) * 0.96;
    cam.current = { scale: s, tx: (wrap.clientWidth - page.widthPx * s) / 2, ty: (wrap.clientHeight - page.heightPx * s) / 2 };
  }, [page]);

  useEffect(() => { fit(); draw(); }, [pageId]);        // eslint-disable-line react-hooks/exhaustive-deps
  // item trace "side by side": zoom to the item on this sheet
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!focus || !wrap || !page || focus.pageId !== page.id) return;
    if (!focus.rect) { fit(); draw(); return; }
    const [x0, y0, x1, y1] = focus.rect;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const s = Math.max(0.05, Math.min((w * 0.7) / Math.max(x1 - x0, 30), (h * 0.7) / Math.max(y1 - y0, 30), 6));
    cam.current = { scale: s, tx: w / 2 - ((x0 + x1) / 2) * s, ty: h / 2 - ((y0 + y1) / 2) * s };
    draw();
  }, [focus?.seq, page?.id]);                          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);
  useEffect(() => () => { bmp.current?.bitmap.close(); bmp.current = null; }, []);

  if (!pageId) return null;

  function onWheel(e: React.WheelEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top, c = cam.current;
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.max(0.02, Math.min(c.scale * k, 12));
    cam.current = { scale: s, tx: mx - ((mx - c.tx) * s) / c.scale, ty: my - ((my - c.ty) * s) / c.scale };
    draw();
  }

  return (
    <div className="relative flex flex-col w-1/2 min-w-0 border-l-2 border-slate-700 bg-slate-800">
      <div className="flex items-center gap-2 px-2 h-8 bg-slate-900 border-b border-slate-800 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Split</span>
        <select value={pageId} onChange={e => useNavStore.getState().setSplitPage(e.target.value)}
                className="rounded bg-slate-800 border border-slate-700 px-1 py-0.5 text-xs text-slate-200 max-w-[14rem]">
          {pages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={() => { fit(); draw(); }} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800">Fit</button>
        <button onClick={() => useStudioStore.getState().setActivePage(pageId)} className="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800" title="Open this sheet in the main view">Open in main</button>
        <div className="flex-1" />
        <button onClick={() => useNavStore.getState().setSplitPage(null)} className="text-slate-500 hover:text-slate-200" title="Close split view">✕</button>
      </div>
      <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing"
           onWheel={onWheel}
           onMouseDown={e => { drag.current = { x: e.clientX, y: e.clientY, tx: cam.current.tx, ty: cam.current.ty }; }}
           onMouseMove={e => { const d = drag.current; if (!d) return; cam.current = { ...cam.current, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }; draw(); }}
           onMouseUp={() => { drag.current = null; }}
           onMouseLeave={() => { drag.current = null; }}
           onDoubleClick={() => useStudioStore.getState().setActivePage(pageId)}>
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
