import React, { useState, useCallback, useEffect } from 'react';
import BlueprintViewer from './BlueprintViewer';
import ParametricFrameBuilder from './ParametricFrameBuilder';
import ScopeToolbelt from './ScopeToolbelt';
import useBidStore from '../../store/useBidStore';
import { SYSTEM_PACKAGES, DEFAULT_SYSTEM_ID } from '../../data/systemPackages';

const DRAWER_WIDTH = '30%';
const TRANSITION   = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';

// Per-engine accent colors (matches ScopeToolbelt ENGINE_META)
const ENGINE_COLOR = {
  GRID:     '#60a5fa',
  ASSEMBLY: '#a78bfa',
  LINEAR:   '#fbbf24',
  COUNT:    '#34d399',
};

const ENGINE_LABEL = {
  GRID:     'Grid Engine',
  ASSEMBLY: 'Assembly Engine',
  LINEAR:   'Linear Engine',
  COUNT:    'Count Engine',
};

//  Placeholder panels for non-GRID engines 
function EnginePlaceholder({ engine, scopeName, dims }) {
  const color = ENGINE_COLOR[engine] ?? '#9ea7b3';
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 24, textAlign: 'center',
      fontFamily: 'Inter,"Segoe UI",sans-serif',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {engine === 'ASSEMBLY' && (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        )}
        {engine === 'LINEAR' && (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}><line x1={2} y1={12} x2={22} y2={12}/><line x1={2} y1={8} x2={2} y2={16}/><line x1={22} y1={8} x2={22} y2={16}/></svg>
        )}
        {engine === 'COUNT' && (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx={12} cy={10} r={3}/></svg>
        )}
      </div>

      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>
          {scopeName}
        </div>
        <div style={{
          display: 'inline-block',
          fontSize: '0.62rem', fontWeight: 700,
          color, background: `${color}15`,
          border: `1px solid ${color}30`,
          borderRadius: 20, padding: '2px 10px',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {ENGINE_LABEL[engine]}
        </div>
      </div>

      {dims && (
        <div style={{ fontSize: '0.72rem', color: '#4b5563', marginTop: 4 }}>
          {dims.width}"  {dims.height}"
        </div>
      )}

      <div style={{
        marginTop: 8,
        padding: '10px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #1e2530',
        borderRadius: 8,
        fontSize: '0.68rem', color: '#6b7280',
        lineHeight: 1.6, maxWidth: 200,
      }}>
        {engine === 'ASSEMBLY' && 'Draws a box on the plan  calculates SqFt and hardware kit quantities.'}
        {engine === 'LINEAR'   && 'Draws a line on the plan  calculates linear footage and stretch-out.'}
        {engine === 'COUNT'    && 'Drops a pin on the plan  increments unit count.'}
        <div style={{ marginTop: 6, color: '#374151', fontStyle: 'italic' }}>
          Engine coming soon.
        </div>
      </div>
    </div>
  );
}

//  Main workspace 
export default function TakeoffWorkspace() {
  const addFrame            = useBidStore(s => s.addFrame);
  const incrementFrameQty   = useBidStore(s => s.incrementFrameQuantity);
  const savedFrames         = useBidStore(s => s.frames);
  const importBluebeamFrames = useBidStore(s => s.importBluebeamFrames);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [savedCount,   setSavedCount]   = useState(0);
  const [bbImportToast, setBbImportToast] = useState(null); // { count: n }

  // ── Auto-import Bluebeam frames queued by Smart Scan on the intake page ────
  useEffect(() => {
    const raw = sessionStorage.getItem('pendingBluebeamFrames');
    if (!raw) return;
    try {
      const frames = JSON.parse(raw);
      if (Array.isArray(frames) && frames.length > 0) {
        importBluebeamFrames(frames);
        setBbImportToast({ count: frames.length });
        setTimeout(() => setBbImportToast(null), 5000);
        console.log('📐 Auto-imported', frames.length, 'Bluebeam frame(s) from Smart Scan');
      }
    } catch (e) {
      console.error('Failed to auto-import Smart Scan frames:', e);
    } finally {
      sessionStorage.removeItem('pendingBluebeamFrames');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── Quantity — controlled by Drawer input OR Canvas stamp tool ────────────
  const [quantity, setQuantity] = useState(1);

  // ── Build & Stamp — active saved-frame for cross-page counting ──────────
  const [activeSavedFrameId, setActiveSavedFrameId] = useState(null);

  // Active grid — single source of truth for everything drawn on the plan
  const [activeGrid, setActiveGrid] = useState({
    width:      120,
    height:     120,
    bays:       1,
    rows:       1,
    bayWidths:  [120],
    rowHeights: [120],
  });

  // Scope / engine state
  const [currentEngine,    setCurrentEngine]    = useState('GRID');
  const [currentScopeName, setCurrentScopeName] = useState('Storefront');

  // ── Active glazing system ──────────────────────────────────────────────
  const [activeSystemId,   setActiveSystemId]   = useState(DEFAULT_SYSTEM_ID);

  // ── Toolbelt selection ─────────────────────────────────────────────────────
  const handleSelectScope = useCallback((itemName, engineType) => {
    setCurrentScopeName(itemName);
    setCurrentEngine(engineType);
    setIsDrawerOpen(false);
    setQuantity(1);
    setActiveSavedFrameId(null); // exit Build & Stamp mode
  }, []);
  // ── System package selection ──────────────────────────────────────────
  const handleSelectSystem = useCallback((pkgId) => {
    if (SYSTEM_PACKAGES[pkgId]) setActiveSystemId(pkgId);
  }, []);
  // ── ScopeToolbelt: user clicked a saved frame (Build & Stamp) ─────────
  const handleSelectSavedFrame = useCallback((frameId) => {
    setActiveSavedFrameId(frameId);
    setIsDrawerOpen(false); // work on the plan, not the drawer
  }, []);

  // ── BlueprintViewer: stamp was placed for a saved frame ───────────────
  const handleActiveSavedFrameStamp = useCallback((frameId) => {
    if (typeof incrementFrameQty === 'function') incrementFrameQty(frameId);
  }, [incrementFrameQty]);

  // ── BlueprintViewer: user finished drawing a box on the PDF ───────────────
  const handleBoxDrawn = useCallback((widthInches, heightInches) => {
    setQuantity(1); // reset count for fresh box
    setActiveSavedFrameId(null); // exit Build & Stamp mode when drawing new box
    setActiveGrid(prev => ({
      width:      widthInches,
      height:     heightInches,
      bays:       prev.bays,
      rows:       prev.rows,
      bayWidths:  Array.from({ length: prev.bays },  () => +(widthInches  / prev.bays ).toFixed(2)),
      rowHeights: Array.from({ length: prev.rows },  () => +(heightInches / prev.rows ).toFixed(2)),
    }));
    setIsDrawerOpen(true);
  }, []);

  // ── BlueprintViewer: user dragged a grid line on the overlay ──────────────
  const handleGridAdjusted = useCallback(({ newBayWidths, newRowHeights }) => {
    setActiveGrid(prev => ({
      ...prev,
      bayWidths:  newBayWidths,
      rowHeights: newRowHeights,
    }));
  }, []);

  // ── ParametricFrameBuilder: bays/rows spinner changed in the drawer ───────
  const handleBaysRowsChange = useCallback((newBays, newRows) => {
    setActiveGrid(prev => ({
      ...prev,
      bays:       newBays,
      rows:       newRows,
      bayWidths:  Array.from({ length: newBays }, () => +(prev.width  / newBays).toFixed(2)),
      rowHeights: Array.from({ length: newRows }, () => +(prev.height / newRows).toFixed(2)),
    }));
  }, []);
  // ── BlueprintViewer: user clicked a Bluebeam annotation overlay ────────────────────
  // Sets the system then opens the drawer with the annotation dimensions,
  // exactly as if the estimator had drawn the box themselves.
  const handleAnnotationClick = useCallback((widthIn, heightIn, sysId) => {
    if (sysId && SYSTEM_PACKAGES[sysId]) handleSelectSystem(sysId);
    handleBoxDrawn(widthIn, heightIn);
  }, [handleSelectSystem, handleBoxDrawn]);
  // ── ParametricFrameBuilder fires this on save ──────────────────────────────
  const handleSaveFrame = useCallback((payload) => {
    if (typeof addFrame === 'function') addFrame(payload);
    setSavedCount(c => c + 1);
    setIsDrawerOpen(false);
  }, [addFrame]);

  const closeDrawer = () => setIsDrawerOpen(false);

  // Close the frame-builder on Escape (non-destructive: lastBox is preserved)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isDrawerOpen) setIsDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDrawerOpen]);

  const accentColor = ENGINE_COLOR[currentEngine] ?? '#60a5fa';

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-deep, #0b0e11)',
      position: 'relative',
    }}>

      {/* Smart Scan auto-import toast */}
      {bbImportToast && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, pointerEvents: 'none',
          background: '#0d1117', border: '1px solid #34d39960',
          borderRadius: 8, padding: '8px 18px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          fontFamily: 'Inter,"Segoe UI",sans-serif', fontSize: '0.78rem',
          color: '#34d399', fontWeight: 600, whiteSpace: 'nowrap',
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
          Smart Scan imported {bbImportToast.count} frame{bbImportToast.count !== 1 ? 's' : ''} into BidSheet
        </div>
      )}

      {/* 
          SCOPE TOOLBELT  fixed left sidebar
           */}
      <ScopeToolbelt
        onSelectScope={handleSelectScope}
        onSelectSystem={handleSelectSystem}
        activeSystemId={activeSystemId}
        onSelectSavedFrame={handleSelectSavedFrame}
        activeSavedFrameId={activeSavedFrameId}
      />

      {/* 
          CENTER  Blueprint Viewer
           */}
      <div style={{
        flex: 1,
        transition: TRANSITION,
        overflow: 'hidden',
        position: 'relative',
        minWidth: 0,
      }}>
        <BlueprintViewer
          onBoxDrawn={handleBoxDrawn}
          editingActive={isDrawerOpen}
          bays={activeGrid.bays}
          rows={activeGrid.rows}
          bayWidths={activeGrid.bayWidths}
          rowHeights={activeGrid.rowHeights}
          onGridAdjusted={handleGridAdjusted}
          quantity={quantity}
          setQuantity={setQuantity}
          activeSavedFrameId={activeSavedFrameId}
          onActiveSavedFrameStamp={handleActiveSavedFrameStamp}
          onAnnotationClick={handleAnnotationClick}
        />
      </div>

      {/* 
          RIGHT DRAWER  Engine Panel (slides in from right)
           */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0,
        width: DRAWER_WIDTH,
        height: '100%',
        background: 'var(--bg-deep, #0b0e11)',
        borderLeft: `1px solid ${isDrawerOpen ? accentColor + '30' : '#2d333b'}`,
        boxShadow: isDrawerOpen ? `-8px 0 32px rgba(0,0,0,0.7)` : 'none',
        transform: isDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: TRANSITION,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        overflow: 'hidden',
      }}>

        {/* Drawer header */}
        <div style={{
          height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: `1px solid ${accentColor}20`,
          background: '#0b0f14',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {/* Engine color dot */}
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />

            {/* Scope name */}
            <span style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: '#e6edf3',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentScopeName}
            </span>

            {/* Engine badge */}
            <span style={{
              fontSize: '0.58rem', fontWeight: 700,
              color: accentColor,
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}30`,
              padding: '1px 7px', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              flexShrink: 0,
            }}>
              {ENGINE_LABEL[currentEngine]}
            </span>

            {/* Dimensions badge  only meaningful for GRID/ASSEMBLY */}
            {(currentEngine === 'GRID' || currentEngine === 'ASSEMBLY') && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 600,
                color: accentColor,
                background: `${accentColor}10`,
                border: `1px solid ${accentColor}25`,
                padding: '1px 7px', borderRadius: 10,
                flexShrink: 0,
              }}>
                {activeGrid.width}" × {activeGrid.height}"
                {activeGrid.bays > 1 && ` · ${activeGrid.bays}B`}
                {activeGrid.rows > 1 && `/${activeGrid.rows}R`}
              </span>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={closeDrawer}
            title="Close"
            style={{
              width: 26, height: 26, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #2d333b',
              borderRadius: 6,
              color: '#9ea7b3',
              fontSize: '0.75rem', fontWeight: 700,
              cursor: 'pointer', lineHeight: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ea7b3'; e.currentTarget.style.borderColor = '#2d333b'; }}
          >
            
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isDrawerOpen && (() => {
            switch (currentEngine) {
              case 'GRID':
                return (
                  <ParametricFrameBuilder
                    key={currentScopeName}
                    initialWidth={activeGrid.width}
                    initialHeight={activeGrid.height}
                    bayWidths={activeGrid.bayWidths}
                    rowHeights={activeGrid.rowHeights}
                    onBaysRowsChange={handleBaysRowsChange}
                    onSaveFrame={handleSaveFrame}
                    compact={true}
                    quantity={quantity}
                    onQuantityChange={setQuantity}
                    systemProfile={SYSTEM_PACKAGES[activeSystemId]}
                  />
                );
              case 'ASSEMBLY':
                return <EnginePlaceholder engine="ASSEMBLY" scopeName={currentScopeName} dims={{ width: activeGrid.width, height: activeGrid.height }} />;
              case 'LINEAR':
                return <EnginePlaceholder engine="LINEAR"   scopeName={currentScopeName} dims={null} />;
              case 'COUNT':
                return <EnginePlaceholder engine="COUNT"    scopeName={currentScopeName} dims={null} />;
              default:
                return null;
            }
          })()}
        </div>
      </div>

    </div>
  );
}
