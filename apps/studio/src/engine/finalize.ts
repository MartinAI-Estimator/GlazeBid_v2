/**
 * finalize.ts — what Finalize hands on.
 *
 *  inboxFromTakeoff(result, shapes, …) → Builder inbox records (RawTakeoff):
 *    • one per engine item still on the drawings (any markup not rejected):
 *        frames  → Area, schedule / elevation size, bays × rows, quantity = count (Thus)
 *        linear  → LF from the reviewed polylength markups (edits respected)
 *        doors / counts → Count with quantity
 *        sloped / measured areas (translucent bays …) → Area from the reviewed polygons
 *    • one per markup the estimator drew with a Tool Chest tool (Area / LF / Count)
 *  markupsForPdf(shapes, …) → the payload for the Bluebeam-compatible marked set
 */
import type { DrawnShape } from '../types/shapes';
import type { RawTakeoff } from '../store/useProjectStore';
import type { TakeoffResult, EngineItem } from './takeoffImport';
import { measure, measureLabel } from './shapeGeometry';

type Cal = Record<string, { pixelsPerInch: number }>;
type Pg = { id: string; pdfPageIndex: number; label: string };

export type InboxEntry = Omit<RawTakeoff, 'id'> & { quantity?: number; subject?: string };

const SYSTEM_TYPE: [RegExp, string][] = [
  [/^ext(\.|\s)*sf|ext sf/i, 'Ext SF'], [/^int(\.|\s)*sf|int sf/i, 'Int SF'],
  [/^ext(\.|\s)*cw|ext cw/i, 'Cap CW'], [/^int(\.|\s)*cw|int cw/i, 'Cap CW'],
];
const CLS_SYSTEM: Record<string, string> = { ext_sf: 'Ext SF', int_sf: 'Int SF', ext_cw: 'Cap CW', int_cw: 'Cap CW', fire_rated_sf: 'Int SF' };

function systemOf(subjectOrCls: string | undefined): string | undefined {
  if (!subjectOrCls) return undefined;
  if (CLS_SYSTEM[subjectOrCls]) return CLS_SYSTEM[subjectOrCls];
  for (const [rx, t] of SYSTEM_TYPE) if (rx.test(subjectOrCls)) return t;
  return undefined;
}

function bbox(s: DrawnShape) {
  const pts = s.type === 'rect' || s.type === 'text' ? [s.origin, { x: s.origin.x + s.widthPx, y: s.origin.y + s.heightPx }]
    : s.type === 'line' ? [s.start, s.end] : s.type === 'marker' ? [s.position] : s.points;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function inboxFromTakeoff(result: TakeoffResult | null, shapes: DrawnShape[], cals: Cal): InboxEntry[] {
  const out: InboxEntry[] = [];
  const ppiOf = (s: DrawnShape) => cals[s.pageId]?.pixelsPerInch ?? 72;
  const live = shapes.filter(s => s.author !== 'external' && s.subjectRole !== 'flag');
  const byItem = new Map<string, DrawnShape[]>();
  for (const s of live) if (s.author === 'engine' && s.itemId) byItem.set(s.itemId, [...(byItem.get(s.itemId) ?? []), s]);

  const items = new Map<string, EngineItem>((result?.items ?? []).map(i => [i.id, i]));
  for (const [itemId, ss] of byItem) {
    const it = items.get(itemId);
    if (it && it.kind !== 'scope') continue;
    const first = ss[0], b = bbox(first);
    const loc = { shapeId: first.id, pageId: first.pageId, x: b.x, y: b.y, widthPx: b.w, heightPx: b.h };
    const lin = ss.filter(s => s.subjectRole === 'polylength' || s.type === 'polyline');
    const areas = ss.filter(s => s.subjectRole === 'area');
    const typed = ss.find(s => s.qtyOverride != null && s.subjectRole !== 'polylength');
    if (lin.length && (!it || !it.w_in)) {
      const L = lin.reduce((a, s) => a + (s.qtyOverride ?? measure(s, ppiOf(s)).lengthIn ?? 0), 0);
      out.push({ ...loc, widthInches: L, heightInches: 0, type: 'LF', label: it?.label ?? itemId, mark: itemId,
                 subject: first.subject, systemType: systemOf(it?.cls ?? first.subject), source: 'autotakeoff', quantity: 1 });
    } else if (it && (it.w_in || it.h_in)) {
      out.push({ ...loc, widthInches: Number(it.w_in || 0), heightInches: Number(it.h_in || 0), type: 'Area',
                 label: it.label, mark: itemId, subject: first.subject, systemType: systemOf(it.cls),
                 bayCount: (it as unknown as { bays?: number }).bays ?? undefined, rowCount: (it as unknown as { rows?: number }).rows ?? undefined,
                 source: 'autotakeoff', quantity: Number(typed?.qtyOverride ?? it.qty ?? 1) });
    } else if (areas.length) {
      const A = areas.reduce((a, s) => a + (s.qtyOverride ?? measure(s, ppiOf(s)).areaSf ?? 0), 0);
      const side = Math.sqrt(A * 144);
      out.push({ ...loc, widthInches: side, heightInches: side, type: 'Area', label: `${it?.label ?? itemId} — ${A.toFixed(1)} sf`,
                 mark: itemId, subject: first.subject, systemType: systemOf(it?.cls ?? first.subject), source: 'autotakeoff', quantity: 1 });
    } else if (it) {
      out.push({ ...loc, widthInches: 0, heightInches: 0, type: 'Count', label: it.label, mark: itemId, subject: first.subject,
                 systemType: systemOf(it.cls), source: 'autotakeoff', quantity: Number(typed?.qtyOverride ?? it.qty ?? 1) });
    }
  }

  // the estimator's own Tool Chest markups
  for (const s of live.filter(x => x.author !== 'engine' && x.subject)) {
    const b = bbox(s), m = measure(s, ppiOf(s));
    const role = s.subjectRole;
    const loc = { shapeId: s.id, pageId: s.pageId, x: b.x, y: b.y, widthPx: b.w, heightPx: b.h };
    if (role === 'polylength' || role === 'line') {
      out.push({ ...loc, widthInches: s.qtyOverride ?? m.lengthIn ?? 0, heightInches: 0, type: 'LF', label: s.subject, subject: s.subject,
                 systemType: systemOf(s.subject), source: 'studio', quantity: 1 });
    } else if (role === 'count') {
      out.push({ ...loc, widthInches: 0, heightInches: 0, type: 'Count', label: s.subject, subject: s.subject, systemType: systemOf(s.subject),
                 source: 'studio', quantity: s.qtyOverride ?? 1 });
    } else if (role === 'area') {
      out.push({ ...loc, widthInches: m.wIn ?? 0, heightInches: m.hIn ?? 0, type: 'Area', label: s.subject, subject: s.subject,
                 systemType: systemOf(s.subject), source: 'studio', quantity: 1 });
    }
  }
  return out;
}

/** Studio markups → the sidecar's Bluebeam writer payload (others' markups stay in the PDF untouched). */
export function markupsForPdf(shapes: DrawnShape[], pages: Pg[], cals: Cal, author = 'GlazeBid'): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of shapes) {
    if (s.author === 'external') continue;
    const pg = pages.find(p => p.id === s.pageId);
    if (!pg) continue;
    const ppi = cals[s.pageId]?.pixelsPerInch;
    const role = s.type === 'text' || s.style ? 'note'
      : s.subjectRole ?? (s.type === 'polyline' || s.type === 'line' ? 'polylength' : s.type === 'marker' ? 'count' : 'highlight');
    const pts = s.type === 'rect' || s.type === 'text' ? null : s.type === 'line' ? [[s.start.x, s.start.y], [s.end.x, s.end.y]]
      : s.type === 'marker' ? null : s.points.map(p => [p.x, p.y]);
    const rect = s.type === 'rect' || s.type === 'text' ? [s.origin.x, s.origin.y, s.origin.x + s.widthPx, s.origin.y + s.heightPx]
      : s.type === 'marker' ? [s.position.x - 4, s.position.y - 4, s.position.x + 4, s.position.y + 4] : null;
    const label = s.type === 'text' ? s.text
      : s.style ? (s.label ?? '')
      : [s.subject, ...(ppi ? measureLabel(s, ppi) : []), s.subjectRole === 'flag' ? s.note : null].filter(Boolean).join('\n');
    out.push({
      id: s.id, page: pg.pdfPageIndex, type: s.type, role, subject: s.subject ?? '', author: s.author === 'engine' ? 'GlazeBid' : author,
      rect, points: pts, stroke: s.color, fill: s.fill, opacity: s.opacity, label, ppf: ppi ? ppi * 12 : null,
      style: s.style, leader: s.type === 'text' && s.leader ? [s.leader.x, s.leader.y] : null,
      font_size: s.type === 'text' ? s.fontSize : null,
      meta: { author: s.author ?? 'user', itemId: s.itemId, reviewState: s.reviewState, qtyOverride: s.qtyOverride ?? undefined, note: s.note,
              style: s.style, fontSize: s.type === 'text' ? s.fontSize : undefined,
              leader: s.type === 'text' && s.leader ? [s.leader.x, s.leader.y] : undefined },
    });
  }
  return out;
}
