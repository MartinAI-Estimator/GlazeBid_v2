// Frame Builder import: Studio / schedule payloads → FrameSpecs (importer.js).
//   node --test packages/frame-engine/test/frameEngine.import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importFrame, importJob, resyncFrame, acceptDrawingValue, spansToDlo, resolveSystem, snapshot,
  solveFrame, normalizeSpec, createTakeoff, buildTakeoff,
  markKey, findImported, mergeSchedule, combineSources,
} from '../src/core/index.js';

const near = (a, b, tol = 0.07) => Math.abs(a - b) <= tol;

// Curtis SAF as the sidecar reads it: 31 | 38 door | 31 CL, transom horizontal at 86"
const SAF = {
  mark: 'SAF', itemId: 'SAF', cls: 'int_sf', systemType: 'storefront', manufacturer: 'Kawneer', frameSeries: 'Trifab VG 450',
  overallWidth: 100, overallHeight: 108, sizeMode: 'frame', quantity: 1, sillAFF: 0,
  columns: [
    { widthCL: 31, kind: 'glass', horizontalsAt: [86] },
    { widthCL: 38, kind: 'door', horizontalsAt: [86], doorHeight: 86, leaves: 1, door: 'B120' },
    { widthCL: 31, kind: 'glass', horizontalsAt: [86] },
  ],
  doors: [{ mark: 'B120', kind: 'single', width: 36, height: 84, hardware: '4', panic: true }],
  provenance: { size: { source: 'schedule' } }, needs: [], citations: ['A7.21 schedule type SAF'],
};

test('CL spans become DLOs with the perimeter and intermediate sightlines', () => {
  assert.deepEqual(spansToDlo([31, 38, 31], 1.75, 1.75, 1.75), [31 - 1.75 - 0.875, 38 - 1.75, 31 - 0.875 - 1.75]);
});

test('door bay, transom and the door from the schedule', () => {
  const { spec, needsInput } = importFrame(SAF);
  assert.equal(spec.systemId, 'kawneer-450');
  assert.equal(spec.columns[1].kind, 'door');
  assert.equal(spec.columns[1].door.mark, 'B120');
  assert.equal(spec.columns[1].door.hardwarePreset, 'rim');          // panic on the schedule
  assert.ok(near(spec.columns[1].dlo, 38 - 1.75));
  // header CL at 86 → opening = 86 − header sightline / 2
  assert.ok(near(spec.columns[1].door.height, 86 - 1.75 / 2));
  // one glass bay left EQ so the frame closes on 100"
  assert.equal(spec.columns.filter((c) => c.dlo == null).length, 1);
  const s = solveFrame(spec);
  assert.equal(s.warnings.length, 0, s.warnings.join(' / '));
  assert.ok(spec.importMeta && spec.importMeta.itemId === 'SAF' && spec.importMeta.imported.columns.length === 3);
  assert.ok(!needsInput.some((n) => n.field === 'system'));
});

test('rough-opening sizes deduct the job joints', () => {
  const { spec } = importFrame({ ...SAF, sizeMode: 'ro', overallWidth: 100.5, overallHeight: 108.75 },
    { defaultJoints: { left: 0.25, right: 0.25, head: 0.5, sill: 0.25 } });
  assert.equal(spec.size.mode, 'ro');
  assert.equal(solveFrame(spec).warnings.length, 0);
});

test('a door with no frame type becomes its own door frame', () => {
  const { spec } = importFrame({ mark: 'D2', cls: 'ext_sf', standaloneDoor: true, quantity: 1,
    doors: [{ mark: 'D2', kind: 'single', width: 36, height: 94 }], needs: [] });
  assert.equal(spec.columns.length, 1);
  assert.equal(spec.columns[0].kind, 'door');
  assert.equal(spec.size.width, 36 + 2 * 2);                            // 451T jambs
  assert.equal(solveFrame(spec).warnings.length, 0);
});

test('another maker is priced as the Kawneer equal and flagged', () => {
  const r = resolveSystem({ manufacturer: 'PITCO', frameSeries: 'TMW 450', cls: 'ext_cw' });
  assert.equal(r.how, 'equal');
  assert.equal(r.systemId, 'kawneer-1600-75');
  const { needsInput } = importFrame({ ...SAF, manufacturer: 'PITCO', frameSeries: 'TMS 114', cls: 'ext_sf' });
  assert.ok(needsInput.some((n) => n.field === 'system'));
  assert.equal(resolveSystem({ manufacturer: 'Tubelite', frameSeries: 'T14000', cls: 'ext_sf' }).systemId, 'tubelite-451t');
});

test('normalizeSpec keeps the import record', () => {
  const { spec } = importFrame(SAF);
  assert.ok(normalizeSpec(spec).importMeta);
});

test('re-sync: untouched fields update, edited fields are kept with "drawing now says"', () => {
  const { spec } = importFrame(SAF);
  const edited = normalizeSpec({ ...spec, quantity: 3 });               // estimator changed the count
  const revised = { ...SAF, quantity: 2, overallWidth: 102 };            // drawing changed count AND width
  const { spec: merged, updated, kept } = resyncFrame(edited, revised);
  assert.ok(updated.includes('size'));                                   // never touched → updated
  assert.equal(merged.size.width, 102);
  assert.deepEqual(kept.map((k) => k.field), ['quantity']);              // edited → kept, asked
  assert.equal(merged.quantity, 3);
  assert.equal(merged.importMeta.drawingSays[0].drawing, 2);
  const accepted = acceptDrawingValue(merged, 'quantity');
  assert.equal(accepted.quantity, 2);
  assert.equal(accepted.importMeta.drawingSays.length, 0);
});

test('whole job: glass types from the specs, frames take the matching type, takeoff builds', async () => {
  const fs = await import('node:fs');
  const url = new URL('./fixtures/hope_frames_spec.json', import.meta.url);
  if (!fs.existsSync(url)) return;                                       // fixture optional
  const doc = JSON.parse(fs.readFileSync(url, 'utf8'));
  const tp = createTakeoff({ frames: [] });
  const job = importJob(doc, tp);
  assert.equal(job.glassTypes.length, 2);                                // exterior IG, interior 1/4"
  assert.match(job.finish, /#17 CLEAR ANODIZED/);
  const built = job.frames.map((f) => f.spec).filter((s) => s.size.width > 0);
  assert.ok(built.length >= 20);
  assert.ok(built.filter((s) => s.glass.frameDefault?.startsWith('SPEC-')).length >= 15);
  const res = buildTakeoff({ ...tp, glassTypes: [...tp.glassTypes, ...job.glassTypes], frames: built });
  assert.ok(res.totals.metalLF > 1000 && res.totals.glassSf > 1000);
  assert.ok(snapshot(built[0]).columns.length >= 1);
});

// ── Window schedule (step 5) ──

const ROW = (o = {}) => ({                                   // a spreadsheet row (rulesMapRows → §4 payload)
  mark: 'SF-1', itemId: 'SF-1', source: 'schedule', scheduleFile: 'Window Schedule.xlsx', systemType: null,
  manufacturer: 'Generic', frameSeries: null, overallWidth: 120, overallHeight: 96, sizeMode: 'frame',
  quantity: 2, quantityGiven: true, primaryGlass: '1" insulated low-e', finish: 'Clear anodized', sillAFF: 24,
  panelCount: null, rowCount: null, bayWidths: null, rowHeights: null, hasDoor: false, doorBays: [], needs: [], ...o,
});

test('marks match across the plans and the schedule', () => {
  assert.equal(markKey('FRAME TYPE 05'), '5');
  assert.equal(markKey('Type 5'), '5');
  assert.equal(markKey('SF-01'), 'SF1');
  assert.equal(markKey('sf1'), 'SF1');
  assert.equal(markKey('6a'), '6A');
});

test('§4 bayWidths / rowHeights / doorBays build the grid', () => {
  const { spec, needsInput } = importFrame(ROW({ bayWidths: [40, 40, 40], rowHeights: [24, 72], doorBays: [1], hasDoor: true }));
  assert.deepEqual(spec.columns.map((c) => c.kind), ['glass', 'door', 'glass']);
  assert.equal(spec.rows.length, 2);
  assert.ok(needsInput.some((n) => n.field === 'doors'));              // door height not read
  assert.equal(spec.importMeta.source, 'schedule');
  assert.equal(spec.sillAFF, 24);
  const s = solveFrame(spec);
  assert.equal(s.warnings.length, 0);
});

test('a schedule door with no bay is flagged', () => {
  const { needsInput } = importFrame(ROW({ hasDoor: true }));
  assert.ok(needsInput.some((n) => n.field === 'doors' && /door bay/.test(n.reason)));
});

test('merge: size and type from the schedule, count from the plans, bays from the elevation', () => {
  const studio = { ...SAF, mark: 'SF1', itemId: 'SF1', quantity: 3, provenance: { quantity: { source: 'plan' }, system: { source: 'drawing' } },
    overallWidth: 99, overallHeight: 108, primaryGlass: null };
  const m = mergeSchedule(studio, ROW({ overallWidth: 100, overallHeight: 108, quantity: 2, frameSeries: 'Trifab VG 451T', manufacturer: 'Kawneer' }));
  assert.equal(m.overallWidth, 100);                                  // schedule size
  assert.equal(m.quantity, 3);                                        // plan count
  assert.equal(m.columns.length, 3);                                  // elevation bays
  assert.equal(m.frameSeries, 'Trifab VG 451T');
  assert.equal(m.primaryGlass, '1" insulated low-e');
  assert.equal(m.itemId, 'SF1');                                      // Studio's item stays the anchor
  const f = m.needs.map((n) => n.field);
  assert.ok(f.includes('size') && f.includes('quantity') && f.includes('system'));
  assert.equal(m.source, 'studio+schedule');
  const { spec } = importFrame(m);
  assert.equal(spec.systemId, 'kawneer-451t');
  assert.equal(spec.size.width, 100);
});

test('combine: one-sided marks stay, flagged', () => {
  const studio = [{ ...SAF, mark: 'FRAME TYPE 5', itemId: 'FRAME TYPE 5' }, { ...SAF, mark: 'SF9', itemId: 'SF9' }];
  const out = combineSources(studio, [ROW({ mark: '5', itemId: '5' }), ROW({ mark: 'SF-7', itemId: 'SF-7' })]);
  assert.deepEqual(out.map((p) => p.itemId), ['FRAME TYPE 5', 'SF9', 'SF-7']);
  assert.equal(out[0].source, 'studio+schedule');
  assert.ok(out[1].needs.some((n) => n.field === 'schedule'));
  assert.ok(out[2].needs.some((n) => /not found in the Studio takeoff/.test(n.reason)));
});

test('a frame built from the schedule re-syncs when Studio sends the same mark', () => {
  const { spec } = importFrame(ROW({ mark: '5', itemId: '5' }));
  const frames = [spec];
  const studio = { ...SAF, mark: 'FRAME TYPE 5', itemId: 'FRAME TYPE 5', provenance: { quantity: { source: 'plan' } }, quantity: 4 };
  const merged = combineSources([studio], [ROW({ mark: '5', itemId: '5' })])[0];
  assert.equal(findImported(frames, merged), 0);
  const r = resyncFrame(frames[0], merged);
  assert.ok(r.updated.includes('quantity') && r.updated.includes('columns'));
  assert.equal(r.spec.importMeta.itemId, 'FRAME TYPE 5');
  assert.equal(r.spec.quantity, 4);
});
