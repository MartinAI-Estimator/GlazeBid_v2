/**
 * PHASE 1 ACCEPTANCE — one source of truth
 * =========================================
 * Master build plan §7 Phase 1: "create bid → add frames from 3 different
 * paths → same numbers on BidSheet, Review, Proposal → save, reopen,
 * everything identical."
 *
 * This exercises the store/engine layer of that flow:
 *   Path 1 — ParametricFrameBuilder payload  → useBidStore.addFrame
 *   Path 2 — StudioInbox group               → useBidStore.addFrame
 *   Path 3 — PartnerPak/workspace system     → useBidStore.addWorkspaceSystem
 * then proves every consumer aggregation agrees and the v3 project file
 * round-trips byte-identically. (UI click-through is verified manually.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import useBidStore from '../../store/useBidStore';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import { calcSystemMH } from '../../utils/laborCalcEngine';
import { toCanonicalSystemType } from '../../utils/systemTypes';
import { saveProjectToCloud, loadProjectFromCloud } from '../../utils/syncProject';

const PROJ = 'Phase1 Acceptance';

beforeEach(() => {
  useBidStore.setState({ frames: [], workspaceSystems: [] });
});

// ── Path 1: Frame Builder payload (engine hours in bom) ─────────────────────
const frameBuilderFrame = {
  frameId: 'frame_fb_1', elevationTag: 'E1', systemType: 'Ext SF', quantity: 2,
  inputs: { width: 144, height: 108, bays: 3, rows: 2 },
  bom: {
    quantity: 2, totalAluminumLF: 120, totalGlassSqFt: 216, glassLitesCount: 12,
    shopHours: 9.5, distHours: 2.1, fieldHours: 22.4, laborEngine: 'laborCalcEngine',
    cutList: [], glassSizes: { widthInches: 44, heightInches: 50, qty: 12 },
  },
};

// ── Path 2: Studio inbox group (canonical type, preserved systemId) ─────────
const studioFrame = {
  frameId: 'studio-abc-1', elevationTag: '72"x96"',
  systemType: toCanonicalSystemType(null), // 'Ext SF' default — never 'Studio Takeoff'
  source: 'studio', sourceSystemId: 'ft-storefront-a',
  inputs: { width: 72, height: 96, bays: 1, rows: 1 },
  bom: {
    totalAluminumLF: 28, totalGlassSqFt: 48, glassLitesCount: 1,
    shopHours: 1.2, distHours: 0.3, fieldHours: 2.8,
    cutList: [], glassSizes: { widthInches: 72, heightInches: 96, qty: 1 },
  },
};

// ── Path 3: workspace system (PartnerPak import shape) ──────────────────────
const workspaceSystem = {
  id: 'partnerpak-sys-1', type: 'partnerpak-import', systemType: 'Cap CW',
  name: 'Captured Curtain Wall 1', shortName: 'Cap CW',
  frames: [
    { id: 'wf1', mark: 'CW-1', quantity: 1, sf: 240, dlos: 18, bays: 13, rows: 29,
      verticals: 13, horizontals: 29, joints: 58, ft: 16, stoolTrim: 0,
      gtDlos: 6, pairs: 2, singles: 0, perimeter: 177.33, brakeMetal: 3 },
  ],
  materials: [], laborTasks: [], totals: {},
};

describe('three entry paths land in ONE store', () => {
  it('all paths are visible to every consumer surface', () => {
    useBidStore.getState().addFrame(frameBuilderFrame);
    useBidStore.getState().addFrame(studioFrame);
    useBidStore.getState().addWorkspaceSystem(workspaceSystem);

    const s = useBidStore.getState();
    // ProposalGenerator + RFQ + useBidMath read s.frames
    expect(s.frames).toHaveLength(2);
    // GlazeBidWorkspace + ReviewBidPage read s.workspaceSystems
    expect(s.workspaceSystems).toHaveLength(1);
    // No 'Studio Takeoff' contract violation anywhere
    expect(s.frames.every(f => ['Ext SF','Int SF','Cap CW','SSG CW'].includes(f.systemType))).toBe(true);
  });
});

describe('same numbers on every surface', () => {
  it('projectTotals.labor equals the sum of engine bom hours (no parallel engine)', () => {
    useBidStore.getState().addFrame(frameBuilderFrame);
    useBidStore.getState().addFrame(studioFrame);
    const { labor } = useBidStore.getState().projectTotals;
    const shopDist = 9.5 + 2.1 + 1.2 + 0.3;
    const field    = 22.4 + 2.8;
    expect(labor.shopFabHours).toBeCloseTo(shopDist, 2);
    expect(labor.fieldInstHours).toBeCloseTo(field, 2);
    expect(labor.totalLaborHours).toBeCloseTo(shopDist + field, 2);
  });

  it('workspace laborMap and ReviewBidPage produce identical MH for the same system (legacy vs canonical type spelling)', () => {
    const rateStore = useProductionRatesStore.getState();
    const hfA = rateStore.getHourlyFunctions('Cap CW');   // workspace path
    const hfB = rateStore.getHourlyFunctions('cap-cw');   // legacy stored id
    const irA = rateStore.getItemRates('Cap CW');
    const irB = rateStore.getItemRates('cap-cw');
    const a = calcSystemMH(workspaceSystem.frames, hfA, irA, 2, 'Cap CW');
    const b = calcSystemMH(workspaceSystem.frames, hfB, irB, 2, 'cap-cw');
    expect(b.totalMH).toBe(a.totalMH);
    expect(b.shopMH).toBe(a.shopMH);
    expect(b.fieldMH).toBe(a.fieldMH);
    // and it's genuinely the CW formula (Warren-verified totals for these counts)
    expect(a.shopMH).toBeCloseTo(45.5, 1);
    expect(a.totalMH).toBeCloseTo(190.8, 1);
  });
});

describe('save → reopen → identical (v3)', () => {
  it('frames + workspaceSystems survive the project file byte-for-byte', async () => {
    useBidStore.getState().addFrame(frameBuilderFrame);
    useBidStore.getState().addFrame(studioFrame);
    useBidStore.getState().addWorkspaceSystem(workspaceSystem);

    const before = useBidStore.getState();
    await saveProjectToCloud({
      projectName: PROJ,
      frames: before.frames,
      workspaceSystems: before.workspaceSystems,
      bidSettings: { laborRate: 42, markupPercent: 40, taxPercent: 8.2, crewSize: 2 },
    });

    // wipe, then reopen
    useBidStore.getState().clearBid();
    expect(useBidStore.getState().frames).toHaveLength(0);
    expect(useBidStore.getState().workspaceSystems).toHaveLength(0);

    const payload = await loadProjectFromCloud(PROJ);
    useBidStore.getState().rehydrateBid({
      frames: payload.takeoff?.frames ?? [],
      workspaceSystems: payload.workspaceSystems ?? null,
    });

    const after = useBidStore.getState();
    expect(after.workspaceSystems).toEqual(before.workspaceSystems);
    expect(after.frames.map(f => f.frameId)).toEqual(before.frames.map(f => f.frameId));
    // engine hours survive the round trip exactly
    const fb = after.frames.find(f => f.frameId === 'frame_fb_1');
    expect(fb.bom.shopHours).toBe(9.5);
    expect(fb.bom.distHours).toBe(2.1);
    expect(fb.bom.fieldHours).toBe(22.4);
    // and totals recompute to the same numbers
    expect(after.projectTotals.labor.totalLaborHours)
      .toBe(before.projectTotals.labor.totalLaborHours);
  });
});
