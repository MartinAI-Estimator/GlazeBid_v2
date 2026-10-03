/**
 * parametricFrameMath.parity.test.jsx — Builder UI ⇄ engine, EXACT parity.
 *
 * Since Gap 8 the Parametric Frame Builder computes nothing itself: its save
 * is buildFramePayload(frameSpec).  So a frame typed into the UI must equal,
 * field for field, the payload the engine builds from the same spec.  If
 * anyone reintroduces inline math in the component, this fails.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ParametricFrameBuilder from '../../components/BidSheet/ParametricFrameBuilder';
import useBidStore from '../../store/useBidStore';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import { buildFramePayload } from '../../engine/parametricFrameMath';

function setNumber(labelText, value) {
  const label = screen.getByText(labelText);
  const input = label.closest('div').parentElement.querySelector('input[type="number"]');
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input, { target: { value: String(value) } });
}

const save = () => fireEvent.click(screen.getAllByRole('button').find(b => /save frame to bid|update frame/i.test(b.textContent)));

describe('Builder UI save === engine payload', () => {
  beforeEach(() => useBidStore.setState({ frames: [] }));

  it.each([
    [120, 96, 3, 2],
    [48, 84, 1, 1],
    [200, 144, 4, 3],
  ])('%s" × %s", %s bays × %s rows', (W, H, B, R) => {
    render(<ParametricFrameBuilder initialWidth={W} initialHeight={H} compact />);
    setNumber('Number of Bays', B);
    setNumber('Number of Rows', R);
    save();

    const ui = useBidStore.getState().frames[0];
    const eng = buildFramePayload(
      {
        widthInches: W, heightInches: H, systemType: 'Ext SF', bays: B, rows: R, quantity: 1,
        elevationTag: 'Elev-A', glassType: 'GL-1 (1" Low-E)',
        geometryOverride: { sightline: 2, hSightline: 2, bite: 0.375, hBite: 0.375 },
        headSightline: 2, sillSightline: 2,
        door: { type: 'none', bay: 1 },
        shape: { mode: 'rectangular', leftHeight: H, rightHeight: H },
        bayHorizontals: {}, sillStepUps: {},
      },
      { frameId: ui.frameId, elevationTag: 'Elev-A', source: 'builder', systemLabel: 'Storefront 2×4.5', preset: '__default__', isOverride: false },
      useProductionRatesStore.getState(),
    );
    expect(ui).toEqual(eng);
    expect(ui.systemType).toBe('Ext SF');                          // canonical, not the free-text label
    expect(ui.inputs.systemLabel).toBe('Storefront 2×4.5');
    expect(ui.bom.cutList[0]).toMatchObject({ part: 'Jamb', qtyPerFrame: 2 });
    expect(ui.bom.totalLaborHours).toBeGreaterThan(0);
  });

  it('door frame saved from the UI: sill removed in the door bay, header + transom present', () => {
    render(<ParametricFrameBuilder initialWidth={120} initialHeight={120} compact />);
    setNumber('Number of Bays', 3);
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'single' } });
    const bayInput = screen.getByText('Door Location (Bay #)').parentElement.querySelector('input');
    fireEvent.change(bayInput, { target: { value: '2' } });
    fireEvent.blur(bayInput, { target: { value: '2' } });
    save();

    const f = useBidStore.getState().frames[0];
    const byRole = Object.fromEntries(f.bom.rfq.metal.map(m => [m.role, m.qtyPerFrame]));
    expect(byRole).toEqual({ jamb: 2, intermediate_vertical: 2, head: 3, sill: 2, door_header: 1 });
    expect(f.bom.rfq.glass.map(l => [l.liteType, l.qtyPerFrame, l.heightInches])).toEqual([
      ['vision', 2, 116.5],
      ['transom', 1, 32.5],
    ]);
    expect(f.inputs.door).toEqual({ type: 'single', bay: 2 });
    // moving the door from bay 1 → 2 must not leave a phantom horizontal in bay 1
    expect(f.inputs.bayHorizontals[0]).toBeUndefined();
    expect(f.bom.rfq.doors[0]).toMatchObject({ type: 'single', bay: 2, openingHeightInches: 84 });
  });

  it('removing the door restores its bay (no leftover 84" horizontal)', () => {
    render(<ParametricFrameBuilder initialWidth={120} initialHeight={120} compact />);
    setNumber('Number of Bays', 3);
    const doorSelect = screen.getByDisplayValue('None');
    fireEvent.change(doorSelect, { target: { value: 'single' } });
    fireEvent.change(doorSelect, { target: { value: 'none' } });
    save();
    const f = useBidStore.getState().frames[0];
    expect(f.inputs.bayHorizontals).toEqual({});
    expect(f.bom.rfq.metal.map(m => m.role)).not.toContain('intermediate_horizontal');
    expect(f.bom.rfq.glass).toHaveLength(1);
  });
});
