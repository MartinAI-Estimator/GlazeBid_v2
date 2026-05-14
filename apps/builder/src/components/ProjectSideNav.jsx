import React from 'react';
import {
  LayoutGrid,
  FileDown,
  FileCheck,
  Brain,
  BookOpen,
} from 'lucide-react';
const ProjectSideNav = ({
  currentView,
  onNavigate,
  project,
  projectData,
  sheets = [],
  activeSidebarSection,
  setActiveSidebarSection,
}) => {
  const [hoveredItem, setHoveredItem] = React.useState(null);

  const isProjectHome = currentView === 'projectHome';

  const handleOverviewClick = () => {
    if (isProjectHome) setActiveSidebarSection(null);
    else onNavigate('projectHome');
  };

  const overviewActive = isProjectHome && activeSidebarSection === null;
  const bidsheetActive = currentView === 'bidsheet';
  const bidCartActive = currentView === 'bid-cart';
  const proposalActive = currentView === 'proposal';
  const aiSettingsActive = currentView === 'ai-settings';
  const specSorterActive = currentView === 'spec-sorter';

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


      </div>

      {/* Actions section */}
      <div style={{ ...styles.section, marginTop: 12 }}>
        <span style={styles.label}>Actions</span>

        <Btn
          title="Spec Sorter"
          active={specSorterActive}
          hovered={hoveredItem === 'spec-sorter'}
          onClick={() => onNavigate('spec-sorter')}
          onEnter={() => setHoveredItem('spec-sorter')}
          onLeave={() => setHoveredItem(null)}
        >
          <BookOpen size={15} style={{ flexShrink: 0, color: '#f59e0b' }} />
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
          title="Proposal Generator"
          active={proposalActive}
          hovered={hoveredItem === 'proposal'}
          onClick={() => onNavigate('proposal')}
          onEnter={() => setHoveredItem('proposal')}
          onLeave={() => setHoveredItem(null)}
        >
          <FileCheck size={15} style={{ flexShrink: 0, color: '#10b981' }} />
        </Btn>

        <Btn
          title="AI Settings"
          active={aiSettingsActive}
          hovered={hoveredItem === 'ai-settings'}
          onClick={() => onNavigate('ai-settings')}
          onEnter={() => setHoveredItem('ai-settings')}
          onLeave={() => setHoveredItem(null)}
        >
          <Brain size={15} style={{ flexShrink: 0, color: '#8b5cf6' }} />
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {children}
        <span style={styles.label}>
          {title}
        </span>
      </div>
      {badge != null && <span style={styles.badge}>{badge}</span>}
    </button>
  );
}

const styles = {
  sidebar: {
    width: '72px',
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
    fontSize: '9px',
    color: 'inherit',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    lineHeight: '1',
    fontWeight: 600,
    textAlign: 'center',
    maxWidth: '60px',
    wordWrap: 'break-word',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '52px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#52525b',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    position: 'relative',
    padding: '4px 6px',
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
