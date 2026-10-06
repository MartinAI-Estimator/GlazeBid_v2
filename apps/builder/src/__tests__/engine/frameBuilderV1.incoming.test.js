/**
 * Studio → Frame Builder hand-off: a packet lands in Incoming, "Build" turns
 * payloads into frames (DLOs from the drawing, doors in their bays, job glass
 * types from the specs), a re-send updates untouched frames and keeps edits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { solveFrame } from '@glazebid/frame-engine/core';
import useFrameTakeoffStore, { mergeIncoming } from '../../components/FrameBuilderV1/useFrameTakeoffStore';

const doc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../packages/frame-engine/test/fixtures/hope_frames_spec.json'), 'utf8'));
const packet = (over = {}) => ({ schema: 'glazebid.frameHandoff/1', builderProject: 'Hope', studioProject: 'Hope', pdfName: 'Hope.pdf', mode: 'all', doc, ...over });

describe('Frame Builder Incoming', () => {
  beforeEach(() => {
    localStorage.clear();
    useFrameTakeoffStore.setState({ projectName: null, takeoff: null, past: [], future: [] });
  });

  it('files a packet for a project that is not open, ready for when it is', () => {
    const r = useFrameTakeoffStore.getState().receive(packet({ builderProject: 'Other' }));
    expect(r.target).toBe('Other');
    useFrameTakeoffStore.getState().open('Other');
    expect(useFrameTakeoffStore.getState().takeoff.incoming.frames.length).toBe(doc.frames.length);
  });

  it('builds every buildable frame, adds the spec glass types, drops the placeholder', () => {
    const st = useFrameTakeoffStore.getState();
    st.open('Hope');
    st.receive(packet());
    const r = useFrameTakeoffStore.getState().buildIncoming(null);
    const tp = useFrameTakeoffStore.getState().takeoff;
    const buildable = doc.frames.filter((p) => p.buildable !== false).length;
    expect(r.added).toBe(buildable);
    expect(r.glassTypes).toBe(2);
    expect(tp.frames.length).toBe(buildable);                     // SF-1 placeholder gone
    expect(tp.frames.every((f) => f.importMeta?.itemId)).toBe(true);
    const solvedClean = tp.frames.filter((f) => solveFrame(f).warnings.length === 0).length;
    expect(solvedClean).toBeGreaterThanOrEqual(buildable - 2);
    expect(tp.incoming.frames.every((p) => p.buildable === false)).toBe(true);   // only unsized ones left
    // the door named on the schedule sits in its bay
    const t8 = tp.frames.find((f) => f.mark === 'FRAME TYPE 8');
    expect(t8.columns.some((c) => c.kind === 'door' && c.door.mark === 'B101B')).toBe(true);
  });

  it('a re-send updates untouched frames and keeps edited values with "drawing now says"', () => {
    const st = useFrameTakeoffStore.getState();
    st.open('Hope'); st.receive(packet()); useFrameTakeoffStore.getState().buildIncoming(null);
    const tp = useFrameTakeoffStore.getState().takeoff;
    const a = tp.frames.find((f) => f.mark === 'A');
    const f = tp.frames.find((x) => x.mark === 'F');
    useFrameTakeoffStore.getState().updateFrame(a.id, (s) => ({ ...s, quantity: 4 }));     // estimator edit
    const moved = { ...doc, frames: doc.frames.map((p) => (p.mark === 'A' ? { ...p, quantity: 2 } : p.mark === 'F' ? { ...p, quantity: 11 } : p)) };
    useFrameTakeoffStore.getState().receive(packet({ doc: moved }));
    const r = useFrameTakeoffStore.getState().buildIncoming(['A', 'F']);
    expect(r.added).toBe(0);
    const after = useFrameTakeoffStore.getState().takeoff;
    expect(after.frames.find((x) => x.id === f.id).quantity).toBe(11);                    // untouched → updated
    const a2 = after.frames.find((x) => x.id === a.id);
    expect(a2.quantity).toBe(4);                                                            // edited → kept
    expect(a2.importMeta.drawingSays[0]).toMatchObject({ field: 'quantity', drawing: 2 });
    useFrameTakeoffStore.getState().acceptDrawing(a.id, 'quantity');
    expect(useFrameTakeoffStore.getState().takeoff.frames.find((x) => x.id === a.id).quantity).toBe(2);
  });

  it('"Open in Frame Builder" for one frame merges into what is waiting', () => {
    const prev = mergeIncoming(null, packet());
    const one = { ...packet({ mode: 'one' }), doc: { ...doc, frames: [{ ...doc.frames[0], quantity: 99 }] } };
    const merged = mergeIncoming(prev, one);
    expect(merged.frames.length).toBe(doc.frames.length);
    expect(merged.frames.find((p) => p.itemId === doc.frames[0].itemId).quantity).toBe(99);
    expect(merged.focus).toBe(doc.frames[0].itemId);
  });
});
