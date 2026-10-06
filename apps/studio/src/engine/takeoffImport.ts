/**
 * takeoffImport.ts — the auto-takeoff engine's result → Studio markups.
 *
 * The engine works in PDF points of the page as viewed (rotation applied),
 * which is exactly Studio's page space (pdf.js viewport at scale 1), so
 * coordinates map 1:1.  Each engine markup becomes an editable shape carrying
 * its Tool Chest subject, the item it cites, and author 'engine' / unreviewed.
 *
 *   region  → rect highlight          area   → rect or polygon area
 *   linear  → polyline (polylength)   door / count → count marker
 *   flag    → yellow flag pin (reason in note)      label → skipped
 *
 * Each sheet's drawing scale (points per foot) becomes the page calibration,
 * and the sheet number becomes the page label.
 */
import type { DrawnShape, SubjectRole } from '../types/shapes';
import type { PageState } from '../store/useStudioStore';
import type { PageCalibration } from './coordinateSystem';
import { recompute } from './shapeGeometry';
import { TOOL_CHEST } from '../constants/toolChest';

export type EngineMarkup = {
  item: string; sheet: string; page: number; subject: string; role: string;
  rect: number[] | null; points?: number[][] | null; text?: string; stroke?: string; fill?: string;
  opacity?: number | null; dashed?: boolean; note?: string;
};

export type EngineItem = {
  id: string; cls: string; kind: string; label: string; desc: string;
  qty: number | null; qty_source?: string; sf_each?: number | null; sf_total?: number | null;
  w_in?: number | null; h_in?: number | null; series?: unknown[]; hardware?: unknown[];
  implied?: { cls: string; note?: string }[]; flags: string[]; notes: string[]; citations: string[];
  is_door?: boolean; source?: string; location?: string | null;
  /** "Alt 2" when the item belongs to a bid alternate (priced separately). */
  alternate?: string;
};

export type EngineAlternate = { page: number; label: string; text: string; rect: number[]; source?: string };

export type EngineSheet = {
  page: number; sheet: string; title: string; category: string; categories: string[];
  rotation: number; width: number; height: number; ppf?: number | null;
};

export type TakeoffResult = {
  project: string; pdf: string; pages: number;
  sheets: EngineSheet[]; read: Record<string, unknown>[]; skipped: Record<string, unknown>[];
  items: EngineItem[]; markups: EngineMarkup[]; flags: { item: string; flags: string[] }[];
  totals?: Record<string, unknown>; elapsed_s?: number; model_calls?: number;
  alternates?: EngineAlternate[];
};

const ROLE_OF: Record<string, SubjectRole> = {
  region: 'highlight', area: 'area', linear: 'polylength', door: 'count', count: 'count', flag: 'flag',
};

const DEFAULT_PPI = 72;

export function importTakeoff(res: TakeoffResult, pages: PageState[]): {
  shapes: DrawnShape[]; calibrations: PageCalibration[]; labels: { pageId: string; label: string }[];
} {
  const byIndex = new Map(pages.map(p => [p.pdfPageIndex, p]));
  const calibrations: PageCalibration[] = [];
  const labels: { pageId: string; label: string }[] = [];
  const ppiOf = new Map<number, number>();
  for (const sh of res.sheets) {
    const pg = byIndex.get(sh.page);
    if (!pg) continue;
    if (sh.sheet) labels.push({ pageId: pg.id, label: sh.sheet });
    if (sh.ppf && sh.ppf > 0) {
      const ppi = sh.ppf / 12;
      ppiOf.set(sh.page, ppi);
      calibrations.push({ pageId: pg.id, pixelsPerInch: ppi });
    }
  }

  const tc = new Map(TOOL_CHEST.map(t => [t.subject, t]));
  const altOf = new Map(res.items.filter(i => i.alternate).map(i => [i.id, i.alternate as string]));
  const shapes: DrawnShape[] = [];
  for (const m of res.markups) {
    const pg = byIndex.get(m.page);
    const role = ROLE_OF[m.role];
    if (!pg || !role || (!m.rect && !m.points)) continue;
    const ppi = ppiOf.get(m.page) ?? DEFAULT_PPI;
    const t = tc.get(m.subject);
    const base = {
      id: crypto.randomUUID(), pageId: pg.id,
      subject: role === 'flag' ? 'Needs Review' : m.subject, subjectRole: role,
      color: m.stroke || t?.stroke || '#FFFF00', fill: m.fill || t?.fill || m.stroke || '#FFFF00',
      opacity: m.opacity ?? t?.opacity ?? null,
      author: 'engine' as const, reviewState: 'unreviewed' as const,
      itemId: m.item, note: [m.text, m.note].filter(Boolean).join(' — ') || undefined,
      ...(altOf.has(m.item) ? { alternate: altOf.get(m.item) } : {}),
    };
    if (role === 'polylength' && m.points && m.points.length >= 2) {
      const pts = m.points.map(([x, y]) => ({ x, y }));
      shapes.push(recompute({ ...base, type: 'polyline', points: pts, lengthPx: 0, lengthInches: 0 }, ppi));
    } else if ((role === 'count' || role === 'flag') && m.rect) {
      const [x0, y0, x1, y1] = m.rect;
      shapes.push({ ...base, type: 'marker', position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, countGroupId: m.item });
    } else if (role === 'area' && m.points && m.points.length >= 3) {
      const pts = m.points.map(([x, y]) => ({ x, y }));
      shapes.push(recompute({ ...base, type: 'polygon', points: pts, bbWidthPx: 0, bbHeightPx: 0, bbWidthInches: 0, bbHeightInches: 0 }, ppi));
    } else if (m.rect) {
      const [x0, y0, x1, y1] = m.rect;
      shapes.push(recompute({
        ...base, type: 'rect', origin: { x: Math.min(x0, x1), y: Math.min(y0, y1) },
        widthPx: Math.abs(x1 - x0), heightPx: Math.abs(y1 - y0), widthInches: 0, heightInches: 0,
      }, ppi));
    }
  }
  return { shapes, calibrations, labels };
}

// ── Summary ──────────────────────────────────────────────────────────────────

export const CLASS_NAME: Record<string, string> = {
  ext_sf: 'Ext Storefront', int_sf: 'Int Storefront', ext_cw: 'Ext Curtain Wall', int_cw: 'Int Curtain Wall',
  ext_sf_door: 'Ext SF Doors', int_sf_door: 'Int SF Doors', ext_cw_door: 'Ext CW Doors', int_cw_door: 'Int CW Doors',
  glazing_only: 'Glazing Only', glazing_only_door: 'Glazing Only Doors', fire_rated_glazing: 'Fire Rated Glazing',
  fire_rated_glazing_door: 'Fire Rated Glazing Doors', fire_rated_sf: 'Fire Rated Storefront',
  translucent_panel: 'Translucent Panels', break_metal: 'Break Metal', sun_control: 'Sun Control',
  all_glass_wall: 'All Glass Walls', all_glass_door: 'All Glass Doors', mirror: 'Mirrors', glass_handrail: 'Glass Handrail',
  window: 'Windows', window_wall: 'Window Wall', bifold_sliding: 'Bi-Fold / Sliding', transaction_window: 'Transaction Windows',
};

export type SystemTotal = { cls: string; name: string; items: number; ea: number; sf: number; lf: number; flagged: number };

/** Totals by system from the engine items (alternates excluded — kept separate). */
export function systemTotals(items: EngineItem[]): SystemTotal[] {
  const m = new Map<string, SystemTotal>();
  for (const it of items) {
    if (it.kind !== 'scope' || it.alternate) continue;
    const t = m.get(it.cls) ?? { cls: it.cls, name: CLASS_NAME[it.cls] ?? it.cls, items: 0, ea: 0, sf: 0, lf: 0, flagged: 0 };
    t.items += 1;
    if (it.flags?.length) t.flagged += 1;
    const src = (it.qty_source || '').toLowerCase();
    if (src.includes('lf') || it.cls === 'break_metal' && it.id === 'BREAK METAL') t.lf += Number(it.qty || 0);
    else if (src.includes('(sf)')) t.sf += Number(it.qty || 0);
    else {
      t.ea += Number(it.qty || 0);
      if (it.sf_total) t.sf += Number(it.sf_total);
    }
    m.set(it.cls, t);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
