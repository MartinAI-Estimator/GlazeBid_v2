/**
 * builderHandshake.test.jsx — an AI frame from the Studio inbox opens in the
 * Parametric Frame Builder with its exact size / grid / system, can be edited
 * (grid, door, raked head), and Save updates THAT frame in the bid.
 *
 *   StudioInbox → useBidStore → Bid Summary "Frames" → FrameEditorView
 *     → ParametricFrameBuilder(initialFrame) → Save → updateFrame(frameId)
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ParametricFrameBuilder from '../../components/BidSheet/ParametricFrameBuilder';
import FrameEditorView from '../../components/BidSheet/FrameEditorView';
import ParametricFramesSection from '../../components/BidCart/ParametricFramesSection';
import useBidStore from '../../store/useBidStore';
import { groupTakeoffs, framePayloadForGroup } from '../../components/StudioInbox';

const aiTakeoff = (over = {}) => ({
  id: `t-${Math.random()}`, type: 'Area', widthInches: 120, heightInches: 96,
  label: 'SF-1 — Cap CW', systemType: 'Cap CW', bayCount: 3, rowCount: 2,
  gridSource: 'geometry', mark: 'SF-1', confidence: 0.88, source: 'boxsnap', ...over,
});

/** The frame exactly as "+ Add to Bid" in StudioInbox would store it. */
function addAiFrameToBid() {
  const [g] = groupTakeoffs([aiTakeoff(), aiTakeoff()]);
  const frame = framePayloadForGroup(g);
  useBidStore.getState().addFrame(frame);
  return frame;
}

const numberInputFor = (labelText) =>
  screen.getByText(labelText).closest('div').parentElement.querySelector('input[type="number"]');
const textInputFor = (labelText) =>
  screen.getByText(labelText).closest('div').parentElement.querySelector('input[type="text"]');
const setNumber = (labelText, value) => {
  const input = numberInputFor(labelText);
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input, { target: { value: String(value) } });
};
const clickSave = () => fireEvent.click(screen.getAllByRole('button').find(b => /update frame in bid|save frame to bid/i.test(b.textContent)));

describe('AI frame → Builder → Save (edit in place)', () => {
  beforeEach(() => useBidStore.setState({ frames: [] }));

  it('opens with exact width, height, bays, rows, quantity, tag and system', () => {
    const frame = addAiFrameToBid();
    render(<ParametricFrameBuilder initialFrame={frame} compact />);

    expect(textInputFor('Overall Width').value).toBe('120');
    expect(numberInputFor('Number of Bays').value).toBe('3');
    expect(numberInputFor('Number of Rows').value).toBe('2');
    expect(numberInputFor('Quantity').value).toBe('2');
    expect(screen.getByDisplayValue('SF-1')).toBeTruthy();                  // elevation tag
    expect(screen.getAllByText(/Captured Curtain Wall/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /update frame in bid/i })).toBeTruthy();
  });

  it('saving without changes updates the same frame and reproduces its BOM', () => {
    const frame = addAiFrameToBid();
    render(<ParametricFrameBuilder initialFrame={frame} compact />);
    clickSave();

    const frames = useBidStore.getState().frames;
    expect(frames).toHaveLength(1);                                          // replaced, not duplicated
    const saved = frames[0];
    expect(saved.frameId).toBe(frame.frameId);
    expect(saved.systemType).toBe('Cap CW');
    expect(saved.quantity).toBe(2);
    expect(saved.source).toBe('studio');
    expect(saved.ai).toEqual(frame.ai);                                      // AI provenance kept
    expect(saved.takeoffIds).toEqual(frame.takeoffIds);
    expect(saved.inputs).toEqual(frame.inputs);
    expect(saved.bom.rfq).toEqual(frame.bom.rfq);
  });

  it('estimator edits: 4 bays + single door in bay 2 → die-level BOM updates in place', () => {
    const frame = addAiFrameToBid();
    render(<ParametricFrameBuilder initialFrame={frame} compact />);
    setNumber('Number of Bays', 4);
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'single' } });
    const bayInput = screen.getByText('Door Location (Bay #)').parentElement.querySelector('input');
    fireEvent.change(bayInput, { target: { value: '2' } });
    fireEvent.blur(bayInput, { target: { value: '2' } });
    clickSave();

    const frames = useBidStore.getState().frames;
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.frameId).toBe(frame.frameId);
    expect(f.inputs).toMatchObject({ bays: 4, rows: 2, door: { type: 'single', bay: 2 } });
    const qtyByRole = {};
    for (const m of f.bom.rfq.metal) qtyByRole[m.role] = (qtyByRole[m.role] ?? 0) + m.qtyPerFrame;
    expect(qtyByRole).toMatchObject({ jamb: 2, intermediate_vertical: 3, head: 4, sill: 3, door_header: 1 });
    expect(qtyByRole.intermediate_horizontal).toBe(3);                       // 3 non-door bays × 1 line
    expect(f.bom.rfq.glass.some(l => l.liteType === 'transom')).toBe(true);
    expect(f.bom.rfq.doors[0]).toMatchObject({ type: 'single', bay: 2, qty: 2 });   // ×2 frames
  });

  it('raked head edit round-trips back into the Builder', () => {
    const frame = addAiFrameToBid();
    const { unmount } = render(<ParametricFrameBuilder initialFrame={frame} compact />);
    fireEvent.click(screen.getByText(/raked/i, { selector: 'button, button *' }));
    // leg inputs are ArchDimInputs (text) labelled Left / Right
    const legs = screen.getAllByRole('textbox').filter(el => el.closest('div')?.textContent?.match(/left|right/i));
    expect(legs.length).toBeGreaterThanOrEqual(2);
    fireEvent.focus(legs[1]); fireEvent.change(legs[1], { target: { value: '110' } }); fireEvent.blur(legs[1], { target: { value: '110' } });
    clickSave();

    const saved = useBidStore.getState().frames[0];
    expect(saved.inputs.shapeMode).toBe('raked_head');
    expect(saved.bom.rfq.glass.some(l => l.shape === 'raked')).toBe(true);
    unmount();

    // reopen the saved frame: the raked state comes back
    render(<ParametricFrameBuilder initialFrame={saved} compact />);
    clickSave();
    const again = useBidStore.getState().frames[0];
    expect(again.inputs).toEqual(saved.inputs);
    expect(again.bom.rfq).toEqual(saved.bom.rfq);
  });

  it('a brand-new frame (no initialFrame) is still added, not updated', () => {
    addAiFrameToBid();
    render(<ParametricFrameBuilder initialWidth={60} initialHeight={84} compact />);
    clickSave();
    expect(useBidStore.getState().frames).toHaveLength(2);
  });
});

describe('Bid Summary → Frame Builder navigation', () => {
  beforeEach(() => useBidStore.setState({ frames: [] }));

  it('lists AI frames and "Open in Frame Builder" hands back the frameId', () => {
    const frame = addAiFrameToBid();
    const onEdit = vi.fn();
    render(<ParametricFramesSection onEditFrame={onEdit} />);
    const row = screen.getByTestId(`frame-row-${frame.frameId}`);
    expect(within(row).getByText('SF-1')).toBeTruthy();
    expect(within(row).getByText('Cap CW')).toBeTruthy();
    expect(within(row).getByText('3×2')).toBeTruthy();
    expect(within(row).getByText('AI / Studio')).toBeTruthy();
    fireEvent.click(screen.getByTestId(`open-frame-${frame.frameId}`));
    expect(onEdit).toHaveBeenCalledWith(frame.frameId);
  });

  it('FrameEditorView mounts the Builder on that frame and Save updates it', () => {
    const frame = addAiFrameToBid();
    const onBack = vi.fn();
    render(<FrameEditorView frameId={frame.frameId} onBack={onBack} />);
    expect(screen.getByText(/AI baseline/)).toBeTruthy();
    expect(numberInputFor('Number of Bays').value).toBe('3');
    setNumber('Number of Rows', 3);
    clickSave();
    const frames = useBidStore.getState().frames;
    expect(frames).toHaveLength(1);
    expect(frames[0].inputs.rows).toBe(3);
    fireEvent.click(screen.getByText(/Back to Bid Summary/));
    expect(onBack).toHaveBeenCalled();
  });

  it('missing frame shows a message instead of crashing', () => {
    render(<FrameEditorView frameId="nope" onBack={() => {}} />);
    expect(screen.getByText(/no longer in the bid/)).toBeTruthy();
  });
});
