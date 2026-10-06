/**
 * useSetLoader — when a drawing set opens: sheet numbers as page labels, each
 * sheet's drawing scale as its calibration, hyperlinked callouts, and the
 * markups already in the PDF (Studio's own come back editable with their review
 * state; anyone else's Bluebeam markups come in locked, toggleable).
 *
 * Needs the GlazeBid sidecar; without it Studio keeps pdf.js painting the
 * annotations into the page and nothing else changes.
 */
import { useEffect } from 'react';
import type { CanvasEngineAPI } from './useCanvasEngine';
import { useStudioStore } from '../store/useStudioStore';
import { useNavStore, type SheetLink } from '../store/useNavStore';
import { recompute } from '../engine/shapeGeometry';
import type { DrawnShape, SubjectRole } from '../types/shapes';

const SIDECAR_URL = 'http://localhost:8100';

export function b64(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function projectNameOf(fileName: string | null): string {
  return (fileName || 'untitled').replace(/\.pdf$/i, '');
}

type Annot = {
  id: string; page: number; annot_type: string; type: string; role: string; subject: string; author: string;
  label: string; stroke: string | null; fill: string | null; opacity: number | null;
  rect: number[]; points: number[][] | null; ours: boolean; meta: Record<string, unknown>;
  style?: string; leader?: number[] | null; text_rect?: number[] | null; font_size?: number | null;
};

export function useSetLoader(engine: CanvasEngineAPI | null): void {
  const fileName = useStudioStore(s => s.pdfFileName);
  useEffect(() => {
    if (!engine || !fileName) return;
    const buf = engine.getPdfBuffer();
    if (!buf) return;
    let cancelled = false;
    const project = projectNameOf(fileName);
    const body = JSON.stringify({ pdf_base64: b64(buf), project_name: project });
    useNavStore.getState().setLinks([]);
    (async () => {
      try {
        const r = await fetch(`${SIDECAR_URL}/drawing-intelligence/sheets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!r.ok || cancelled) return;
        const j = await r.json() as { sheets: { page: number; sheet: string; ppf: number | null }[]; links: SheetLink[] };
        const st = useStudioStore.getState();
        for (const sh of j.sheets) {
          const pg = st.pages.find(p => p.pdfPageIndex === sh.page);
          if (!pg) continue;
          if (sh.sheet) st.setPageLabel(pg.id, sh.sheet);
          if (sh.ppf && !st.calibrations[pg.id]) st.setCalibration({ pageId: pg.id, pixelsPerInch: sh.ppf / 12 });
        }
        useNavStore.getState().setLinks(j.links);
      } catch { /* sidecar not running — plain viewer */ }
      try {
        const r = await fetch(`${SIDECAR_URL}/drawing-intelligence/markups/read`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_name: project }),
        });
        if (!r.ok || cancelled) return;
        const { annotations } = await r.json() as { annotations: Annot[] };
        const st = useStudioStore.getState();
        const shapes = annotations.map(a => annotToShape(a, st.pages, st.calibrations)).filter((x): x is DrawnShape => !!x);
        // one undo-free load: these are the file's contents, not edits
        useStudioStore.setState(s => ({ shapes: [...s.shapes.filter(x => x.author !== 'external'), ...shapes], past: [], future: [] }));
        engine.setBakeAnnotations(false);
      } catch { /* keep annotations painted in */ }
    })();
    return () => { cancelled = true; };
  }, [engine, fileName]);
}

export function annotToShape(a: Annot, pages: { id: string; pdfPageIndex: number }[], cals: Record<string, { pixelsPerInch: number }>): DrawnShape | null {
  const pg = pages.find(p => p.pdfPageIndex === a.page);
  if (!pg) return null;
  const ppi = cals[pg.id]?.pixelsPerInch ?? 72;
  const meta = a.meta || {};
  const ours = a.ours;
  const role = (ours ? (meta.role as SubjectRole) : (a.role as SubjectRole)) || 'highlight';
  const base = {
    id: ours ? a.id : `ext-${a.id}`, pageId: pg.id,
    subject: a.subject || a.annot_type, subjectRole: role,
    color: a.stroke ?? '#ef4444', fill: a.fill ?? a.stroke ?? '#ef4444', opacity: a.opacity,
    author: ours ? ((meta.author as 'user' | 'engine') || 'user') : 'external' as const,
    authorName: a.author || undefined,
    locked: !ours,
    itemId: (meta.itemId as string) || undefined,
    reviewState: (meta.reviewState as 'unreviewed' | 'edited' | 'accepted') || undefined,
    qtyOverride: (meta.qtyOverride as number) ?? undefined,
    note: (meta.note as string) || (ours ? undefined : a.label || undefined),
  };
  const pts = (a.points || []).map(([x, y]) => ({ x, y }));
  const [x0, y0, x1, y1] = a.rect;
  const style = (meta.style as 'cloud' | 'arrow' | undefined) ?? (a.style as 'cloud' | 'arrow' | undefined);
  if (a.type === 'text') {
    const ld = (meta.leader as number[] | undefined) ?? a.leader ?? null;
    const box = (a.text_rect as number[] | undefined) ?? a.rect;
    return { ...base, subject: undefined, subjectRole: undefined, style: undefined, type: 'text',
             origin: { x: box[0], y: box[1] }, widthPx: box[2] - box[0], heightPx: box[3] - box[1],
             text: a.label, fontSize: Number(meta.fontSize ?? a.font_size ?? 10), leader: ld ? { x: ld[0], y: ld[1] } : null };
  }
  if (style === 'arrow' && pts.length >= 2) {
    return { ...base, subject: undefined, subjectRole: undefined, style, type: 'line', start: pts[0], end: pts[pts.length - 1],
             lengthPx: 0, lengthInches: 0 };
  }
  if (style === 'cloud' && pts.length >= 3) {
    return recompute({ ...base, subject: undefined, subjectRole: undefined, style, type: 'polygon', points: pts,
                       bbWidthPx: 0, bbHeightPx: 0, bbWidthInches: 0, bbHeightInches: 0 }, ppi);
  }
  if ((a.type === 'polygon') && pts.length >= 3) {
    return recompute({ ...base, type: 'polygon', points: pts, bbWidthPx: 0, bbHeightPx: 0, bbWidthInches: 0, bbHeightInches: 0 }, ppi);
  }
  if ((a.type === 'polyline' || a.type === 'line') && pts.length >= 2) {
    return recompute({ ...base, type: 'polyline', points: pts, lengthPx: 0, lengthInches: 0 }, ppi);
  }
  if (a.type === 'marker') {
    return { ...base, type: 'marker', position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, countGroupId: base.subject };
  }
  return recompute({ ...base, type: 'rect', origin: { x: x0, y: y0 }, widthPx: x1 - x0, heightPx: y1 - y0, widthInches: 0, heightInches: 0 }, ppi);
}
