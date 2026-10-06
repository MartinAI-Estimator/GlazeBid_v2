/**
 * scopeChecklist.ts — the per-job scope checklist: every kind of work a
 * glazing bid can carry, what the takeoff found for it, which spec sections
 * cover it, and a suggested decision the estimator confirms.
 */
import type { DrawnShape } from '../types/shapes';
import type { TakeoffResult } from './takeoffImport';
import type { SpecCheck, ScopeDecision } from '../store/useReviewStore';

export type ScopeLine = {
  id: string; label: string; help: string;
  classes: string[];            // takeoff classes that count as "found"
  specKeys: string[];           // spec section keys (6 digits) that cover it
  subjects?: RegExp;            // estimator-drawn markups that count as found
};

export const SCOPE_LINES: ScopeLine[] = [
  { id: 'ext_sf', label: 'Exterior storefront', help: 'Exterior storefront framing and glass.', classes: ['ext_sf'], specKeys: ['084113'], subjects: /^Ext SF/i },
  { id: 'int_sf', label: 'Interior storefront / aluminum frames', help: 'Interior storefront, interior aluminum frames and partitions.', classes: ['int_sf', 'int_alum_partition', 'alum_frame_only'], specKeys: ['084113', '081116'], subjects: /^Int SF/i },
  { id: 'cw', label: 'Curtain wall', help: 'Captured / SSG curtain wall.', classes: ['ext_cw', 'int_cw'], specKeys: ['084413', '084423'], subjects: /CW/i },
  { id: 'ww', label: 'Window wall', help: 'Slab-to-slab window wall.', classes: ['window_wall'], specKeys: [], subjects: /WW/i },
  { id: 'windows', label: 'Aluminum windows', help: 'Fixed / operable aluminum windows. Vinyl, fiberglass and wood/clad windows are not ours.', classes: ['window'], specKeys: ['085113', '085213'] },
  { id: 'doors', label: 'Entrance doors', help: 'Storefront / curtain wall doors.', classes: ['ext_sf_door', 'int_sf_door', 'ext_cw_door', 'int_cw_door', 'terrace_door'], specKeys: ['084113', '084213'], subjects: /Door/i },
  { id: 'hardware', label: 'Door hardware', help: 'Storefront door hardware is included by default (from the specs / hardware sets). Confirm who furnishes it.', classes: [], specKeys: ['087100'] },
  { id: 'all_glass', label: 'All-glass entrances & walls', help: 'Frameless tempered doors and walls.', classes: ['all_glass_wall', 'all_glass_door'], specKeys: ['084126', '084226'], subjects: /All Glass/i },
  { id: 'auto', label: 'Automatic entrances (pass-thru)', help: 'Auto sliders and revolving doors, by a hired sub.', classes: ['auto_door', 'revolving_door'], specKeys: ['084229', '084233'] },
  { id: 'skylight', label: 'Skylights (pass-thru)', help: 'Unit and metal-framed skylights, by a hired sub.', classes: ['skylight'], specKeys: ['086200', '086300', '084433'] },
  { id: 'translucent', label: 'Translucent panels', help: 'Kalwall-type panels, often only shown by elevation arrow notes.', classes: ['translucent_panel'], specKeys: ['084513', '084523'], subjects: /Translucent/i },
  { id: 'mirrors', label: 'Mirrors', help: 'Ours when frameless and/or not Bobrick. Bobrick toilet mirrors are Division 10.', classes: ['mirror'], specKeys: ['088300'], subjects: /Mirror/i },
  { id: 'fire', label: 'Fire-rated glazing & frames', help: 'Fire-rated lites, frames and doors.', classes: ['fire_rated_glazing', 'fire_rated_door', 'fire_rated_sf'], specKeys: ['088813'], subjects: /Fire/i },
  { id: 'security', label: 'Transaction / bullet-resistant', help: 'Pass-thru and bullet-resistant windows and glass.', classes: ['transaction_window', 'br_transaction_window'], specKeys: ['085619', '085653', '085680', '088853', '088856'] },
  { id: 'glazing_only', label: 'Glass in HM / wood doors & frames', help: 'Vision lites in others\' frames: glass only, including fire-rated.', classes: ['glazing_only', 'glazing_only_door'], specKeys: [], subjects: /Glazing Only/i },
  { id: 'handrail', label: 'Glass handrail / guardrail', help: 'Glass infill or structural glass guards.', classes: ['glass_handrail'], specKeys: [], subjects: /Handrail/i },
  { id: 'break_metal', label: 'Break metal & sill flashing', help: 'Ours whenever a detail shows it touching our system. Sill flashing is always ours when shown.', classes: ['break_metal'], specKeys: [], subjects: /Break Metal|Brake Metal|Flashing/i },
  { id: 'sun_control', label: 'Sun control', help: 'Sunshades integral to our framing.', classes: ['sun_control'], specKeys: [] },
  { id: 'film', label: 'Film, back-painted glass, shower doors', help: 'Glass film, back-painted glass, shower doors and other specialty glass.', classes: ['glass_film', 'bifold_sliding'], specKeys: ['088700'] },
  { id: 'sealant', label: 'Perimeter sealant', help: 'Perimeter caulking at our frames (07 92 00) — usually ours.', classes: [], specKeys: ['079200'] },
  { id: 'existing', label: 'Existing glazing / demo', help: 'Existing (EX) glazing is flagged. Demo only when the GC asks.', classes: [], specKeys: ['024119'] },
  { id: 'engineering', label: 'Engineering, testing, mock-ups', help: 'Delegated design, field water tests and mock-ups from the specs.', classes: [], specKeys: [] },
];

export const DECISION_LABEL: Record<ScopeDecision, string> = {
  included: 'Included', excluded: 'Excluded', by_others: 'By others', na: 'N/A',
};

export type ScopeRow = ScopeLine & {
  found: number;                 // takeoff items + estimator markups
  sections: string[];            // spec csi numbers covering it
  suggestion: ScopeDecision;
  why: string;
};

export function scopeRows(result: TakeoffResult | null, shapes: DrawnShape[], spec: SpecCheck | null): ScopeRow[] {
  const items = (result?.items ?? []).filter(i => i.kind === 'scope' || i.kind === 'pass_thru');
  const secKeys = new Map<string, string>();
  for (const s of spec?.sections ?? []) secKeys.set(s.key, s.csi);
  const existing = items.filter(i => /\bEXIST|\(E\)|\bEX\b/i.test([...(i.flags ?? []), ...(i.notes ?? [])].join(' '))).length;
  const costTopics = new Set((spec?.checks ?? []).map(c => c.topic));
  return SCOPE_LINES.map(line => {
    let found = items.filter(i => line.classes.includes(i.cls)).length;
    if (line.subjects) found += shapes.filter(s => s.author === 'user' && s.subject && line.subjects!.test(s.subject)).length;
    if (line.id === 'existing') found = existing;
    if (line.id === 'hardware') found = items.filter(i => i.is_door || /door/.test(i.cls)).length;
    const sections = line.specKeys.filter(k => secKeys.has(k)).map(k => secKeys.get(k)!);
    let suggestion: ScopeDecision = 'na';
    let why = 'nothing found on the drawings or in the specs';
    if (line.id === 'engineering') {
      const hit = ['engineering', 'field_test', 'mockup'].filter(t => costTopics.has(t));
      if (hit.length) { suggestion = 'included'; why = `specs require: ${hit.join(', ').replace('field_test', 'field testing')}`; }
      else { why = spec ? 'not required by the specs read' : 'run the spec check'; }
    } else if (line.id === 'existing') {
      if (found) { suggestion = 'excluded'; why = `${found} item(s) flagged existing — demo only if the GC asks`; }
    } else if (line.id === 'sealant') {
      suggestion = 'included'; why = sections.length ? `07 92 00 in the specs` : 'perimeter sealant at our frames';
    } else if (line.id === 'hardware') {
      if (found) { suggestion = 'included'; why = `${found} door item(s) — hardware included by default`; }
    } else if (found) {
      suggestion = 'included'; why = `${found} found in the takeoff`;
    } else if (sections.length) {
      suggestion = 'included'; why = `in the specs (${sections.join(', ')}) but not found on the drawings — look again`;
    }
    return { ...line, found, sections, suggestion, why };
  });
}
