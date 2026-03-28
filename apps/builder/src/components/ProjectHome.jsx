import React from 'react';
import { FolderOpen, FileText, Building2, Wrench, LayoutGrid, ArrowLeft, Clock, Calendar, CheckCircle, Play, FileDown, ChevronRight, ChevronDown, FileSpreadsheet, HardHat } from 'lucide-react';
import ProjectSettingsPanel from './ProjectSettingsPanel';

/**
 * Project Home Page - Estimator's Dashboard
 * 
 * Workflow-based interface showing the bidding process from start to finish.
 */
const ProjectHome = ({ 
  project,
  projectData, 
  categoryCounts = {},
  sheets = [],
  onCategorySelect,
  onBack,
  onNavigate,
  bidSettings = {},
  onBidSettingsChange,
}) => {
  const [hoveredNavCard, setHoveredNavCard] = React.useState(null);
  const [hoveredWorkflowCard, setHoveredWorkflowCard] = React.useState(null);
  const [activeSidebarSection, setActiveSidebarSection] = React.useState(null);

  // ── Labor Days ──────────────────────────────────────────────────────────
  const [laborSystems, setLaborSystems] = React.useState(() => {
    try {
      const raw = localStorage.getItem('glazebid:laborSystems');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  // Re-read when the user opens the Labor Days tab
  React.useEffect(() => {
    if (activeSidebarSection !== 'labor') return;
    try {
      const raw = localStorage.getItem('glazebid:laborSystems');
      if (raw) setLaborSystems(JSON.parse(raw));
    } catch {}
  }, [activeSidebarSection]);

  /**
   * Last takeoff result received from the Studio window via IPC.
   * Shape: { scale: number, pageCount: number, counts?: Record<string,number> }
   * Only populated when running inside Electron and a Studio session has ended.
   */
  const [lastTakeoffResult, setLastTakeoffResult] = React.useState(null);

  // Subscribe to takeoff-update events relayed from the Studio window.
  // The main process sends these whenever Studio closes or explicitly exports.
  React.useEffect(() => {
    if (!window.electronAPI?.onTakeoffUpdate) return;
    const cleanup = window.electronAPI.onTakeoffUpdate((data) => {
      console.info('[Builder] takeoff-update received from Studio:', data);
      setLastTakeoffResult(data);
      // If a parent wants the raw data (e.g. to persist bid totals), call back.
      if (typeof onNavigate === 'function' && data) {
        // Emit as a synthetic navigate event so the parent can handle without
        // coupling directly to this component's internals.
        onNavigate('takeoff-update', data);
      }
    });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandedDocSections, setExpandedDocSections] = React.useState({
    architectural: true,
    structural: false,
    specifications: false,
    other: false
  });
  
  // Default counts if not provided
  const counts = {
    architectural: categoryCounts.architectural || 0,
    structural: categoryCounts.structural || 0,
    specifications: categoryCounts.specifications || 0,
    other: categoryCounts.other || 0,
  };

  const totalSheets = counts.architectural + counts.structural + counts.other;

  const categories = [
    {
      id: 'architectural',
      name: 'Architectural',
      icon: Building2,
      count: counts.architectural,
      color: '#10B981',
      subtitle: counts.architectural > 0 ? 'Drawing Sheets' : 'No Drawings Found',
      viewerType: 'drawing',
      view: 'pdfViewer',
      category: 'architectural'
    },
    {
      id: 'structural',
      name: 'Structural',
      icon: LayoutGrid,
      count: counts.structural,
      color: '#F59E0B',
      subtitle: counts.structural > 0 ? 'Drawing Sheets' : 'No Drawings Found',
      viewerType: 'drawing',
      view: 'pdfViewer',
      category: 'structural'
    },
    {
      id: 'specifications',
      name: 'Specifications',
      icon: FileText,
      count: counts.specifications,
      color: '#8B5CF6',
      subtitle: counts.specifications > 0 ? 'Documents' : 'No Specs Found',
      viewerType: 'document',
      view: 'documentViewer',
      category: 'specifications'
    },
    {
      id: 'other',
      name: 'Other Documents',
      icon: FolderOpen,
      count: counts.other,
      color: '#6B7280',
      subtitle: counts.other > 0 ? 'Documents' : 'None Found',
      viewerType: 'drawing',
      view: 'pdfViewer',
      category: 'other'
    }
  ];

  // Studio dev server URL â€” must match C:\GlazeBid_Studio\vite.config.ts server.port
  // Uses 127.0.0.1 (not localhost) to match the explicit host binding in both Vite configs
  // and avoid IPv6 resolution mismatches on Windows.
  const STUDIO_URL = 'http://127.0.0.1:5174';

  /**
   * Open GlazeBid Studio with the current project.
   *
   * Inside Electron (both windows share the same main process) we use IPC so
   * the Studio window gets the project file and calibration data directly
   * without any URL-parameter gymnastics.
   *
   * In a plain browser we fall back to opening a new tab at the Studio dev URL.
   *
   * @param {string} [sheetId] - Optional specific sheet/page to open.
   */
  const openStudio = (sheetId) => {
    // Resolve which architectural PDF to open.
    // Prefer the sheet explicitly requested (by id), then the first
    // Architectural sheet, then the first sheet of any category.
    const targetSheet = sheetId
      ? sheets.find(s => s.id === sheetId)
      : (sheets.find(s => s.category === 'Architectural') ?? sheets[0]);

    const filePath = targetSheet?.path
      ?? projectData?.filePath
      ?? projectData?.file_path
      ?? '';

    // â”€â”€ Electron path: use IPC bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (window.electronAPI?.openStudioProject) {
      window.electronAPI.openStudioProject({
        projectId:       String(project || ''),
        filePath,
        calibrationData: projectData?.calibrationData ?? null,
        sheetId:         targetSheet?.id ?? sheetId ?? null,
      });
      return;
    }

    // â”€â”€ Browser fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const base = STUDIO_URL + '?project=' + encodeURIComponent(project || '');
    const url  = filePath ? base + '&file=' + encodeURIComponent(filePath) : base;
    window.open(sheetId ? url + '&sheet=' + encodeURIComponent(sheetId) : url, '_blank');
  };

  const handleCardClick = (category) => {
    if (!category.count) return;
    // Specifications route to the internal document viewer; drawings go to Studio
    if (category.id === 'specifications' && onCategorySelect) {
      onCategorySelect({ view: category.view, viewerType: category.viewerType, category: category.category });
    } else {
      openStudio();
    }
  };

  return (
    <div style={styles.container}>

      {/* ── LEFT SIDEBAR ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarSection}>
          <span style={styles.sidebarSectionLabel}>Project</span>
          <button
            style={activeSidebarSection === null ? {...styles.sidebarItem, ...styles.sidebarItemActive} : styles.sidebarItem}
            onClick={() => setActiveSidebarSection(null)}
          >
            <LayoutGrid size={15} style={{ flexShrink: 0 }} />
            <span style={styles.sidebarItemLabel}>Overview</span>
          </button>
          <button
            style={activeSidebarSection === 'documents' ? {...styles.sidebarItem, ...styles.sidebarItemActive} : styles.sidebarItem}
            onClick={() => setActiveSidebarSection('documents')}
          >
            <FolderOpen size={15} style={{ flexShrink: 0 }} />
            <span style={styles.sidebarItemLabel}>Project Documents</span>
            {totalSheets > 0 && <span style={styles.sidebarBadge}>{totalSheets}</span>}
          </button>
          <button
            style={activeSidebarSection === 'labor' ? {...styles.sidebarItem, ...styles.sidebarItemActive} : styles.sidebarItem}
            onClick={() => setActiveSidebarSection('labor')}
          >
            <HardHat size={15} style={{ flexShrink: 0 }} />
            <span style={styles.sidebarItemLabel}>Labor Days</span>
            {laborSystems.length > 0 && <span style={styles.sidebarBadge}>{laborSystems.length}</span>}
          </button>
        </div>

        {/* ── Actions ── */}
        <div style={{ ...styles.sidebarSection, marginTop: 12 }}>
          <span style={styles.sidebarSectionLabel}>Actions</span>
          <button
            style={hoveredWorkflowCard === 'studio'
              ? { ...styles.sidebarItem, ...styles.sidebarActionHover }
              : styles.sidebarItem}
            onClick={() => openStudio()}
            onMouseEnter={() => setHoveredWorkflowCard('studio')}
            onMouseLeave={() => setHoveredWorkflowCard(null)}
          >
            <Building2 size={15} style={{ flexShrink: 0, color: '#60a5fa' }} />
            <span style={styles.sidebarItemLabel}>Open Studio</span>
          </button>
          <button
            style={hoveredWorkflowCard === 'labor'
              ? { ...styles.sidebarItem, ...styles.sidebarActionHover }
              : styles.sidebarItem}
            onClick={() => onNavigate && onNavigate('bidsheet')}
            onMouseEnter={() => setHoveredWorkflowCard('labor')}
            onMouseLeave={() => setHoveredWorkflowCard(null)}
          >
            <FileDown size={15} style={{ flexShrink: 0, color: '#34d399' }} />
            <span style={styles.sidebarItemLabel}>Bid Builder</span>
          </button>
          <button
            style={hoveredNavCard === 'bid-cart'
              ? { ...styles.sidebarItem, ...styles.sidebarActionHover }
              : styles.sidebarItem}
            onClick={() => onNavigate && onNavigate('bid-cart')}
            onMouseEnter={() => setHoveredNavCard('bid-cart')}
            onMouseLeave={() => setHoveredNavCard(null)}
          >
            <span style={{ fontSize: '14px', flexShrink: 0 }}>💵</span>
            <span style={styles.sidebarItemLabel}>Bid Cart &amp; Pricing</span>
          </button>
          <button
            style={activeSidebarSection === 'settings' ? {...styles.sidebarItem, ...styles.sidebarItemActive} : styles.sidebarItem}
            onClick={() => setActiveSidebarSection('settings')}
          >
            <Wrench size={15} style={{ flexShrink: 0, color: activeSidebarSection === 'settings' ? '#58a6ff' : undefined }} />
            <span style={styles.sidebarItemLabel}>Project Settings</span>
          </button>
        </div>
      </div>

      {/* ── MAIN SCROLL AREA ── */}
      <div style={styles.scrollArea}>
      <div style={styles.content}>
        {/* Back Button */}
        <button onClick={onBack} style={styles.backButton}>
          <ArrowLeft size={18} />
          <span>Back to Projects</span>
        </button>

        {/* Project Header - Compact */}
        <div style={styles.projectHeader}>
          <div>
            <h1 style={styles.projectTitle}>{project || 'Project'}</h1>
            <p style={styles.projectSubtitle}>Glazing Estimation Workspace</p>
          </div>
          <div style={styles.projectMeta}>
            <div style={styles.metaItem}>
              <Clock size={16} color="#9ca3af" />
              <span style={styles.metaText}>Modified Today</span>
            </div>
            <div style={styles.metaItem}>
              <CheckCircle size={16} color="#10b981" />
              <span style={styles.metaText}>Ready</span>
            </div>
          </div>
        </div>

        {/* â”€â”€ BENTO GRID â”€â”€ */}
        {activeSidebarSection === null && (
        <div style={styles.bentoGrid}>

          {/* -- Content -- */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            {/* PROJECT FINANCIALS & RATES */}
            <div style={styles.financialsCard}>
              {/* Card header */}
              <div style={styles.financialsHeader}>
                <span style={{ fontSize: '0.85rem' }}>⚙️</span>
                <span style={styles.financialsHeaderLabel}>Project Financials &amp; Rates</span>
                <span style={styles.financialsHeaderSub}>Applied across the entire bid</span>
              </div>
              {/* 5-cell grid (3 top, 2 bottom-left) */}
              <div style={styles.financialsGrid}>
                {[
                  { label: 'Labor Rate',   unit: '$/hr', key: 'laborRate',        default: 42,   icon: '⏱️',  step: 1,    min: 0 },
                  { label: 'Crew Size',    unit: 'men',  key: 'crewSize',         default: 2,    icon: '👷',  step: 1,    min: 1 },
                  { label: 'Labor Cont.',  unit: '%',    key: 'laborContingency', default: 2.5,  icon: '🛡️', step: 0.5,  min: 0 },
                  { label: 'Markup',       unit: '%',    key: 'markupPercent',    default: 40,   icon: '📈',  step: 0.5,  min: 0 },
                  { label: 'Tax Rate',     unit: '%',    key: 'taxPercent',       default: 8.2,  icon: '🏛️', step: 0.25, min: 0 },
                ].map((field, i) => {
                  const value = bidSettings[field.key] ?? field.default;
                  return (
                    <div key={field.label} style={{
                      ...styles.financialsCell,
                      borderRight: (i % 3 < 2) ? '1px solid #1e2530' : 'none',
                      borderBottom: i < 3 ? '1px solid #1e2530' : 'none',
                    }}>
                      <div style={styles.financialsCellLabel}>
                        <span style={{ fontSize: '0.85rem' }}>{field.icon}</span>
                        <span style={styles.financialsCellLabelText}>{field.label}</span>
                      </div>
                      <div style={styles.financialsCellInput}>
                        <input
                          type="number"
                          value={value}
                          step={field.step}
                          min={field.min}
                          onChange={e => onBidSettingsChange?.({ ...bidSettings, [field.key]: Number(e.target.value) })}
                          style={styles.financialsInput}
                          onFocus={e => (e.target.style.borderColor = '#58a6ff')}
                          onBlur={e => (e.target.style.borderColor = '#1e2530')}
                        />
                        <span style={styles.financialsCellUnit}>{field.unit}</span>
                      </div>
                    </div>
                  );
                })}
                {/* Filler cell to complete grid row */}
                <div style={{ ...styles.financialsCell, borderBottom: 'none', borderRight: 'none' }} />
              </div>
            </div>

            {/* Tax Rate Generator and Project Map cards removed — to be re-added later */}

          </div>{/* end bottom full-width */}

        </div>
        )}{/* end overview/bentoGrid */}

        {/* ── LABOR DAYS PANEL ── */}
        {activeSidebarSection === 'labor' && (
          <div style={styles.documentsFocusPanel}>
            <div style={styles.documentsFocusHeader}>
              <HardHat size={18} color="#6b7280" />
              <span style={styles.documentsFocusTitle}>Labor Days</span>
              <span style={styles.documentsFocusCount}>{laborSystems.length} system{laborSystems.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Crew settings reminder */}
            <div style={styles.laborCrewNote}>
              Crew: <strong style={{ color: '#e6edf3' }}>{bidSettings.crewSize ?? 2} men</strong> &nbsp;·&nbsp; 8 hrs/day &nbsp;·&nbsp; 5 days/wk &nbsp;·&nbsp; 4 wks/mo
            </div>

            {laborSystems.length === 0 ? (
              <div style={styles.laborEmptyState}>
                <HardHat size={32} color="#30363d" />
                <div style={{ color: '#4b5563', fontSize: '0.9rem', marginTop: 10 }}>No systems built yet</div>
                <div style={{ color: '#374151', fontSize: '0.78rem', marginTop: 4 }}>Build system cards in Bid Builder to see labor tables here</div>
                <button
                  onClick={() => onNavigate && onNavigate('bidsheet')}
                  style={styles.laborGoBtn}
                >
                  Open Bid Builder →
                </button>
              </div>
            ) : (
              <div style={styles.laborSystemsGrid}>
                {laborSystems.map((sys, sysIdx) => {
                  const crewSize = bidSettings.crewSize ?? 2;
                  const DAYS_MO  = 20;
                  const totals   = sys.totals ?? {};
                  const totalMHs = +(totals.shopMHs ?? 0) + +(totals.distMHs ?? 0) + +(totals.fieldMHs ?? 0);
                  const hrsPerMan = crewSize > 0 ? totalMHs / crewSize : 0;
                  const days      = hrsPerMan / 8;
                  const weeks     = days / 5;
                  const months    = days / DAYS_MO;

                  const COLORS = [
                    { accent: '#00d4ff', headerBg: 'rgba(0,212,255,0.13)',   rowBg: 'rgba(0,212,255,0.04)'   },
                    { accent: '#a78bfa', headerBg: 'rgba(167,139,250,0.13)', rowBg: 'rgba(167,139,250,0.04)' },
                    { accent: '#f87171', headerBg: 'rgba(248,113,113,0.13)', rowBg: 'rgba(248,113,113,0.04)' },
                    { accent: '#86efac', headerBg: 'rgba(134,239,172,0.13)', rowBg: 'rgba(134,239,172,0.04)' },
                    { accent: '#fbbf24', headerBg: 'rgba(251,191,36,0.13)',  rowBg: 'rgba(251,191,36,0.04)'  },
                    { accent: '#60a5fa', headerBg: 'rgba(96,165,250,0.13)',  rowBg: 'rgba(96,165,250,0.04)'  },
                  ];
                  const c   = COLORS[sysIdx % COLORS.length];
                  const fmt = n => n > 0 ? (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)) : '0';

                  const calcRows = [
                    { label: 'Total hours / crew size = hours per man', value: fmt(hrsPerMan) },
                    { label: 'hrs per man / 8 hrs per day = qty of days', value: fmt(days) },
                    { label: 'days / 5 days = qty of weeks', value: fmt(weeks) },
                    { label: 'qty of days / 20 days per month = qty of months', value: months.toFixed(2) },
                  ];

                  // Phase 3: GPM signal for this system
                  const laborCost = totalMHs * (bidSettings.laborRate ?? 42);
                  const matCost   = (sys.materials || []).reduce((s, m) => s + (Number(m.cost) || 0), 0);
                  const totalCost = laborCost + matCost;
                  const markupAmt = totalCost * ((bidSettings.markupPercent ?? 40) / 100);
                  const gpmPct    = (totalCost + markupAmt) > 0
                    ? (markupAmt / (totalCost + markupAmt)) * 100 : 0;
                  const gpmColor  = gpmPct >= 30 ? '#34d399' : gpmPct >= 25 ? '#fbbf24' : '#f87171';

                  return (
                    <div key={sys.id} style={{ ...styles.laborSystemCard, borderColor: c.accent + '55' }}>
                      {/* Header */}
                      <div style={{ ...styles.laborXlsHeader, background: c.headerBg, borderBottomColor: c.accent + '55' }}>
                        <span style={{ ...styles.laborXlsHeaderName, color: c.accent }}>{sys.name}:</span>
                        <span style={styles.laborXlsHeaderHoursLabel}>Hours</span>
                        <span style={{ ...styles.laborXlsHeaderHoursVal, color: c.accent }}>
                          {totalMHs > 0 ? totalMHs.toFixed(2) : '—'}
                        </span>
                      </div>

                      {/* 4-row calculation chain */}
                      {calcRows.map((row, i) => (
                        <div key={i} style={{ ...styles.laborXlsRow, background: i % 2 === 0 ? c.rowBg : 'transparent' }}>
                          <span style={styles.laborXlsRowLabel}>{row.label}</span>
                          <span style={{ ...styles.laborXlsRowValue, color: totalMHs > 0 ? '#e6edf3' : '#4b5563' }}>
                            {row.value}
                          </span>
                        </div>
                      ))}

                      {/* Phase 3: Summary row — labor cost + GPM signal */}
                      {totalMHs > 0 && (
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 14px',
                          background: 'rgba(255,255,255,0.02)',
                          borderTop: `1px solid ${c.accent}33`,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: '0.7rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              Est. Labor Cost
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: c.accent, fontVariantNumeric: 'tabular-nums' }}>
                              ${laborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span style={{ fontSize: '0.7rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              System GPM
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: gpmColor, fontVariantNumeric: 'tabular-nums' }}>
                              {gpmPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS FOCUSED VIEW ── */}
        {activeSidebarSection === 'documents' && (
          <div style={styles.documentsFocusPanel}>
            <div style={styles.documentsFocusHeader}>
              <FolderOpen size={18} color="#6b7280" />
              <span style={styles.documentsFocusTitle}>Project Documents</span>
              <span style={styles.documentsFocusCount}>{totalSheets} files</span>
            </div>
            <div style={styles.documentTable}>
              {categories.map((category) => {
                const IconComponent = category.icon;
                const isExpanded = expandedDocSections[category.id];
                const hasDocuments = category.count > 0;
                return (
                  <div key={category.id} style={styles.documentSection}>
                    <div
                      style={styles.documentSectionHeader}
                      onClick={() => setExpandedDocSections(prev => ({ ...prev, [category.id]: !prev[category.id] }))}
                    >
                      <div style={styles.documentSectionLeft}>
                        {isExpanded ? <ChevronDown size={20} color="#9ca3af" /> : <ChevronRight size={20} color="#9ca3af" />}
                        <IconComponent size={20} color={category.color} />
                        <span style={styles.documentSectionTitle}>{category.name}</span>
                        <span style={{ ...styles.documentCount, color: hasDocuments ? category.color : '#6b7280' }}>
                          {category.count} {category.count === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                      {hasDocuments && (
                        <button
                          style={styles.viewAllButton}
                          onClick={(e) => { e.stopPropagation(); handleCardClick(category); }}
                        >
                          View All
                        </button>
                      )}
                    </div>
                    {isExpanded && hasDocuments && (
                      <div style={styles.documentList}>
                        {(sheets ?? [])
                          .filter(s => {
                            const cat = (s.category || '').toLowerCase();
                            if (category.id === 'specifications') return cat === 'specifications' || cat.startsWith('division');
                            return cat === category.id;
                          })
                          .map((sheet) => (
                            <div
                              key={sheet.id}
                              style={styles.documentRow}
                              onClick={() => category.id === 'specifications' ? handleCardClick(category) : openStudio(sheet.id)}
                            >
                              <div style={styles.documentRowLeft}>
                                <FileText size={16} color="#6b7280" />
                                <span style={styles.documentName}>{sheet.display || sheet.id}</span>
                              </div>
                              <span style={styles.documentDate}>Today</span>
                            </div>
                          ))}
                      </div>
                    )}
                    {isExpanded && !hasDocuments && (
                      <div style={styles.documentListEmpty}>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>No documents found in this category</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

        {/* ── PROJECT SETTINGS PANEL ── */}
        {activeSidebarSection === 'settings' && (
          <ProjectSettingsPanel
            bidSettings={bidSettings}
            onBidSettingsChange={(newSettings) => {
              onBidSettingsChange?.(newSettings);
            }}
            onClose={() => setActiveSidebarSection(null)}
          />
        )}

      </div>{/* end scrollArea */}
    </div>
  );
};

const styles = {
  // ── Bento Grid ──────────────────────────────────────────────────────────────
  bentoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginTop: 24,
  },
  bentoLeft:  { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  bentoRight: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },

  bidBuilderHero: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '26px 28px',
    background: 'linear-gradient(135deg, #062a22 0%, #0a3d30 55%, #0d3028 100%)',
    border: '1px solid rgba(16,185,129,.3)',
    borderRadius: 16, cursor: 'pointer',
    transition: 'transform .2s, box-shadow .2s',
    boxShadow: '0 4px 24px rgba(16,185,129,.07)',
  },
  bidBuilderHeroHover: {
    transform: 'translateY(-3px)',
    boxShadow: '0 10px 40px rgba(16,185,129,.22)',
    borderColor: 'rgba(16,185,129,.7)',
  },
  bidBuilderHeroIcon: {
    width: 56, height: 56, borderRadius: 14, flexShrink: 0,
    background: 'rgba(16,185,129,.25)', border: '1px solid rgba(16,185,129,.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bidBuilderHeroTitle: { fontSize: 20, fontWeight: 700, color: '#e6edf3', margin: '0 0 4px 0' },
  bidBuilderHeroSub:   { fontSize: 13, color: '#8b949e', margin: 0 },
  bidBuilderHeroArrow: { fontSize: 24, color: 'rgba(16,185,129,.5)', flexShrink: 0 },

  bentoCardHeader: {
    display: 'flex', alignItems: 'center',
    paddingBottom: 12, marginBottom: 4,
    borderBottom: '1px solid #1e2530',
  },
  bentoCardTitle: {
    flex: 1, fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.07em',
  },
  bentoCardCount: { fontSize: 11, color: '#4b5563', fontWeight: 500 },

  studioHero: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '26px 28px',
    background: 'linear-gradient(135deg, #0d2a4a 0%, #1a3a6b 55%, #2d1b69 100%)',
    border: '1px solid rgba(0,123,255,.3)',
    borderRadius: 16, cursor: 'pointer',
    transition: 'transform .2s, box-shadow .2s',
    boxShadow: '0 4px 24px rgba(0,123,255,.07)',
  },
  studioHeroHover: {
    transform: 'translateY(-3px)',
    boxShadow: '0 10px 40px rgba(0,123,255,.22)',
    borderColor: 'rgba(0,123,255,.7)',
  },
  studioHeroIcon: {
    width: 56, height: 56, borderRadius: 14, flexShrink: 0,
    background: 'rgba(0,123,255,.25)', border: '1px solid rgba(0,123,255,.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  studioHeroTitle: { fontSize: 20, fontWeight: 700, color: '#e6edf3', margin: '0 0 4px 0' },
  studioHeroSub:   { fontSize: 13, color: '#8b949e', margin: 0 },
  studioHeroArrow: { fontSize: 24, color: 'rgba(0,123,255,.5)', flexShrink: 0 },

  bentoDocCard: {
    background: '#0d1117', border: '1px solid #1e2530',
    borderRadius: 14, padding: '16px 18px',
  },

  vaultCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 22px',
    background: 'linear-gradient(135deg, #052e16 0%, #0a3d21 100%)',
    border: '1px solid rgba(63,185,80,.25)',
    borderRadius: 14, cursor: 'pointer',
    transition: 'transform .2s, box-shadow .2s',
  },
  vaultCardHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(63,185,80,.18)',
    borderColor: 'rgba(63,185,80,.6)',
  },
  vaultIconWrap: { fontSize: 28, flexShrink: 0, lineHeight: 1 },
  vaultTitle: { fontSize: 15, fontWeight: 700, color: '#3fb950', marginBottom: 3 },
  vaultSub:   { fontSize: 12, color: '#4b8a59' },
  vaultArrow: { fontSize: 20, color: 'rgba(63,185,80,.4)', flexShrink: 0 },

  // ── Project Financials & Rates card ─────────────────────────────────────────
  financialsCard: {
    background: '#0d1117',
    border: '1px solid #1e2530',
    borderRadius: 14,
    overflow: 'hidden',
  },
  financialsHeader: {
    background: '#161b22',
    borderBottom: '1px solid #1e2530',
    padding: '0.6rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  financialsHeaderLabel: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#e6edf3',
  },
  financialsHeaderSub: {
    fontSize: '0.72rem',
    color: '#6b7280',
    marginLeft: 4,
  },
  financialsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 0,
  },
  financialsCell: {
    padding: '0.9rem 1.1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  financialsCellLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  financialsCellLabelText: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  financialsCellInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  financialsInput: {
    flex: 1,
    minWidth: 0,
    padding: '6px 8px',
    borderRadius: 7,
    background: '#0b0e11',
    border: '1px solid #1e2530',
    color: '#e6edf3',
    fontSize: '1rem',
    fontWeight: 700,
    textAlign: 'right',
    outline: 'none',
    boxSizing: 'border-box',
  },
  financialsCellUnit: {
    fontSize: '0.72rem',
    color: '#6b7280',
    flexShrink: 0,
  },

  toolboxCard: {
    background: '#0d1117', border: '1px solid #1e2530',
    borderRadius: 14, padding: '16px 18px',
  },
  toolRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 10px', borderRadius: 9,
    cursor: 'pointer', transition: 'background .15s',
  },
  toolRowHover: { background: '#161b22' },
  toolRowIcon: {
    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16,
  },
  toolRowLabel: { fontSize: 13, fontWeight: 600, color: '#e6edf3' },
  toolRowSub:   { fontSize: 11, color: '#6b7280', marginTop: 1 },

  // ── Layout ──────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    height: '100%',
    backgroundColor: '#0b0e11',
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
  },
  sidebar: {
    width: '200px',
    flexShrink: 0,
    backgroundColor: '#0d1117',
    borderRight: '1px solid #1e2530',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
    overflowY: 'auto',
  },
  sidebarSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 8px',
  },
  sidebarSectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0 8px',
    marginBottom: '6px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.15s, color 0.15s',
  },
  sidebarItemActive: {
    background: 'rgba(0,123,255,0.12)',
    color: '#58a6ff',
  },
  sidebarActionHover: {
    background: 'rgba(255,255,255,0.05)',
    color: '#e6edf3',
  },
  sidebarItemLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sidebarBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#4b5563',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '10px',
    padding: '1px 6px',
    flexShrink: 0,
  },
  documentsFocusPanel: {
    marginTop: 24,
  },
  documentsFocusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    marginBottom: 16,
    borderBottom: '1px solid #1e2530',
  },
  documentsFocusTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 700,
    color: '#e6edf3',
  },
  documentsFocusCount: {
    fontSize: 12,
    color: '#4b5563',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#2d333b',
    color: '#9ca3af',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '20px',
    width: 'fit-content',
    transition: 'all 0.2s',
  },
  projectHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '1px solid #2d333b',
  },
  projectTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    margin: 0,
    marginBottom: '4px',
  },
  projectSubtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  projectMeta: {
    display: 'flex',
    gap: '20px',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  metaText: {
    fontSize: '13px',
    color: '#9ca3af',
  },
  // Document table styles
  documentTable: {
    backgroundColor: '#1a1f26',
    borderRadius: '12px',
    border: '1px solid #2d333b',
    overflow: 'hidden',
    marginBottom: '32px',
  },
  documentSection: {
    borderBottom: '1px solid #2d333b',
  },
  documentSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  documentSectionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  documentSectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
  },
  documentCount: {
    fontSize: '12px',
    fontWeight: '500',
    backgroundColor: '#242b33',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  viewAllButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#007BFF',
    backgroundColor: 'transparent',
    border: '1px solid #007BFF',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  documentList: {
    backgroundColor: '#161b22',
    padding: '8px 0',
  },
  documentListEmpty: {
    backgroundColor: '#161b22',
    padding: '16px 20px',
    textAlign: 'center',
  },
  documentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 56px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  documentRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  documentName: {
    fontSize: '13px',
    color: '#9ca3af',
  },
  documentDate: {
    fontSize: '12px',
    color: '#6b7280',
  },
  navCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 12px',
    backgroundColor: '#1c2128',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#2d333b',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navCardHover: {
    backgroundColor: '#242b33',
    borderColor: '#007BFF',
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0, 123, 255, 0.2)',
  },

  // ── Labor Days Panel ─────────────────────────────────────────────────────────
  laborCrewNote: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginBottom: 20,
    padding: '6px 12px',
    background: '#161b22',
    border: '1px solid #1e2530',
    borderRadius: 8,
    display: 'inline-block',
  },
  laborEmptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: '#0d1117',
    border: '1px solid #1e2530',
    borderRadius: 14,
    textAlign: 'center',
  },
  laborGoBtn: {
    marginTop: 18,
    padding: '8px 20px',
    borderRadius: 8,
    background: 'rgba(52,211,153,0.1)',
    border: '1px solid rgba(52,211,153,0.25)',
    color: '#34d399',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  laborSystemsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  // XLS-style card
  laborSystemCard: {
    border: '1px solid',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#0d1117',
  },
  laborXlsHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    borderBottom: '1px solid',
    gap: 8,
  },
  laborXlsHeaderName: {
    flex: 1,
    fontSize: '0.88rem',
    fontWeight: 700,
  },
  laborXlsHeaderHoursLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginRight: 8,
  },
  laborXlsHeaderHoursVal: {
    fontSize: '1rem',
    fontWeight: 800,
    minWidth: 70,
    textAlign: 'right',
  },
  laborXlsRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 14px',
    borderBottom: '1px solid #1e2530',
  },
  laborXlsRowLabel: {
    flex: 1,
    fontSize: '0.8rem',
    color: '#9ca3af',
  },
  laborXlsRowValue: {
    fontSize: '0.9rem',
    fontWeight: 700,
    minWidth: 70,
    textAlign: 'right',
  },
};

export default ProjectHome;

