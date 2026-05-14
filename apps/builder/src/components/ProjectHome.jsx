import React from 'react';
import { FolderOpen, FileText, Building2, LayoutGrid, ArrowLeft, Clock, Calendar, CheckCircle, Play, FileDown, ChevronRight, ChevronDown, FileSpreadsheet } from 'lucide-react';

// ─── Module & Tool card data ──────────────────────────────────────────────────
const MODULES = [
  { id: 'bidbuilder',   label: 'Bid Builder',              icon: '📋', accent: '#10b981', description: 'Full estimation suite — system cards, labor MH breakdown, materials, pricing, and proposal generation.', tags: ['Labor', 'Materials', 'Pricing', 'Proposals'] },
  { id: 'studio',       label: 'Studio',                   icon: '📐', accent: '#60a5fa', description: 'PDF takeoff canvas — load blueprints, calibrate scale, draw frames, and send counts to Bid Builder.',   tags: ['PDF Takeoff', 'Auto-Scan', 'Frame Counting', 'BOM'] },
  { id: 'framebuilder', label: 'Parametric Frame Builder', icon: '🏗️', accent: '#a78bfa', description: 'Engineer individual frames parametrically — specify geometry, system type, grid layout, glass, and generate cut lists.', tags: ['Frame Design', 'BOM', 'Cut List', 'Glass Takeout'] },
  { id: 'shopDrawings', label: 'Shop Drawings',            icon: '📏', accent: '#fbbf24', description: 'Generate shop-ready drawing packages from bid data — elevations, sections, details, and submittal cover sheets.', tags: ['Elevations', 'Sections', 'Submittal', 'PDF Export'] },
];

const TOOLS = [
  { id: 'structuralCalc',  label: 'Structural Calculator',  icon: '🧱', accent: '#06b6d4', description: 'Deflection, moment, and load analysis for mullions and frames per AAMA/ASTM standards.' },
  { id: 'brakeMetalCalc',  label: 'Brake Metal Calculator', icon: '⚙️', accent: '#f97316', description: 'Calculate bend allowances, flat blank lengths, and material quantities for custom flashings.' },
  { id: 'caulkingCalc',    label: 'Caulking Calculator',    icon: '🔧', accent: '#84cc16', description: 'Estimate sausage or cartridge counts from joint dimensions — perimeter, depth, and width.' },
  { id: 'glassWeightCalc', label: 'Glass Weight Calculator',icon: '🪟', accent: '#e879f9', description: 'Compute glass lite weight by size, make-up, and thickness for crane and handling planning.' },
  { id: 'quickQuote',      label: 'Quick Quote',            icon: '💲', accent: '#fbbf24', description: 'Fast multi-scope estimate — build system takeoffs, apply labor and material rates, and generate a summary.' },
  { id: 'doorBuilder',     label: 'Door Builder',           icon: '🚪', accent: '#3B82F6', description: 'Build aluminum doors for quote and order — configure size, swing, stiles, rails, finish, glass, framing, and hardware.', tags: ['Door Schedule', 'Quote PDF', 'Hardware'] },
  { id: 'specSplitter',    label: 'Spec Splitter',          icon: '📄', accent: '#f43f5e', description: 'Upload a project spec book — automatically splits by CSI section, scans for glazing scope, and flags requirements.', tags: ['Spec Scan', 'BOD', 'Risk Check'] },
  { id: 'proposal',         label: 'Proposal Generator',     icon: '📑', accent: '#10b981', description: 'Generate a professional branded proposal PDF from your bid data — cover letter, scope summary, pricing, and terms.', tags: ['Proposal PDF', 'Cover Letter', 'Pricing'] },
];

// Small hook-free card components so we can use hover state without touching the class component
function ModuleCard({ mod, onLaunch }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      style={{ ...cs.modCard, borderColor: hov ? mod.accent : 'rgba(255,255,255,0.07)', boxShadow: hov ? `0 0 0 1px ${mod.accent}, 0 8px 40px ${mod.accent}22` : '0 2px 12px rgba(0,0,0,0.4)', transform: hov ? 'translateY(-3px)' : 'none' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onLaunch(mod.id)}
    >
      <div style={{ ...cs.accentBar, background: mod.accent }} />
      <div style={cs.cardIcon}>{mod.icon}</div>
      <h2 style={{ ...cs.cardTitle, color: hov ? mod.accent : '#e6edf3' }}>{mod.label}</h2>
      <p style={cs.cardDesc}>{mod.description}</p>
      <div style={cs.cardTags}>
        {(mod.tags || []).map(t => <span key={t} style={{ ...cs.tag, background: `${mod.accent}18`, color: mod.accent, borderColor: `${mod.accent}35` }}>{t}</span>)}
      </div>
      <div style={{ ...cs.launchBtn, background: hov ? mod.accent : 'rgba(255,255,255,0.05)', color: hov ? '#000' : '#8b949e' }}>Open {mod.label} →</div>
    </button>
  );
}

function ToolCard({ tool, onLaunch }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      style={{ ...cs.toolCard, borderColor: hov ? tool.accent : 'rgba(255,255,255,0.07)', boxShadow: hov ? `0 0 0 1px ${tool.accent}, 0 4px 24px ${tool.accent}22` : '0 2px 8px rgba(0,0,0,0.35)', transform: hov ? 'translateY(-2px)' : 'none' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onLaunch(tool.id)}
    >
      <div style={{ ...cs.toolAccentBar, background: tool.accent }} />
      <div style={cs.toolRow}>
        <span style={cs.toolIcon}>{tool.icon}</span>
        <span style={{ ...cs.toolLabel, color: hov ? tool.accent : '#e6edf3' }}>{tool.label}</span>
      </div>
      <p style={cs.toolDesc}>{tool.description}</p>
      <div style={{ ...cs.toolBtn, background: hov ? tool.accent : 'rgba(255,255,255,0.04)', color: hov ? '#000' : '#8b949e' }}>Use Tool →</div>
    </button>
  );
}

// Card grid styles (scoped, won't clash with existing `styles` object below)
const cs = {
  modulesGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20, marginBottom: 28 },
  toolsGrid:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 36 },
  sectionHead:  { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: '#e6edf3', letterSpacing: '-0.01em' },
  sectionSub:   { fontSize: 12, color: '#5c6370' },
  // Module card
  modCard:    { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '28px 22px 18px', background: '#161b22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s' },
  accentBar:  { position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: '14px 14px 0 0' },
  cardIcon:   { fontSize: '2.3rem', marginBottom: 12, marginTop: 4, lineHeight: 1 },
  cardTitle:  { margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 800, transition: 'color 0.15s' },
  cardDesc:   { margin: '0 0 14px', fontSize: '0.8rem', color: '#8b949e', lineHeight: 1.6, flex: 1 },
  cardTags:   { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 },
  tag:        { fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, border: '1px solid', fontWeight: 600 },
  launchBtn:  { width: '100%', padding: '9px 0', borderRadius: 7, fontWeight: 700, fontSize: '0.82rem', textAlign: 'center', transition: 'background 0.18s, color 0.18s', boxSizing: 'border-box' },
  // Tool card
  toolCard:     { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '16px 16px 12px', background: '#161b22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s' },
  toolAccentBar:{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  toolRow:      { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, marginTop: 3 },
  toolIcon:     { fontSize: '1.25rem' },
  toolLabel:    { fontSize: 13, fontWeight: 700, transition: 'color 0.15s' },
  toolDesc:     { margin: '0 0 12px', fontSize: 11, color: '#8b949e', lineHeight: 1.55, flex: 1 },
  toolBtn:      { width: '100%', padding: '6px 0', borderRadius: 5, fontWeight: 700, fontSize: 11, textAlign: 'center', transition: 'background 0.18s, color 0.18s', boxSizing: 'border-box' },
};

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
  onLaunch,
  bidSettings = {},
  onBidSettingsChange,
}) => {

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

  const totalSheets = counts.specifications;

  const categories = [
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

        {/* ── SUITE MODULES & TOOLS ── */}
        {onLaunch && (
          <>
            <div style={cs.sectionHead}>
              <span style={cs.sectionTitle}>Suite Modules</span>
              <span style={cs.sectionSub}>Full commercial glazing workflow</span>
            </div>
            <div style={cs.modulesGrid}>
              {MODULES.map(mod => <ModuleCard key={mod.id} mod={mod} onLaunch={onLaunch} />)}
            </div>

            <div style={cs.sectionHead}>
              <span style={cs.sectionTitle}>Tools</span>
              <span style={cs.sectionSub}>Quick-access calculators for glaziers</span>
            </div>
            <div style={cs.toolsGrid}>
              {TOOLS.map(tool => <ToolCard key={tool.id} tool={tool} onLaunch={onLaunch} />)}
            </div>
          </>
        )}

        {/* ── BENTO GRID ── */}
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
                  { label: 'Markup',       unit: '%',    key: 'markupPercent',    default: 40,   icon: '📈',  step: 0.5,  min: 0 },
                  { label: 'Tax Rate',     unit: '%',    key: 'taxPercent',       default: 8.2,  icon: '🏛️', step: 0.25, min: 0 },
                ].map((field, i) => {
                  const value = bidSettings[field.key] ?? field.default;
                  return (
                    <div key={field.label} style={{
                      ...styles.financialsCell,
                      borderRight: (i % 2 === 0) ? '1px solid #1e2530' : 'none',
                      borderBottom: i < 2 ? '1px solid #1e2530' : 'none',
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

        {/* ── DOCUMENTS FOCUSED VIEW ── */}
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
                                <span style={styles.documentName}>{sheet.name || sheet.display || sheet.id}</span>
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

      </div>

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
    gridTemplateColumns: 'repeat(2, 1fr)',
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

};

export default ProjectHome;

