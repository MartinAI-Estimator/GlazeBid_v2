import React from 'react';
import {
  LayoutGrid,
  FolderOpen,
  HardHat,
  Building2,
  FileSpreadsheet,
  FileDown,
  FileText,
} from 'lucide-react';

const STUDIO_URL = 'http://127.0.0.1:5174';

const ProjectSideNav = ({
  currentView,
  onNavigate,
  project,
  projectData,
  sheets = [],
  activeSidebarSection,
  setActiveSidebarSection,
  totalSheets = 0,
}) => {
  const [hoveredItem, setHoveredItem] = React.useState(null);
  const [laborCount, setLaborCount] = React.useState(0);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('glazebid:laborSystems');
      setLaborCount(raw ? JSON.parse(raw).length : 0);
    } catch {}
  }, []);

  const openStudio = () => {
    const targetSheet =
      sheets.find(s => s.category === 'Architectural') ?? sheets[0];
    const filePath =
      targetSheet?.path ??
      projectData?.filePath ??
      projectData?.file_path ??
      localStorage.getItem(`glazebid:filePath:${project}`) ??
      '';

    if (window.electronAPI?.openStudioProject) {
      window.electronAPI.openStudioProject({
        projectId: String(project || ''),
        filePath,
        calibrationData: projectData?.calibrationData ?? null,
        sheetId: targetSheet?.id ?? null,
      });
      return;
    }

    const base = STUDIO_URL + '?project=' + encodeURIComponent(project || '');
    const url = filePath
      ? base + '&file=' + encodeURIComponent(filePath)
      : base;
    window.open(url, '_blank');
  };

  const isProjectHome = currentView === 'projectHome';

  const handleOverviewClick = () => {
    if (isProjectHome) setActiveSidebarSection(null);
    else onNavigate('projectHome');
  };

  const handleDocumentsClick = () => {
    if (isProjectHome) setActiveSidebarSection('documents');
    else onNavigate('projectHome');
  };

  const handleLaborClick = () => {
    if (isProjectHome) setActiveSidebarSection('labor');
    else onNavigate('projectHome');
  };

  const overviewActive = isProjectHome && activeSidebarSection === null;
  const docsActive = isProjectHome && activeSidebarSection === 'documents';
  const laborActive = isProjectHome && activeSidebarSection === 'labor';
  const inboxActive = currentView === 'inbox';
  const bidsheetActive = currentView === 'bidsheet';
  const bidCartActive = currentView === 'bid-cart';
  const shopDrawingsActive = currentView === 'shopDrawings';

  return (
    <div style={styles.sidebar}>
      {/* Project section */}
      <div style={styles.section}>
        <span style={styles.label}>Project</span>

        <Btn
          title="Overview"
          active={overviewActive}
          hovered={hoveredItem === 'overview'}
          onClick={handleOverviewClick}
          onEnter={() => setHoveredItem('overview')}
          onLeave={() => setHoveredItem(null)}
        >
          <LayoutGrid size={15} style={{ flexShrink: 0 }} />
        </Btn>

        <Btn
          title="Project Documents"
          active={docsActive}
          hovered={hoveredItem === 'docs'}
          onClick={handleDocumentsClick}
          onEnter={() => setHoveredItem('docs')}
          onLeave={() => setHoveredItem(null)}
          badge={totalSheets || null}
        >
          <FolderOpen size={15} style={{ flexShrink: 0 }} />
        </Btn>

        <Btn
          title="Labor Days"
          active={laborActive}
          hovered={hoveredItem === 'labor'}
          onClick={handleLaborClick}
          onEnter={() => setHoveredItem('labor')}
          onLeave={() => setHoveredItem(null)}
          badge={laborCount || null}
        >
          <HardHat size={15} style={{ flexShrink: 0 }} />
        </Btn>
      </div>

      {/* Actions section */}
      <div style={{ ...styles.section, marginTop: 12 }}>
        <span style={styles.label}>Actions</span>

        <Btn
          title="Open Studio"
          hovered={hoveredItem === 'studio'}
          onClick={openStudio}
          onEnter={() => setHoveredItem('studio')}
          onLeave={() => setHoveredItem(null)}
        >
          <Building2 size={15} style={{ flexShrink: 0, color: '#60a5fa' }} />
        </Btn>

        <Btn
          title="Studio Takeoffs"
          active={inboxActive}
          hovered={hoveredItem === 'inbox'}
          onClick={() => onNavigate('inbox')}
          onEnter={() => setHoveredItem('inbox')}
          onLeave={() => setHoveredItem(null)}
        >
          <FileSpreadsheet size={15} style={{ flexShrink: 0, color: '#a78bfa' }} />
        </Btn>

        <Btn
          title="Bid Builder"
          active={bidsheetActive}
          hovered={hoveredItem === 'bidsheet'}
          onClick={() => onNavigate('bidsheet')}
          onEnter={() => setHoveredItem('bidsheet')}
          onLeave={() => setHoveredItem(null)}
        >
          <FileDown size={15} style={{ flexShrink: 0, color: '#34d399' }} />
        </Btn>

        <Btn
          title="Bid Cart & Pricing"
          active={bidCartActive}
          hovered={hoveredItem === 'bid-cart'}
          onClick={() => onNavigate('bid-cart')}
          onEnter={() => setHoveredItem('bid-cart')}
          onLeave={() => setHoveredItem(null)}
        >
          <span style={{ fontSize: '14px', flexShrink: 0 }}>💵</span>
        </Btn>

        <Btn
          title="Shop Drawings"
          active={shopDrawingsActive}
          hovered={hoveredItem === 'shopDrawings'}
          onClick={() => onNavigate('shopDrawings')}
          onEnter={() => setHoveredItem('shopDrawings')}
          onLeave={() => setHoveredItem(null)}
        >
          <FileText size={15} style={{ flexShrink: 0, color: '#f59e0b' }} />
        </Btn>
      </div>
    </div>
  );
};

function Btn({ title, active, hovered, onClick, onEnter, onLeave, badge, children }) {
  const style = active
    ? { ...styles.btn, ...styles.btnActive }
    : hovered
    ? { ...styles.btn, ...styles.btnHover }
    : styles.btn;

  return (
    <button
      title={title}
      style={style}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
      {badge != null && <span style={styles.badge}>{badge}</span>}
    </button>
  );
}

const styles = {
  sidebar: {
    width: '64px',
    flexShrink: 0,
    backgroundColor: '#09090b',
    borderRight: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    width: '100%',
    padding: '0 8px',
  },
  label: {
    display: 'none',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '40px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#52525b',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    position: 'relative',
  },
  btnActive: {
    background: 'rgba(14, 165, 233, 0.10)',
    color: '#0ea5e9',
  },
  btnHover: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#e4e4e7',
  },
  badge: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    fontSize: '9px',
    fontWeight: 700,
    color: '#09090b',
    background: '#0ea5e9',
    borderRadius: '8px',
    padding: '0px 4px',
    lineHeight: '14px',
    minWidth: '14px',
    textAlign: 'center',
    flexShrink: 0,
  },
};

export default ProjectSideNav;
