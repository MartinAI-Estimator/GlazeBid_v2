// Frame Builder import: Studio / schedule payloads → FrameSpecs (importer.js).
//   node --test packages/frame-engine/test/frameEngine.import.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importFrame, importJob, resyncFrame, acceptDrawingValue, spansToDlo, resolveSystem, snapshot,
  solveFrame, normalizeSpec, createTakeoff, buildTakeoff,
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
