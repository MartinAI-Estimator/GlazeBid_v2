/**
 * itemTrace.ts — every place one takeoff item shows up in the set, in reading
 * order: schedule row → plan tags → elevation → details.
 *
 * Built from the item's markups on the drawings (whatever the estimator has
 * kept or moved), the details its schedule row names (HEAD 9/A3.9 …, resolved
 * through the set's hyperlinks), and the sheet its citation names.
 */
import type { DrawnShape } from '../types/shapes';
import type { PageState } from '../store/useStudioStore';
import type { SheetLink } from '../store/useNavStore';
import type { EngineItem, TakeoffResult } from './takeoffImport';
import { shapeBounds } from './shapeGeometry';

export type TraceKind = 'schedule' | 'plan' | 'elevation' | 'detail' | 'other';

export type TraceEntry = {
  key: string;
  pageId: string;
  sheet: string;
  kind: TraceKind;
  what: string;                                   // "3 plan tags", "HEAD 9/A3.9", "schedule row"
  rect: [number, number, number, number] | null;  // page-space region to zoom to
  shapeIds: string[];
};

const KIND_ORDER: Record<TraceKind, number> = { schedule: 0, plan: 1, elevation: 2, detail: 3, other: 4 };

export const KIND_LABEL: Record<TraceKind, string> = {
  schedule: 'Schedule', plan: 'Plan', elevation: 'Elevation', detail: 'Detail', other: 'Sheet',
};

function kindOf(cats: string[] | undefined): TraceKind {
  const c = cats ?? [];
  if (c.includes('schedule')) return 'schedule';
  if (c.includes('elevation')) return 'elevation';
  if (c.includes('plan') || c.includes('enlarged')) return 'plan';
  if (c.includes('detail') || c.includes('section')) return 'detail';
  return 'other';
}

const norm = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();

/** "HEAD: 9/A3.9 | JAMB: 9/A3.9 | SILL: 5/A3.11" → [{part:'HEAD/JAMB', ref:'9/A3.9'}, {part:'SILL', ref:'5/A3.11'}] */
export function detailRefs(desc: string): { part: string; ref: string }[] {
  const out = new Map<string, string[]>();
  const rx = /\b(HEAD|JAMB|SILL|THRESHOLD|MULLION|MULL|TRANSOM|BASE|SUBSILL|DETAIL)\b[^|:]{0,30}?:\s*(\d{1,2}\s*\/\s*[A-Z]{1,3}-?\d{1,3}(?:\.\d{1,3})?[A-Z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(desc))) {
    const ref = m[2].replace(/\s+/g, '').toUpperCase();
    const part = m[1].toUpperCase() === 'DETAIL' ? '' : m[1].toUpperCase();
    const parts = out.get(ref) ?? [];
    if (part && !parts.includes(part)) parts.push(part);
    out.set(ref, parts);
  }
  return [...out.entries()].map(([ref, parts]) => ({ part: parts.join('/') || 'DETAIL', ref }));
}

export function buildTrace(
  itemId: string, result: TakeoffResult | null, shapes: DrawnShape[], pages: PageState[], links: SheetLink[],
): { item: EngineItem | null; entries: TraceEntry[] } {
  const item = result?.items.find(i => i.id === itemId) ?? null;
  const sheetOf = new Map((result?.sheets ?? []).map(s => [s.page, s]));
  const pageById = new Map(pages.map(p => [p.id, p]));
  const entries = new Map<string, TraceEntry>();

  // 1 — the item's markups, one entry per sheet (flags excluded)
  for (const s of shapes) {
    if (s.itemId !== itemId || s.subjectRole === 'flag') continue;
    const pg = pageById.get(s.pageId);
    if (!pg) continue;
    const sh = sheetOf.get(pg.pdfPageIndex);
    const b = shapeBounds(s);
    const e = entries.get(s.pageId) ?? {
      key: `m:${s.pageId}`, pageId: s.pageId, sheet: sh?.sheet || pg.label, kind: kindOf(sh?.categories),
      what: '', rect: [b.x, b.y, b.x + b.w, b.y + b.h] as [number, number, number, number], shapeIds: [],
    };
    e.shapeIds.push(s.id);
    const r = e.rect!;
    e.rect = [Math.min(r[0], b.x), Math.min(r[1], b.y), Math.max(r[2], b.x + b.w), Math.max(r[3], b.y + b.h)];
    entries.set(s.pageId, e);
  }
  for (const e of entries.values()) {
    const n = e.shapeIds.length;
    e.what = e.kind === 'plan' ? `${n} plan tag${n > 1 ? 's' : ''}` : e.kind === 'schedule' ? 'schedule row'
      : e.kind === 'elevation' ? `elevation${n > 1 ? ` (${n} marks)` : ''}` : `${n} mark${n > 1 ? 's' : ''}`;
  }

  // 2 — the schedule sheet its citation names, when no markup is there
  for (const c of item?.citations ?? []) {
    const m = /^([A-Z]{1,3}-?\d{1,3}(?:\.\d{1,3})?[A-Z]?)\s+(.*)$/i.exec(c);
    if (!m) continue;
    const pg = pages.find(p => norm(p.label) === norm(m[1]));
    if (!pg || entries.has(pg.id)) continue;
    const sh = sheetOf.get(pg.pdfPageIndex);
    entries.set(pg.id, { key: `c:${pg.id}`, pageId: pg.id, sheet: m[1], kind: /schedule/i.test(m[2]) ? 'schedule' : kindOf(sh?.categories),
                         what: m[2], rect: null, shapeIds: [] });
  }

  // 3 — details named on the schedule row, through the set's hyperlinks
  const out = [...entries.values()];
  for (const { part, ref } of detailRefs(item?.desc ?? '')) {
    const [num, sheet] = ref.split('/');
    const link = links.find(l => norm(l.label) === norm(ref) && l.target_page >= 0);
    const pg = link ? pages.find(p => p.pdfPageIndex === link.target_page) : pages.find(p => norm(p.label) === norm(sheet));
    if (!pg) continue;
    out.push({ key: `d:${ref}`, pageId: pg.id, sheet, kind: 'detail', what: `${part} detail ${num}/${sheet}`,
               rect: link?.target_rect ?? null, shapeIds: [] });
  }

  out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (pageById.get(a.pageId)?.pdfPageIndex ?? 0) - (pageById.get(b.pageId)?.pdfPageIndex ?? 0));
  return { item, entries: out };
}
