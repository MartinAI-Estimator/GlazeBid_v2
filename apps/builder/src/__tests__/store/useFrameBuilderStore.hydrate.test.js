/**
 * useFrameBuilderStore.hydrate.test.js — hydrateFrame / hydrateFrames
 * (window schedule import, Path C)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const AS1_PAYLOAD = {
  mark: 'AS1',
  systemType: 'storefront',
  frameSeries: '2x6 Thermally Broken Aluminum Storefront',
  manufacturer: 'Generic',
  finish: 'Dark Bronze Anodized',
  laborType: 'STANDARD',
  overallWidth: 118.0,
  overallHeight: 72.0,
  sillAFF: null,
  panelCount: 3,
  rowCount: 2,
  bayWidths: [40, 45, 27],
  rowHeights: null,
  primaryGlass: '1" Solarban 90 IGU',
  safetyFilm: true,
  specialtyGlass: null,
  brakemetal: false,
  squareCornerMullion: false,
  hasDoor: false,
  doorBays: [],
  notes: 'Sill at level',
  confidence: 0.9,
  flaggedFields: [],
};

// Captured before any test mutates the store — hydrateFrame can add glass
// specs, which must not leak between tests.
const INITIAL_GLASS_SPECS = useFrameBuilderStore.getState().glassSpecs;

function resetStore() {
  useFrameBuilderStore.setState({
    groups: [],
    frames: [],
    activeFrameId: null,
    glassSpecs: INITIAL_GLASS_SPECS,
  });
}

describe('hydrateFrame', () => {
  beforeEach(resetStore);

  it('creates a frame with mapped geometry', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    expect(res.ok).toBe(true);

    const frame = useFrameBuilderStore.getState().frames.find((f) => f.frameId === res.frameId);
    expect(frame.mark).toBe('AS1');
    expect(frame.widthInches).toBe(118);
    expect(frame.heightInches).toBe(72);
    expect(frame.bays).toBe(3);
    expect(frame.rows).toBe(2);
    expect(frame.systemClass).toBe('ext-storefront');
    expect(frame.laborType).toBe('STANDARD');
  });

  it('auto-creates a group per system type and reuses it', () => {
    const st = useFrameBuilderStore.getState();
    st.hydrateFrame(AS1_PAYLOAD);
    useFrameBuilderStore.getState().hydrateFrame({ ...AS1_PAYLOAD, mark: 'AS2' });

    const { groups, frames } = useFrameBuilderStore.getState();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Ext Storefront');
    expect(groups[0].finishType).toBe('dark-bronze');
    expect(frames.every((f) => f.groupId === groups[0].groupId)).toBe(true);
  });

  it('groups curtainwall separately with COMBINATION labor', () => {
    useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    const res = useFrameBuilderStore.getState().hydrateFrame({
      ...AS1_PAYLOAD, mark: 'CW-1', systemType: 'curtainwall',
    });

    const { groups, frames } = useFrameBuilderStore.getState();
    expect(groups).toHaveLength(2);
    expect(res.groupName).toBe('Ext Curtainwall');
    const cw = frames.find((f) => f.mark === 'CW-1');
    expect(cw.laborType).toBe('COMBINATION');
    expect(cw.systemClass).toBe('cap-curtainwall');
  });

  it('applies explicit bay widths as overrides', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    const frame = useFrameBuilderStore.getState().frames.find((f) => f.frameId === res.frameId);
    expect(frame.bayConfigs).toHaveLength(3);
    expect(frame.bayConfigs.map((b) => b.widthOverride)).toEqual([40, 45, 27]);
  });

  it('leaves bayConfigs empty for EQ bays (no widths given)', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame({
      ...AS1_PAYLOAD, bayWidths: null,
    });
    const frame = useFrameBuilderStore.getState().frames.find((f) => f.frameId === res.frameId);
    expect(frame.bayConfigs).toEqual([]);
    expect(res.warnings.some((w) => w.includes('equal'))).toBe(true);
  });

  it('flags missing rowHeights and sillAFF as needsInput — never silently skips', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    expect(res.needsInput).toContain('rowHeights');
    expect(res.needsInput).toContain('sillAFF');
  });

  it('marks door bays', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame({
      ...AS1_PAYLOAD, mark: 'AS3', hasDoor: true, doorBays: [1],
    });
    const frame = useFrameBuilderStore.getState().frames.find((f) => f.frameId === res.frameId);
    expect(frame.hasDoor).toBe(true);
    expect(frame.bayConfigs[1].type).toBe('door');
    expect(frame.bayConfigs[0].type).toBe('glazing');
  });

  it('creates a new glass spec when none matches', () => {
    const before = useFrameBuilderStore.getState().glassSpecs.length;
    useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    const { glassSpecs } = useFrameBuilderStore.getState();
    expect(glassSpecs.length).toBe(before + 1);
    expect(glassSpecs.some((g) => g.name === '1" Solarban 90 IGU')).toBe(true);
  });

  it('folds safety film / specialty flags into estimator notes', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame(AS1_PAYLOAD);
    const frame = useFrameBuilderStore.getState().frames.find((f) => f.frameId === res.frameId);
    expect(frame.estimatorNotes).toContain('Safety film');
    expect(frame.estimatorNotes).toContain('Sill at level');
  });

  it('rejects an empty payload', () => {
    const res = useFrameBuilderStore.getState().hydrateFrame(null);
    expect(res.ok).toBe(false);
  });
});

describe('hydrateFrames', () => {
  beforeEach(resetStore);

  it('hydrates a batch and selects the first frame', () => {
    const results = useFrameBuilderStore.getState().hydrateFrames([
      AS1_PAYLOAD,
      { ...AS1_PAYLOAD, mark: 'AS2' },
      { ...AS1_PAYLOAD, mark: 'HM13', systemType: 'hollow_metal_fire_rated' },
    ]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);

    const { frames, activeFrameId, groups } = useFrameBuilderStore.getState();
    expect(frames).toHaveLength(3);
    expect(activeFrameId).toBe(results[0].frameId);
    expect(groups.map((g) => g.name)).toContain('HM Fire-Rated');
  });
});
