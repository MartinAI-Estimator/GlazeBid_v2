// Non-frame lines (decision 7): brake metal onto frames, glass-only to the glass report,
// the rest to the bid cart.
//   node --test packages/frame-engine/test/frameEngine.nonframes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importFrame, resyncFrame, routeNonFrame, applyNonFrames, setGlassOnly, glassOnlySizes,
  createTakeoff, buildTakeoff, solveFrame, normalizeSpec, BRAKE_ASSUMED,
} from '../src/core/index.js';

const FRAME = {
  mark: 'A', itemId: 'A', cls: 'ext_sf', manufacturer: 'Kawneer', frameSeries: 'Trifab 451T',
  overallWidth: 120, overallHeight: 96, quantity: 2, sillAFF: 0, panelCount: 3, rowCount: 1, needs: [],
  brakeMetal: [
    { edge: 'sill', description: 'Sill brake metal — detail 4/A8.1', details: ['4/A8.1'] },
    { edge: 'jambs', description: 'Jamb brake metal — detail 5/A8.1', details: ['5/A8.1'] },
  ],
};

test('routing by kind', () => {
  assert.equal(routeNonFrame({ kind: 'glass', cls: 'glazing_only' }).route, 'glass');
  assert.equal(routeNonFrame({ kind: 'brake_metal', cls: 'break_metal', placedOn: ['A'] }).route, 'brake');
  assert.deepEqual(routeNonFrame({ kind: 'brake_metal', cls: 'break_metal', placedOn: [] }), { route: 'bid', group: 'Brake metal' });
  assert.deepEqual(routeNonFrame({ kind: 'line', cls: 'mirror' }), { route: 'bid', group: 'Mirrors' });
  assert.deepEqual(routeNonFrame({ kind: 'line', cls: 'translucent_panel' }), { route: 'bid', group: 'Translucent panels' });
  assert.deepEqual(routeNonFrame({ kind: 'line', cls: 'window', passThru: true }), { route: 'bid', group: 'Pass-thru' });
  assert.equal(routeNonFrame({ kind: 'note' }).route, 'note');
});

test('brake metal from the details lands on the frame, flagged, and runs its edges', () => {
  const { spec, needsInput } = importFrame(FRAME);
  assert.deepEqual(spec.brakeMetal.map((b) => b.edge), ['sill', 'jambs']);
  assert.equal(spec.brakeMetal[0].girth, BRAKE_ASSUMED.girth);
  assert.ok(needsInput.some((n) => n.field === 'brakeMetal' && /4\/A8\.1/.test(n.reason) && /assumed/.test(n.reason)));
  const tp = { ...createTakeoff({ frames: [] }), frames: [spec] };
  const t = buildTakeoff(tp);
  const sill = t.brakeRows.find((b) => b.edge === 'sill');
  const jambs = t.brakeRows.find((b) => b.edge === 'jambs');
  assert.ok(Math.abs(sill.length - 120) < 0.01);
  assert.ok(Math.abs(jambs.length - 192) < 0.01);
  assert.equal(sill.qtyTotal, 2);
});

test('a frame imported before brake metal existed picks it up on re-sync', () => {
  const { spec } = importFrame({ ...FRAME, brakeMetal: undefined });
  const old = structuredClone(spec);
  delete old.importMeta.imported.brakeMetal;                    // as saved before step 6
  const r = resyncFrame(old, FRAME);
  assert.ok(r.updated.includes('brakeMetal'));
  assert.equal(r.spec.brakeMetal.length, 2);
});

test('glass-only rows: opening sizes are listed, never ordered, until the lite size is entered', () => {
  const lines = [
    { itemId: '9', kind: 'glass', cls: 'glazing_only', quantity: 2, w_in: 40, h_in: 86, glass: '1/4" clear tempered', description: 'HM frame w/ lite' },
    { itemId: 'A101', kind: 'glass', cls: 'glazing_only_door', quantity: 1, description: 'door lite' },
    { itemId: 'M1', kind: 'line', cls: 'mirror', quantity: 4, unit: 'EA', description: '18 x 36 mirror' },
    { itemId: 'N1', kind: 'note', description: 'note' },
  ];
  let tp = createTakeoff({ frames: [] });
  const r = applyNonFrames(tp, lines, { glassTypeIdFor: (t) => (/1\/4/.test(t ?? '') ? 'GL-2' : null) });
  tp = r.takeoff;
  assert.deepEqual(r.glassOnly, { added: 2, updated: 0, kept: 0 });
  assert.deepEqual(r.bidLines, { added: 1, updated: 0, kept: 0 });
  assert.equal(r.notes, 1);
  const go = tp.glassOnly.find((g) => g.itemId === '9');
  assert.equal(go.sizeIs, 'opening');
  assert.equal(go.glassTypeId, 'GL-2');
  assert.ok(go.needs.some((n) => n.field === 'size'));
  let t = buildTakeoff(tp);
  assert.equal(t.totals.glassOnlyLites, 0);
  assert.equal(t.glassOnly.unsized.length, 2);
  // the estimator enters the lite size
  tp = { ...tp, glassOnly: tp.glassOnly.map((g) => (g.itemId === '9' ? setGlassOnly(g, { width: 36.75, height: 30.75 }) : g)) };
  t = buildTakeoff(tp);
  assert.equal(t.totals.glassOnlyLites, 2);
  const grp = t.glassRfq.find((g) => g.key === 'GL-2 (T)');           // monolithic → tempered (company rule)
  assert.ok(grp.sizes.some((s) => s.orderW === 36.75 && s.qty === 2 && s.blockW === 38 && s.locations[0].includes('glass only')));
});

test('re-sending keeps the estimator\'s edits and notes what the drawing says', () => {
  const line = { itemId: '9', kind: 'glass', cls: 'glazing_only', quantity: 2, w_in: 40, h_in: 86 };
  let tp = applyNonFrames(createTakeoff({ frames: [] }), [line]).takeoff;
  tp = { ...tp, glassOnly: tp.glassOnly.map((g) => setGlassOnly(g, { width: 36, height: 80 })) };
  const r = applyNonFrames(tp, [{ ...line, quantity: 3 }]);
  assert.deepEqual(r.glassOnly, { added: 0, updated: 0, kept: 1 });
  const g = r.takeoff.glassOnly[0];
  assert.equal(g.width, 36);
  assert.deepEqual(g.drawingSays.find((d) => d.field === 'qty'), { field: 'qty', drawing: 3 });
  const m = applyNonFrames(r.takeoff, [{ itemId: 'M1', kind: 'line', cls: 'mirror', quantity: 4 }]);
  const m2 = applyNonFrames(m.takeoff, [{ itemId: 'M1', kind: 'line', cls: 'mirror', quantity: 6 }]);
  assert.equal(m2.takeoff.bidLines[0].quantity, 6);                     // untouched → updates
});
