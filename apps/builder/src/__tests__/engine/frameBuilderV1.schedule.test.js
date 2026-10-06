/**
 * Window schedule upload in Frame Builder V1 (no AI): spreadsheets by rules, PDFs by
 * the sidecar engine; merged with Studio by mark — size and type from the schedule,
 * count from the plans, bays from the elevation, every disagreement flagged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { solveFrame } from '@glazebid/frame-engine/core';
import useFrameTakeoffStore from '../../components/FrameBuilderV1/useFrameTakeoffStore';
import { sheetPayloads, readScheduleFile } from '../../components/FrameBuilderV1/scheduleIntake';

const doc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../packages/frame-engine/test/fixtures/hope_frames_spec.json'), 'utf8'));
const packet = (over = {}) => ({ schema: 'glazebid.frameHandoff/1', builderProject: 'Hope', studioProject: 'Hope', pdfName: 'Hope.pdf', mode: 'all', doc, ...over });

const ROWS = [
  ['WINDOW SCHEDULE'],
  ['Mark', 'Width', 'Height', 'Qty', 'System', 'Glass', 'Finish', 'Remarks'],
  ['Type 5', "7'-6\"", "7'-1\"", '2', 'Trifab 451T', 'GL-1 1" insulated', 'Clear anodized', ''],
  ['SF-99', '120', '96', '1', 'Kawneer 451T', '', '', 'Interior'],
  ['CW-1', "20'-0\"", "12'-0\"", '1', '1600 Wall System 1', '', '', ''],
];

describe('window schedule — spreadsheet rules', () => {
  it('reads marks, sizes, counts, system and glass; flags the assumptions', () => {
    const d = sheetPayloads(ROWS, 'Window Schedule.xlsx');
    expect(d.frames.map((p) => p.mark)).toEqual(['Type 5', 'SF-99', 'CW-1']);
    const [a, b, c] = d.frames;
    expect(a.overallWidth).toBe(90);
    expect(a.overallHeight).toBe(85);
    expect(a.quantity).toBe(2);
    expect(a.quantityGiven).toBe(true);
    expect(a.source).toBe('schedule');
    expect(a.manufacturer).toBe('Kawneer');                       // Trifab, maker assumed
    expect(a.needs.some((n) => n.field === 'system' && /Kawneer assumed/.test(n.reason))).toBe(true);
    expect(a.sizeMode).toBe('frame');
    expect(a.needs.some((n) => n.field === 'size' && /frame size assumed/.test(n.reason))).toBe(true);
    expect(b.cls).toBe('int_sf');
    expect(b.needs.some((n) => n.field === 'system')).toBe(false);  // maker named
    expect(c.systemType).toBe('curtainwall');
    expect(c.cls).toBe('ext_cw');
  });

  it('R.O. columns → rough-opening mode; no count column → flagged', () => {
    const d = sheetPayloads([['Mark', 'R.O. Width', 'R.O. Height'], ['A', '48', '60']], 'ro.csv');
    expect(d.frames[0].sizeMode).toBe('ro');
    expect(d.frames[0].needs.some((n) => n.field === 'quantity')).toBe(true);
    expect(d.frames[0].needs.some((n) => n.field === 'size')).toBe(false);
  });

  it('returns null when there is no mark / width / height header', () => {
    expect(sheetPayloads([['foo', 'bar'], ['1', '2']], 'x.csv')).toBeNull();
  });

  it('reads a CSV file end to end', async () => {
    const csv = ROWS.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const file = new File([csv], 'Window Schedule.csv', { type: 'text/csv' });
    const d = await readScheduleFile(file);
    expect(d.kind).toBe('sheet');
    expect(d.report.frames).toBe(3);
  });
});

describe('window schedule — PDF through the engine', () => {
  afterEach(() => { delete window.electronAPI; });
  it('sends the PDF to the sidecar and tags the payloads', async () => {
    let sent = null;
    window.electronAPI = { readSchedule: async (p) => { sent = p; return { ok: true, data: { frames: [{ ...doc.frames[0], itemId: '5', mark: '5' }], nonFrames: [], doorTypes: [] } }; } };
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'A3.1 schedule.pdf', { type: 'application/pdf' });
    const d = await readScheduleFile(file, { projectName: 'Hope' });
    expect(sent.pdfBase64).toBe('JVBERg==');
    expect(sent.projectName).toBe('Hope');
    expect(d.frames[0].source).toBe('schedule');
    expect(d.frames[0].scheduleFile).toBe('A3.1 schedule.pdf');
  });
  it('says so when the desktop engine is not there', async () => {
    const file = new File([new Uint8Array([1])], 's.pdf', { type: 'application/pdf' });
    await expect(readScheduleFile(file)).rejects.toThrow(/desktop app/);
  });
});

describe('window schedule — merge with Studio by mark', () => {
  beforeEach(() => {
    localStorage.clear();
    useFrameTakeoffStore.setState({ projectName: null, takeoff: null, past: [], future: [] });
  });

  it('Studio first, then the schedule: merged, one-sided marks flagged', () => {
    const st = useFrameTakeoffStore.getState();
    st.open('Hope');
    st.receive(packet());
    const sched = { fileName: 'Window Schedule.xlsx', kind: 'sheet', ...sheetPayloads(ROWS, 'Window Schedule.xlsx') };
    const r = useFrameTakeoffStore.getState().receiveSchedule(sched);
    expect(r.merged).toBe(1);
    expect(r.scheduleOnly).toBe(2);
    const inc = useFrameTakeoffStore.getState().takeoff.incoming;
    const t5 = inc.frames.find((p) => p.itemId === 'FRAME TYPE 5');
    expect(t5.source).toBe('studio+schedule');
    expect(t5.overallWidth).toBe(90);                             // schedule size
    expect(t5.needs.some((n) => n.field === 'size' && /Schedule says/.test(n.reason))).toBe(true);
    expect(t5.quantity).toBe(2);                                  // no plan count on this one → schedule's, flagged
    expect(t5.needs.some((n) => n.field === 'quantity')).toBe(true);
    expect(inc.frames.find((p) => p.itemId === 'FRAME TYPE 9').needs.some((n) => n.field === 'schedule')).toBe(true);
    expect(inc.frames.find((p) => p.itemId === 'SF-99').needs.some((n) => /not found in the Studio takeoff/.test(n.reason))).toBe(true);
    useFrameTakeoffStore.getState().buildIncoming(['FRAME TYPE 5']);
    const f = useFrameTakeoffStore.getState().takeoff.frames.find((x) => x.importMeta?.itemId === 'FRAME TYPE 5');
    expect(f.size.width).toBe(90);
    expect(f.importMeta.source).toBe('studio+schedule');
    expect(solveFrame(f).warnings.length).toBe(0);
  });

  it('schedule first, then Studio: the same frame re-syncs (no duplicate)', () => {
    const st = useFrameTakeoffStore.getState();
    st.open('Hope');
    st.receiveSchedule({ fileName: 'Window Schedule.xlsx', kind: 'sheet', ...sheetPayloads(ROWS, 'Window Schedule.xlsx') });
    useFrameTakeoffStore.getState().buildIncoming(null);
    let tp = useFrameTakeoffStore.getState().takeoff;
    expect(tp.frames.length).toBe(3);
    const before = tp.frames.find((f) => f.importMeta?.itemId === 'Type 5');
    expect(before.columns.length).toBe(1);                        // schedule has no bays
    useFrameTakeoffStore.getState().receive(packet());
    const r = useFrameTakeoffStore.getState().buildIncoming(['FRAME TYPE 5']);
    expect(r.added).toBe(0);
    expect(r.updated).toBe(1);
    tp = useFrameTakeoffStore.getState().takeoff;
    const after = tp.frames.find((f) => f.id === before.id);
    expect(after.importMeta.itemId).toBe('FRAME TYPE 5');
    expect(after.columns.length).toBeGreaterThan(1);              // bays from the elevation
    expect(after.size.width).toBe(90);                            // size still the schedule's
  });
});
