import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { useInboxStore } from '../../store/useInboxStore';
import Tab7BOM from './tabs/Tab7BOM';
import FrameBuilderCanvas from './FrameBuilderCanvas';
import WizardNewFrame from './WizardNewFrame';
import GlassTakeoutSheet from './GlassTakeoutSheet';
import AllGlassWallBuilder from './AllGlassWallBuilder';
import MetalMaterialList from './MetalMaterialList';
import FrameBuilderDashboard from './FrameBuilderDashboard';
import ScopeComplianceChecker from './ScopeComplianceChecker';
import ADAComplianceChecker from './ADAComplianceChecker';
import BidUnitPriceCalc from './BidUnitPriceCalc';
import VentScheduler from './VentScheduler';
import FirestopCalculator from './FirestopCalculator';
import CutListOptimizer from './CutListOptimizer';
import RevisionTracker from './RevisionTracker';
import PurchaseOrderSummary from './PurchaseOrderSummary';
import FrameScheduleExport from './FrameScheduleExport';
import ShopDrawingViewer from './ShopDrawingViewer';
import SubmittalCoverSheet from './SubmittalCoverSheet';
import AlternateBidSummary from './AlternateBidSummary';
import VendorLibraryManager from './VendorLibraryManager';
import PriceBookManager from './PriceBookManager';
import {
  ARCHETYPE_CATALOG,
  getVendorsForArchetype,
  FINISH_MULTIPLIERS,
  analyzeStructural,
  fmtIn,
} from '@glazebid/frame-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function inchesToFtIn(inches) {
  if (!inches || inches <= 0) return '';
  try { return fmtIn(inches); } catch (_) { /* fallback below */ }
  const total = Math.round(inches * 8) / 8;
  const ft = Math.floor(total / 12);
  const rem = total - ft * 12;
  const wi = Math.floor(rem);
  const frac = rem - wi;
  const fs = frac > 0 ? ` ${Math.round(frac * 8)}/8"` : '"';
  return ft > 0 ? `${ft}'-${wi}${fs}` : `${wi}${fs}`;
}

const SCOPE_OPTIONS = [
  { value: 'BASE_BID', label: 'Base Bid' },
  { value: 'ALT_1',    label: 'Alt 1' },
  { value: 'ALT_2',    label: 'Alt 2' },
  { value: 'ALT_3',    label: 'Alt 3' },
];

const SHAPE_OPTIONS = [
  { value: 'rectangular', label: 'Rectangular' },
  { value: 'arched',      label: 'Arched' },
  { value: 'sloped',      label: 'Sloped' },
  { value: 'trapezoid',   label: 'Trapezoid' },
];

const FINISH_OPTIONS = Object.entries(FINISH_MULTIPLIERS).map(([k]) => ({
  value: k,
  label: k === 'clear-anod'       ? 'Clear Anodized'
       : k === 'dark-bronze'      ? 'Dark Bronze'
       : k === 'black-anod'       ? 'Black Anodized'
       : k === 'two-coat-paint'   ? '2-Coat Paint'
       : k === 'three-coat-kynar' ? '3-Coat Kynar'
       : k === 'custom'           ? 'Custom'
       : k,
}));

const FINISH_SWATCHES = {
  'clear-anod':       '#9ab0b8',
  'dark-bronze':      '#5a3d20',
  'black-anod':       '#252525',
  'two-coat-paint':   '#6080a0',
  'three-coat-kynar': '#708860',
  'custom':           '#887060',
};

const ARCHETYPE_OPTIONS = Object.values(ARCHETYPE_CATALOG).map((a) => ({
  value: a.id,
  label: a.label,
}));

const EXPOSURE_OPTIONS = [
  { value: 'B', label: 'B — Suburban' },
  { value: 'C', label: 'C — Open Terrain' },
  { value: 'D', label: 'D — Coastal' },
];

const PRIMARY_TABS = [
  { id: 'framed',        label: 'Framed Systems' },
  { id: 'all-glass',     label: 'All-Glass Walls' },
  { id: 'glass-takeout', label: 'Glass Takeout' },
  { id: 'metal-list',    label: 'Metal List' },
  { id: 'dashboard',     label: 'Dashboard' },
];

const ADVANCED_TABS = [
  { id: 'vents',          label: 'Vents' },
  { id: 'firestop',       label: 'Firestop / Exp Joints' },
  { id: 'cut-list',       label: 'Cut List Optimizer' },
  { id: 'revisions',      label: 'Revisions' },
  { id: 'po-summary',     label: 'Purchase Orders' },
  { id: 'frame-schedule', label: 'Frame Schedule' },
  { id: 'shop-drawings',  label: 'Shop Drawings' },
  { id: 'submittal',      label: 'Submittal' },
  { id: 'alternates',     label: 'Alternates' },
  { id: 'vendor-library', label: 'Vendor Library' },
  { id: 'price-book',     label: 'Price Book' },
];

// ── Profile variants (mullion / transom) ─────────────────────────────────────
// face = nominal face width; mult = canvas draw multiplier vs. standard
const MULLION_VARIANTS = [
  { value: 'std-2',   label: 'Standard 2" Mullion',     face: '1.75" face', mult: 1.0 },
  { value: 'hd-4',    label: 'Heavy Duty 4" Mullion',   face: '4" face',    mult: 2.3 },
  { value: 'str-6',   label: 'Structural 6" Mullion',   face: '6" face',    mult: 3.4 },
];
const TRANSOM_VARIANTS = [
  { value: 'std-2',   label: 'Standard 2" Transom',     face: '1.75" face', mult: 1.0 },
  { value: 'hd-4',    label: 'Heavy Duty 4" Transom',   face: '4" face',    mult: 2.3 },
];

// ── Compact sub-components ────────────────────────────────────────────────────

const FieldRow = ({ label, children, hint }) => (
  <div style={{ padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5, minHeight: 26 }}>
    <span style={{ color: '#71717a', fontSize: 10, minWidth: 64, flexShrink: 0 }}>{label}</span>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
      {children}
      {hint && <span style={{ color: '#6a9ab0', fontSize: 10, whiteSpace: 'nowrap' }}>{hint}</span>}
    </div>
  </div>
);

const Inp = ({ value, onChange, type = 'text', width, style: xs }) => (
  <input
    type={type}
    value={value ?? ''}
    onChange={e => onChange(type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
    style={{
      background: '#18181b', border: '1px solid #3f3f46', borderRadius: 3,
      color: '#e4e4e7', fontSize: 11, padding: '2px 5px',
      width: width || '100%', outline: 'none', boxSizing: 'border-box', ...xs,
    }}
  />
);

const Sel = ({ value, onChange, options, style: xs }) => (
  <select
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    style={{
      background: '#18181b', border: '1px solid #3f3f46', borderRadius: 3,
      color: '#e4e4e7', fontSize: 11, padding: '2px 4px',
      width: '100%', outline: 'none', ...xs,
    }}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const SecHead = ({ title }) => (
  <div style={{
    padding: '5px 10px 2px', fontSize: 9, fontWeight: 700,
    color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.8,
    borderTop: '1px solid #27272a', marginTop: 2,
  }}>
    {title}
  </div>
);

// ── Slideout helper ───────────────────────────────────────────────────────────

const Slideout = ({ title, onClose, children }) => (
  <div style={{
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 360, zIndex: 200,
    background: '#18181b', borderLeft: '1px solid #3f3f46',
    boxShadow: '-8px 0 24px rgba(0,0,0,.6)',
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 44, padding: '0 16px', borderBottom: '1px solid #27272a', flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{title}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 14, cursor: 'pointer' }}>✕</button>
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
  </div>
);

// ── GroupNameInput ────────────────────────────────────────────────────────────

const GroupNameInput = ({ value, onChange, onConfirm, onCancel }) => (
  <div style={{ display: 'flex', gap: 3, padding: '4px 6px' }}>
    <input
      autoFocus value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }}
      style={{ flex: 1, padding: '3px 5px', fontSize: 11, background: '#18181b', border: '1px solid #3f3f46', borderRadius: 3, color: '#e4e4e7', outline: 'none' }}
      placeholder="Group name"
    />
    <button onClick={onConfirm} style={{ background: '#22c55e', border: 'none', color: '#fff', fontSize: 11, padding: '2px 7px', borderRadius: 3, cursor: 'pointer' }}>✓</button>
    <button onClick={onCancel}  style={{ background: '#3f3f46', border: 'none', color: '#fff', fontSize: 11, padding: '2px 7px', borderRadius: 3, cursor: 'pointer' }}>✕</button>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const FrameBuilder = ({ project, onNavigate, onBack }) => {
  const {
    activeTopTab,
    activeFrameId,
    groups, frames, glassSpecs,
    setActiveTopTab, setActiveFrame,
    addGroup, addFrame, updateFrame, updateGroup, resolveBOM,
  } = useFrameBuilderStore();

  const inboxItems = useInboxStore?.((s) => s.inbox || []) ?? [];

  const [expandedGroupId, setExpandedGroupId] = useState(() => groups[0]?.groupId ?? null);
  const [showGroupInput,  setShowGroupInput]  = useState(false);
  const [newGroupName,    setNewGroupName]    = useState('');
  const [showCompliance,  setShowCompliance]  = useState(false);
  const [showADA,         setShowADA]         = useState(false);
  const [showUnitPrice,   setShowUnitPrice]   = useState(false);
  const [showAdvancedMenu,setShowAdvancedMenu]= useState(false);
  const [rightTab,        setRightTab]        = useState('frame');
  const [selectedEl,      setSelectedEl]      = useState(null);
  const [wizardGroupId,   setWizardGroupId]   = useState(null);  // null = closed

  useEffect(() => {
    if (!showAdvancedMenu) return;
    const close = () => setShowAdvancedMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showAdvancedMenu]);

  // Seed first group + frame if store is empty
  useEffect(() => {
    // Scrub stale glassOverrides from persisted store data (pre-v2 schema artifacts)
    try {
      const raw = localStorage.getItem('glazebid-frame-builder-store');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.state?.frames) {
          let dirty = false;
          parsed.state.frames = parsed.state.frames.map(f => {
            if (f.glassOverrides && Object.keys(f.glassOverrides).length > 0) {
              dirty = true;
              return { ...f, glassOverrides: {} };
            }
            return f;
          });
          if (dirty) localStorage.setItem('glazebid-frame-builder-store', JSON.stringify(parsed));
        }
      }
    } catch (_) { /* ignore parse errors */ }

    const st = useFrameBuilderStore.getState();
    if (st.groups.length > 0) {
      // Auto-expand first group and select first frame if nothing active
      if (!st.activeFrameId && st.frames.length > 0) {
        st.setActiveFrame(st.frames[0].frameId);
      }
      setExpandedGroupId(prev => prev ?? st.groups[0]?.groupId ?? null);
      return;
    }
    const gid = st.addGroup('Ext Storefront — Dark Bronze', 'sf-450', 'kawneer-451t');
    st.updateGroup(gid, { finishType: 'dark-bronze', finishMultiplier: 1.08, connectionType: 'screw-spline', glassSpecId: 'GL-1' });
    if (st.frames.length === 0) {
      const fid = st.addFrame(gid);
      if (fid) {
        st.updateFrame(fid, { mark: 'Frame 1', widthInches: 84, heightInches: 102, bays: 2, rows: 2, quantity: 1, shape: 'rectangular' });
        st.setActiveFrame(fid);
        setExpandedGroupId(gid);
        // Trigger BOM resolution for the seeded frame
        setTimeout(() => {
          const latest = useFrameBuilderStore.getState();
          if (latest.resolveBOM) latest.resolveBOM(fid);
        }, 0);
      }
    }
  }, []);

  const activeFrame = frames.find(f => f.frameId === activeFrameId);
  const activeGroup = activeFrame ? groups.find(g => g.groupId === activeFrame.groupId) : null;

  // ── Frame validation warnings ──────────────────────────────────────────────
  function validateFrame(frame, bom) {
    if (!frame) return [];
    const w = [];
    if (!bom)                                         w.push({ level: 'error', msg: 'BOM not resolved' });
    if (!frame.glassSpecId && !activeGroup?.glassSpecId) w.push({ level: 'warn',  msg: 'No glass spec assigned' });
    if (bom?.structural?.status === 'ENGINEER_REQUIRED') w.push({ level: 'error', msg: 'Engineer review required' });
    if (bom?.structural?.status === 'ADD_STEEL')         w.push({ level: 'warn',  msg: 'Steel reinforcement required' });
    if (bom?.structural?.status === 'UPGRADE_PROFILE')   w.push({ level: 'warn',  msg: 'Profile upgrade required' });
    if ((frame.widthInches || 0) > 240)                  w.push({ level: 'warn',  msg: 'Width > 20′ — verify limits' });
    return w;
  }
  const activeFrameWarnings = useMemo(
    () => validateFrame(activeFrame, activeFrame?.lastBOM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFrame?.lastBOM, activeFrame?.glassSpecId, activeFrame?.widthInches]
  );

  const vendorOptions = useMemo(() => {
    const aid = activeGroup?.archetypeId || 'sf-450';
    return getVendorsForArchetype(aid).map(v => ({ value: v.id, label: `${v.manufacturer} ${v.productLine}` }));
  }, [activeGroup?.archetypeId]);

  const structuralResult = useMemo(() => {
    if (!activeFrame || !activeGroup) return null;
    const { widthInches, heightInches, bays, rows, windSpeedMph, exposureCategory, buildingHeightFt } = activeFrame;
    if (!widthInches || !heightInches || widthInches < 12 || heightInches < 12) return null;
    const arch = ARCHETYPE_CATALOG[activeGroup.archetypeId || 'sf-450'];
    if (!arch) return null;
    try {
      return analyzeStructural({
        windSpeedMph: windSpeedMph || 90,
        exposureCategory: exposureCategory || 'C',
        buildingHeightFt: buildingHeightFt || 30,
        mullionSpanIn: Math.round(heightInches / (rows || 1)),
        tributaryWidthIn: Math.round(widthInches / (bays || 1)),
        profileDepthIn: arch.profileDepth,
        systemClass: activeFrame.systemClass || 'ext-storefront',
      });
    } catch (_) { return null; }
  }, [activeFrame, activeGroup]);

  const statusBadge = (() => {
    if (!structuralResult) return null;
    return {
      PASS:              { label: 'PASS',    bg: '#14532d', color: '#4ade80' },
      ADD_STEEL:         { label: 'STEEL',   bg: '#78350f', color: '#fbbf24' },
      UPGRADE_PROFILE:   { label: 'UPGRADE', bg: '#7c2d12', color: '#fb923c' },
      ENGINEER_REQUIRED: { label: 'ENGR REQ',bg: '#7f1d1d', color: '#f87171' },
    }[structuralResult.status] ?? null;
  })();

  const setF = patch => { if (activeFrameId) updateFrame(activeFrameId, patch); };
  const setG = patch => { if (activeGroup?.groupId) updateGroup(activeGroup.groupId, patch); };

  const handleElementSelect = (hit) => {
    setSelectedEl(hit);
    setRightTab('element');
  };

  const openWizard = (gid) => setWizardGroupId(gid);

  const handleWizardComplete = ({ archetypeId, vendorSystemId, finishType, connectionType, finishMultiplier, glassSpecId, mark, widthInches, heightInches, bays, rows, quantity, sillAFF, scopeTag, estimatorNotes }) => {
    // Update group system settings to match wizard
    if (wizardGroupId) {
      updateGroup(wizardGroupId, { archetypeId, vendorSystemId, finishType, connectionType, finishMultiplier, glassSpecId });
    }
    const fid = addFrame(wizardGroupId);
    if (fid) {
      updateFrame(fid, { mark, widthInches, heightInches, bays, rows, quantity, sillAFF, scopeTag, estimatorNotes, glassSpecId, vendorSystemId, finishType });
      setTimeout(() => {
        const latest = useFrameBuilderStore.getState();
        if (latest.resolveBOM) latest.resolveBOM(fid);
      }, 0);
    }
    setWizardGroupId(null);
    setExpandedGroupId(wizardGroupId);
  };

  const handleAddGroup = () => { setNewGroupName('Group ' + (groups.length + 1)); setShowGroupInput(true); };
  const confirmGroup   = () => { const n = newGroupName.trim(); if (n) addGroup(n); setShowGroupInput(false); setNewGroupName(''); };
  const cancelGroup    = () => { setShowGroupInput(false); setNewGroupName(''); };

  return (
    <div style={st.root}>

      {/* Breadcrumb */}
      <div style={st.breadcrumb}>
        {onBack && <button onClick={onBack} style={st.bcBtn}>← Suite</button>}
        {onBack && project && <span style={st.bcSep}>›</span>}
        {project && <>
          <button onClick={() => onNavigate?.('projectHome')} style={st.bcBtn}>
            {project?.name || project?.projectName || 'Project'}
          </button>
          <span style={st.bcSep}>›</span>
        </>}
        <span style={st.bcCurrent}>Frame Builder</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => onNavigate?.('bid-cart')} style={st.bidCartBtn}>Bid Cart →</button>
      </div>

      {/* Top tab bar */}
      <div style={st.topBar}>
        {PRIMARY_TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...st.topTab, ...(activeTopTab === tab.id ? st.topTabOn : {}) }}
            onClick={() => { setActiveTopTab(tab.id); setShowAdvancedMenu(false); }}
          >{tab.label}</button>
        ))}
        <div style={st.divider} />
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={{ ...st.topTab, ...(ADVANCED_TABS.some(t => t.id === activeTopTab) ? st.topTabOn : {}) }}
            onClick={() => setShowAdvancedMenu(v => !v)}
          >
            {ADVANCED_TABS.find(t => t.id === activeTopTab)?.label ?? 'More ▾'}
          </button>
          {showAdvancedMenu && (
            <div style={st.advMenu}>
              {ADVANCED_TABS.map(tab => (
                <button
                  key={tab.id}
                  style={{ ...st.advItem, ...(activeTopTab === tab.id ? st.advItemOn : {}) }}
                  onMouseEnter={e => { if (activeTopTab !== tab.id) e.currentTarget.style.background = '#27272a'; }}
                  onMouseLeave={e => { if (activeTopTab !== tab.id) e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => { setActiveTopTab(tab.id); setShowAdvancedMenu(false); }}
                >{tab.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compliance toolbar */}
      {activeTopTab === 'framed' && (
        <div style={st.compBar}>
          <button onClick={() => setShowCompliance(!showCompliance)} style={st.smallBtn}>Scope Compliance</button>
          <button onClick={() => setShowADA(!showADA)}               style={st.smallBtn}>ADA Check</button>
          <button onClick={() => setShowUnitPrice(!showUnitPrice)}   style={st.smallBtn}>Unit Prices</button>
        </div>
      )}

      {/* ── THREE-PANEL MAIN ROW ─────────────────────────────────────────── */}
      <div style={st.main}>

        {/* LEFT PANEL — frame list only */}
        {activeTopTab === 'framed' && (
          <div style={st.left}>
            <div style={st.leftHdr}>
              <span style={st.leftTitle}>FRAMES</span>
              {groups.length > 0 && activeGroup && (
                <button style={st.addBtn} onClick={() => openWizard(activeGroup.groupId)} title="Add frame">
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div style={st.frameListOuter}>
              {groups.length === 0 ? (
                <div style={st.empty}>
                  {inboxItems.length > 0 && (
                    <div style={st.studioBox}>
                      <div style={{ fontSize: 10, color: '#7dd3fc', fontWeight: 600, marginBottom: 3 }}>
                        {inboxItems.length} Studio takeoff{inboxItems.length !== 1 ? 's' : ''} ready
                      </div>
                      <button onClick={() => onNavigate?.('inbox')} style={st.studioBtn}>Import →</button>
                    </div>
                  )}
                  <p style={st.emptyTxt}>No frames yet.</p>
                  {showGroupInput
                    ? <GroupNameInput value={newGroupName} onChange={setNewGroupName} onConfirm={confirmGroup} onCancel={cancelGroup} />
                    : <button style={st.addGroupBtn} onClick={handleAddGroup}>+ Add Group</button>
                  }
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                  {groups.map(group => {
                    const gf = frames.filter(f => f.groupId === group.groupId);
                    const isExp = expandedGroupId === group.groupId;
                    return (
                      <div key={group.groupId} style={{ marginBottom: 5 }}>
                        <div style={st.groupRow} onClick={() => setExpandedGroupId(isExp ? null : group.groupId)}>
                          {isExp ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          <span style={st.groupName}>{group.name}</span>
                          <span style={st.groupCnt}>{gf.length}</span>
                        </div>
                        {isExp && (
                          <div style={st.groupFrames}>
                            {gf.length === 0
                              ? <button style={st.addFirstBtn} onClick={() => openWizard(group.groupId)}>+ Add Frame</button>
                              : gf.map(frame => {
                                // per-frame warning count
                                const fwarn = validateFrame(frame, frame.lastBOM);
                                return (
                                <div
                                  key={frame.frameId}
                                  style={{ ...st.frameRow, ...(activeFrameId === frame.frameId ? st.frameRowOn : {}) }}
                                  onClick={() => setActiveFrame(frame.frameId)}
                                >
                                  <span style={st.frameMark}>{frame.mark}</span>
                                  <span style={st.frameDims}>
                                    {frame.widthInches > 0 ? `${inchesToFtIn(frame.widthInches)} × ${inchesToFtIn(frame.heightInches)}` : '—'}
                                  </span>
                                  {fwarn.length > 0 && (
                                    <span style={{ fontSize: 9, color: fwarn.some(w => w.level === 'error') ? '#f87171' : '#fbbf24', flexShrink: 0 }}>
                                      {fwarn.some(w => w.level === 'error') ? '🔴' : '⚠️'}{fwarn.length}
                                    </span>
                                  )}
                                </div>
                                );
                              })
                            }
                            <button style={st.addFrameBtn} onClick={() => openWizard(group.groupId)}>+ Frame</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {showGroupInput
                    ? <GroupNameInput value={newGroupName} onChange={setNewGroupName} onConfirm={confirmGroup} onCancel={cancelGroup} />
                    : <button style={st.addGroupSmall} onClick={handleAddGroup}>+ Add Group</button>
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* CANVAS */}
        <div style={activeTopTab === 'framed' ? st.canvas : st.fullArea}>
          {activeTopTab === 'framed'        && <FrameBuilderCanvas onElementSelect={handleElementSelect} />}
          {activeTopTab === 'all-glass'     && <AllGlassWallBuilder />}
          {activeTopTab === 'glass-takeout' && <GlassTakeoutSheet />}
          {activeTopTab === 'metal-list'    && <MetalMaterialList />}
          {activeTopTab === 'vents'         && <VentScheduler />}
          {activeTopTab === 'firestop'      && <FirestopCalculator />}
          {activeTopTab === 'cut-list'      && <CutListOptimizer />}
          {activeTopTab === 'revisions'     && <RevisionTracker />}
          {activeTopTab === 'po-summary'    && <PurchaseOrderSummary />}
          {activeTopTab === 'frame-schedule'&& <FrameScheduleExport />}
          {activeTopTab === 'shop-drawings' && <ShopDrawingViewer />}
          {activeTopTab === 'submittal'     && <SubmittalCoverSheet />}
          {activeTopTab === 'alternates'    && <AlternateBidSummary />}
          {activeTopTab === 'vendor-library'&& <VendorLibraryManager />}
          {activeTopTab === 'price-book'    && <PriceBookManager />}
          {activeTopTab === 'dashboard'     && (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
              <FrameBuilderDashboard />
              <BidUnitPriceCalc />
            </div>
          )}
        </div>

        {/* RIGHT PANEL — 3-tab inspector */}
        {activeTopTab === 'framed' && (
          <div style={st.right}>
            <div style={st.rightTabBar}>
              {['frame', 'element', 'bom'].map(t => (
                <button
                  key={t}
                  style={{ ...st.rtBtn, ...(rightTab === t ? st.rtBtnOn : {}) }}
                  onClick={() => setRightTab(t)}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={st.rightBody}>

              {/* FRAME tab */}
              {rightTab === 'frame' && (
                !activeFrame
                  ? <div style={st.noSel}>Select a frame to edit</div>
                  : <>
                    <SecHead title="Frame Parameters" />

                    <FieldRow label="Name">
                      <Inp value={activeFrame.mark} onChange={v => setF({ mark: v })} />
                    </FieldRow>

                    <FieldRow label="Panels / Rows">
                      <Inp type="number" value={activeFrame.bays} onChange={v => setF({ bays: Math.max(1, v) })} width={48} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>/</span>
                      <Inp type="number" value={activeFrame.rows} onChange={v => setF({ rows: Math.max(1, v) })} width={48} />
                    </FieldRow>

                    {/* ── Bay width entry ── */}
                    {(activeFrame.bays ?? 1) > 1 && (() => {
                      const B = activeFrame.bays;
                      const profileW = 1.75;
                      const target = activeFrame.widthInches - (B - 1) * profileW;
                      const cfgs = activeFrame.bayConfigs || [];
                      const hasX = cfgs.length === B && cfgs.every(c => typeof c.widthOverride === 'number');
                      const eqW  = B > 0 ? Math.round((target / B) * 100) / 100 : 0;
                      const widths = hasX ? cfgs.map(c => c.widthOverride) : Array(B).fill(eqW);
                      const sum = widths.reduce((a, b) => a + b, 0);
                      const ok  = Math.abs(sum - target) < 0.5;
                      const updBay = (i, val) => {
                        const nw = [...widths]; nw[i] = val;
                        setF({ bayConfigs: Array.from({ length: B }, (_, idx) => ({
                          ...(cfgs[idx] || {}), index: idx,
                          type: cfgs[idx]?.type || 'glazing', widthOverride: nw[idx],
                        })) });
                      };
                      return <>
                        <SecHead title="Bay Widths" />
                        {widths.map((w, i) => (
                          <FieldRow key={i} label={`Bay ${i + 1}`} hint={inchesToFtIn(Math.max(w - profileW, 0))}>
                            <Inp type="number" value={w} onChange={v => updBay(i, Math.max(0, v))} />
                            <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                          </FieldRow>
                        ))}
                        <div style={{ padding: '2px 10px 5px', fontSize: 10, fontFamily: 'monospace', color: ok ? '#22c55e' : '#ef4444' }}>
                          {`Σ ${Math.round(sum * 10) / 10}" / ${Math.round(target * 10) / 10}" target ${ok ? '✓' : '✗'}`}
                        </div>
                      </>;
                    })()}

                    {/* ── Row height entry ── */}
                    {(activeFrame.rows ?? 1) > 1 && (() => {
                      const R = activeFrame.rows;
                      const profileW = 1.75;
                      const target = activeFrame.heightInches - (R - 1) * profileW;
                      const cfgs = activeFrame.rowConfigs || [];
                      const hasX = cfgs.length === R && cfgs.every(c => typeof c.heightOverride === 'number');
                      const eqH  = R > 0 ? Math.round((target / R) * 100) / 100 : 0;
                      const heights = hasX ? cfgs.map(c => c.heightOverride) : Array(R).fill(eqH);
                      const sum = heights.reduce((a, b) => a + b, 0);
                      const ok  = Math.abs(sum - target) < 0.5;
                      const updRow = (i, val) => {
                        const nh = [...heights]; nh[i] = val;
                        setF({ rowConfigs: Array.from({ length: R }, (_, idx) => ({
                          ...(cfgs[idx] || {}), index: idx, heightOverride: nh[idx],
                        })) });
                      };
                      return <>
                        <SecHead title="Row Heights" />
                        {heights.map((h, i) => (
                          <FieldRow key={i} label={`Row ${i + 1}`} hint={inchesToFtIn(Math.max(h - profileW, 0))}>
                            <Inp type="number" value={h} onChange={v => updRow(i, Math.max(0, v))} />
                            <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                          </FieldRow>
                        ))}
                        <div style={{ padding: '2px 10px 5px', fontSize: 10, fontFamily: 'monospace', color: ok ? '#22c55e' : '#ef4444' }}>
                          {`Σ ${Math.round(sum * 10) / 10}" / ${Math.round(target * 10) / 10}" target ${ok ? '✓' : '✗'}`}
                        </div>
                      </>;
                    })()}

                    <FieldRow label="Width" hint={inchesToFtIn(activeFrame.widthInches)}>
                      <Inp type="number" value={activeFrame.widthInches} onChange={v => setF({ widthInches: v })} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                    </FieldRow>

                    <FieldRow label="Height" hint={inchesToFtIn(activeFrame.heightInches)}>
                      <Inp type="number" value={activeFrame.heightInches} onChange={v => setF({ heightInches: v })} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                    </FieldRow>

                    <FieldRow label="Qty">
                      <Inp type="number" value={activeFrame.quantity} onChange={v => setF({ quantity: Math.max(1, v) })} width={52} />
                    </FieldRow>

                    <FieldRow label="Sill AFF">
                      <Inp type="number" value={activeFrame.sillAFF} onChange={v => setF({ sillAFF: v })} width={56} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                      {activeFrame.sillAFF > 0 && <span style={{ color: '#52525b', fontSize: 10 }}>{inchesToFtIn(activeFrame.sillAFF)}</span>}
                    </FieldRow>

                    <FieldRow label="Shape">
                      <Sel value={activeFrame.shape} onChange={v => setF({ shape: v })} options={SHAPE_OPTIONS} />
                    </FieldRow>

                    <FieldRow label="Scope">
                      <Sel value={activeFrame.scopeTag} onChange={v => setF({ scopeTag: v })} options={SCOPE_OPTIONS} />
                    </FieldRow>

                    <div style={{ padding: '3px 10px 5px', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <input
                        type="checkbox" id="mockup-chk"
                        checked={!!activeFrame.isMockup}
                        onChange={e => setF({ isMockup: e.target.checked })}
                        style={{ accentColor: '#0ea5e9', cursor: 'pointer' }}
                      />
                      <label htmlFor="mockup-chk" style={{ color: '#a1a1aa', fontSize: 11, cursor: 'pointer' }}>Mock-up frame</label>
                    </div>

                    <SecHead title="System & Finish" />

                    <FieldRow label="Archetype">
                      <Sel
                        value={activeGroup?.archetypeId || 'sf-450'}
                        onChange={v => setG({ archetypeId: v })}
                        options={ARCHETYPE_OPTIONS}
                      />
                    </FieldRow>

                    <FieldRow label="Vendor">
                      {vendorOptions.length > 0
                        ? <Sel value={activeGroup?.vendorSystemId || ''} onChange={v => setG({ vendorSystemId: v })} options={vendorOptions} />
                        : <span style={{ color: '#52525b', fontSize: 10 }}>No vendors for archetype</span>
                      }
                    </FieldRow>

                    <FieldRow label="Finish">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                        <span style={{
                          display: 'inline-block', width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                          background: FINISH_SWATCHES[activeGroup?.finishType] ?? '#888',
                          border: '1px solid rgba(255,255,255,0.15)',
                        }} />
                        <Sel
                          value={activeGroup?.finishType || 'clear-anod'}
                          onChange={v => setG({ finishType: v, finishMultiplier: FINISH_MULTIPLIERS[v] ?? 1.0 })}
                          options={FINISH_OPTIONS}
                        />
                      </div>
                    </FieldRow>

                    <FieldRow label="Connection">
                      <Sel
                        value={activeGroup?.connectionType || 'screw-spline'}
                        onChange={v => setG({ connectionType: v })}
                        options={[
                          { value: 'screw-spline', label: 'Screw Spline' },
                          { value: 'shear-block',  label: 'Shear Block' },
                        ]}
                      />
                    </FieldRow>

                    {vendorOptions.length > 0 && <>
                      <FieldRow label="Alt 1">
                        <Sel value={activeGroup?.altVendor1Id || ''} onChange={v => setG({ altVendor1Id: v })}
                          options={[{ value: '', label: '— None —' }, ...vendorOptions]} />
                      </FieldRow>
                      <FieldRow label="Alt 2">
                        <Sel value={activeGroup?.altVendor2Id || ''} onChange={v => setG({ altVendor2Id: v })}
                          options={[{ value: '', label: '— None —' }, ...vendorOptions]} />
                      </FieldRow>
                    </>}

                    <SecHead title="Glass" />

                    <FieldRow label="Spec">
                      <Sel
                        value={activeFrame.glassSpecId || activeGroup?.glassSpecId || 'GL-1'}
                        onChange={v => setF({ glassSpecId: v })}
                        options={glassSpecs.map(g => ({ value: g.specId, label: g.name }))}
                      />
                    </FieldRow>

                    {activeFrame.lastBOM?.glassSchedule?.length > 0 && (() => {
                      const gs = activeFrame.lastBOM.glassSchedule;
                      const lites = gs.reduce((t, g) => t + (g.quantity || 0), 0);
                      const first = gs[0];
                      const bays = activeFrame.bays || 1;
                      const rows = activeFrame.rows || 1;
                      const dloW = first?.widthInches ?? Math.round((activeFrame.widthInches / bays) - 2);
                      const dloH = first?.heightInches ?? Math.round((activeFrame.heightInches / rows) - 2);
                      return <>
                        <FieldRow label="DLO">
                          <span style={{ color: '#a1a1aa', fontSize: 11 }}>
                            {`${inchesToFtIn(dloW)} × ${inchesToFtIn(dloH)}`}
                          </span>
                        </FieldRow>
                        <FieldRow label="Lites">
                          <span style={{ color: '#a1a1aa', fontSize: 11 }}>{lites}</span>
                        </FieldRow>
                      </>;
                    })()}

                    <SecHead title="Structural" />

                    <FieldRow label="Wind / Exp">
                      <Inp type="number" value={activeFrame.windSpeedMph} onChange={v => setF({ windSpeedMph: v })} width={46} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>mph</span>
                      <Sel value={activeFrame.exposureCategory || 'C'} onChange={v => setF({ exposureCategory: v })}
                        options={EXPOSURE_OPTIONS} style={{ width: 110 }} />
                    </FieldRow>

                    <FieldRow label="Bldg Ht">
                      <Inp type="number" value={activeFrame.buildingHeightFt} onChange={v => setF({ buildingHeightFt: v })} width={52} />
                      <span style={{ color: '#52525b', fontSize: 10 }}>ft</span>
                    </FieldRow>

                    {statusBadge && (
                      <div style={{ padding: '3px 10px 5px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 9px', borderRadius: 3,
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                            background: statusBadge.bg, color: statusBadge.color,
                          }}>
                            {statusBadge.label}
                          </span>
                          {structuralResult?.steelRec && (
                            <span style={{ color: '#a1a1aa', fontSize: 10 }}>{structuralResult.steelRec.size}</span>
                          )}
                        </div>
                        {(structuralResult?.status === 'ADD_STEEL') && (
                          <span style={{ color: '#fbbf24', fontSize: 9 }}>→ Add 1.5×1.5×11ga HSS reinforcing</span>
                        )}
                        {(structuralResult?.status === 'UPGRADE_PROFILE') && (
                          <span style={{ color: '#fb923c', fontSize: 9 }}>→ Upgrade to 6" depth profile</span>
                        )}
                      </div>
                    )}

                    <SecHead title="Notes" />
                    {/* ── Validation warnings strip ── */}
                    {activeFrameWarnings.length > 0 && (
                      <div style={{ margin: '0 10px 6px', borderRadius: 4, overflow: 'hidden', border: '1px solid #3f3f46' }}>
                        {activeFrameWarnings.map((w, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                            background: w.level === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.08)',
                            borderBottom: i < activeFrameWarnings.length - 1 ? '1px solid #27272a' : 'none',
                          }}>
                            <span style={{ fontSize: 10, flexShrink: 0 }}>{w.level === 'error' ? '🔴' : '⚠️'}</span>
                            <span style={{ fontSize: 10, color: w.level === 'error' ? '#f87171' : '#fbbf24' }}>{w.msg}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ padding: '3px 10px 10px' }}>
                      <textarea
                        value={activeFrame.estimatorNotes || ''}
                        onChange={e => setF({ estimatorNotes: e.target.value })}
                        rows={3}
                        placeholder="Estimator notes…"
                        style={{
                          width: '100%', background: '#18181b', border: '1px solid #3f3f46',
                          borderRadius: 3, color: '#a1a1aa', fontSize: 11, padding: '4px 6px',
                          resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </>
              )}

              {/* ELEMENT tab */}
              {rightTab === 'element' && (
                !selectedEl
                  ? <div style={st.noSel}>
                      <span style={{ fontSize: 18, marginBottom: 6 }}>⬡</span>
                      Click a panel, transom, or mullion in the canvas to inspect it.
                    </div>
                  : <div style={{ overflowY: 'auto', flex: 1 }}>
                      {/* PANE */}
                      {selectedEl.type === 'pane' && (() => {
                        const b = selectedEl.bay ?? 0;
                        const r = selectedEl.row ?? 0;
                        const bays = activeFrame?.bays || 1;
                        const rows = activeFrame?.rows || 1;
                        const profileW = 1.75;
                        const bayW = bays > 0 ? (activeFrame?.widthInches - (bays - 1) * profileW) / bays : 0;
                        const rowH = rows > 0 ? (activeFrame?.heightInches - (rows - 1) * profileW) / rows : 0;
                        const dloW = Math.max(bayW - profileW, 0);
                        const dloH = Math.max(rowH - profileW, 0);
                        return <>
                          <SecHead title={`Pane — Bay ${b + 1}, Row ${r + 1}`} />
                          <FieldRow label="DLO W"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{inchesToFtIn(dloW)}</span></FieldRow>
                          <FieldRow label="DLO H"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{inchesToFtIn(dloH)}</span></FieldRow>
                          <FieldRow label="Glass SF"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{((dloW * dloH) / 144).toFixed(2)} SF</span></FieldRow>
                          <SecHead title="Glass Spec" />
                          <FieldRow label="Spec">
                            <Sel
                              value={activeFrame?.glassSpecId || ''}
                              onChange={v => setF({ glassSpecId: v })}
                              options={glassSpecs.map(g => ({ value: g.specId, label: g.name }))}
                            />
                          </FieldRow>
                        </>;
                      })()}
                      {/* TRANSOM */}
                      {selectedEl.type === 'transom' && (() => {
                        const r = selectedEl.row ?? 1;
                        const calcLen = activeFrame?.widthInches ?? 0;
                        const key = `transom-${r}`;
                        const ovr = activeFrame?.cutLengthOverrides?.[key];
                        const profVar = activeFrame?.memberOverrides?.[key]?.profileVariantId || 'std-2';
                        return <>
                          <SecHead title={`Transom — Row ${r} / ${r + 1}`} />
                          <FieldRow label="Calc Len"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{inchesToFtIn(calcLen)}</span></FieldRow>
                          <FieldRow label="Profile">
                            <Sel value={profVar} onChange={v => setF({ memberOverrides: { ...(activeFrame.memberOverrides || {}), [key]: { ...(activeFrame.memberOverrides?.[key] || {}), profileVariantId: v } } })} options={TRANSOM_VARIANTS} />
                          </FieldRow>
                          {profVar !== 'std-2' && <div style={{ padding: '0 10px 4px' }}><span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>{TRANSOM_VARIANTS.find(p => p.value === profVar)?.face}</span></div>}
                          <SecHead title="Cut Override" />
                          <FieldRow label="Length">
                            <Inp type="number" value={ovr ?? ''} onChange={v => setF({ cutLengthOverrides: { ...(activeFrame.cutLengthOverrides || {}), [key]: parseFloat(v) } })} style={{ opacity: ovr != null ? 1 : 0.5, width: 60 }} />
                            <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                            {ovr != null && <button onClick={() => { const o = { ...(activeFrame.cutLengthOverrides || {}) }; delete o[key]; setF({ cutLengthOverrides: o }); }} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 9, padding: '0 2px' }}>× clear</button>}
                          </FieldRow>
                          {ovr != null && <div style={{ padding: '0 10px 4px' }}><span style={{ background: '#78350f', color: '#fbbf24', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>OVERRIDE</span></div>}
                        </>;
                      })()}
                      {/* MULLION */}
                      {selectedEl.type === 'mullion' && (() => {
                        const b = selectedEl.bay ?? 1;
                        const calcLen = activeFrame?.heightInches ?? 0;
                        const key = `mullion-${b}`;
                        const ovr = activeFrame?.cutLengthOverrides?.[key];
                        const profVar = activeFrame?.memberOverrides?.[key]?.profileVariantId || 'std-2';
                        return <>
                          <SecHead title={`Mullion — Bay ${b} / ${b + 1}`} />
                          <FieldRow label="Calc Len"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{inchesToFtIn(calcLen)}</span></FieldRow>
                          <FieldRow label="Profile">
                            <Sel value={profVar} onChange={v => setF({ memberOverrides: { ...(activeFrame.memberOverrides || {}), [key]: { ...(activeFrame.memberOverrides?.[key] || {}), profileVariantId: v } } })} options={MULLION_VARIANTS} />
                          </FieldRow>
                          {profVar !== 'std-2' && <div style={{ padding: '0 10px 4px' }}><span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>{MULLION_VARIANTS.find(p => p.value === profVar)?.face}</span></div>}
                          <SecHead title="Cut Override" />
                          <FieldRow label="Length">
                            <Inp type="number" value={ovr ?? ''} onChange={v => setF({ cutLengthOverrides: { ...(activeFrame.cutLengthOverrides || {}), [key]: parseFloat(v) } })} style={{ opacity: ovr != null ? 1 : 0.5, width: 60 }} />
                            <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                            {ovr != null && <button onClick={() => { const o = { ...(activeFrame.cutLengthOverrides || {}) }; delete o[key]; setF({ cutLengthOverrides: o }); }} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 9, padding: '0 2px' }}>× clear</button>}
                          </FieldRow>
                          {ovr != null && <div style={{ padding: '0 10px 4px' }}><span style={{ background: '#78350f', color: '#fbbf24', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>OVERRIDE</span></div>}
                        </>;
                      })()}
                      {/* HEAD / SILL / JAMBS */}
                      {['head', 'sill', 'jamb-left', 'jamb-right'].includes(selectedEl.type) && (() => {
                        const label = { head: 'Head', sill: 'Sill', 'jamb-left': 'Left Jamb', 'jamb-right': 'Right Jamb' }[selectedEl.type];
                        const isHoriz = selectedEl.type === 'head' || selectedEl.type === 'sill';
                        const calcLen = isHoriz ? activeFrame?.widthInches : activeFrame?.heightInches;
                        const key = selectedEl.type;
                        const ovr = activeFrame?.cutLengthOverrides?.[key];
                        return <>
                          <SecHead title={label} />
                          <FieldRow label="Calc Len"><span style={{ color: '#a1a1aa', fontSize: 11 }}>{inchesToFtIn(calcLen)}</span></FieldRow>
                          <FieldRow label="Profile"><span style={{ color: '#52525b', fontSize: 10 }}>1.75" face</span></FieldRow>
                          <SecHead title="Cut Override" />
                          <FieldRow label="Length">
                            <Inp type="number" value={ovr ?? ''} onChange={v => setF({ cutLengthOverrides: { ...(activeFrame.cutLengthOverrides || {}), [key]: parseFloat(v) } })} style={{ opacity: ovr != null ? 1 : 0.5, width: 60 }} />
                            <span style={{ color: '#52525b', fontSize: 10 }}>in</span>
                            {ovr != null && <button onClick={() => { const o = { ...(activeFrame.cutLengthOverrides || {}) }; delete o[key]; setF({ cutLengthOverrides: o }); }} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 9, padding: '0 2px' }}>× clear</button>}
                          </FieldRow>
                          {ovr != null && <div style={{ padding: '0 10px 4px' }}><span style={{ background: '#78350f', color: '#fbbf24', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>OVERRIDE</span></div>}
                        </>;
                      })()}
                    </div>
              )}

              {/* BOM tab */}
              {rightTab === 'bom' && (
                <Tab7BOM frameId={activeFrameId} onNavigate={onNavigate} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTopTab === 'framed' && activeFrame && (
        <div style={st.statusBar}>
          <span>{activeFrame.mark}</span>
          {activeGroup && <><span style={st.sep}>·</span><span>{activeGroup.name}</span></>}
          {activeFrame.widthInches > 0 && (
            <><span style={st.sep}>·</span><span>{inchesToFtIn(activeFrame.widthInches)} × {inchesToFtIn(activeFrame.heightInches)}</span></>
          )}
          {(activeFrame.bays || 0) > 0 && (
            <><span style={st.sep}>·</span><span>{activeFrame.bays}p × {activeFrame.rows}r</span></>
          )}
          {activeFrame.lastBOM?.glassSchedule && (
            <><span style={st.sep}>·</span>
            <span>{activeFrame.lastBOM.glassSchedule.reduce((t, g) => t + (g.quantity || 0), 0)} lites</span></>
          )}
        </div>
      )}

      {/* Slide-outs */}
      {showCompliance && <Slideout title="Scope Compliance"         onClose={() => setShowCompliance(false)}><ScopeComplianceChecker /></Slideout>}
      {showADA        && <Slideout title="ADA Compliance"           onClose={() => setShowADA(false)}><ADAComplianceChecker /></Slideout>}
      {showUnitPrice  && <Slideout title="Bid Unit Price Calculator" onClose={() => setShowUnitPrice(false)}><BidUnitPriceCalc /></Slideout>}

      {/* New Frame Wizard */}
      {wizardGroupId && (
        <WizardNewFrame
          targetGroupId={wizardGroupId}
          groups={groups}
          glassSpecs={glassSpecs}
          updateGroup={updateGroup}
          onComplete={handleWizardComplete}
          onCancel={() => setWizardGroupId(null)}
        />
      )}
    </div>
  );
};

// ── Styles object ─────────────────────────────────────────────────────────────

const st = {
  root: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#09090b', overflow: 'hidden' },

  // Breadcrumb
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 32, background: '#0a0a0b', borderBottom: '1px solid #1f1f23', flexShrink: 0 },
  bcBtn:      { background: 'none', border: 'none', color: '#71717a', fontSize: 11, cursor: 'pointer', padding: 0 },
  bcSep:      { color: '#3f3f46', fontSize: 11 },
  bcCurrent:  { color: '#a1a1aa', fontSize: 11, fontWeight: 500 },
  bidCartBtn: { background: '#27272a', border: 'none', color: '#a1a1aa', fontSize: 11, cursor: 'pointer', padding: '2px 10px', borderRadius: 4 },

  // Top tab bar
  topBar:   { display: 'flex', height: 40, background: '#09090b', borderBottom: '1px solid #27272a', alignItems: 'center', gap: 2, padding: '0 12px', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' },
  topTab:   { flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 6, border: 'none', background: '#27272a', color: '#a1a1aa', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  topTabOn: { background: '#0ea5e9', color: '#fff' },
  divider:  { width: 1, height: 20, background: '#3f3f46', margin: '0 4px', flexShrink: 0 },
  advMenu:  { position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.5)', minWidth: 180, marginTop: 4, padding: '4px 0' },
  advItem:  { display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', background: 'transparent', color: '#a1a1aa', fontSize: 12, cursor: 'pointer' },
  advItemOn:{ background: '#1e3a5f', color: '#7dd3fc' },

  // Compliance bar
  compBar:  { display: 'flex', gap: 6, padding: '4px 12px', background: '#0f0f11', borderBottom: '1px solid #27272a', flexShrink: 0 },
  smallBtn: { background: '#27272a', border: 'none', color: '#a1a1aa', fontSize: 11, cursor: 'pointer', padding: '3px 10px', borderRadius: 4 },

  // Main row
  main:     { display: 'flex', flex: 1, overflow: 'hidden' },

  // Left panel (200px)
  left:       { width: 200, flexShrink: 0, background: '#111113', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  leftHdr:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 10px', background: '#1a1a1f', borderBottom: '1px solid #27272a', flexShrink: 0 },
  leftTitle:  { fontSize: 9, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.8 },
  addBtn:     { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer' },
  frameListOuter: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 14 },
  emptyTxt:   { fontSize: 11, color: '#52525b', textAlign: 'center' },
  studioBox:  { width: '100%', padding: '7px 9px', background: '#1e3a5f', border: '1px solid #0ea5e9', borderRadius: 4 },
  studioBtn:  { background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 10, padding: '2px 9px', borderRadius: 3, cursor: 'pointer', width: '100%', marginTop: 4 },
  addGroupBtn:    { background: '#fb923c', border: 'none', color: '#fff', fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 4, cursor: 'pointer' },
  addGroupSmall:  { background: 'transparent', border: '1px dashed #3f3f46', color: '#71717a', fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginTop: 4, width: '100%' },
  groupRow:   { display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 5px', background: '#1a1a1f', borderRadius: 3, cursor: 'pointer', color: '#a1a1aa' },
  groupName:  { flex: 1, fontWeight: 500, color: '#e4e4e7', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  groupCnt:   { fontSize: 9, color: '#52525b', background: '#27272a', padding: '1px 4px', borderRadius: 3 },
  groupFrames:{ paddingLeft: 12, paddingTop: 2, display: 'flex', flexDirection: 'column', gap: 2 },
  frameRow:   { display: 'flex', alignItems: 'center', gap: 5, height: 24, padding: '0 5px', borderRadius: 3, cursor: 'pointer', background: '#18181b' },
  frameRowOn: { background: '#0ea5e9' },
  frameMark:  { fontSize: 11, fontWeight: 600, color: '#e4e4e7' },
  frameDims:  { fontSize: 9, color: '#52525b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addFirstBtn:{ background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 3, cursor: 'pointer' },
  addFrameBtn:{ background: 'transparent', border: 'none', color: '#52525b', fontSize: 10, padding: '1px 3px', cursor: 'pointer', textAlign: 'left' },

  // Canvas area
  canvas:   { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  fullArea: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  // Right panel (260px)
  right:       { width: 260, flexShrink: 0, background: '#111113', borderLeft: '1px solid #27272a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightTabBar: { display: 'flex', height: 34, borderBottom: '1px solid #27272a', flexShrink: 0 },
  rtBtn:       { flex: 1, border: 'none', background: 'transparent', color: '#52525b', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer', borderBottom: '2px solid transparent' },
  rtBtnOn:     { color: '#e4e4e7', borderBottom: '2px solid #0ea5e9' },
  rightBody:   { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', overflowX: 'hidden' },
  noSel:       { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 6, color: '#52525b', fontSize: 11, textAlign: 'center', padding: 16 },

  // Status bar
  statusBar: { display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 14px', background: '#0f0f11', borderTop: '1px solid #1f1f23', fontSize: 11, color: '#71717a', flexShrink: 0 },
  sep:       { color: '#3f3f46' },
};

export default FrameBuilder;
