/**
 * Non-frame lines in the Frame Builder (decision 7): break metal onto the frames it
 * touches, glass-only lites to the glass report, the rest to the bid cart.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { buildTakeoff } from '@glazebid/frame-engine/core';
import useFrameTakeoffStore from '../../components/FrameBuilderV1/useFrameTakeoffStore';
import OtherLinesPanel from '../../components/FrameBuilderV1/OtherLinesPanel';
import { toBidCards, syncLinesToBid, LINES_SOURCE, GLASS_ONLY_GROUP } from '../../components/FrameBuilderV1/builderBridge';
import useBidStore from '../../store/useBidStore';

const doc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../packages/frame-engine/test/fixtures/hope_frames_spec.json'), 'utf8'));
const packet = (d = doc) => ({ schema: 'glazebid.frameHandoff/1', builderProject: 'Hope', studioProject: 'Hope', pdfName: 'Hope.pdf', mode: 'all', doc: d });
const st = () => useFrameTakeoffStore.getState();

const BM_DOC = {
  frames: [{
    mark: 'A', itemId: 'A', cls: 'ext_sf', manufacturer: 'Kawneer', frameSeries: 'Trifab 451T', overallWidth: 120, overallHeight: 96,
    quantity: 2, sillAFF: 0, panelCount: 3, rowCount: 1, needs: [], buildable: true,
    brakeMetal: [{ edge: 'sill', description: 'Sill brake metal — detail 4/A8.1', details: ['4/A8.1'] }],
  }],
  nonFrames: [
    { itemId: 'BREAK METAL', kind: 'brake_metal', cls: 'break_metal', quantity: 22, unit: 'LF', placedOn: ['A'], description: '4/A8.1 sill' },
    { itemId: 'M1', kind: 'line', cls: 'mirror', quantity: 4, unit: 'EA', description: '18 x 36 mirror' },
  ],
  doorTypes: [], jobDefaults: null,
};

describe('Other lines', () => {
  beforeEach(() => {
    localStorage.clear();
    useFrameTakeoffStore.setState({ projectName: null, takeoff: null, past: [], future: [] });
    useBidStore.setState({ frames: [], workspaceSystems: [] });
  });

  it('Build all files glass-only lites and bid cart lines', () => {
    st().open('Hope');
    st().receive(packet());
    const r = st().buildIncoming(null);
    const tp = st().takeoff;
    expect(r.other.glassOnly).toBe(5);
    expect(r.other.bidLines).toBe(5);                       // sun control, translucent, railing, wraps, unplaced break metal
    expect(tp.incoming.nonFramesApplied).toBeTruthy();
    expect(tp.bidLines.map((b) => b.group)).toEqual(expect.arrayContaining(['Translucent panels', 'Glass railings', 'Sun control', 'Brake metal']));
    const t11 = tp.glassOnly.find((g) => g.itemId === 'FRAME TYPE 11');
    expect(t11.sizeIs).toBe('opening');
    expect(t11.qty).toBe(4);
    // a second Build all doesn't file them twice
    st().receive(packet());
    st().buildIncoming(null);
    expect(st().takeoff.glassOnly.length).toBe(5);
  });

  it('brake metal lands on its frame; the measured run stays as a cross-check', () => {
    st().open('Job');
    st().receive({ ...packet(BM_DOC), builderProject: 'Job' });
    st().buildIncoming(null);
    const tp = st().takeoff;
    const f = tp.frames.find((x) => x.importMeta?.itemId === 'A');
    expect(f.brakeMetal.map((b) => b.edge)).toEqual(['sill']);
    expect(f.importMeta.needs.some((n) => n.field === 'brakeMetal')).toBe(true);
    expect(tp.brakeMeasured[0]).toMatchObject({ itemId: 'BREAK METAL', quantity: 22, placedOn: ['A'] });
    expect(tp.bidLines.map((b) => b.group)).toEqual(['Mirrors']);
    const t = buildTakeoff(tp);
    expect(t.brakeRows.reduce((s, b) => s + (b.length * b.qtyTotal) / 12, 0)).toBeCloseTo(20, 5);
  });

  it('a typed lite size puts the glass-only lite on the glass report', () => {
    st().open('Hope');
    st().receive(packet());
    st().buildIncoming(null);
    const row = st().takeoff.glassOnly.find((g) => g.itemId === 'FRAME TYPE 11');
    expect(buildTakeoff(st().takeoff).totals.glassOnlyLites).toBe(0);
    st().updateGlassOnly(row.id, { width: 30, height: 40 });
    const t = buildTakeoff(st().takeoff);
    expect(t.totals.glassOnlyLites).toBe(4);
    expect(t.glassRfq.some((g) => g.sizes.some((s) => s.locations.some((l) => l.includes('FRAME TYPE 11 (glass only)'))))).toBe(true);
  });

  it('bid cart: one material scope per group; prices survive a re-send', () => {
    st().open('Job');
    st().receive({ ...packet(BM_DOC), builderProject: 'Job' });
    st().buildIncoming(null);
    st().addGlassOnly();
    let t = buildTakeoff(st().takeoff);
    const r = syncLinesToBid(t);
    expect(r.groups).toBe(2);
    let ws = useBidStore.getState().workspaceSystems;
    const mirrors = ws.find((c) => c.name === 'Mirrors — from takeoff');
    expect(mirrors.source).toBe(LINES_SOURCE);
    expect(mirrors.materials[0].description).toMatch(/^4 EA — M1/);
    expect(ws.some((c) => c.name.startsWith(GLASS_ONLY_GROUP))).toBe(true);
    // the estimator prices the line on the bid, another scope exists, then a re-send
    useBidStore.getState().setWorkspaceSystems((all) => [
      ...all.map((c) => (c.id === mirrors.id ? { ...c, materials: c.materials.map((m) => ({ ...m, cost: 480 })) } : c)),
      { id: 'mine', name: 'Manual', materials: [] }]);
    const row = st().takeoff.bidLines[0];
    st().updateBidLine(row.id, { quantity: 6 });
    t = buildTakeoff(st().takeoff);
    syncLinesToBid(t);
    ws = useBidStore.getState().workspaceSystems;
    const m2 = ws.find((c) => c.id === mirrors.id);
    expect(m2.materials[0].cost).toBe(480);
    expect(m2.materials[0].description).toMatch(/^6 EA/);
    expect(m2.totals.totalCost).toBe(480);
    expect(ws.some((c) => c.id === 'mine')).toBe(true);
    expect(toBidCards({ bidLines: [], glassOnly: { rows: [] } })).toEqual([]);
  });

  it('renders the Other lines panel', () => {
    st().open('Hope');
    st().receive(packet());
    st().buildIncoming(null);
    const tp = st().takeoff;
    const html = renderToString(<OtherLinesPanel takeoff={tp} result={buildTakeoff(tp)} store={st()} onClose={() => {}} />);
    expect(html).toContain('Glass only (5)');
    expect(html).toContain('Bid cart lines (5)');
  });
});
