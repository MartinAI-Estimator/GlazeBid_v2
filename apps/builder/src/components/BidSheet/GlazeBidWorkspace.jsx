import React, { useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { partnerPakToSOWLines } from '../../utils/partnerPakToSOW';
import { parsePartnerPakFile } from '../../utils/parsePartnerPak';
import ToolPalette from './ToolPalette';
import VisualCanvas from './VisualCanvas';
import MaterialDrawer from './MaterialDrawer';
import BidCartPanel from './BidCartPanel';
import BidSummaryDashboard from './BidSummaryDashboard';
import ExecutiveDashboard from './ExecutiveDashboard';
import MaterialOnlyWorkspace from './MaterialOnlyWorkspace';
import LaborOnlyWorkspace from './LaborOnlyWorkspace';
import CustomSystemWorkspace from './CustomSystemWorkspace';
import MiscLaborWorkspace from './MiscLaborWorkspace';

import SystemLaborMHs from './SystemLaborMHs';
import FrameTable from './FrameTable';

import ParametricFrameBuilder from './ParametricFrameBuilder';
import TakeoffWorkspace from './TakeoffWorkspace';
import { useBidSheet } from '../../context/BidSheetContext';
import useProductionRatesStore from '../../store/useProductionRatesStore';
import useEquipmentRatesStore from '../../store/useEquipmentRatesStore';
import useBidProjectStore from '../../store/useBidProjectStore';
import { calcSystemMH, mhToCost } from '../../utils/laborCalcEngine';
import { calculatePricing } from '../../utils/PricingEngine';
import { getSystemCategory } from '../../utils/systemTypeConfig';
import { calcSystemAncillary, DEFAULT_ANCILLARY_CONFIG, normalizeAncillaryConfig } from '../../utils/ancillaryPricing';

const GlazeBidWorkspace = forwardRef(({ projectName, onNavigate, bidSettings = {}, onBidSettingsChange }, ref) => {
  const { frames, setFrames } = useBidSheet();

  // ── Persistence key — scoped to project ──
  const LS_KEY = `glazebid:workspaceSystems:${projectName || '_default'}`;

  const [importedSystems, setImportedSystems] = useState(() => {
    try {
      const saved = localStorage.getItem(`glazebid:workspaceSystems:${projectName || '_default'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* ignore */ }
    return [];
  });

  // isDirty = systems exist but haven't been confirmed-saved to a .gbid file
  const [isDirty, setIsDirty] = useState(() => {
    try {
      const saved = localStorage.getItem(`glazebid:workspaceSystems:${projectName || '_default'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0;
      }
    } catch { /* ignore */ }
    return false;
  });
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingNavDest, setPendingNavDest] = useState(null);
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [showDropZone, setShowDropZone] = useState(true);
  const [showHomeBase, setShowHomeBase] = useState(true);
  const [activeTool, setActiveTool] = useState(null);
  const [customTools, setCustomTools] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBidCartOpen, setIsBidCartOpen] = useState(false);
  const [activeView, setActiveView] = useState('workspace'); // 'workspace' | 'executive-dashboard'
  const [homeTab, setHomeTab] = useState('scope'); // 'scope' | 'breakdown' | 'summary'
  const [systemTab, setSystemTab] = useState('frames'); // 'frames' | 'labor' | 'laborMHs' | 'materials'
  const [frameView, setFrameView] = useState('table'); // 'table' | 'cards'
  const [showMhBreakdown, setShowMhBreakdown] = useState(false);

  const [isRecapCollapsed, setIsRecapCollapsed] = useState(() => {
    try {
      return localStorage.getItem('glazebid:liveRecapCollapsed') === '1';
    } catch {
      return false;
    }
  });

  // ── Reactive rate subscription — triggers re-render when rates change ──
  const laborRate = useProductionRatesStore(s => s.laborRate);
  const setGlobalLaborRate = useProductionRatesStore(s => s.setLaborRate);
  const beadsOfCaulk = useProductionRatesStore(s => s.beadsOfCaulk || 2);
  const hourlyFunctionsByType = useProductionRatesStore(s => s.hourlyFunctionsByType);
  const itemRatesByType = useProductionRatesStore(s => s.itemRatesByType);
  const equipmentRates = useEquipmentRatesStore(s => s.rates);
  const equipmentCategoryOrder = useEquipmentRatesStore(s => s.categoryOrder);

  // Effective labor rate: prefer the bid-level setting (from bidSettings prop, default $42/hr),
  // fall back to the global admin rate from the production rates store.
  // The store defaults to 0 until the user explicitly sets it in admin settings.
  const bidLaborRateEff = (bidSettings?.laborRate ?? 0) || laborRate || 42;

  // ── Memoized labor map: systemId → full MH result + cost ──
  const laborMap = useMemo(() => {
    const map = {};
    const { getHourlyFunctions, getItemRates } = useProductionRatesStore.getState();
    importedSystems.forEach(sys => {
      if (!sys?.frames?.length) {
        // type-library-frame systems from Studio carry pre-computed MH in sys.totals
        const shopMH  = sys.totals?.shopMHs  || 0;
        const distMH  = sys.totals?.distMHs  || 0;
        const fieldMH = sys.totals?.fieldMHs || 0;
        const totalMH = shopMH + distMH + fieldMH;
        map[sys.id] = {
          totalMH,
          totalCost:      mhToCost(totalMH, bidLaborRateEff),
          shopMH,
          distributionMH: distMH,
          fieldMH,
          frameResults:   [],
        };
        return;
      }
      const sysType = sys.systemType || sys.name;
      // Per-system overrides take priority over global defaults
      const hf = sys.rateOverrides?.hourlyFunctions || getHourlyFunctions(sysType);
      const ir = sys.rateOverrides?.itemRates || getItemRates(sysType);
      const mh = calcSystemMH(sys.frames, hf, ir, beadsOfCaulk, sysType);
      map[sys.id] = { ...mh, totalCost: mhToCost(mh.totalMH, bidLaborRateEff) };
    });
    return map;
  }, [importedSystems, bidLaborRateEff, beadsOfCaulk, hourlyFunctionsByType, itemRatesByType]);

  // Quick accessor
  const getSystemLabor = (sys) => laborMap[sys?.id] || { totalMH: 0, totalCost: 0, shopMH: 0, distributionMH: 0, fieldMH: 0, frameResults: [] };

  // ── Check if any system has unconfigured rates (all zeros) ──
  const hasUnconfiguredRates = useMemo(() => {
    if (importedSystems.length === 0) return false;
    const { getHourlyFunctions, getItemRates } = useProductionRatesStore.getState();
    return laborRate === 0 || importedSystems.some(sys => {
      const sysType = sys.systemType || sys.name;
      const hf = getHourlyFunctions(sysType);
      const ir = getItemRates(sysType);
      const allHfZero = Object.values(hf).every(fn => Object.values(fn).every(v => v === 0));
      const allIrZero = Object.values(ir).every(v => v === 0);
      return allHfZero && allIrZero;
    });
  }, [importedSystems, laborRate, hourlyFunctionsByType, itemRatesByType]);

  // ── Custom System Cards from Studio (via IPC) ───────────────────────────────
  // Received when the estimator right-clicks a highlight in Studio and
  // sends it to a Custom System.  These land in "Needs Attention" as
  // lightweight system cards with type: 'studio-custom'.
  const [studioCustomCards, setStudioCustomCards] = useState(() => {
    try {
      const raw = localStorage.getItem('glazebid:customSystemCards');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  // ── IPC: receive custom cards pushed from Studio ─────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onCustomCardsUpdate) return;
    return window.electronAPI.onCustomCardsUpdate((cards) => {
      setStudioCustomCards(Array.isArray(cards) ? cards : []);
      try { localStorage.setItem('glazebid:customSystemCards', JSON.stringify(cards)); } catch { /* ignore */ }
    });
  }, []);

  // ── IPC: receive "Open in Frame Builder" payload from Studio ─────────────
  useEffect(() => {
    if (!window.electronAPI?.onFrameBuilderReceive) return;
    return window.electronAPI.onFrameBuilderReceive((payload) => {
      // Create a "Needs Work" import card so the estimator can review and price it
      const card = {
        id:           `fbr-${Date.now()}`,
        type:         'studio-frame-import',
        name:         payload.label ? `Frame: ${payload.label}` : `Frame ${(payload.widthInches / 12).toFixed(1)}′ × ${(payload.heightInches / 12).toFixed(1)}′`,
        shortName:    'Studio',
        description:  `From Studio takeoff — ${payload.widthInches?.toFixed?.(1) ?? '?'}" × ${payload.heightInches?.toFixed?.(1) ?? '?'}" — open in Frame Builder to price`,
        frames:       [],
        materials:    [],
        laborTasks:   [],
        status:       'pending',
        studioPayload: payload,
        totals:       { totalFrames: 0, totalQuantity: 0, totalSF: 0, shopMHs: 0, distMHs: 0, fieldMHs: 0, totalCost: 0 },
        lastModified: new Date().toISOString(),
      };
      setImportedSystems(prev => [card, ...prev]);
      setShowDropZone(false);
      setShowHomeBase(false);
      setSelectedSystem(card);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('glazebid:liveRecapCollapsed', isRecapCollapsed ? '1' : '0');
    } catch {
      // ignore localStorage failures
    }
  }, [isRecapCollapsed]);

  useEffect(() => {
    // In table mode, modifiers are edited directly in the grid workflow.
    if (frameView === 'table' && activeTool) {
      setActiveTool(null);
    }
  }, [frameView, activeTool]);

  useEffect(() => {
    if (!selectedSystem?.id) return;
    const latest = importedSystems.find(sys => sys.id === selectedSystem.id);
    if (latest && latest !== selectedSystem) {
      setSelectedSystem(latest);
    }
  }, [importedSystems, selectedSystem]);

  // ── Deep-link: open a specific system for editing when navigating back from BidCart ──
  useEffect(() => {
    const pendingId = useBidProjectStore.getState().pendingEditSystemId;
    if (!pendingId) return;
    const target = importedSystems.find(sys => sys.id === pendingId);
    if (target) {
      useBidProjectStore.getState().clearPendingEditSystemId();
      setShowHomeBase(false);
      setSelectedSystem(target);
    }
  }, [importedSystems]); // importedSystems is the dependency — runs after data is loaded

  // ── IPC: receive Frame Type Library snapshot from Studio ─────────────────
  // we receive { types, dots }.  For each type with ≥1 dot we create a system
  // card whose BOM is already computed (type.bom × quantity).
  // Cards are replaced (not appended) so re-sending overwrites prior results.
  useEffect(() => {
    if (!window.electronAPI?.onFrameTypesUpdate) return;
    return window.electronAPI.onFrameTypesUpdate(({ types, dots }) => {
      if (!Array.isArray(types) || !Array.isArray(dots)) return;

      const newCards = types
        .map(ft => {
          const count = dots.filter(d => d.frameTypeId === ft.id).length;
          if (count === 0) return null;
          const bom = ft.bom ?? null;
          const totalAlumLF   = bom ? bom.hardware.totalPieceLF * count : 0;
          const totalGlassSF  = bom ? bom.totalGlassSF          * count : 0;
          const totalShopMH   = bom ? bom.hardware.shopLaborMhs  * count : 0;
          const totalFieldMH  = bom ? bom.hardware.fieldLaborMhs * count : 0;
          return {
            id:          `ftl-${ft.id}`,
            type:        'type-library-frame',
            name:        `${ft.mark} — ${ft.name || ft.mark}`,
            shortName:   ft.mark,
            description: `${ft.systemLabel} · ${(ft.widthInches / 12).toFixed(1)}′×${(ft.heightInches / 12).toFixed(1)}′ · ${ft.bays}B×${ft.rows}R · ×${count}`,
            frameType:   ft,
            quantity:    count,
            frames:      [],
            materials:   [],
            laborTasks:  [],
            status:      'ready',
            bom,
            aggregated: {
              quantity:   count,
              alumLF:     Math.round(totalAlumLF),
              glassSF:    Math.round(totalGlassSF),
              shopMH:     parseFloat(totalShopMH.toFixed(2)),
              fieldMH:    parseFloat(totalFieldMH.toFixed(2)),
            },
            totals: {
              totalFrames:    count,
              totalQuantity:  count,
              totalSF:        parseFloat(totalGlassSF.toFixed(0)),
              shopMHs:        parseFloat(totalShopMH.toFixed(2)),
              distMHs:        0,
              fieldMHs:       parseFloat(totalFieldMH.toFixed(2)),
              totalCost:      0, // priced in Builder UI
            },
            lastModified: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      // Replace any previously-synced type-library cards, keep hand-built ones
      setImportedSystems(prev => [
        ...prev.filter(s => s.type !== 'type-library-frame'),
        ...newCards,
      ]);
      setShowDropZone(false);
      // Stay on home base so user can see new type-library cards
      setShowHomeBase(true);
    });
  }, []);

  // Expose navigation methods to parent (BidSheet title bar buttons)
  useImperativeHandle(ref, () => ({
    goHome: () => setShowHomeBase(true),
    importAnother: () => setShowHomeBase(true),
  }));

  // ── Bid Settings (received from parent, applied to all math) ──
  const {
    laborRate: bidLaborRate = 42,
    crewSize         = 2,
    laborContingency = 2.5,
    markupPercent    = 20,
    taxPercent       = 8.5,
  } = bidSettings;

  const setLaborRate        = v => onBidSettingsChange?.({ ...bidSettings, laborRate:        v });
  const setCrewSize         = v => onBidSettingsChange?.({ ...bidSettings, crewSize:         v });
  const setLaborContingency = v => onBidSettingsChange?.({ ...bidSettings, laborContingency: v });
  const setMarkupPercent    = v => onBidSettingsChange?.({ ...bidSettings, markupPercent:    v });
  const setTaxPercent       = v => onBidSettingsChange?.({ ...bidSettings, taxPercent:       v });

  const setSelectedAncillaryConfig = useCallback((partial) => {
    if (!selectedSystem) return;
    setImportedSystems(prev => prev.map(sys => {
      if (sys.id !== selectedSystem.id) return sys;
      return {
        ...sys,
        ancillaryConfig: {
          ...normalizeAncillaryConfig(sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG),
          ...partial,
        },
      };
    }));
  }, [selectedSystem, setImportedSystems]);

  // ── Live recap sidebar math (Warren-style margin mode) ──
  const selectedMaterialCost = useMemo(() => {
    const systemMaterials = (selectedSystem?.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const frameManualMaterials = (selectedSystem?.frames || []).reduce((s, f) => s + (Number(f.manualMaterialCost) || 0), 0);
    const ancillary = calcSystemAncillary(
      selectedSystem?.frames || [],
      selectedSystem?.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
      { systemType: selectedSystem?.systemType || selectedSystem?.name }
    );
    return systemMaterials + frameManualMaterials + ancillary.totalCost;
  }, [selectedSystem]);
  const selectedLaborCost = useMemo(
    () => getSystemLabor(selectedSystem).totalCost || 0,
    [selectedSystem, laborMap]
  );
  const selectedRecap = useMemo(
    () => calculatePricing({
      materialCost: selectedMaterialCost,
      laborCost: selectedLaborCost,
      taxPercent,
      pricingPercent: markupPercent,
      pricingMode: 'margin',
      isTaxExempt: false,
    }),
    [selectedMaterialCost, selectedLaborCost, taxPercent, markupPercent]
  );

  const projectRecap = useMemo(() => {
    const materialCost = importedSystems.reduce((sum, sys) => {
      const systemMaterials = (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
      const frameManualMaterials = (sys.frames || []).reduce((s, f) => s + (Number(f.manualMaterialCost) || 0), 0);
      const ancillary = calcSystemAncillary(
        sys.frames || [],
        sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
        { systemType: sys.systemType || sys.name }
      );
      return sum + systemMaterials + frameManualMaterials + ancillary.totalCost;
    }, 0);
    const laborCost = importedSystems.reduce((sum, sys) => sum + (getSystemLabor(sys).totalCost || 0), 0);
    return calculatePricing({
      materialCost,
      laborCost,
      taxPercent,
      pricingPercent: markupPercent,
      pricingMode: 'margin',
      isTaxExempt: false,
    });
  }, [importedSystems, laborMap, taxPercent, markupPercent]);

  const categoryRollups = useMemo(() => {
    const buckets = {
      storefront: { material: 0, labor: 0 },
      curtainwall: { material: 0, labor: 0 },
      misc: { material: 0, labor: 0 },
    };

    importedSystems.forEach(sys => {
      const mat =
        (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0)
        + (sys.frames || []).reduce((s, f) => s + (Number(f.manualMaterialCost) || 0), 0)
        + calcSystemAncillary(
          sys.frames || [],
          sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
          { systemType: sys.systemType || sys.name }
        ).totalCost;
      const lab = getSystemLabor(sys).totalCost || 0;
      let key = 'misc';

      if (sys.type === 'partnerpak-import') {
        key = getSystemCategory(sys.systemType || sys.name) === 'curtainwall' ? 'curtainwall' : 'storefront';
      }

      buckets[key].material += mat;
      buckets[key].labor += lab;
    });

    return {
      storefront: calculatePricing({ materialCost: buckets.storefront.material, laborCost: buckets.storefront.labor, taxPercent, pricingPercent: markupPercent, pricingMode: 'margin', isTaxExempt: false }),
      curtainwall: calculatePricing({ materialCost: buckets.curtainwall.material, laborCost: buckets.curtainwall.labor, taxPercent, pricingPercent: markupPercent, pricingMode: 'margin', isTaxExempt: false }),
      misc: calculatePricing({ materialCost: buckets.misc.material, laborCost: buckets.misc.labor, taxPercent, pricingPercent: markupPercent, pricingMode: 'margin', isTaxExempt: false }),
    };
  }, [importedSystems, laborMap, taxPercent, markupPercent]);

  const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const selectedAncillary = useMemo(
    () => calcSystemAncillary(
      selectedSystem?.frames || [],
      selectedSystem?.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
      { systemType: selectedSystem?.systemType || selectedSystem?.name }
    ),
    [selectedSystem]
  );

  // ── Sync system summaries to localStorage so ProjectHome Labor panel can read them ──
  useEffect(() => {
    try {
      const summaries = importedSystems.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        shortName: s.shortName,
        totals: s.totals,
      }));
      localStorage.setItem('glazebid:laborSystems', JSON.stringify(summaries));
    } catch { /* ignore */ }
  }, [importedSystems]);

  // ── Push bid snapshot to useBidProjectStore so BidCart can read totals ──
  useEffect(() => {
    const systemsWithCosts = importedSystems.map(sys => {
      const matCost =
        (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0)
        + (sys.frames || []).reduce((s, f) => s + (Number(f.manualMaterialCost) || 0), 0)
        + calcSystemAncillary(
            sys.frames || [],
            sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG,
            { systemType: sys.systemType || sys.name }
          ).totalCost;
      const labCost = laborMap[sys.id]?.totalCost || 0;
      const eqCost  = (sys.laborExtras?.equipment || []).reduce((s, e) =>
        s + (e.weeks || 0) * (e.weekRate || 0)
          + (e.months || 0) * (e.monthRate || 0)
          + (e.pickupDropoff || 0) * (e.pdRate ?? 310),
        0);
      return {
        ...sys,
        _computedMaterialCost: matCost,
        _computedLaborCost:    labCost,
        _computedEquipCost:    eqCost,
      };
    });
    useBidProjectStore.getState().setSnapshot({
      systems: systemsWithCosts,
      projectRecap,
      bidSettings: { laborRate: bidLaborRate, crewSize, markupPercent, taxPercent },
    });
  }, [importedSystems, laborMap, projectRecap, bidLaborRate, crewSize, markupPercent, taxPercent]);

  // ── Auto-save importedSystems to localStorage so data survives navigation ──
  useEffect(() => {
    if (importedSystems.length === 0) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(importedSystems));
      setIsDirty(true);
      useBidProjectStore.getState().setDirty(true);
    } catch { /* ignore */ }
  }, [importedSystems, LS_KEY]);

  // ── Manual explicit save (clears dirty flag + shows "Saved" for 2s) ──
  const handleSaveBid = useCallback(() => {
    setSaveStatus('saving');
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(importedSystems));
      setIsDirty(false);
      useBidProjectStore.getState().setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [importedSystems, LS_KEY]);

  // ── Intercept navigation: if systems exist + dirty, show leave-confirm modal ──
  const safeNavigate = useCallback((destination) => {
    if (importedSystems.length > 0 && isDirty) {
      setPendingNavDest(destination);
      setShowLeaveConfirm(true);
    } else {
      onNavigate?.(destination);
    }
  }, [importedSystems.length, isDirty, onNavigate]);

  // Handle import completion — auto-select first system to go straight into workspace
  const handleImportComplete = useCallback((systems) => {
    const enrichedSystems = systems.map(sys => ({
      ...sys,
      frames: (sys.frames || []).map(frame => ({
        ...frame,
        receptors: Number(frame.receptors ?? 0) || 0,
        gtBays: Number(frame.gtBays ?? 0) || 0,
        gtDlos: Number(frame.gtDlos ?? 0) || 0,
      })),
      ancillaryConfig: normalizeAncillaryConfig(sys.ancillaryConfig || DEFAULT_ANCILLARY_CONFIG),
      materials: sys.materials?.length > 0
        ? sys.materials
        : partnerPakToSOWLines([sys]),
    }));
    setImportedSystems(enrichedSystems);
    setShowDropZone(false);
    setShowHomeBase(false);
    if (enrichedSystems.length > 0) {
      setSelectedSystem(enrichedSystems[0]);
    }
  }, []);

  // ── Typed PartnerPak import (per system type) ──
  const pendingSystemTypeRef = useRef(null);
  const fileInputRef = useRef(null);

  const openPartnerPakForType = useCallback((systemType) => {
    pendingSystemTypeRef.current = systemType;
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const systemType = pendingSystemTypeRef.current;
    if (!systemType) return;
    try {
      const { systems } = await parsePartnerPakFile(file);
      const taggedSystems = systems.map(s => ({ ...s, systemType }));
      handleImportComplete(taggedSystems);
    } catch (err) {
      console.error('PartnerPak parse error:', err);
    }
    e.target.value = '';
  }, [handleImportComplete]);

  // ── Frame Builder launcher (per system type) ──
  // Handle system selection from dashboard
  const handleSelectSystem = useCallback((systemId) => {
    const system = importedSystems.find(s => s.id === systemId);
    setSelectedSystem(system);
  }, [importedSystems]);

  // Generate a blank system of the given type
  const handleCreateBlankSystem = (type = 'material-only', systemType = null) => {
    const newId = `${type}-sys-${Date.now()}`;
    const newSystemCount = importedSystems.length + 1;

    let defaultName = `Alternate System ${newSystemCount}`;
    let shortName = `Alt ${newSystemCount}`;
    if (type === 'material-only')  { defaultName = 'Manual Material Scope';          shortName = 'Mat Only'; }
    if (type === 'labor-only')     { defaultName = 'Manual Labor Scope';             shortName = 'Lab Only'; }
    if (type === 'custom-system')  { defaultName = `Custom System ${newSystemCount}`; shortName = 'Custom'; }
    if (type === 'misc-labor')      { defaultName = `Misc Labor ${newSystemCount}`;    shortName = 'Misc Lab'; }

    // Frame-based system types (Ext SF, Int SF, Cap CW, SSG CW)
    if (type === 'partnerpak-import' && systemType) {
      const typeLabels = { 'Ext SF': 'Exterior Storefront', 'Int SF': 'Interior Storefront', 'Cap CW': 'Captured Curtain Wall', 'SSG CW': 'SSG Curtain Wall' };
      const typeShort  = { 'Ext SF': 'Ext SF', 'Int SF': 'Int SF', 'Cap CW': 'Cap CW', 'SSG CW': 'SSG CW' };
      defaultName = `${typeLabels[systemType] || systemType} ${newSystemCount}`;
      shortName = typeShort[systemType] || systemType;
    }

    const blankSystem = {
      id: newId,
      type: type,
      name: defaultName,
      shortName: shortName,
      description: 'Manually created scope',
      frames: [],
      materials: [],
      laborTasks: [],
      totals: { totalFrames: 0, totalQuantity: 0, totalSF: 0, shopMHs: 0, distMHs: 0, fieldMHs: 0, totalCost: 0 },
      ...(systemType ? { systemType } : {}),
    };

    setImportedSystems(prev => [...prev, blankSystem]);
    setShowDropZone(false);
    setShowHomeBase(false);
    setSelectedSystem(blankSystem); // Auto-navigate right into the new scope
  };

  // Click-to-apply "paintbrush" — replaces drag-and-drop entirely
  const handleFrameClick = (targetFrameId, targetFrameIndex = -1) => {
    if (!activeTool) return;

    try {
      const currentSystem = importedSystems.find(sys => sys.id === selectedSystem?.id) || selectedSystem;
      const currentFrames = currentSystem?.frames || [];
      const hasIdMatch = currentFrames.some(f => String(f.id) === String(targetFrameId));
      const parsedIndex = Number(targetFrameId);
      const inferredIndex = Number.isInteger(parsedIndex) ? parsedIndex : -1;
      const targetIndex = targetFrameIndex >= 0 ? targetFrameIndex : inferredIndex;
      const frameExists = hasIdMatch
        ? currentFrames.find(f => String(f.id) === String(targetFrameId))
        : (targetIndex >= 0 ? currentFrames[targetIndex] : null);
      if (!frameExists) return;

      const fullModifierId = activeTool.startsWith('modifier-') ? activeTool : `modifier-${activeTool}`;
      const isLift = fullModifierId.includes('lift');

      // Normalize old string-based modifiers to objects
      const normalizeMods = (mods) => (mods || []).map(m => typeof m === 'string' ? { id: m, qty: 1 } : m);

      const currentMods = normalizeMods(frameExists.modifiers);
      const existingModIndex = currentMods.findIndex(m => m.id === fullModifierId);

      let newMods;
      if (existingModIndex >= 0) {
        if (isLift) {
          console.log('⚪ Lift already on frame, skipping (cannot have multiple lifts).');
          return;
        }
        // Increment quantity
        newMods = [...currentMods];
        newMods[existingModIndex] = { ...newMods[existingModIndex], qty: newMods[existingModIndex].qty + 1 };
      } else {
        // Add new modifier with qty 1
        newMods = [...currentMods, { id: fullModifierId, qty: 1 }];
      }

      const MOD_FIELD_MAP = {
        'modifier-subsill': 'subsills',
        'modifier-receptor': 'receptors',
        'modifier-door-single': 'singles',
        'modifier-door-pair': 'pairs',
        'modifier-vent': 'vents',
        'modifier-brake-metal': 'brake',
        'modifier-steel': 'steel',
        'modifier-ssg': 'ssg',
      };

      const mappedField = MOD_FIELD_MAP[fullModifierId];
      const applyNumericFieldSync = (frame) => {
        if (!mappedField) return frame;
        const current = Math.max(0, Number(frame?.[mappedField]) || 0);
        return { ...frame, [mappedField]: current + 1 };
      };

      const updateFrameCollection = (frames = []) => {
        const idMatched = frames.some(f => String(f.id) === String(targetFrameId));
        return frames.map((f, idx) => {
          const shouldUpdate = idMatched
            ? String(f.id) === String(targetFrameId)
            : (targetIndex >= 0 && idx === targetIndex);
          if (!shouldUpdate) return f;
          return applyNumericFieldSync({ ...f, modifiers: newMods });
        });
      };

      // 1. Update local UI
      setSelectedSystem(prev => ({
        ...prev,
        frames: updateFrameCollection(prev?.frames || [])
      }));

      // 2. Update master state
      setImportedSystems(prev => prev.map(sys => {
        if (sys.id !== selectedSystem?.id) return sys;
        return {
          ...sys,
          frames: updateFrameCollection(sys.frames || []),
        };
      }));

      // 3. Update global context
      setFrames(prev => {
        const cloned = JSON.parse(JSON.stringify(prev || []));
        const idx = cloned.findIndex(f => String(f.id) === String(targetFrameId));
        if (idx >= 0) {
          cloned[idx].modifiers = newMods;
          if (mappedField) {
            const current = Math.max(0, Number(cloned[idx][mappedField]) || 0);
            cloned[idx][mappedField] = current + 1;
          }
        }
        return cloned;
      });

      // 4. Backend sync
      fetch(`/api/bidsheet/projects/${encodeURIComponent(projectName)}/frames/${frameExists.id || targetFrameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiers: newMods })
      }).catch(err => console.error('[GlazeBid] Backend sync failed:', err));

    } catch (error) {
      console.error('🔴 CRITICAL ERROR applying modifier:', error);
    }
  };

  const handleCardFrameFieldUpdate = useCallback((frameId, frameIndex, field, value) => {
    const numericValue = Math.max(0, Number(value) || 0);
    setImportedSystems(prev => prev.map(sys => {
      if (sys.id !== selectedSystem?.id) return sys;

      const frames = sys.frames || [];
      const hasIdMatch = frames.some(f => String(f.id) === String(frameId));
      const nextFrames = frames.map((f, idx) => {
        const idMatch = String(f.id) === String(frameId);
        const indexMatch = !hasIdMatch && idx === frameIndex;
        if (!idMatch && !indexMatch) return f;
        return { ...f, [field]: numericValue };
      });

      return { ...sys, frames: nextFrames };
    }));
  }, [setImportedSystems, selectedSystem?.id]);

  // Back to dashboard handler — always returns to Scope tab (previous workflow page)
  const handleBackToDashboard = () => {
    setSelectedSystem(null);
    setShowHomeBase(true);
    setHomeTab('scope');
  };

  // Mark a system as complete — stamps time and returns to Scope tab
  const handleCompleteSystem = () => {
    if (!selectedSystem) return;
    const now = new Date().toISOString();
    setImportedSystems(prev => prev.map(sys =>
      sys.id === selectedSystem.id
        ? { ...sys, status: 'completed', lastModified: now }
        : sys
    ));
    setSelectedSystem(null);
    setShowHomeBase(true);
    setHomeTab('scope');
  };

  // Delete a system after confirmation
  const handleDeleteSystem = (systemId) => {
    setImportedSystems(prev => prev.filter(sys => sys.id !== systemId));
    if (selectedSystem?.id === systemId) {
      setSelectedSystem(null);
      setShowHomeBase(true);
      setHomeTab('scope');
    }
  };

  // Update a system's properties (e.g. systemType)
  const handleUpdateSystem = (systemId, updates) => {
    setImportedSystems(prev => prev.map(sys =>
      sys.id === systemId ? { ...sys, ...updates } : sys
    ));
    if (selectedSystem?.id === systemId) {
      setSelectedSystem(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  // ── Layout wrapper (sidebar removed) ──────────────────────────────────────
  const wrapWithSidebar = (content) => (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
    </div>
  );

  // Render sequence:
  // 1. If homeBase, show scope cards
  // 2. If imported but no system selected, show dashboard
  // 3. If system selected, show workspace for that system type

  if (activeView === 'takeoff') {
    return wrapWithSidebar(
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-panel)', flexShrink: 0 }}>
          <button
            onClick={() => setActiveView('workspace')}
            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Takeoff Workspace
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TakeoffWorkspace />
        </div>
      </div>
    );
  }

  if (activeView === 'frame-builder') {
    return wrapWithSidebar(
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>
        {/* Back button */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <button
            onClick={() => setActiveView('workspace')}
            style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            ← Back to Workspace
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Parametric Frame Builder
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ParametricFrameBuilder />
        </div>
      </div>
    );
  }

  if (activeView === 'executive-dashboard') {
    return wrapWithSidebar(
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-panel)', flexShrink: 0 }}>
          <button
            onClick={() => setActiveView('workspace')}
            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Executive Dashboard
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ExecutiveDashboard projectName={projectName} />
        </div>
      </div>
    );
  }

  if (showHomeBase) {
    // ── Tab bar helper ──
    const tabStyle = (tab) => ({
      padding: '0.55rem 1.25rem',
      fontSize: '0.82rem',
      fontWeight: homeTab === tab ? 700 : 500,
      color: homeTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)',
      background: 'transparent',
      border: 'none',
      borderBottom: homeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.15s',
    });

    return wrapWithSidebar(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

        {/* ── Top tab bar ── */}
        <div style={{ display: 'flex', gap: '0.25rem', padding: '0 2rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', flexShrink: 0, alignItems: 'center' }}>
          <button style={tabStyle('scope')} onClick={() => setHomeTab('scope')}>Scope</button>
          <button style={tabStyle('breakdown')} onClick={() => setHomeTab('breakdown')}>Breakdown</button>
          <button style={tabStyle('summary')} onClick={() => setHomeTab('summary')}>Summary</button>

          {importedSystems.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isDirty && saveStatus !== 'saved' && (
                <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600, letterSpacing: '0.02em' }}>
                  ● Not saved to file
                </span>
              )}
              <button
                onClick={handleSaveBid}
                style={{
                  padding: '4px 14px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: saveStatus === 'saved' ? 'rgba(52,211,153,0.15)' : 'rgba(59,130,246,0.15)',
                  border: saveStatus === 'saved' ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(59,130,246,0.4)',
                  color: saveStatus === 'saved' ? '#34d399' : '#60a5fa',
                }}
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save Bid'}
              </button>
            </div>
          )}
        </div>



        {/* ── Tab: Breakdown ── */}
        {homeTab === 'breakdown' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem 2.5rem' }}>
            {importedSystems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No systems added yet</p>
                <p style={{ fontSize: '0.82rem' }}>Add a scope from the Scope tab to see the breakdown here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {importedSystems.map(sys => {
                  const mats = sys.materials || [];
                  const labor = sys.laborTasks || [];
                  const frames = sys.frames || [];
                  const hasLineItems = mats.length > 0 || labor.length > 0 || frames.length > 0;
                  const sysLabor = getSystemLabor(sys);

                  return (
                    <div key={sys.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                      {/* System header */}
                      <div style={{ padding: '0.85rem 1.1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-panel)' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,123,255,0.1)', color: 'var(--accent-blue)', textTransform: 'uppercase' }}>{sys.shortName || sys.type}</span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{sys.name}</span>
                        <button
                          onClick={() => { setShowHomeBase(false); setSelectedSystem(sys); }}
                          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.08)', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✏️ Edit
                        </button>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{sysLabor.totalMH.toFixed(1)} MH</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                            ${sysLabor.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {!hasLineItems ? (
                        <div style={{ padding: '1rem 1.1rem', color: 'var(--text-secondary)', fontSize: '0.78rem', fontStyle: 'italic' }}>No line items yet — open this system to add materials or labor.</div>
                      ) : (
                        <div style={{ padding: '0.5rem 0' }}>
                          {/* Materials */}
                          {mats.length > 0 && (
                            <>
                              <div style={{ padding: '0.35rem 1.1rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials ({mats.length})</div>
                              {mats.map((m, i) => (
                                <div key={m.id || i} style={{ display: 'flex', alignItems: 'center', padding: '0.35rem 1.1rem', gap: '0.75rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <span style={{ flex: 2, color: 'var(--text-primary)', fontWeight: 500 }}>{m.description || m.name || `Item ${i + 1}`}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{m.quantity ?? '—'}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{m.unit || ''}</span>
                                  <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {m.totalCost != null ? `$${Number(m.totalCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}

                          {/* Labor */}
                          {labor.length > 0 && (
                            <>
                              <div style={{ padding: '0.5rem 1.1rem 0.35rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Labor ({labor.length})</div>
                              {labor.map((t, i) => (
                                <div key={t.id || i} style={{ display: 'flex', alignItems: 'center', padding: '0.35rem 1.1rem', gap: '0.75rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <span style={{ flex: 2, color: 'var(--text-primary)', fontWeight: 500 }}>{t.description || t.name || `Task ${i + 1}`}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{t.hours ?? t.quantity ?? '—'}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{t.hours != null ? 'hrs' : (t.unit || '')}</span>
                                  <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {t.totalCost != null ? `$${Number(t.totalCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}

                          {/* Frames (PartnerPak imports) — show calculated MH */}
                          {frames.length > 0 && (() => {
                            const mhRes = getSystemLabor(sys);
                            return (
                            <>
                              <div style={{ padding: '0.5rem 1.1rem 0.35rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Frames ({frames.length})</div>
                              {frames.map((f, i) => {
                                const fr = mhRes.frameResults[i] || {};
                                return (
                                <div key={f.id || i} style={{ display: 'flex', alignItems: 'center', padding: '0.35rem 1.1rem', gap: '0.75rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <span style={{ flex: 2, color: 'var(--text-primary)', fontWeight: 500 }}>{f.mark || f.name || `Frame ${i + 1}`}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.quantity ?? 1}</span>
                                  <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{fr.totalMH?.toFixed(1) || '0'} MH</span>
                                  <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    ${mhToCost(fr.totalMH || 0, laborRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                );
                              })}
                            </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Summary ── */}
        {homeTab === 'summary' && (() => {
          const totMat = importedSystems.reduce((s, sys) => s + (sys.materials || []).reduce((a, m) => a + (Number(m.totalCost) || 0), 0), 0);
          const totLab = importedSystems.reduce((s, sys) => s + (sys.laborTasks || []).reduce((a, t) => a + (Number(t.totalCost) || 0), 0), 0);
          const totCalcLabor = importedSystems.reduce((s, sys) => s + getSystemLabor(sys).totalCost, 0);
          const totMH = importedSystems.reduce((s, sys) => s + getSystemLabor(sys).totalMH, 0);
          const grandTotal = totMat + totLab + totCalcLabor;
          const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem 2.5rem' }}>
              {importedSystems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No systems added yet</p>
                  <p style={{ fontSize: '0.82rem' }}>Add a scope from the Scope tab to see the summary here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Per-system summary rows */}
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', padding: '0.6rem 1.1rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      <span style={{ flex: 2 }}>System</span>
                      <span style={{ flex: 0.7, textAlign: 'right' }}>Materials</span>
                      <span style={{ flex: 0.7, textAlign: 'right' }}>Labor (Manual)</span>
                      <span style={{ flex: 0.5, textAlign: 'right' }}>Total MH</span>
                      <span style={{ flex: 0.7, textAlign: 'right' }}>Calc. Labor</span>
                      <span style={{ flex: 0.8, textAlign: 'right' }}>System Total</span>
                    </div>
                    {importedSystems.map(sys => {
                      const sysMat = (sys.materials || []).reduce((a, m) => a + (Number(m.totalCost) || 0), 0);
                      const sysLab = (sys.laborTasks || []).reduce((a, t) => a + (Number(t.totalCost) || 0), 0);
                      const sysCalc = getSystemLabor(sys);
                      const sysTotal = sysMat + sysLab + sysCalc.totalCost;
                      return (
                        <div
                          key={sys.id}
                          onClick={() => { setShowHomeBase(false); setSelectedSystem(sys); }}
                          style={{ display: 'flex', padding: '0.6rem 1.1rem', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.82rem', alignItems: 'center', cursor: 'pointer', transition: 'background 0.12s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                          title={`Open ${sys.name} for editing`}
                        >
                          <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 5, background: 'rgba(0,123,255,0.1)', color: 'var(--accent-blue)', fontWeight: 700, textTransform: 'uppercase' }}>{sys.shortName || sys.type}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sys.name}</span>
                          </div>
                          <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(sysMat)}</span>
                          <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(sysLab)}</span>
                          <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{sysCalc.totalMH.toFixed(1)}</span>
                          <span style={{ flex: 0.7, textAlign: 'right', color: '#fbbf24', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${fmt(sysCalc.totalCost)}</span>
                          <span style={{ flex: 0.8, textAlign: 'right', color: '#34d399', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${fmt(sysTotal)}</span>
                          <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 700, padding: '1px 7px', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, marginLeft: '0.5rem' }}>Edit →</span>
                        </div>
                      );
                    })}
                    {/* Grand total row */}
                    <div style={{ display: 'flex', padding: '0.75rem 1.1rem', background: 'var(--bg-panel)', borderTop: '2px solid var(--border-subtle)', fontSize: '0.85rem', fontWeight: 700 }}>
                      <span style={{ flex: 2, color: 'var(--text-primary)' }}>Grand Total</span>
                      <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(totMat)}</span>
                      <span style={{ flex: 0.7, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>${fmt(totLab)}</span>
                      <span style={{ flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{totMH.toFixed(1)}</span>
                      <span style={{ flex: 0.7, textAlign: 'right', color: '#fbbf24', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${fmt(totCalcLabor)}</span>
                      <span style={{ flex: 0.8, textAlign: 'right', color: '#34d399', fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>${fmt(grandTotal)}</span>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                    {[
                      { label: 'Systems', value: importedSystems.length, color: 'var(--accent-blue)' },
                      { label: 'Total Materials', value: `$${fmt(totMat)}`, color: '#a78bfa' },
                      { label: 'Total MH', value: totMH.toFixed(1), color: '#38bdf8' },
                      { label: 'Calc. Labor', value: `$${fmt(totCalcLabor)}`, color: '#fbbf24' },
                      { label: 'Grand Total', value: `$${fmt(grandTotal)}`, color: '#34d399' },
                    ].map(stat => (
                      <div key={stat.label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1rem', background: 'var(--bg-card)', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</p>
                        <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: stat.color, fontVariantNumeric: 'tabular-nums' }}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tab: Scope (original home content) ── */}
        {homeTab === 'scope' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Add Project Scope
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Import, build, or create a scope to begin estimating
              </span>
            </div>

            {/* Hidden file input for typed imports */}
            <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileInputChange} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>

              {/* ── Frame-Based System Cards (with dual Import / Frame Builder buttons) ── */}
              {[
                { systemType: 'Ext SF', label: 'Exterior Storefront', desc: 'Bays, DLOs, subsills, caulk ÷20', icon: '🏢', color: '#3b82f6' },
                { systemType: 'Int SF', label: 'Interior Storefront', desc: 'Bays, DLOs, subsills, caulk ÷20', icon: '🏛️', color: '#10b981' },
                { systemType: 'Cap CW', label: 'Captured Curtain Wall', desc: 'Verticals, horizontals, stool trim, caulk ÷12', icon: '🏗️', color: '#f59e0b' },
                { systemType: 'SSG CW', label: 'SSG Curtain Wall', desc: 'Verticals, horizontals, stool trim, caulk ÷12', icon: '🌐', color: '#ef4444' },
              ].map(({ systemType, label, desc, icon, color }) => (
                <div key={systemType} style={{
                  borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
                  overflow: 'hidden', transition: 'all 0.18s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem 0.5rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>{desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1rem 0.8rem' }}>
                    <button
                      onClick={() => openPartnerPakForType(systemType)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                        padding: '0.4rem 0.5rem', borderRadius: 7, border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-deep)', color: 'var(--text-secondary)', fontSize: '0.72rem',
                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; e.currentTarget.style.background = `${color}0a`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-deep)'; }}
                    >
                      📄 Import
                    </button>

                  </div>
                </div>
              ))}

              {/* ── Utility Cards (single-action) ── */}
              {[
                { type: 'material-only',  label: 'Material Only',  desc: 'Flat-rate quotes, glass only, hardware bypasses', icon: '🧱', color: '#a78bfa' },
                { type: 'labor-only',     label: 'Labor Only',     desc: 'Demo, mobilization, standalone labor tasks',      icon: '👷‍♂️', color: '#34d399' },
                { type: 'custom-system',  label: 'Custom System',  desc: 'Combine manual labor tasks with a full material list', icon: '🛠️', color: '#8b5cf6' },
                { type: 'misc-labor',     label: 'Misc Labor',     desc: 'Daily cleaning, hardware installs, labor contingency', icon: '👷', color: '#fbbf24' },
              ].map(({ type, label, desc, icon, color }) => (
                <div key={type} style={{
                  borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
                  overflow: 'hidden', transition: 'all 0.18s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem 0.5rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>{desc}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1rem 0.8rem' }}>
                    <button
                      onClick={() => handleCreateBlankSystem(type)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                        padding: '0.4rem 0.5rem', borderRadius: 7, border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-deep)', color: 'var(--text-secondary)', fontSize: '0.72rem',
                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; e.currentTarget.style.background = `${color}0a`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-deep)'; }}
                    >
                      + Create
                    </button>
                  </div>
                </div>
              ))}

            </div>
          </div>

          {/* ── Existing Systems — re-open for editing ── */}
          {importedSystems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Existing Systems</h2>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click any system to re-open it for editing</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {importedSystems.map(sys => {
                  const sysLabor = getSystemLabor(sys);
                  const matTotal = (sys.materials || []).reduce((s, m) => s + (Number(m.totalCost ?? m.cost) || 0), 0);
                  return (
                    <button
                      key={sys.id}
                      onClick={() => { setShowHomeBase(false); setSelectedSystem(sys); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        width: '100%', padding: '0.75rem 1rem', textAlign: 'left',
                        borderRadius: 10, border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-card)', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.45)'; e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                    >
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: 'rgba(0,123,255,0.1)', color: 'var(--accent-blue)', textTransform: 'uppercase', flexShrink: 0 }}>{sys.shortName || sys.type}</span>
                      <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{sys.name}</span>
                      {matTotal > 0 && <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>${matTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })} mat</span>}
                      {sysLabor.totalMH > 0 && <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{sysLabor.totalMH.toFixed(1)} MH</span>}
                      <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 700, border: '1px solid rgba(59,130,246,0.3)', borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>✏️ Edit →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        )}



      </div>
    );
  }

  // If no system is selected, always show home base
  if (!selectedSystem) {
    if (!showHomeBase) setShowHomeBase(true);
    return null; // will re-render with showHomeBase=true above
  }

  // --- DYNAMIC WORKSPACE ROUTING ---
  if (selectedSystem.type === 'custom-system') {
    return wrapWithSidebar(
      <CustomSystemWorkspace
        system={selectedSystem}
        importedSystems={importedSystems}
        setImportedSystems={setImportedSystems}
        onComplete={handleCompleteSystem}
        onBack={handleBackToDashboard}
        crewSize={crewSize}
        laborContingency={laborContingency}
      />
    );
  }

  if (selectedSystem.type === 'material-only') {
    return wrapWithSidebar(
      <MaterialOnlyWorkspace
        system={selectedSystem}
        setImportedSystems={setImportedSystems}
        onComplete={handleCompleteSystem}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (selectedSystem.type === 'labor-only') {
    return wrapWithSidebar(
      <LaborOnlyWorkspace
        system={selectedSystem}
        setImportedSystems={setImportedSystems}
        onComplete={handleCompleteSystem}
        onBack={handleBackToDashboard}
        crewSize={crewSize}
        laborContingency={laborContingency}
      />
    );
  }

  if (selectedSystem.type === 'studio-frame-import') {
    const sp = selectedSystem.studioPayload ?? {};
    return wrapWithSidebar(
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, background: 'var(--bg-panel)' }}>
          <button
            onClick={handleBackToDashboard}
            style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Frame Builder
          </span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#60a5fa', marginLeft: 4 }}>
            — {selectedSystem.name}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {sp.widthInches != null ? `${sp.widthInches}"W` : ''}{sp.heightInches != null ? ` × ${sp.heightInches}"H` : ''}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ParametricFrameBuilder
            initialWidth={sp.widthInches ?? 120}
            initialHeight={sp.heightInches ?? 120}
            onSaveFrame={handleCompleteSystem}
          />
        </div>
      </div>
    );
  }

  // --- MISC LABOR WORKSPACE ---
  if (selectedSystem.type === 'misc-labor') {
    return wrapWithSidebar(
      <MiscLaborWorkspace
        system={selectedSystem}
        setImportedSystems={setImportedSystems}
        onComplete={handleCompleteSystem}
        onBack={handleBackToDashboard}
        laborRate={laborRate}
        crewSize={crewSize}
        markupPct={markupPercent}
      />
    );
  }

  // --- STANDARD PARTNERPAK WORKSPACE ---
  const workingSystem = importedSystems.find(sys => sys.id === selectedSystem?.id) || selectedSystem;

  return (
    <>
      {wrapWithSidebar(
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-deep)' }}>
        {/* Left: Tool Palette (cards view only) */}
        {frameView === 'cards' && (
          <ToolPalette activeTool={activeTool} setActiveTool={setActiveTool} customTools={customTools} setCustomTools={setCustomTools} />
        )}

        {/* Right: Main workspace + live recap sidebar */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Persistent header: back nav + system name + add to project */}
          <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button onClick={handleBackToDashboard} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>← Back</button>
              <span style={{ color: 'var(--border-subtle)' }}>|</span>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{workingSystem.name}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 10px', fontWeight: 600 }}>
                {(workingSystem.frames || []).length} {(workingSystem.frames || []).length === 1 ? 'Frame' : 'Frames'}
              </span>
            </div>
            <button
              onClick={handleCompleteSystem}
              style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
            >
              ✅ Add System to Project
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 1.5rem', flexShrink: 0 }}>
            {[
              { id: 'frames', label: '☰ Frames' },
              { id: 'labor', label: '📐 Labor' },
              { id: 'laborMHs', label: '📊 Labor MHs' },
              { id: 'materials', label: '📋 Materials' },
              { id: 'equipment', label: '🏗️ Equipment' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSystemTab(tab.id)}
                style={{
                  padding: '0.6rem 1.1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: systemTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: systemTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  fontWeight: systemTab === tab.id ? 700 : 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
            {/* Table|Cards toggle + MH breakdown toggle — only in Frames tab */}
            {systemTab === 'frames' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                  <button onClick={() => setFrameView('table')} style={{ padding: '5px 10px', background: frameView === 'table' ? 'rgba(59,130,246,0.15)' : 'transparent', border: 'none', color: frameView === 'table' ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }} title="Table view">☰ Table</button>
                  <button onClick={() => setFrameView('cards')} style={{ padding: '5px 10px', background: frameView === 'cards' ? 'rgba(59,130,246,0.15)' : 'transparent', border: 'none', borderLeft: '1px solid var(--border-subtle)', color: frameView === 'cards' ? 'var(--accent-blue)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }} title="Card view">▦ Cards</button>
                </div>
                <button
                  onClick={() => setShowMhBreakdown(v => !v)}
                  style={{ padding: '5px 10px', background: showMhBreakdown ? 'rgba(52,211,153,0.12)' : 'transparent', border: `1px solid ${showMhBreakdown ? 'rgba(52,211,153,0.35)' : 'var(--border-subtle)'}`, borderRadius: 6, color: showMhBreakdown ? '#34d399' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  title="Toggle MH breakdown"
                >📊 MH</button>
              </div>
            )}
          </div>

          {/* Tab content */}
          {systemTab === 'frames' && (
            frameView === 'table' ? (
              <FrameTable
                system={workingSystem}
                setImportedSystems={setImportedSystems}
                frameResults={getSystemLabor(workingSystem).frameResults || []}
              />
            ) : (
              <VisualCanvas
                systemName={workingSystem.name}
                systemType={workingSystem.systemType || workingSystem.name}
                frames={workingSystem.frames || []}
                onBack={handleBackToDashboard}
                activeTool={activeTool}
                onFrameClick={handleFrameClick}
                onUpdateFrameField={handleCardFrameFieldUpdate}
              />
            )
          )}

          {systemTab === 'frames' && showMhBreakdown && (() => {
            const mhResult = getSystemLabor(workingSystem);
            const frames = workingSystem.frames || [];
            const totals = workingSystem.totals || {};
            const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <div style={{ padding: '0.75rem 1.5rem 1rem', background: 'var(--bg-deep)', borderTop: '1px solid var(--border-subtle)' }}>
                {/* 4-stat summary bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Shop MH', value: mhResult.shopMH, color: '#a78bfa' },
                    { label: 'Distribution MH', value: mhResult.distributionMH, color: '#38bdf8' },
                    { label: 'Field MH', value: mhResult.fieldMH, color: '#fbbf24' },
                    { label: 'Total MH', value: mhResult.totalMH, color: '#34d399' },
                  ].map(stat => (
                    <div key={stat.label} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '0.6rem 0.75rem', background: 'var(--bg-card)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>{stat.label}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: stat.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(stat.value)}</div>
                    </div>
                  ))}
                </div>
                {/* Per-frame MH table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '0.35rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Frame</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Size</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Panels</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>DLOs</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Joints</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#a78bfa', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Shop MH</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#38bdf8', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Dist MH</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#fbbf24', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Field MH</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#34d399', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Total MH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frames.map((f, i) => {
                      const fr = mhResult.frameResults[i] || {};
                      return (
                        <tr key={f.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>{f.mark || f.frame_number || `Frame ${i + 1}`}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.width}" × {f.height}"</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.quantity || 1}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.panels || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.dlos || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f.joints || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>{fmt(fr.shopMH)}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{fmt(fr.distributionMH)}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{fmt(fr.fieldMH)}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#34d399', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(fr.totalMH)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                      <td colSpan={6} style={{ padding: '0.45rem 0.5rem', fontWeight: 700, fontSize: '0.76rem', color: 'var(--text-primary)' }}>
                        Total — {frames.length} elevations, {totals.totalQuantity || frames.reduce((s, f) => s + (f.quantity || 1), 0)} frames, {fmt(totals.totalSF || 0)} SF
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>{fmt(mhResult.shopMH)}</td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{fmt(mhResult.distributionMH)}</td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{fmt(mhResult.fieldMH)}</td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#34d399', fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}>{fmt(mhResult.totalMH)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}

          {systemTab === 'labor' && (() => {
            const frames = workingSystem.frames || [];
            const totals = workingSystem.totals || {};
            const sysType = workingSystem.systemType || workingSystem.name;
            const mhResult = getSystemLabor(workingSystem);
            const totalCost = mhResult.totalCost;
            const allZero = mhResult.totalMH === 0 && frames.length > 0;
            const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem 1rem', background: 'var(--bg-deep)' }}>
                {allZero && (
                  <p style={{ fontSize: '0.76rem', color: '#fbbf24', marginBottom: '0.75rem', lineHeight: 1.6, padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)', borderRadius: 6, border: '1px solid rgba(251,191,36,0.15)' }}>
                    <strong>Rates not configured.</strong> Open the Admin section to set hourly function rates and item rates for "{sysType}".
                    All rates default to 0 until your company configures them.
                  </p>
                )}

                {/* ── Additional Labor Lines: Cleaning, Contingency ── */}
                {(() => {
                  const laborExtras       = workingSystem.laborExtras || {};
                  const cleaningHrsPerDay = laborExtras.cleaningHrsPerDay ?? 1;
                  const contingencyPct    = laborExtras.contingencyPct ?? 2.5;

                  const totalMH = mhResult.totalMH || 0;
                  const fieldMH = mhResult.fieldMH || 0;
                  const crew    = crewSize > 0 ? crewSize : 1;
                  const daysQty = (fieldMH / crew) / 8;  // field hrs only

                  const activeRate = bidLaborRate || laborRate || 0;

                  const cleaningMH   = daysQty * cleaningHrsPerDay;
                  const cleaningCost = cleaningMH * activeRate;

                  const contingencyMH   = totalMH * (contingencyPct / 100);
                  const contingencyCost = contingencyMH * activeRate;

                  const fmtN = n => n <= 0 ? '0' : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);

                  const updateLaborExtras = (patch) => {
                    setImportedSystems(prev => prev.map(sys =>
                      sys.id !== selectedSystem?.id ? sys : {
                        ...sys,
                        laborExtras: { ...(sys.laborExtras || {}), ...patch }
                      }
                    ));
                  };

                  const inputSt = { width: 56, padding: '2px 5px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-primary)', fontSize: '0.78rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none' };

                  return (
                    <div style={{ marginTop: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Section header */}
                      <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(251,191,36,0.07)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fbbf24' }}>
                          ➕ Additional Labor &amp; Equipment
                        </span>
                      </div>

                      {/* Daily Cleaning */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(251,191,36,0.03)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 130 }}>🧹 Daily Cleaning</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmtN(daysQty)} days ×</span>
                        <input
                          type="number" min="0" step="0.25" value={cleaningHrsPerDay}
                          onChange={e => updateLaborExtras({ cleaningHrsPerDay: parseFloat(e.target.value) || 0 })}
                          style={inputSt}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>hr/day =</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{fmt(cleaningMH)} MH</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>× ${fmt(activeRate)}/hr</span>
                        <div style={{ marginLeft: 'auto', fontSize: '0.95rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(cleaningCost)}</div>
                      </div>

                      {/* Labor Contingency */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 130 }}>⚖️ Labor Contingency</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmt(totalMH)} MH ×</span>
                        <input
                          type="number" min="0" max="100" step="0.5" value={contingencyPct}
                          onChange={e => updateLaborExtras({ contingencyPct: parseFloat(e.target.value) || 0 })}
                          style={inputSt}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>% =</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{fmt(contingencyMH)} MH</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>× ${fmt(activeRate)}/hr</span>
                        <div style={{ marginLeft: 'auto', fontSize: '0.95rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmt(contingencyCost)}</div>
                      </div>

                    </div>
                  );
                })()}

                {/* Labor Days calculation chain — Field MH only */}
                {(() => {
                  const fieldMH   = mhResult.fieldMH || 0;
                  const crew      = crewSize > 0 ? crewSize : 1;
                  const hrsPerMan = fieldMH / crew;
                  const daysQty   = hrsPerMan / 8;
                  const weeksQty  = daysQty / 5;
                  const monthsQty = daysQty / 20;
                  const fmtLD = n => n <= 0 ? '0' : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);

                  const rows = [
                    { label: `Field MH (${fmt(fieldMH)}) ÷ crew size (${crew} men) = field hrs per man`, value: fmtLD(hrsPerMan), unit: 'hrs/man' },
                    { label: `Field hrs per man (${fmtLD(hrsPerMan)}) ÷ 8 hrs/day = qty of days`, value: fmtLD(daysQty), unit: 'days' },
                    { label: `Days (${fmtLD(daysQty)}) ÷ 5 days/wk = qty of weeks`, value: fmtLD(weeksQty), unit: 'wks' },
                    { label: `Days (${fmtLD(daysQty)}) ÷ 20 days/mo = qty of months`, value: monthsQty.toFixed(2), unit: 'mo' },
                  ];

                  return (
                    <div style={{ marginTop: '1rem', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', background: 'rgba(0,212,255,0.07)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#00d4ff' }}>
                          ⏱ Labor Days
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          Crew: <strong style={{ color: '#e6edf3' }}>{crew} men</strong> · 8 hrs/day · 5 days/wk · 20 days/mo · <span style={{ color: '#fbbf24' }}>Field MH only</span>
                        </span>
                      </div>
                      {rows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.75rem', background: i % 2 === 0 ? 'rgba(0,212,255,0.03)' : 'transparent', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.label}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: fieldMH > 0 ? '#e6edf3' : '#4b5563', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                            {row.value} <span style={{ fontSize: '0.65rem', color: '#00d4ff', fontWeight: 600 }}>{row.unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {systemTab === 'laborMHs' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <SystemLaborMHs
                system={workingSystem}
                setImportedSystems={setImportedSystems}
              />
            </div>
          )}

          {systemTab === 'materials' && (
            <MaterialDrawer
              inline
              isDrawerOpen={false}
              toggleDrawer={() => {}}
              activeSystemId={workingSystem.id}
              systemName={workingSystem.name}
              importedSystems={importedSystems}
              setImportedSystems={setImportedSystems}
            />
          )}

          {systemTab === 'equipment' && (() => {
            const laborExtras    = workingSystem.laborExtras || {};
            const equipmentItems = laborExtras.equipment || [];

            const inputSt  = { width: 56, padding: '2px 5px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-primary)', fontSize: '0.78rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none' };
            const selectSt = { padding: '3px 6px', background: '#161b22', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', cursor: 'pointer', width: '100%' };

            const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const updateEquipExtras = (patch) => {
              setImportedSystems(prev => prev.map(sys =>
                sys.id !== selectedSystem?.id ? sys : {
                  ...sys,
                  laborExtras: { ...(sys.laborExtras || {}), ...patch }
                }
              ));
            };

            const addEquipItem = () => updateEquipExtras({
              equipment: [...equipmentItems, { id: `eq-${Date.now()}`, categoryKey: '', rateItemId: '', name: '', weekRate: null, monthRate: null, pdRate: null, weeks: 0, months: 0, pickupDropoff: 0 }]
            });

            const updateEquipItem = (id, field, val) => updateEquipExtras({
              equipment: equipmentItems.map(e => e.id === id ? { ...e, [field]: val } : e)
            });

            const removeEquipItem = (id) => updateEquipExtras({
              equipment: equipmentItems.filter(e => e.id !== id)
            });

            // Selecting a category resets the model
            const selectEquipCategory = (itemId, categoryKey) => updateEquipExtras({
              equipment: equipmentItems.map(e =>
                e.id !== itemId ? e : { ...e, categoryKey, rateItemId: '', name: '', weekRate: null, monthRate: null, pdRate: null }
              )
            });

            // Selecting a model auto-fills rates from the store
            const selectEquipModel = (itemId, rateId) => {
              const rate = equipmentRates.find(r => r.id === rateId);
              if (!rate) return;
              updateEquipExtras({
                equipment: equipmentItems.map(e =>
                  e.id !== itemId ? e : { ...e, rateItemId: rateId, name: rate.name, weekRate: rate.weekRate, monthRate: rate.monthRate, pdRate: rate.pdRate }
                )
              });
            };

            const totalEquipCost = equipmentItems.reduce((sum, item) =>
              sum + (item.weeks || 0) * (item.weekRate || 0)
                  + (item.months || 0) * (item.monthRate || 0)
                  + (item.pickupDropoff || 0) * (item.pdRate ?? 310), 0);

            // ── Equipment Duration Calculator ─────────────────────────────
            const mhResult    = getSystemLabor(workingSystem);
            const allFR       = mhResult.frameResults || [];
            const sysCategory = getSystemCategory(workingSystem.systemType || workingSystem.name);
            const isSF        = sysCategory !== 'curtainwall';

            const dloHrs   = allFR.reduce((s, fr) => s + (fr.dlosMH || 0) + (fr.gtDlosMH || 0), 0);
            const caulkHrs = allFR.reduce((s, fr) => s + (fr.caulkMH || 0), 0);
            const ftHrs    = isSF ? 0 : allFR.reduce((s, fr) => s + (fr.ftMH || 0), 0);
            const frameHrs = isSF
              ? allFR.reduce((s, fr) => s + (fr.baysMH || 0) + (fr.gtBaysMH || 0), 0)
              : allFR.reduce((s, fr) => s + (fr.vertsMH || 0), 0);
            const totalFieldHrs = dloHrs + frameHrs + caulkHrs + ftHrs;
            const crewNum       = crewSize || 2;
            const equipDays     = crewNum > 0 ? totalFieldHrs / (crewNum * 8) : 0;
            const equipWeeks    = equipDays / 5;
            const fmtHrs = (n) => n.toFixed(2);
            const fmtNum = (n) => n.toFixed(2);
            const calcRows = isSF ? [
              { label: '>DLO Hours',    value: fmtHrs(dloHrs),    unit: 'hrs' },
              { label: '>Bays Hours',   value: fmtHrs(frameHrs),  unit: 'hrs' },
              { label: 'Caulking Hours', value: fmtHrs(caulkHrs), unit: 'hrs' },
              null,
              { label: 'Total Field Hours', value: fmtHrs(totalFieldHrs), unit: 'hrs', bold: true },
              { label: 'Crew Size',     value: crewNum, unit: 'workers', dim: true },
              { label: 'Hours / Day',   value: 8,       unit: 'hrs/day', dim: true },
              null,
              { label: 'Equipment Days',  value: fmtNum(equipDays),  unit: 'days',  bold: true, accent: true },
              { label: 'Equipment Weeks', value: fmtNum(equipWeeks), unit: 'weeks', bold: true, accent: true },
            ] : [
              { label: 'F&T Hours',       value: fmtHrs(ftHrs),     unit: 'hrs' },
              { label: '>DLO Hours',      value: fmtHrs(dloHrs),    unit: 'hrs' },
              { label: 'Caulking Hours',  value: fmtHrs(caulkHrs),  unit: 'hrs' },
              { label: 'Vertical Hours',  value: fmtHrs(frameHrs),  unit: 'hrs' },
              null,
              { label: 'Total Field Hours', value: fmtHrs(totalFieldHrs), unit: 'hrs', bold: true },
              { label: 'Crew Size',       value: crewNum, unit: 'workers', dim: true },
              { label: 'Hours / Day',     value: 8,       unit: 'hrs/day', dim: true },
              null,
              { label: 'Equipment Days',  value: fmtNum(equipDays),  unit: 'days',  bold: true, accent: true },
              { label: 'Equipment Weeks', value: fmtNum(equipWeeks), unit: 'weeks', bold: true, accent: true },
            ];

            return (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem 1rem', background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* ── Duration Calculator ── */}
                <div style={{ border: '1px solid rgba(168,139,250,0.25)', borderRadius: 8, overflow: 'hidden', background: 'rgba(168,139,250,0.04)' }}>
                  <div style={{ padding: '0.45rem 0.75rem', background: 'rgba(168,139,250,0.1)', borderBottom: '1px solid rgba(168,139,250,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a78bfa' }}>
                      ⏱️ Equipment Duration Calculator
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                      — {isSF ? 'Storefront' : 'Curtain Wall'} · crew of {crewNum} · 8-hr day
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', padding: '0.35rem 0' }}>
                    {calcRows.map((row, i) =>
                      row === null ? (
                        <div key={`div-${i}`} style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(168,139,250,0.15)', margin: '0.2rem 0' }} />
                      ) : (
                        <React.Fragment key={row.label}>
                          <span style={{ padding: '0.2rem 0.75rem', fontSize: '0.75rem', color: row.dim ? 'var(--text-secondary)' : row.accent ? '#c4b5fd' : 'var(--text-primary)', fontWeight: row.bold ? 700 : 400 }}>
                            {row.label}
                          </span>
                          <span style={{ padding: '0.2rem 0.25rem', fontSize: '0.78rem', color: row.accent ? '#a78bfa' : 'var(--text-primary)', fontWeight: row.bold ? 800 : 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.value}
                          </span>
                          <span style={{ padding: '0.2rem 0.75rem 0.2rem 0.3rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {row.unit}
                          </span>
                        </React.Fragment>
                      )
                    )}
                  </div>
                </div>

                {/* ── Equipment Lines ── */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(168,139,250,0.07)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a78bfa' }}>🏗️ Equipment</span>
                    <button
                      onClick={addEquipItem}
                      style={{ padding: '4px 12px', background: 'rgba(168,139,250,0.12)', border: '1px solid rgba(168,139,250,0.3)', borderRadius: 4, color: '#a78bfa', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                    >+ Add Equipment</button>
                  </div>

                  {equipmentItems.length === 0 && (
                    <div style={{ padding: '1rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      No equipment added. Click "+ Add Equipment" — select a category then a model to auto-fill rates.
                    </div>
                  )}

                  {equipmentItems.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-subtle)', textAlign: 'left' }}>
                          <th style={{ padding: '0.35rem 0.5rem 0.35rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', width: 170 }}>Category</th>
                          <th style={{ padding: '0.35rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>Model</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', width: 62 }}>Wks</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', width: 62 }}>Mos</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', width: 62 }}>P/D</th>
                          <th style={{ padding: '0.35rem 0.75rem', textAlign: 'right', color: '#a78bfa', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', width: 90 }}>Cost</th>
                          <th style={{ padding: '0.35rem 0.5rem', width: 32 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentItems.map((item, idx) => {
                          const categoryItems = equipmentRates.filter(r => r.category === item.categoryKey);
                          const itemCost = (item.weeks || 0) * (item.weekRate || 0)
                                         + (item.months || 0) * (item.monthRate || 0)
                                         + (item.pickupDropoff || 0) * (item.pdRate ?? 310);
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'rgba(168,139,250,0.02)' : 'transparent' }}>
                              {/* Category dropdown */}
                              <td style={{ padding: '0.3rem 0.5rem 0.3rem 0.75rem' }}>
                                <select
                                  value={item.categoryKey || ''}
                                  onChange={e => selectEquipCategory(item.id, e.target.value)}
                                  style={selectSt}
                                >
                                  <option value="">— Category —</option>
                                  {equipmentCategoryOrder.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Model dropdown */}
                              <td style={{ padding: '0.3rem 0.5rem' }}>
                                <select
                                  value={item.rateItemId || ''}
                                  onChange={e => selectEquipModel(item.id, e.target.value)}
                                  disabled={!item.categoryKey}
                                  style={{ ...selectSt, opacity: item.categoryKey ? 1 : 0.4 }}
                                >
                                  <option value="">{item.categoryKey ? '— Select model —' : '← Pick category first'}</option>
                                  {categoryItems.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Qty inputs */}
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                <input type="number" min="0" step="1" value={item.weeks || ''}
                                  onChange={e => updateEquipItem(item.id, 'weeks', parseFloat(e.target.value) || 0)}
                                  style={inputSt} />
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                <input type="number" min="0" step="1" value={item.months || ''}
                                  onChange={e => updateEquipItem(item.id, 'months', parseFloat(e.target.value) || 0)}
                                  style={inputSt} />
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                <input type="number" min="0" step="1" value={item.pickupDropoff || ''}
                                  onChange={e => updateEquipItem(item.id, 'pickupDropoff', parseFloat(e.target.value) || 0)}
                                  style={inputSt} />
                              </td>
                              {/* Live cost */}
                              <td style={{ padding: '0.3rem 0.75rem', textAlign: 'right', color: itemCost > 0 ? '#a78bfa' : 'var(--text-secondary)', fontWeight: itemCost > 0 ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                                {fmt(itemCost)}
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                <button
                                  onClick={() => removeEquipItem(item.id)}
                                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}
                                  title="Remove"
                                >✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                          <td colSpan={5} style={{ padding: '0.45rem 0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Rates auto-filled from Admin → Equipment Rates</td>
                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalEquipCost)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}

          </div>

          {/* Live recap sidebar */}
          <aside style={{
            width: isRecapCollapsed ? 46 : 340,
            borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: isRecapCollapsed ? 'hidden' : 'auto',
            flexShrink: 0,
          }}>
            <div style={{
              padding: isRecapCollapsed ? '0.55rem 0.35rem' : '0.9rem 1rem',
              borderBottom: '1px solid var(--border-subtle)',
              position: 'sticky',
              top: 0,
              background: 'var(--bg-panel)',
              zIndex: 2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: isRecapCollapsed ? 'center' : 'space-between', gap: '0.45rem' }}>
                {!isRecapCollapsed && (
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
                      Live Recap
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Warren-style pricing engine
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setIsRecapCollapsed(prev => !prev)}
                  title={isRecapCollapsed ? 'Expand Live Recap' : 'Collapse Live Recap'}
                  style={{
                    padding: isRecapCollapsed ? '3px 5px' : '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {isRecapCollapsed ? '«' : '»'}
                </button>
              </div>
            </div>

            {isRecapCollapsed ? null : (
              <>

            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Tax %</span>
                <input
                  type='number'
                  step='0.1'
                  value={taxPercent}
                  onChange={e => setTaxPercent(Number(e.target.value) || 0)}
                  style={{ padding: '0.45rem 0.55rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Margin %</span>
                <input
                  type='number'
                  step='0.1'
                  value={markupPercent}
                  onChange={e => setMarkupPercent(Number(e.target.value) || 0)}
                  style={{ padding: '0.45rem 0.55rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Labor Rate $/hr</span>
                <input
                  type='number'
                  step='0.1'
                  value={laborRate}
                  onChange={e => setGlobalLaborRate(e.target.value)}
                  style={{ padding: '0.45rem 0.55rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </label>

              {/* Ancillary auto-calc settings (selected system) */}
              <div style={{ marginTop: '0.2rem', paddingTop: '0.65rem', borderTop: '1px dashed rgba(255,255,255,0.1)', display: 'grid', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  Ancillary Auto Calc
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <input
                    type='checkbox'
                    checked={!!(selectedSystem?.ancillaryConfig?.enableSubsills ?? true)}
                    onChange={e => setSelectedAncillaryConfig({ enableSubsills: e.target.checked })}
                  />
                  Enable Subsills (width-based)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <input
                    type='checkbox'
                    checked={!!(selectedSystem?.ancillaryConfig?.enableReceptors ?? false)}
                    onChange={e => setSelectedAncillaryConfig({ enableReceptors: e.target.checked })}
                  />
                  Enable Receptors (width-based)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Subsill $/LF</span>
                    <input
                      type='number'
                      step='0.01'
                      value={selectedSystem?.ancillaryConfig?.subsillRatePerLF ?? 0}
                      onChange={e => setSelectedAncillaryConfig({ subsillRatePerLF: Number(e.target.value) || 0 })}
                      style={{ padding: '0.35rem 0.45rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Receptor $/LF</span>
                    <input
                      type='number'
                      step='0.01'
                      value={selectedSystem?.ancillaryConfig?.receptorRatePerLF ?? 0}
                      onChange={e => setSelectedAncillaryConfig({ receptorRatePerLF: Number(e.target.value) || 0 })}
                      style={{ padding: '0.35rem 0.45rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    />
                  </label>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Waste %</span>
                  <input
                    type='number'
                    step='0.1'
                    value={selectedSystem?.ancillaryConfig?.wastePct ?? 10}
                    onChange={e => setSelectedAncillaryConfig({ wastePct: Number(e.target.value) || 0 })}
                    style={{ padding: '0.35rem 0.45rem', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  <span>Subsill LF: {selectedAncillary.subsillLF.toFixed(2)}</span>
                  <span>Receptor LF: {selectedAncillary.receptorLF.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.45rem' }}>
                Current System
              </div>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Materials</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedRecap.materialCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }}><span style={{ color: 'var(--text-secondary)' }}>Ancillary Auto</span><span style={{ color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedAncillary.totalCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Labor</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedRecap.laborCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Tax</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedRecap.taxAmount)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>O&P</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedRecap.pricingAmount)}</span></div>
                <div style={{ marginTop: '0.15rem', paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800 }}><span style={{ color: '#34d399' }}>Final Bid</span><span style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(selectedRecap.finalBid)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }}><span style={{ color: 'var(--text-secondary)' }}>Projected GPM</span><span style={{ color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(selectedRecap.gpmPct)}%</span></div>
              </div>
            </div>

            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.45rem' }}>
                Category Rollup
              </div>
              {[
                { key: 'storefront', label: 'Storefront', color: '#34d399' },
                { key: 'curtainwall', label: 'Curtain Wall', color: '#60a5fa' },
                { key: 'misc', label: 'Misc', color: '#fbbf24' },
              ].map(row => (
                <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.8rem', color: row.color, fontWeight: 700 }}>{row.label}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(categoryRollups[row.key].finalBid)}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '0.95rem 1rem 1.2rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.5rem' }}>
                Project Total
              </div>
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Materials</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(projectRecap.materialCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Labor</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(projectRecap.laborCost)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>Tax</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(projectRecap.taxAmount)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>O&P</span><span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(projectRecap.pricingAmount)}</span></div>
                <div style={{ marginTop: '0.15rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '1.02rem', fontWeight: 900 }}><span style={{ color: '#34d399' }}>Final Bid</span><span style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(projectRecap.finalBid)}</span></div>
              </div>
            </div>
              </>
            )}
          </aside>
        </div>
      </div>
      )}

    {/* Bid Cart & Labor Engine slide-over */}
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 420,
      zIndex: 60,
      transform: isBidCartOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
      borderLeft: '1px solid var(--border-subtle, #2d333b)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg-panel, #0d1117)', borderBottom: '1px solid var(--border-subtle, #2d333b)', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e6edf3' }}>🛒 Bid Cart &amp; Labor Engine</span>
        <button
          onClick={() => setIsBidCartOpen(false)}
          style={{ background: 'none', border: 'none', color: '#9ea7b3', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <BidCartPanel projectName={projectName ?? 'My Project'} />
      </div>
    </div>
    {isBidCartOpen && (
      <div
        onClick={() => setIsBidCartOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 59,
        }}
      />
    )}

    {/* ── Leave-without-saving confirmation modal ── */}
    {showLeaveConfirm && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: '2rem', maxWidth: 420, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: '#f0f6fc', fontSize: '1rem', fontWeight: 700 }}>
            Leave without saving to file?
          </h3>
          <p style={{ margin: '0 0 1.5rem', color: '#8b949e', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Your bid data is auto-saved in this browser session, but saving to a <code style={{ color: '#58a6ff' }}>.gbid</code> file ensures it persists permanently.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                handleSaveBid();
                setShowLeaveConfirm(false);
                onNavigate?.(pendingNavDest);
                setPendingNavDest(null);
              }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Save &amp; Leave
            </button>
            <button
              onClick={() => {
                setShowLeaveConfirm(false);
                onNavigate?.(pendingNavDest);
                setPendingNavDest(null);
              }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8b949e', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Leave Anyway
            </button>
            <button
              onClick={() => {
                setShowLeaveConfirm(false);
                setPendingNavDest(null);
              }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#f0f6fc', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Stay on Bid
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
});

export default GlazeBidWorkspace;
