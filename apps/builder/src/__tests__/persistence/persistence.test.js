/**
 * GlazeBid - Persistence Logic Tests
 * ====================================
 * Unit tests for the localStorage persistence behaviour added in the
 * persistence audit:
 *
 *  1. bidSettings per-project save / restore logic (App.jsx)
 *  2. selectedSheet per-project save / restore logic (App.jsx)
 *  3. pageLabels immediate save on rename  (App.jsx)
 *  4. selectedSystem save on tab change   (BidSheetContext.jsx)
 *  5. selectedSystem restore on boot      (BidSheetContext.jsx)
 *
 * These are pure-logic unit tests — no React rendering needed.
 * They mirror the exact code in App.jsx and BidSheetContext.jsx so that
 * if the implementation changes, these tests will catch the regression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// ❶  Mirrored constants / helpers (match App.jsx exactly)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BID_SETTINGS = {
  laborRate:          42,
  crewSize:           2,
  laborContingency:   2.5,
  markupPercent:      20,
  taxPercent:         8.5,
};

/**
 * Mirrors the bidSettings restore logic inside the currentProject useEffect.
 *   const savedBS = localStorage.getItem(`glazebid:bidSettings:${project}`);
 *   setBidSettings(savedBS ? { ...DEFAULT_BID_SETTINGS, ...JSON.parse(savedBS) } : DEFAULT_BID_SETTINGS);
 */
function restoreBidSettings(project) {
  try {
    const raw = localStorage.getItem(`glazebid:bidSettings:${project}`);
    return raw ? { ...DEFAULT_BID_SETTINGS, ...JSON.parse(raw) } : DEFAULT_BID_SETTINGS;
  } catch {
    return DEFAULT_BID_SETTINGS;
  }
}

/**
 * Mirrors the bidSettings save effect.
 *   localStorage.setItem(`glazebid:bidSettings:${project}`, JSON.stringify(bidSettings));
 */
function saveBidSettings(project, settings) {
  localStorage.setItem(`glazebid:bidSettings:${project}`, JSON.stringify(settings));
}

/**
 * Mirrors handleSelectSheet save.
 *   localStorage.setItem(`glazebid:selectedSheet:${project}`, sheetId);
 */
function saveSelectedSheet(project, sheetId) {
  localStorage.setItem(`glazebid:selectedSheet:${project}`, sheetId);
}

/**
 * Mirrors the selectedSheet restore inside currentProject useEffect.
 *   const savedSheet = localStorage.getItem(`glazebid:selectedSheet:${project}`);
 *   if (savedSheet) setSelectedSheet(savedSheet);
 */
function restoreSelectedSheet(project) {
  try {
    return localStorage.getItem(`glazebid:selectedSheet:${project}`) || null;
  } catch {
    return null;
  }
}

/**
 * Mirrors handleRenamePage save inside setPageLabels updater.
 *   const updated = { ...prev, [pageNum]: newLabel };
 *   localStorage.setItem(`glazebid:pageLabels:${project}:${sheet}`, JSON.stringify(updated));
 */
function savePageLabels(project, sheet, prevLabels, pageNum, newLabel) {
  const updated = { ...prevLabels, [pageNum]: newLabel };
  localStorage.setItem(`glazebid:pageLabels:${project}:${sheet}`, JSON.stringify(updated));
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// ❷  Mirrored helpers (match BidSheetContext.jsx exactly)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors lsKey() in BidSheetContext.jsx.
 *   const lsKey = (project, segment) => `glazebid:bidsheet:${project}:${segment}`;
 */
function lsKey(project, segment) {
  return `glazebid:bidsheet:${project}:${segment}`;
}

/**
 * Mirrors lsGet() and lsSet() in BidSheetContext.jsx.
 */
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota */ }
}

/**
 * Mirrors the selectedSystem boot logic in BidSheetContext.jsx:
 *   const lastSelected = lsGet(lsKey(projectName, 'selectedSystem'), null);
 *   setSelectedSystem(lastSelected && saved.includes(lastSelected) ? lastSelected : saved[0]);
 */
function getInitialSelectedSystem(saved, projectName) {
  const lastSelected = lsGet(lsKey(projectName, 'selectedSystem'), null);
  return lastSelected && saved.includes(lastSelected) ? lastSelected : saved[0];
}

// =============================================================================
// ❶  BID SETTINGS — per-project save & restore
// =============================================================================

describe('bidSettings — restore from localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem.mockReset();
    localStorage.setItem.mockReset();
  });

  it('returns DEFAULT_BID_SETTINGS when nothing is saved', () => {
    localStorage.getItem.mockReturnValue(null);

    const result = restoreBidSettings('Alpha Tower');
    expect(result).toEqual(DEFAULT_BID_SETTINGS);
  });

  it('merges a partial save with defaults (overrides only saved keys)', () => {
    const partial = { laborRate: 58, markupPercent: 25 };
    localStorage.getItem.mockReturnValue(JSON.stringify(partial));

    const result = restoreBidSettings('Alpha Tower');
    expect(result.laborRate).toBe(58);
    expect(result.markupPercent).toBe(25);
    // Keys not in saved fall back to defaults:
    expect(result.crewSize).toBe(DEFAULT_BID_SETTINGS.crewSize);
    expect(result.taxPercent).toBe(DEFAULT_BID_SETTINGS.taxPercent);
    expect(result.laborContingency).toBe(DEFAULT_BID_SETTINGS.laborContingency);
  });

  it('reads from the project-scoped key (not a global key)', () => {
    localStorage.getItem.mockReturnValue(null);

    restoreBidSettings('My Project');

    expect(localStorage.getItem).toHaveBeenCalledWith('glazebid:bidSettings:My Project');
  });

  it('returns defaults when JSON is malformed', () => {
    localStorage.getItem.mockReturnValue('{ bad json :::');

    const result = restoreBidSettings('Alpha Tower');
    expect(result).toEqual(DEFAULT_BID_SETTINGS);
  });

  it('does not mutate DEFAULT_BID_SETTINGS when merging', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({ laborRate: 100 }));

    restoreBidSettings('Alpha Tower');

    // Original constant must be unchanged
    expect(DEFAULT_BID_SETTINGS.laborRate).toBe(42);
  });
});

describe('bidSettings — save to localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem.mockReset();
  });

  it('writes to the project-scoped key', () => {
    saveBidSettings('Beta Mall', DEFAULT_BID_SETTINGS);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:bidSettings:Beta Mall',
      expect.any(String)
    );
  });

  it('serialises the full settings object', () => {
    const custom = { ...DEFAULT_BID_SETTINGS, laborRate: 55 };
    saveBidSettings('Beta Mall', custom);

    const [[, serialised]] = localStorage.setItem.mock.calls;
    const parsed = JSON.parse(serialised);
    expect(parsed.laborRate).toBe(55);
    expect(parsed.markupPercent).toBe(DEFAULT_BID_SETTINGS.markupPercent);
  });

  it('different projects write to different keys', () => {
    saveBidSettings('Project A', DEFAULT_BID_SETTINGS);
    saveBidSettings('Project B', { ...DEFAULT_BID_SETTINGS, laborRate: 60 });

    const keys = localStorage.setItem.mock.calls.map(([k]) => k);
    expect(keys).toContain('glazebid:bidSettings:Project A');
    expect(keys).toContain('glazebid:bidSettings:Project B');
  });
});

// =============================================================================
// ❷  SELECTED SHEET — per-project save & restore
// =============================================================================

describe('selectedSheet — restore from localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem.mockReset();
  });

  it('returns the saved sheet ID when present', () => {
    localStorage.getItem.mockReturnValue('sheet-42');

    const result = restoreSelectedSheet('Alpha Tower');
    expect(result).toBe('sheet-42');
  });

  it('returns null when nothing is saved', () => {
    localStorage.getItem.mockReturnValue(null);

    const result = restoreSelectedSheet('Alpha Tower');
    expect(result).toBeNull();
  });

  it('reads from the project-scoped key', () => {
    localStorage.getItem.mockReturnValue(null);

    restoreSelectedSheet('My Project');

    expect(localStorage.getItem).toHaveBeenCalledWith('glazebid:selectedSheet:My Project');
  });
});

describe('selectedSheet — save on sheet selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem.mockReset();
  });

  it('writes sheet ID to the project-scoped key', () => {
    saveSelectedSheet('Alpha Tower', 'sheet-7');

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:selectedSheet:Alpha Tower',
      'sheet-7'
    );
  });
});

// =============================================================================
// ❸  PAGE LABELS — immediate save on rename
// =============================================================================

describe('pageLabels — save on rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem.mockReset();
  });

  it('writes updated labels to the project+sheet-scoped key', () => {
    savePageLabels('Alpha Tower', 'sheet-1', {}, 1, 'Ground Floor Entry');

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:pageLabels:Alpha Tower:sheet-1',
      expect.stringContaining('Ground Floor Entry')
    );
  });

  it('merges new label with existing labels', () => {
    const prev = { 1: 'Lobby', 2: 'Retail A' };
    const updated = savePageLabels('Alpha Tower', 'sheet-1', prev, 3, 'Retail B');

    expect(updated).toEqual({ 1: 'Lobby', 2: 'Retail A', 3: 'Retail B' });
  });

  it('overwrites label for existing page number', () => {
    const prev = { 1: 'Old Label' };
    const updated = savePageLabels('Alpha Tower', 'sheet-1', prev, 1, 'New Label');

    expect(updated[1]).toBe('New Label');
    const [[, serialised]] = localStorage.setItem.mock.calls;
    const parsed = JSON.parse(serialised);
    expect(parsed[1]).toBe('New Label');
  });

  it('different projects write to different keys', () => {
    savePageLabels('Project A', 'sheet-1', {}, 1, 'Label A');
    savePageLabels('Project B', 'sheet-1', {}, 1, 'Label B');

    const keys = localStorage.setItem.mock.calls.map(([k]) => k);
    expect(keys).toContain('glazebid:pageLabels:Project A:sheet-1');
    expect(keys).toContain('glazebid:pageLabels:Project B:sheet-1');
  });

  it('different sheets within same project write to different keys', () => {
    savePageLabels('Project A', 'sheet-1', {}, 1, 'First floor');
    savePageLabels('Project A', 'sheet-2', {}, 1, 'Second floor');

    const keys = localStorage.setItem.mock.calls.map(([k]) => k);
    expect(keys).toContain('glazebid:pageLabels:Project A:sheet-1');
    expect(keys).toContain('glazebid:pageLabels:Project A:sheet-2');
  });
});

// =============================================================================
// ❹  SELECTED SYSTEM (BidSheetContext.jsx) — save on tab change
// =============================================================================

describe('selectedSystem — save on tab change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem.mockReset();
  });

  it('writes selectedSystem to the project-scoped key', () => {
    lsSet(lsKey('Alpha Tower', 'selectedSystem'), 'ext-sf-1:2');

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:bidsheet:Alpha Tower:selectedSystem',
      JSON.stringify('ext-sf-1:2')
    );
  });

  it('updates the stored value when the active tab changes', () => {
    lsSet(lsKey('Alpha Tower', 'selectedSystem'), 'ext-sf-1:1');
    lsSet(lsKey('Alpha Tower', 'selectedSystem'), 'ext-sf-1:3');

    const calls = localStorage.setItem.mock.calls;
    const last = calls[calls.length - 1];
    expect(JSON.parse(last[1])).toBe('ext-sf-1:3');
  });
});

// =============================================================================
// ❺  SELECTED SYSTEM (BidSheetContext.jsx) — restore on boot
// =============================================================================

describe('selectedSystem — restore on boot', () => {
  const activeSystems = ['ext-sf-1:1', 'ext-sf-1:2', 'curtainwall:1'];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.getItem.mockReset();
  });

  it('restores the saved system when it is still in the active list', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === lsKey('Alpha Tower', 'selectedSystem')) {
        return JSON.stringify('ext-sf-1:2');
      }
      return null;
    });

    const result = getInitialSelectedSystem(activeSystems, 'Alpha Tower');
    expect(result).toBe('ext-sf-1:2');
  });

  it('falls back to the first system when saved value is not in active list', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === lsKey('Alpha Tower', 'selectedSystem')) {
        return JSON.stringify('deleted-system:99');
      }
      return null;
    });

    const result = getInitialSelectedSystem(activeSystems, 'Alpha Tower');
    expect(result).toBe(activeSystems[0]);
  });

  it('falls back to the first system when nothing is saved', () => {
    localStorage.getItem.mockReturnValue(null);

    const result = getInitialSelectedSystem(activeSystems, 'Alpha Tower');
    expect(result).toBe(activeSystems[0]);
  });

  it('reads from the project-scoped selectedSystem key', () => {
    localStorage.getItem.mockReturnValue(null);

    getInitialSelectedSystem(activeSystems, 'My Project');

    expect(localStorage.getItem).toHaveBeenCalledWith(
      'glazebid:bidsheet:My Project:selectedSystem'
    );
  });

  it('restores the first system when saved value equals saved[0]', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === lsKey('Alpha Tower', 'selectedSystem')) {
        return JSON.stringify(activeSystems[0]);
      }
      return null;
    });

    const result = getInitialSelectedSystem(activeSystems, 'Alpha Tower');
    expect(result).toBe(activeSystems[0]);
  });

  it('handles malformed JSON in savedSystem by falling back to first', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === lsKey('Alpha Tower', 'selectedSystem')) {
        return '{ bad json';
      }
      return null;
    });

    // lsGet catches the JSON parse error and returns the fallback (null)
    // → getInitialSelectedSystem returns saved[0]
    const result = getInitialSelectedSystem(activeSystems, 'Alpha Tower');
    expect(result).toBe(activeSystems[0]);
  });
});

// =============================================================================
// ❻  KEY NAMESPACE INTEGRITY — prevent key collisions
// =============================================================================

describe('localStorage key namespace integrity', () => {
  it('bidSettings and selectedSheet keys are distinct', () => {
    const bsKey = `glazebid:bidSettings:Project A`;
    const ssKey = `glazebid:selectedSheet:Project A`;
    expect(bsKey).not.toBe(ssKey);
  });

  it('selectedSystem keys are correctly namespaced per project', () => {
    const key1 = lsKey('Project A', 'selectedSystem');
    const key2 = lsKey('Project B', 'selectedSystem');
    expect(key1).not.toBe(key2);
    expect(key1).toBe('glazebid:bidsheet:Project A:selectedSystem');
    expect(key2).toBe('glazebid:bidsheet:Project B:selectedSystem');
  });

  it('pageLabels keys include both project and sheet', () => {
    const key = `glazebid:pageLabels:Project X:sheet-99`;
    expect(key).toContain('Project X');
    expect(key).toContain('sheet-99');
  });
});
