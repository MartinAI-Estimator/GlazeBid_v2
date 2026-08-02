/**
 * Project file v3 — round-trip tests (AUDIT 1.1/1.2)
 *
 * v3 payloads carry the whole project: frames, workspaceSystems, bidSettings,
 * and a localState snapshot of every project-scoped glazebid localStorage key.
 * Saving then loading must reproduce the project identically.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveProjectToCloud,
  loadProjectFromCloud,
  collectLocalState,
  applyLocalState,
} from '../../utils/syncProject';

const PROJ = 'V3 Test Project';

// The global test setup replaces window.localStorage with inert vi.fn() stubs.
// These tests exercise real storage iteration (length/key), so install a
// functional in-memory implementation for this file.
function makeRealStorage() {
  let store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: makeRealStorage(),
    writable: true,
    configurable: true,
  });
});

describe('collectLocalState / applyLocalState', () => {
  it('captures project-scoped and global keys, skips others', () => {
    localStorage.setItem(`glazebid:bidsheet:${PROJ}:frames:ext-sf-1:1`, '[{"id":"f1"}]');
    localStorage.setItem(`glazebid:bidSettings:${PROJ}`, '{"laborRate":50}');
    localStorage.setItem('glazebid:customSystemCards', '[]');
    localStorage.setItem('glazebid:bidsheet:OTHER PROJECT:frames', '[]'); // different project
    localStorage.setItem('glazebid:inbox', '[]');                          // excluded (transient)
    localStorage.setItem('unrelated-key', 'x');

    const snap = collectLocalState(PROJ);
    expect(Object.keys(snap).sort()).toEqual([
      `glazebid:bidSettings:${PROJ}`,
      `glazebid:bidsheet:${PROJ}:frames:ext-sf-1:1`,
      'glazebid:customSystemCards',
    ]);
  });

  it('applyLocalState restores captured entries verbatim', () => {
    localStorage.setItem(`glazebid:bidSettings:${PROJ}`, '{"laborRate":50}');
    const snap = collectLocalState(PROJ);
    localStorage.clear();
    const n = applyLocalState(snap);
    expect(n).toBe(1);
    expect(localStorage.getItem(`glazebid:bidSettings:${PROJ}`)).toBe('{"laborRate":50}');
  });

  it('never restores excluded transient keys even if present in a payload', () => {
    const n = applyLocalState({ 'glazebid:inbox': '[]', 'glazebid-bid-store': '{}' });
    expect(n).toBe(0);
    expect(localStorage.getItem('glazebid:inbox')).toBeNull();
  });
});

describe('v3 payload round-trip (dev-mode store)', () => {
  it('save → load reproduces frames, workspaceSystems, bidSettings, localState', async () => {
    localStorage.setItem(`glazebid:bidsheet:${PROJ}:hrrates`, '{"joints":0.3}');

    const frames = [{
      frameId: 'frame_1', elevationTag: 'A1', systemType: 'Cap CW', quantity: 2,
      inputs: { width: 120, height: 96 },
      bom: { shopHours: 10, distHours: 2, fieldHours: 20, totalAluminumLF: 80,
             totalGlassSqFt: 160, glassLitesCount: 8, cutList: [] },
    }];
    const workspaceSystems = [{
      id: 'sys-1', type: 'partnerpak-import', systemType: 'Cap CW',
      name: 'Captured Curtain Wall 1', frames: [{ id: 'wf1', quantity: 3 }],
      materials: [], laborTasks: [], totals: {},
    }];
    const bidSettings = { laborRate: 48, markupPercent: 38, taxPercent: 8.2, crewSize: 3 };

    await saveProjectToCloud({
      projectName: PROJ, adminSettings: null,
      frames, workspaceSystems, bidSettings,
      vendorQuotes: [], financials: {}, summary: {},
    });

    const payload = await loadProjectFromCloud(PROJ);
    expect(payload.version).toBe('3.0');
    expect(payload.takeoff.frames).toHaveLength(1);
    expect(payload.takeoff.frames[0].systemType).toBe('Cap CW');
    expect(payload.takeoff.frames[0].bom.distHours).toBe(2);       // engine hours survive
    expect(payload.workspaceSystems).toEqual(workspaceSystems);     // canonical model survives
    expect(payload.bidSettings).toEqual(bidSettings);
    expect(payload.localState[`glazebid:bidsheet:${PROJ}:hrrates`]).toBe('{"joints":0.3}');
  });

  it('a v2 payload (no v3 sections) loads without error — migration tolerance', async () => {
    // simulate a legacy save (no workspaceSystems/bidSettings args)
    await saveProjectToCloud({ projectName: 'Legacy', frames: [] });
    const payload = await loadProjectFromCloud('Legacy');
    // v3 reader contract: missing sections are optional
    expect(payload.workspaceSystems ?? null).not.toBeUndefined();
    expect(payload.bidSettings ?? null).toBeNull();
  });
});
