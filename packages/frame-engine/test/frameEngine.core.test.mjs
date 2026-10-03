/**
 * Frame engine core — unit tests (node:test, no dependencies).
 *   node --test packages/frame-engine/test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/core/index.js';

const near = (a, b, tol = 1e-3, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);

test('units: block size rounds up to the next even inch', () => {
  assert.equal(E.blockSize(24.125), 26);
  assert.equal(E.blockSize(25), 26);
  assert.equal(E.blockSize(26), 26);
  assert.equal(E.blockSize(26.0625), 28);
});

test('units: parse feet-inches and fractions', () => {
  assert.equal(E.parseDimension("9'-9 1/2\""), 117.5);
  assert.equal(E.parseDimension('117 1/2'), 117.5);
  assert.equal(E.parseDimension('3/4'), 0.75);
  assert.equal(E.parseDimension("10'"), 120);
  assert.equal(E.parseDimension('abc'), null);
  assert.equal(E.formatFeetInches(117.5), "9'-9 1/2\"");
});

test('storefront 3 EQ bays: DLO, glass = DLO + 3/4", verticals continuous', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 120, height: 96 } }));
  assert.equal(g.lites.length, 3);
  for (const l of g.lites) { near(l.dloW, 112 / 3); near(l.dloH, 92); near(l.glassW, 112 / 3 + 0.75); near(l.glassH, 92.75); }
  const verts = g.pieces.filter((p) => p.orient === 'v');
  assert.equal(verts.length, 4);
  verts.forEach((p) => near(p.length, 96));
  g.pieces.filter((p) => p.role === 'head' || p.role === 'sill').forEach((p) => near(p.length, 112 / 3));
});

test('rough opening deducts per-side joints', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'ro', width: 121, height: 97, joints: { head: 0.5, sill: 0.5, left: 0.375, right: 0.625 } } }));
  near(g.width, 120); near(g.height, 96);
});

test('EQ solves the remainder; door bay is locked', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 180, height: 120 },
    columns: [{ dlo: 40 }, { kind: 'door', dlo: 36 }, { dlo: null }, { dlo: null }] }));
  const avail = 180 - 4 - 3 * 2;
  near(g.columns[0].dlo, 40); near(g.columns[1].dlo, 36);
  near(g.columns[2].dlo, (avail - 76) / 2); near(g.columns[3].dlo, (avail - 76) / 2);
});

test('door bay: no sill, header at door height, transom lite above', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 180, height: 120 },
    columns: [{ dlo: null }, { kind: 'door', dlo: 36, door: { kind: 'single', height: 84 } }, { dlo: null }] }));
  const transom = g.lites.find((l) => l.kind === 'transom');
  near(transom.dloH, 120 - 84 - 2 - 2);
  near(transom.dloW, 36);
  const sills = g.pieces.filter((p) => p.role === 'sill');
  assert.equal(sills.length, 2, 'sill is removed in the door bay');
  assert.ok(g.pieces.some((p) => p.role === 'doorHeader'));
});

test('raked head: verticals to the long point, head along the slope', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 120, height: 120 }, shape: { type: 'rake', params: { leftHeight: 96, rightHeight: 120 } } }));
  const v1 = g.pieces.find((p) => p.member === 'V1');
  near(v1.length, 96 + 24 * (41.3333 / 120), 1e-2);
  const head = g.pieces.filter((p) => p.role === 'head');
  const cos = 120 / Math.hypot(120, 24);
  head.forEach((h) => near(h.length, (112 / 3) / cos, 1e-2));
});

test('half-round head: true arc length between members', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 96, height: 120 }, shape: { type: 'half_round' }, columns: [{ dlo: null }, { dlo: null }] }));
  const heads = g.pieces.filter((p) => p.role === 'head');
  const ang = (x) => Math.acos((x - 48) / 48);
  const expected = 48 * (ang(2) - ang(47));
  heads.forEach((h) => near(h.length, expected, 0.05));
});

test('curtain wall: flipping one cross makes the horizontal run through', () => {
  const base = { systemId: 'kawneer-1600-75', size: { mode: 'frame', width: 200, height: 240 },
    columns: [{ dlo: null }, { dlo: null }, { dlo: null }], rows: [{ dlo: null }, { dlo: null }, { dlo: null }] };
  const g0 = E.solveFrame(E.createFrame(base));
  assert.equal(g0.pieces.filter((p) => p.member === 'V1').length, 1);
  const g1 = E.solveFrame(E.createFrame({ ...base, joints: { overrides: { 'V1@H0.1+H1.1': 'h' } } }));
  assert.equal(g1.pieces.filter((p) => p.member === 'V1').length, 2);
  const run = g1.pieces.find((p) => p.member === 'H0.1+H1.1');
  near(run.length, 2 * ((200 - 5 - 5) / 3) + 2.5);
});

test('head runs over the jambs when corners are flipped', () => {
  const g = E.solveFrame(E.createFrame({ size: { mode: 'frame', width: 120, height: 96 }, columns: [{ dlo: null }],
    joints: { overrides: { C2: 'h', C3: 'h' } } }));
  near(g.pieces.find((p) => p.role === 'head').length, 120);
  g.pieces.filter((p) => p.role === 'jamb').forEach((j) => near(j.length, 94));
});

test('merging two lites by removing a horizontal', () => {
  let f = E.createFrame({ size: { mode: 'frame', width: 120, height: 96 }, rows: [{ dlo: null }, { dlo: null }] });
  assert.equal(E.solveFrame(f).lites.length, 6);
  f = E.edit.removeMember(f, 'H1.1');
  const g = E.solveFrame(f);
  assert.equal(g.lites.length, 5);
  near(g.lites.find((l) => l.col === 1).dloH, 92);
});

test('auto-temper: door adjacency, large lite, company monolithic rule, manual override', () => {
  const f = E.createFrame({ size: { mode: 'frame', width: 220, height: 120 },
    columns: [{ dlo: null }, { kind: 'door', dlo: 36 }, { dlo: 30 }, { dlo: null }], rows: [{ dlo: 30 }, { dlo: null }] });
  const g = E.solveFrame(f);
  const res = E.evaluateGlass(g, {});
  const byTag = Object.fromEntries(res.map((r) => [r.key, r]));
  const nextToDoor = res.find((r) => r.col === 2 && r.bottomAFF < 10);
  assert.ok(nextToDoor.tempered && nextToDoor.temperReasons.includes('door'));
  const far = res.find((r) => r.col === 3 && r.bottomAFF < 10);
  assert.ok(!far.temperReasons.includes('door'));
  // monolithic → company rule
  const f2 = { ...f, glass: { ...f.glass, frameDefault: 'GL-2' } };
  E.evaluateGlass(E.solveFrame(f2), {}).forEach((r) => assert.ok(r.tempered));
  // manual override wins
  const f3 = E.edit.setLiteTemper(f, nextToDoor.key, false);
  assert.equal(E.evaluateGlass(E.solveFrame(f3), {}).find((r) => r.key === nextToDoor.key).tempered, false);
  assert.ok(byTag);
});

test('optimizer: FFD never under-orders long cuts', () => {
  const r = E.optimizeCuts([{ length: 156, qty: 3 }], { stockLengthIn: 288, kerfIn: 0.125 });
  assert.equal(r.barCount, 3, 'three 13\' pieces need three 24\' bars');
  const r2 = E.optimizeCuts([{ length: 95.5, qty: 6 }], { stockLengthIn: 288, kerfIn: 0.125 });
  assert.equal(r2.barCount, 2);
});

test('hydrateFrame flags missing fields instead of guessing', () => {
  const { spec, needsInput } = E.hydrateFrame({ mark: 'AS1', systemType: 'storefront', overallWidth: 118, overallHeight: 72,
    panelCount: 3, rowCount: 2, bayWidths: [40, 45, 27], rowHeights: null, primaryGlass: '1" Solarban 90 IGU', sillAFF: null, hasDoor: false, doorBays: [] });
  assert.equal(spec.mark, 'AS1');
  assert.equal(spec.columns.length, 3);
  assert.equal(spec.rows.length, 2);
  const fields = needsInput.map((n) => n.field);
  assert.ok(fields.includes('rowHeights'));
  assert.ok(fields.includes('sillAFF'));
  assert.ok(fields.includes('bayWidths'));
});

test('brake metal sheet yield splices long pieces', () => {
  const y = E.sheetYield([{ girth: 12, length: 180, qty: 1 }], { widthIn: 48, lengthIn: 120, lapIn: 4 });
  assert.equal(y.strips, 2);
  assert.equal(y.sheets, 1);
});

test('labor: lift line splits counts and multiplies field hours above', () => {
  const calc = (frame) => ({ shopMH: frame.panels * 1, distributionMH: 0, fieldMH: frame.panels * 2 });
  const f = E.createFrame({ size: { mode: 'frame', width: 120, height: 192 }, rows: [{ dlo: 90 }, { dlo: null }], liftLine: 96 });
  const b = E.buildFrameTakeoff(f, {});
  assert.equal(b.counts.below.panels, 3);
  assert.equal(b.counts.above.panels, 3);
  const L = E.frameLabor(b.counts, { calc, rates: { hf: {}, ir: {} }, systemType: 'Ext SF', liftFactor: 1.5 });
  near(L.field, 3 * 2 + 3 * 2 * 1.5);
  near(L.liftHours, 9);
});

test('library: Tubelite twin is derived through the xref', () => {
  const k = E.getSystem('kawneer-451t'); const t = E.getSystem('tubelite-451t');
  assert.equal(k.dies.jamb, '451TCG001');
  assert.equal(t.dies.jamb, 'T15141');
  assert.equal(t.dies.horizontal, 'T15143');
  assert.equal(t.dieMatch.jamb.match, 'EXACT');
});

test('job takeoff: metal grouped by die with bars, glass grouped by type', () => {
  const tp = E.createTakeoff();
  tp.frames = [E.createFrame({ mark: 'A', quantity: 2, size: { mode: 'frame', width: 120, height: 96 } })];
  const t = E.buildTakeoff(tp);
  const jambDie = t.metalRfq.find((m) => m.die === '451TCG001');
  assert.equal(jambDie.pieces, 2 * (4 + 3));      // 4 verticals + 3 heads per frame
  assert.ok(t.glassRfq[0].sizes[0].blockW % 2 === 0);
  assert.equal(t.totals.lites, 6);
});
