/**
 * BidSheet Context - Multi-System State Management (Local / Electron mode)
 * All state is persisted in localStorage — no backend required.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSystem, SYSTEM_TYPES } from '../config/systemRegistry';
import { calcFrameMH } from '../utils/laborCalcEngine';
import { toCanonicalSystemType } from '../utils/systemTypes';
import useProductionRatesStore from '../store/useProductionRatesStore';

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsKey(project, ...parts) {
  return `glazebid:bidsheet:${project}:${parts.join(':')}`;
}
function lsGet(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ─── Frame labor via THE labor engine (AUDIT 8.2) ───────────────────────────
// The old computeFrameMetrics used flat MHs-per-SF placeholder rates — one of
// FOUR parallel labor implementations that produced different numbers on
// different pages. It is gone. Classic-grid frames now run through
// laborCalcEngine with the same Excel-parity formulas and the same rate store
// as the visual workspace and Review Bid page.
const DEFAULT_LABOR_RATE = 42.00;

function computeFrameMetrics(frame, rates) {
  const laborRate = rates?.laborRate ?? DEFAULT_LABOR_RATE;
  const beads     = rates?.beadsOfCaulk ?? 2;
  const sysType   = toCanonicalSystemType(frame.system_id);
  const { getHourlyFunctions, getItemRates } = useProductionRatesStore.getState();
  const hf = getHourlyFunctions(sysType);
  const ir = getItemRates(sysType);

  // Derive total perimeter LF (for caulk) from inches × qty when not provided
  const qty = frame.quantity || 1;
  const perimeter = frame.perimeter
    ?? ((frame.width && frame.height)
      ? (2 * (Number(frame.width) + Number(frame.height)) / 12) * qty
      : 0);

  const r = calcFrameMH({ ...frame, perimeter }, hf, ir, beads, sysType);

  return {
    ...frame,
    shop_mhs:   r.shopMH,
    dist_mhs:   r.distributionMH,
    field_mhs:  r.fieldMH,
    total_mhs:  r.totalMH,
    shop_cost:  Math.round(r.shopMH         * laborRate * 100) / 100,
    dist_cost:  Math.round(r.distributionMH * laborRate * 100) / 100,
    field_cost: Math.round(r.fieldMH        * laborRate * 100) / 100,
    total_cost: Math.round(r.totalMH        * laborRate * 100) / 100,
  };
}

function generateId() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const BidSheetContext = createContext();

export function useBidSheet() {
  const context = useContext(BidSheetContext);
  if (!context) {
    throw new Error('useBidSheet must be used within BidSheetProvider');
  }
  return context;
}

function getBaseSystemId(instanceId) {
  return instanceId.split(':')[0];
}

export function BidSheetProvider({ children, projectName }) {
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [activeSystems, setActiveSystems]   = useState([]);
  const [systemInstances, setSystemInstances] = useState({ 'ext-sf-1': 0, 'ext-sf-2': 0, 'int-sf': 0, 'cap-cw': 0, 'ssg-cw': 0 });

  const [frames, setFrames]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [productionRates, setProductionRates] = useState({
    beadsOfCaulk: 2.00, shopMHsPerSF: 0.110, distMHsPerSF: 0.051,
    fieldMHsPerSF: 0.264, laborRate: DEFAULT_LABOR_RATE,
  });

  const [hrFunctionRates, setHrFunctionRates] = useState({
    joints: 0.25, dist: 0.33, subsills: 1.00, bays: 2.18, baysBig: 2.93,
    dlos: 1.00, dlosBig: 1.50, pairs: 8.50, singles: 8.50, caulk: 0.67,
    ssg: 0.03, steel: 0.50, vents: 3.00, brakeMetal: 1.00, open: 0.00,
  });

  const [totals, setTotals] = useState({
    totalFrames: 0, totalQuantity: 0, totalSF: 0,
    shopMHs: 0, distMHs: 0, fieldMHs: 0, totalMHs: 0,
    shopCost: 0, distCost: 0, fieldCost: 0, totalCost: 0,
  });

  const [statistics, setStatistics] = useState({
    mhsPerDLO: 0, avgSFPerDLO: 0, avgSFPerFrame: 0,
  });

  // ── Boot: load persisted systems ─────────────────────────────────────────
  useEffect(() => {
    if (!projectName) return;
    // Restore custom HR function rates (AUDIT 1.4: written by updateHrRate, was never read back)
    const savedHrRates = lsGet(lsKey(projectName, 'hrrates'), null);
    if (savedHrRates) setHrFunctionRates(prev => ({ ...prev, ...savedHrRates }));
    const saved = lsGet(lsKey(projectName, 'systems'), []);
    if (saved.length > 0) {
      setActiveSystems(saved);
      const counts = { 'ext-sf-1': 0, 'ext-sf-2': 0, 'int-sf': 0, 'cap-cw': 0, 'ssg-cw': 0 };
      saved.forEach(id => {
        const base = id.split(':')[0];
        const num  = parseInt(id.split(':')[1] || '0', 10);
        if (counts[base] !== undefined && num > counts[base]) counts[base] = num;
      });
      setSystemInstances(counts);
      // Restore last selected system tab (fallback to first)
      const lastSelected = lsGet(lsKey(projectName, 'selectedSystem'), null);
      setSelectedSystem(lastSelected && saved.includes(lastSelected) ? lastSelected : saved[0]);
    }
  }, [projectName]);

  // ── Persist selected system tab ───────────────────────────────────────────
  useEffect(() => {
    if (!projectName || !selectedSystem) return;
    lsSet(lsKey(projectName, 'selectedSystem'), selectedSystem);
  }, [projectName, selectedSystem]);

  // ── Load frames + rates when selection changes ────────────────────────────
  useEffect(() => {
    if (!projectName || !selectedSystem) return;
    const saved = lsGet(lsKey(projectName, 'frames', selectedSystem), []);
    setFrames(saved);
    const base   = getBaseSystemId(selectedSystem);
    const savedR = lsGet(lsKey(projectName, 'rates', base), null);
    if (savedR) setProductionRates(prev => ({ ...prev, ...savedR }));
  }, [projectName, selectedSystem]);

  // ── Recalculate totals on frame changes ───────────────────────────────────
  useEffect(() => { calculateTotals(frames); }, [frames]);

  const calculateTotals = useCallback((list) => {
    const t = {
      totalFrames:   list.length,
      totalQuantity: list.reduce((s, f) => s + (f.quantity || 0), 0),
      totalSF:       list.reduce((s, f) => s + (f.sf       || 0), 0),
      shopMHs:       list.reduce((s, f) => s + (f.shop_mhs  || 0), 0),
      distMHs:       list.reduce((s, f) => s + (f.dist_mhs  || 0), 0),
      fieldMHs:      list.reduce((s, f) => s + (f.field_mhs || 0), 0),
      totalMHs:      list.reduce((s, f) => s + (f.total_mhs || 0), 0),
      shopCost:      list.reduce((s, f) => s + (f.shop_cost  || 0), 0),
      distCost:      list.reduce((s, f) => s + (f.dist_cost  || 0), 0),
      fieldCost:     list.reduce((s, f) => s + (f.field_cost || 0), 0),
      totalCost:     list.reduce((s, f) => s + (f.total_cost || 0), 0),
    };
    setTotals(t);
    const dlos = list.reduce((s, f) => s + (f.dlos || 0), 0);
    setStatistics({
      mhsPerDLO:    dlos > 0 ? t.totalMHs / dlos : 0,
      avgSFPerDLO:  dlos > 0 ? t.totalSF  / dlos : 0,
      avgSFPerFrame: t.totalFrames > 0 ? t.totalSF / t.totalFrames : 0,
    });
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const addFrame = useCallback((frameData) => {
    const newFrame = computeFrameMetrics(
      { id: generateId(), ...frameData, system_id: selectedSystem },
      productionRates
    );
    setFrames(prev => {
      const updated = [...prev, newFrame];
      lsSet(lsKey(projectName, 'frames', selectedSystem), updated);
      return updated;
    });
  }, [projectName, selectedSystem, productionRates]);

  const updateFrame = useCallback((frameId, updates) => {
    setFrames(prev => {
      const updated = prev.map(f =>
        f.id === frameId ? computeFrameMetrics({ ...f, ...updates }, productionRates) : f
      );
      lsSet(lsKey(projectName, 'frames', selectedSystem), updated);
      return updated;
    });
  }, [projectName, selectedSystem, productionRates]);

  const deleteFrame = useCallback((frameId) => {
    setFrames(prev => {
      const updated = prev.filter(f => f.id !== frameId);
      lsSet(lsKey(projectName, 'frames', selectedSystem), updated);
      return updated;
    });
  }, [projectName, selectedSystem]);

  const bulkUpdateFrames = useCallback((frameIds, updates) => {
    setFrames(prev => {
      const updated = prev.map(f =>
        frameIds.includes(f.id) ? computeFrameMetrics({ ...f, ...updates }, productionRates) : f
      );
      lsSet(lsKey(projectName, 'frames', selectedSystem), updated);
      return updated;
    });
  }, [projectName, selectedSystem, productionRates]);

  const clearAllFrames = useCallback(() => {
    if (frames.length === 0) return;
    if (!window.confirm(
      `⚠️ WARNING: This will permanently delete ALL ${frames.length} frame(s) from ${selectedSystem}.\n\nAre you sure?`
    )) return;
    setFrames([]);
    lsSet(lsKey(projectName, 'frames', selectedSystem), []);
  }, [projectName, selectedSystem, frames]);

  // ── System tabs ───────────────────────────────────────────────────────────
  const addSystem = useCallback((systemId) => {
    const count       = systemInstances[systemId] || 0;
    const newId       = `${systemId}:${count + 1}`;
    setSystemInstances(prev => ({ ...prev, [systemId]: count + 1 }));
    setActiveSystems(prev => {
      const updated = [...prev, newId];
      lsSet(lsKey(projectName, 'systems'), updated);
      return updated;
    });
    setSelectedSystem(newId);
  }, [systemInstances, projectName]);

  const removeSystem = useCallback((systemId) => {
    if (activeSystems.length <= 1) {
      alert('Cannot remove the last system. At least one system must remain active.');
      return;
    }
    setActiveSystems(prev => {
      const updated = prev.filter(id => id !== systemId);
      lsSet(lsKey(projectName, 'systems'), updated);
      return updated;
    });
    if (selectedSystem === systemId) {
      const remaining = activeSystems.filter(id => id !== systemId);
      if (remaining.length > 0) setSelectedSystem(remaining[0]);
    }
  }, [activeSystems, selectedSystem, projectName]);

  // ── Rates ─────────────────────────────────────────────────────────────────
  const updateProductionRate = useCallback((key, value) => {
    setProductionRates(prev => {
      const updated = { ...prev, [key]: value };
      lsSet(lsKey(projectName, 'rates', getBaseSystemId(selectedSystem)), updated);
      setFrames(prevFrames => {
        const recomputed = prevFrames.map(f => computeFrameMetrics(f, updated));
        lsSet(lsKey(projectName, 'frames', selectedSystem), recomputed);
        return recomputed;
      });
      return updated;
    });
  }, [projectName, selectedSystem]);

  const updateHrRate = useCallback((key, value) => {
    setHrFunctionRates(prev => {
      const updated = { ...prev, [key]: value };
      lsSet(lsKey(projectName, 'hrrates'), updated);
      return updated;
    });
  }, [projectName]);

  // ── Import (local file reader — tab-delimited CSV) ────────────────────────
  const importPartnerPak = useCallback((file) => {
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines   = e.target.result.split('\n').filter(l => l.trim());
        const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
        const rows    = lines.slice(1).map(line => {
          const cols = line.split('\t');
          const obj  = {};
          headers.forEach((h, i) => { obj[h] = cols[i]?.trim() || ''; });
          return obj;
        }).filter(r => r['sf'] || r['width']);
        const imported = rows.map(r => computeFrameMetrics({
          id:          generateId(),
          system_id:   selectedSystem,
          mark:        r['mark'] || r['type'] || '',
          width:       parseFloat(r['width'])                         || 0,
          height:      parseFloat(r['height'])                        || 0,
          quantity:    parseInt(r['quantity'] || r['qty'] || '1', 10) || 1,
          sf:          parseFloat(r['sf'] || r['sq ft'] || '0')       || 0,
          dlos:        parseInt(r['dlos'] || r['lites'] || '0', 10)   || 0,
          description: r['description'] || r['desc'] || '',
        }, productionRates));
        setFrames(prev => {
          const updated = [...prev, ...imported];
          lsSet(lsKey(projectName, 'frames', selectedSystem), updated);
          return updated;
        });
        alert(`✅ Successfully imported ${imported.length} frame(s)`);
      } catch (err) {
        alert(`❌ Import failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => { alert('❌ Could not read file'); setLoading(false); };
    reader.readAsText(file);
  }, [projectName, selectedSystem, productionRates]);

  // ── Export (CSV download) ─────────────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    const headers = ['Mark','Width','Height','Quantity','SF','DLOs','Shop MHs','Dist MHs','Field MHs','Total MHs','Total Cost'];
    const rows    = frames.map(f => [
      f.mark || '', f.width || 0, f.height || 0, f.quantity || 0,
      f.sf || 0, f.dlos || 0, f.shop_mhs || 0, f.dist_mhs || 0,
      f.field_mhs || 0, f.total_mhs || 0, f.total_cost || 0,
    ]);
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bidsheet-${projectName}-${selectedSystem}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [projectName, selectedSystem, frames]);

  const value = {
    selectedSystem, setSelectedSystem,
    activeSystems, setActiveSystems,
    systemInstances,
    addSystem, removeSystem,
    currentSystem: selectedSystem ? getSystem(getBaseSystemId(selectedSystem)) : null,
    frames, loading, error,
    addFrame, updateFrame, deleteFrame,
    bulkUpdateFrames, clearAllFrames,
    refreshFrames: () => {
      if (selectedSystem) {
        const saved = lsGet(lsKey(projectName, 'frames', selectedSystem), []);
        setFrames(saved);
      }
    },
    productionRates, updateProductionRate,
    hrFunctionRates, setHrFunctionRates, updateHrRate,
    totals, statistics,
    importPartnerPak, exportToExcel,
    projectName,
  };

  return (
    <BidSheetContext.Provider value={value}>
      {children}
    </BidSheetContext.Provider>
  );
}
