/**
 * Frame Builder v1 ↔ Builder bridge: engine takeoff → bid cart payloads,
 * with hours from laborCalcEngine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTakeoff, createFrame, buildTakeoff } from '@glazebid/frame-engine/core';
import { laborDeps, toBidFrame, syncToBid, SOURCE } from '../../components/FrameBuilderV1/builderBridge';
import useBidStore from '../../store/useBidStore';

function demo() {
  const tp = createTakeoff({ name: 'Bridge test' });
  tp.frames = [
    createFrame({ mark: 'SF-1', quantity: 2, size: { mode: 'frame', width: 180, height: 120 },
      columns: [{ dlo: null }, { kind: 'door', dlo: 36 }, { dlo: null }], rows: [{ dlo: 24 }, { dlo: null }] }),
    createFrame({ mark: 'CW-1', frameSet: 'EX CW', systemId: 'kawneer-1600-75', size: { mode: 'frame', width: 240, height: 240 },
      columns: [{ dlo: null }, { dlo: null }, { dlo: null }], rows: [{ dlo: null }, { dlo: null }] }),
  ];
  return tp;
}

describe('Frame Builder v1 bridge', () => {
  beforeEach(() => { useBidStore.getState().clearBid(); });

  it('builds bid payloads with totals scaled by quantity', () => {
    const t = buildTakeoff(demo(), laborDeps());
    const p = toBidFrame(t.frames[0]);
    expect(p.source).toBe(SOURCE);
    expect(p.quantity).toBe(2);
    expect(p.systemType).toBe('Ext SF');
    expect(p.bom.glassLitesCount).toBe(t.frames[0].bom.totals.lites * 2);
    expect(p.bom.totalAluminumLF).toBeCloseTo(t.frames[0].bom.totals.metalLF * 2, 1);
    expect(p.inputs.frameSpec.mark).toBe('SF-1');
    expect(toBidFrame(t.frames[1]).systemType).toBe('Cap CW');
  });

  it('sync replaces earlier Frame Builder frames and keeps other sources', () => {
    useBidStore.getState().addFrame({ frameId: 'legacy-1', elevationTag: 'X', quantity: 1, inputs: {}, bom: { totalAluminumLF: 1, totalGlassSqFt: 1, glassLitesCount: 1 } });
    const t = buildTakeoff(demo(), laborDeps());
    syncToBid(t);
    syncToBid(t);
    const frames = useBidStore.getState().frames;
    expect(frames.filter((f) => f.source === SOURCE)).toHaveLength(2);
    expect(frames.find((f) => f.frameId === 'legacy-1')).toBeTruthy();
  });
});
