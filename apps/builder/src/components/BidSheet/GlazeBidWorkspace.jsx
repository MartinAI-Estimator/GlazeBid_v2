import React, { useState, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import PartnerPakDropZone from './PartnerPakDropZone';
import SystemDashboard from './SystemDashboard';
import ToolPalette from './ToolPalette';
import VisualCanvas from './VisualCanvas';
import MaterialDrawer from './MaterialDrawer';
import BidCartPanel from './BidCartPanel';
import LaborMathModal from './LaborMathModal';
import BidSummaryDashboard from './BidSummaryDashboard';
import ExecutiveDashboard from './ExecutiveDashboard';
import MaterialOnlyWorkspace from './MaterialOnlyWorkspace';
import LaborOnlyWorkspace from './LaborOnlyWorkspace';
import CustomSystemWorkspace from './CustomSystemWorkspace';
import ParametricFrameBuilder from './ParametricFrameBuilder';
import TakeoffWorkspace from './TakeoffWorkspace';
import { useBidSheet } from '../../context/BidSheetContext';
import SystemsSidebar from './SystemsSidebar';

const GlazeBidWorkspace = forwardRef(({ projectName, onNavigate, bidSettings = {}, onBidSettingsChange }, ref) => {
  const { frames, setFrames } = useBidSheet();
  const [importedSystems, setImportedSystems] = useState([]);
  const [selectedSystem, setSelectedSystem] = useState(null);
  const [showDropZone, setShowDropZone] = useState(true);
  const [showHomeBase, setShowHomeBase] = useState(true);
  const [activeTool, setActiveTool] = useState(null);
  const [customTools, setCustomTools] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBidCartOpen, setIsBidCartOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('workspace'); // 'workspace' | 'executive-dashboard'

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
        productionRates: { laborRate: 42, shopMHsPerSF: 0.11, distMHsPerSF: 0.051, fieldMHsPerSF: 0.264, beadsOfCaulk: 2 },
        customRates: {},
        lastModified: new Date().toISOString(),
      };
      setImportedSystems(prev => [card, ...prev]);
      setShowDropZone(false);
      setShowHomeBase(false);
    });
  }, []);

  // ── IPC: receive Frame Type Library snapshot from Studio ─────────────────
  //
  // When the estimator clicks "Send to Builder" in Studio's Frame Type Library,
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
            productionRates: { laborRate: 42, shopMHsPerSF: 0.11, distMHsPerSF: 0.051, fieldMHsPerSF: 0.264, beadsOfCaulk: 2 },
            customRates: {},
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
      setShowHomeBase(false);
    });
  }, []);

  // Expose navigation methods to parent (BidSheet title bar buttons)
  useImperativeHandle(ref, () => ({
    goHome: () => setShowHomeBase(true),
    importAnother: () => setShowHomeBase(true),
  }));

  // ── Bid Settings (received from parent, applied to all math) ──
  const {
    laborRate        = 42,
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

  // ── Sync system summaries to localStorage so ProjectHome Labor panel can read them ──
  useEffect(() => {
    try {
      const summaries = importedSystems.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        shortName: s.shortName,
        totals: s.totals,
        productionRates: s.productionRates,
      }));
      localStorage.setItem('glazebid:laborSystems', JSON.stringify(summaries));
    } catch { /* ignore */ }
  }, [importedSystems]);

  // Handle PartnerPak import completion
  const handleImportComplete = useCallback((systems) => {
    setImportedSystems(systems);
    setShowDropZone(false);
    setShowHomeBase(false);
  }, []);

  // Handle system selection from dashboard
  const handleSelectSystem = useCallback((systemId) => {
    const system = importedSystems.find(s => s.id === systemId);
    setSelectedSystem(system);
  }, [importedSystems]);

  // Generate a blank system of the given type
  const handleCreateBlankSystem = (type = 'material-only') => {
    const newId = `${type}-sys-${Date.now()}`;
    const newSystemCount = importedSystems.length + 1;

    let defaultName = `Alternate System ${newSystemCount}`;
    let shortName = `Alt ${newSystemCount}`;
    if (type === 'material-only')  { defaultName = 'Manual Material Scope';          shortName = 'Mat Only'; }
    if (type === 'labor-only')     { defaultName = 'Manual Labor Scope';             shortName = 'Lab Only'; }
    if (type === 'custom-system')  { defaultName = `Custom System ${newSystemCount}`; shortName = 'Custom'; }

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
      productionRates: { laborRate, shopMHsPerSF: 0.11, distMHsPerSF: 0.051, fieldMHsPerSF: 0.264, beadsOfCaulk: 2 },
      customRates: {},
    };

    setImportedSystems(prev => [...prev, blankSystem]);
    setShowDropZone(false);
    setShowHomeBase(false);
    setSelectedSystem(blankSystem); // Auto-navigate right into the new scope
  };

  // Click-to-apply "paintbrush" — replaces drag-and-drop entirely
  const handleFrameClick = (targetFrameId) => {
    if (!activeTool) return;

    try {
      const frameExists = selectedSystem.frames.find(f => String(f.id) === String(targetFrameId));
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

      // 1. Update local UI
      setSelectedSystem(prev => ({
        ...prev,
        frames: prev.frames.map(f => String(f.id) === String(targetFrameId) ? { ...f, modifiers: newMods } : f)
      }));

      // 2. Update master state
      setImportedSystems(prev => prev.map(sys => ({
        ...sys,
        frames: sys.frames.map(f => String(f.id) === String(targetFrameId) ? { ...f, modifiers: newMods } : f)
      })));

      // 3. Update global context
      setFrames(prev => {
        const cloned = JSON.parse(JSON.stringify(prev || []));
        const idx = cloned.findIndex(f => String(f.id) === String(targetFrameId));
        if (idx >= 0) cloned[idx].modifiers = newMods;
        return cloned;
      });

      // 4. Backend sync
      fetch(`/api/bidsheet/projects/${encodeURIComponent(projectName)}/frames/${targetFrameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiers: newMods })
      }).catch(err => console.error('[GlazeBid] Backend sync failed:', err));

    } catch (error) {
      console.error('🔴 CRITICAL ERROR applying modifier:', error);
    }
  };

  // Back to dashboard handler
  const handleBackToDashboard = () => {
    setSelectedSystem(null);
  };

  // Mark a system as complete — stamps time and returns to dashboard
  const handleCompleteSystem = () => {
    if (!selectedSystem) return;
    const now = new Date().toISOString();
    setImportedSystems(prev => prev.map(sys =>
      sys.id === selectedSystem.id
        ? { ...sys, status: 'completed', lastModified: now }
        : sys
    ));
    setSelectedSystem(null);
  };

  // Delete a system after confirmation
  const handleDeleteSystem = (systemId) => {
    setImportedSystems(prev => prev.filter(sys => sys.id !== systemId));
    if (selectedSystem?.id === systemId) setSelectedSystem(null);
  };

  // ── All systems combined (for the persistent Systems sidebar) ─────────────
  const allSystems = [
    ...importedSystems,
    ...studioCustomCards.map(card => ({
      id:          `studio-custom-${card.id}`,
      type:        'studio-custom',
      name:        card.name,
      shortName:   'Studio',
      description: card.description ?? '',
      status:      'pending',
      frames: [], materials: [],
      totals: {
        totalFrames:   card.totals?.count ?? 0,
        totalQuantity: card.totals?.count ?? 0,
        totalSF:       card.totals?.totalAreaSF ?? 0,
        shopMHs: 0, distMHs: 0, fieldMHs: 0, totalCost: 0,
      },
      studioCustomCard: card,
      lastModified: card.updatedAt,
    })),
  ];

  // ── Persistent sidebar wrapper ─────────────────────────────────────────────
  const wrapWithSidebar = (content) => (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
      <SystemsSidebar
        systems={allSystems}
        selectedSystemId={selectedSystem?.id}
        activeView={activeView}
        onSelect={(id) => { setShowHomeBase(false); setActiveView('workspace'); handleSelectSystem(id); }}
        onGoHome={() => { setShowHomeBase(true); setSelectedSystem(null); setActiveView('workspace'); }}
        onOpenTakeoff={() => setActiveView('takeoff')}
        onOpenFrameBuilder={() => setActiveView('frame-builder')}
        onOpenExecutive={() => setActiveView('executive-dashboard')}
        onOpenBidCart={() => setIsBidCartOpen(true)}
      />
    </div>
  );

  // Render sequence:
  // 1. If no import, show drop zone
  // 2. If imported but no system selected, show dashboard
  // 3. If system selected, show visual canvas with drag-drop

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
    return wrapWithSidebar(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>

        {/* ── Top bar: back to project ── */}
        <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-panel)', flexShrink: 0 }}>
          <button
            onClick={() => onNavigate && onNavigate('projectHome')}
            style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ← Back to Project
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Bid Builder
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

          {/* ── Section 1: Add Project Scope ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Add Project Scope
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Import or create a scope to begin estimating
              </span>
            </div>

            {/* 2×2 scope card grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>

              {/* PartnerPak Import */}
              <div style={{
                border: '1px dashed rgba(0,123,255,0.45)', borderRadius: 12,
                background: 'rgba(0,123,255,0.04)',
                overflow: 'hidden', transition: 'border-color 0.18s, box-shadow 0.18s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,123,255,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,123,255,0.45)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <PartnerPakDropZone onImportComplete={handleImportComplete} projectName={projectName} compact />
              </div>

              {/* Material Only */}
              <div
                onClick={() => handleCreateBlankSystem('material-only')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.9rem 1.1rem', borderRadius: 12, cursor: 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(0,123,255,0.05)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,123,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,123,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                  🧱
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.15rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Material Only</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Flat-rate quotes, glass only, hardware bypasses</p>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 700, flexShrink: 0 }}>+ Add</span>
              </div>

              {/* Labor Only */}
              <div
                onClick={() => handleCreateBlankSystem('labor-only')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.9rem 1.1rem', borderRadius: 12, cursor: 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(0,123,255,0.05)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,123,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(52,211,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                  👷‍♂️
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.15rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Labor Only</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Demo, mobilization, standalone labor tasks</p>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#34d399', fontWeight: 700, flexShrink: 0 }}>+ Add</span>
              </div>

              {/* Custom System */}
              <div
                onClick={() => handleCreateBlankSystem('custom-system')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.9rem 1.1rem', borderRadius: 12, cursor: 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.background = 'rgba(167,139,250,0.05)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(167,139,250,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                  🛠️
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.15rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Custom System</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Combine manual labor tasks with a full material list</p>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>+ Add</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    );
  }

  if (!selectedSystem) {
    return wrapWithSidebar(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', background: 'var(--bg-deep)' }}>
        {/* Top bar */}
        <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '0.65rem 2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <button
            onClick={() => onNavigate && onNavigate('projectHome')}
            style={{ padding: '5px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ← Back to Project
          </button>
          <button
            onClick={() => setShowHomeBase(true)}
            style={{ padding: '5px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ← Bid Builder Home
          </button>
        </div>

        {/* System Dashboard */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SystemDashboard
            systems={[
              ...importedSystems,
              // Studio custom cards land in "Needs Attention" (status=pending).
              // Convert them to the lightweight system card shape expected by SystemDashboard.
              ...studioCustomCards.map(card => ({
                id:           `studio-custom-${card.id}`,
                type:         'studio-custom',
                name:         card.name,
                shortName:    'Studio',
                description:  card.description ?? '',
                status:       'pending',
                frames:       [],
                materials:    [],
                totals: {
                  totalFrames:   card.totals?.count ?? 0,
                  totalQuantity: card.totals?.count ?? 0,
                  totalSF:       card.totals?.totalAreaSF ?? 0,
                  shopMHs: 0, distMHs: 0, fieldMHs: 0, totalCost: 0,
                },
                studioCustomCard: card,
                lastModified: card.updatedAt,
              })),
            ]}
            onSelectSystem={handleSelectSystem}
            onAddSystem={() => handleCreateBlankSystem('material-only')}
            onDeleteSystem={handleDeleteSystem}
          />
        </div>
      </div>
    );
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

  // --- STANDARD PARTNERPAK WORKSPACE ---
  return (
    <>
      {wrapWithSidebar(
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-deep)' }}>
        {/* Left: Tool Palette */}
        <ToolPalette activeTool={activeTool} setActiveTool={setActiveTool} customTools={customTools} setCustomTools={setCustomTools} />

        {/* Right: Visual Canvas — owns its own sticky header + back nav */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Action strip: cost + drawer/estimate buttons */}
          <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)', padding: '0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setIsLaborModalOpen(true)}
                style={{ padding: '6px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                ⏱️ Labor Math
              </button>
              <button
                onClick={() => setIsDrawerOpen(true)}
                style={{ padding: '6px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                📋 Materials
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>System Cost</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                  ${selectedSystem.totals?.totalCost?.toFixed(2) || '0.00'}
                </span>
              </div>
              <button
                onClick={() => setActiveView('executive-dashboard')}
                style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Review Final Estimate →
              </button>
              <button
                onClick={handleCompleteSystem}
                style={{ padding: '8px 16px', background: '#10b981', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
              >
                ✅ Add System to Project
              </button>
            </div>
          </div>

          {/* Visual Canvas */}
          <VisualCanvas
            systemName={selectedSystem.name}
            frames={selectedSystem.frames || []}
            onBack={handleBackToDashboard}
            activeTool={activeTool}
            onFrameClick={handleFrameClick}
          />
        </div>
      </div>
      )}

    {/* Labor Math Modal */}
    <LaborMathModal
      isOpen={isLaborModalOpen}
      onClose={() => setIsLaborModalOpen(false)}
      system={selectedSystem}
      setImportedSystems={setImportedSystems}
      laborRate={laborRate}
      customToolDefs={customTools}
      crewSize={crewSize}
      laborContingency={laborContingency}
    />

    {/* Material Drawer */}
    <MaterialDrawer
      isDrawerOpen={isDrawerOpen}
      toggleDrawer={() => setIsDrawerOpen(prev => !prev)}
      activeSystemId={selectedSystem.id}
      systemName={selectedSystem.name}
      importedSystems={importedSystems}
      setImportedSystems={setImportedSystems}
    />
    {isDrawerOpen && (
      <div
        onClick={() => setIsDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 49,
        }}
      />
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
    </>
  );
});

export default GlazeBidWorkspace;
