/**
 * bidDay.ts — the bid-day checklist shown before Finalize: every flag
 * resolved, every sheet covered, alternates priced, spec conflicts answered,
 * scope decided, plus the few things only the estimator can tick.
 */
import type { DrawnShape } from '../types/shapes';
import type { PageState } from '../store/useStudioStore';
import type { TakeoffResult } from './takeoffImport';
import type { SpecCheck, ScopeEntry } from '../store/useReviewStore';
import { SCOPE_LINES } from './scopeChecklist';

export type BidDayCheck = {
  id: string; label: string; done: boolean; detail: string;
  kind: 'auto' | 'manual';
  /** Things to open from the line (flags to step through, sheets to look at …). */
  targets?: { label: string; shapeId?: string; pageId?: string; ackId?: string; done?: boolean }[];
};

export const MANUAL_CHECKS: { id: string; label: string; detail: string }[] = [
  { id: 'm:addenda', label: 'Addenda acknowledged', detail: 'Every addendum read, compared (Compare) and acknowledged on the bid form.' },
  { id: 'm:hardware', label: 'Hardware sets reviewed', detail: 'Door hardware sets match the schedule; electrified hardware and power noted.' },
  { id: 'm:quotes', label: 'Vendor quotes in', detail: 'Metal, glass, doors and pass-thru subs (auto doors, skylights) quoted.' },
  { id: 'm:letter', label: 'Scope letter written', detail: 'Inclusions, exclusions, alternates and qualifications written up.' },
];

const SCOPE_SHEETS = /plan|elevation|enlarged|schedule|detail|section/;

export function bidDayChecks(args: {
  result: TakeoffResult | null; shapes: DrawnShape[]; pages: PageState[]; calibrated: Set<string>;
  spec: SpecCheck | null; scope: Record<string, ScopeEntry>; ticks: Record<string, boolean>; sheetsReviewed: Record<string, boolean>;
}): BidDayCheck[] {
  const { result, shapes, pages, calibrated, spec, scope, ticks, sheetsReviewed } = args;
  const out: BidDayCheck[] = [];

  // 1 — flags
  const flags = shapes.filter(s => s.subjectRole === 'flag');
  const open = flags.filter(f => f.reviewState !== 'accepted');
  out.push({
    id: 'flags', kind: 'auto', label: 'Every flag resolved', done: open.length === 0,
    detail: flags.length ? `${flags.length - open.length} of ${flags.length} resolved` : 'no flags',
    targets: open.slice(0, 50).map(f => ({ label: `${f.itemId ?? 'flag'} — ${(f.note ?? '').slice(0, 70)}`, shapeId: f.id })),
  });

  // 2 — sheet coverage: drawing sheets with no takeoff markups that nobody has looked at
  const marked = new Set(shapes.filter(s => s.author !== 'external' && (s.subject || s.subjectRole)).map(s => s.pageId));
  const byIndex = new Map(pages.map(p => [p.pdfPageIndex, p]));
  const uncovered: { label: string; pageId: string }[] = [];
  for (const sh of result?.sheets ?? []) {
    const pg = byIndex.get(sh.page);
    if (!pg || marked.has(pg.id)) continue;
    if (!SCOPE_SHEETS.test((sh.categories ?? []).join(' '))) continue;
    if (sheetsReviewed[sh.sheet || pg.label]) continue;
    uncovered.push({ label: `${sh.sheet} ${sh.title ?? ''}`.trim(), pageId: pg.id });
  }
  out.push({
    id: 'sheets', kind: 'auto', label: 'Every sheet covered', done: !!result && uncovered.length === 0,
    detail: !result ? 'run the auto-takeoff first' : uncovered.length ? `${uncovered.length} plan / elevation / detail sheet(s) with no takeoff — look, then tick "nothing ours"` : 'every drawing sheet has takeoff or was checked',
    targets: uncovered.map(u => ({ label: u.label, pageId: u.pageId, ackId: `sheet:${u.label.split(' ')[0]}` })),
  });

  // 3 — scale: markups on sheets without a scale measure wrong
  const unscaled = [...marked].filter(id => !calibrated.has(id));
  out.push({
    id: 'scale', kind: 'auto', label: 'Every measured sheet has a scale', done: unscaled.length === 0,
    detail: unscaled.length ? `${unscaled.length} sheet(s) with markups but no scale — calibrate (K)` : 'all scaled',
    targets: unscaled.map(id => ({ label: pages.find(p => p.id === id)?.label ?? id, pageId: id })),
  });

  // 4 — alternates priced
  const alts = new Map<string, string>();
  for (const s of shapes) if (s.alternate) alts.set(s.alternate, alts.get(s.alternate) ?? `${s.subject ?? s.type}`);
  for (const a of result?.alternates ?? []) if (!alts.has(a.label)) alts.set(a.label, a.text.slice(0, 80));
  for (const a of spec?.alternates ?? []) if (!alts.has(a.label)) alts.set(a.label, a.text.slice(0, 80));
  const altList = [...alts.entries()];
  const altOpen = altList.filter(([k]) => !ticks[`alt:${k}`]);
  out.push({
    id: 'alternates', kind: 'auto', label: 'Alternates priced separately', done: altOpen.length === 0,
    detail: altList.length ? `${altList.length - altOpen.length} of ${altList.length} priced` : 'no alternates found',
    targets: altList.map(([k, v]) => ({ label: `${k}: ${v}`, ackId: `alt:${k}`, done: !!ticks[`alt:${k}`] })),
  });

  // 5 — specs
  const specOpen = (spec?.checks ?? []).map(c => ({ c, id: specAckId(c) }))
    .filter(({ c }) => c.severity !== 'info');
  const specUnack = specOpen.filter(({ id }) => !ticks[id]);
  out.push({
    id: 'specs', kind: 'auto', label: 'Specs checked, conflicts answered', done: !!spec && specUnack.length === 0,
    detail: !spec ? 'run the spec check (Specs tab)' : specOpen.length ? `${specOpen.length - specUnack.length} of ${specOpen.length} answered` : 'no conflicts',
    targets: specOpen.map(({ c, id }) => ({ label: c.message, ackId: id, done: !!ticks[id] })),
  });

  // 6 — scope decided
  const undecided = SCOPE_LINES.filter(l => !scope[l.id]?.decision);
  out.push({
    id: 'scope', kind: 'auto', label: 'Scope checklist decided', done: undecided.length === 0,
    detail: undecided.length ? `${undecided.length} of ${SCOPE_LINES.length} lines undecided (Scope tab)` : 'all decided',
  });

  // 7 — unreviewed engine markups (accepted on Finalize — info)
  const unrev = shapes.filter(s => s.author === 'engine' && s.subjectRole !== 'flag' && (s.reviewState ?? 'unreviewed') === 'unreviewed').length;
  out.push({
    id: 'unreviewed', kind: 'auto', label: 'Engine markups looked over', done: true,
    detail: unrev ? `${unrev} not touched — they are accepted as-is on Finalize` : 'all reviewed',
  });

  for (const m of MANUAL_CHECKS) out.push({ ...m, kind: 'manual', done: !!ticks[m.id] });
  return out;
}

/** Stable id for acknowledging one spec check (survives a re-run). */
export function specAckId(c: { topic: string; section?: string | null; message: string }): string {
  return `spec:${c.topic}:${c.section ?? ''}:${c.message.slice(0, 80)}`;
}
