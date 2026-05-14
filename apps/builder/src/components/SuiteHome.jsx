import React, { useState } from 'react';
import topLogo from '../assets/TOP_LOGO.svg';

const TOOLS = [
  {
    id: 'structuralCalc',
    label: 'Structural Calculator',
    icon: '🧱',
    accent: '#06b6d4',
    description: 'Deflection, moment, and load analysis for mullions and frames per AAMA/ASTM standards.',
  },
  {
    id: 'brakeMetalCalc',
    label: 'Brake Metal Calculator',
    icon: '⚙️',
    accent: '#f97316',
    description: 'Calculate bend allowances, flat blank lengths, and material quantities for custom flashings.',
  },
  {
    id: 'caulkingCalc',
    label: 'Caulking Calculator',
    icon: '🔧',
    accent: '#84cc16',
    description: 'Estimate sausage or cartridge counts from joint dimensions — perimeter, depth, and width.',
  },
  {
    id: 'glassWeightCalc',
    label: 'Glass Weight Calculator',
    icon: '🪟',
    accent: '#e879f9',
    description: 'Compute glass lite weight by size, make-up, and thickness for crane and handling planning.',
  },
];

const MODULES = [
  {
    id: 'bidbuilder',
    label: 'Bid Builder',
    icon: '📋',
    accent: '#10b981',
    description: 'Full estimation suite — system cards, labor MH breakdown, materials, pricing, and proposal generation.',
    tags: ['Labor', 'Materials', 'Pricing', 'Proposals'],
  },
  {
    id: 'studio',
    label: 'Studio',
    icon: '📐',
    accent: '#60a5fa',
    description: 'PDF takeoff canvas — load blueprints, calibrate scale, draw frames, and send counts to Bid Builder.',
    tags: ['PDF Takeoff', 'Auto-Scan', 'Frame Counting', 'BOM'],
  },
  {
    id: 'framebuilder',
    label: 'Parametric Frame Builder',
    icon: '🏗️',
    accent: '#a78bfa',
    description: 'Engineer individual frames parametrically — specify geometry, system type, grid layout, glass, and generate cut lists.',
    tags: ['Frame Design', 'BOM', 'Cut List', 'Glass Takeout'],
  },
  {
    id: 'shopDrawings',
    label: 'Shop Drawings',
    icon: '📏',
    accent: '#fbbf24',
    description: 'Generate shop-ready drawing packages from bid data — elevations, sections, details, and submittal cover sheets.',
    tags: ['Elevations', 'Sections', 'Submittal', 'PDF Export'],
  },
];

export default function SuiteHome({ onLaunch }) {
  const [hovered, setHovered] = useState(null);
  const [toolHovered, setToolHovered] = useState(null);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <img src={topLogo} alt="GlazeBid AiQ" style={styles.logo} onError={e => { e.target.style.display = 'none'; }} />
        <div>
          <h1 style={styles.title}>Welcome to GlazeBid AiQ</h1>
          <p style={styles.subtitle}>Select a module to get started</p>
        </div>
      </div>

      {/* Module cards */}
      <div style={styles.grid}>
        {MODULES.map(mod => {
          const isHovered = hovered === mod.id;
          return (
            <button
              key={mod.id}
              style={{
                ...styles.card,
                borderColor: isHovered ? mod.accent : 'rgba(255,255,255,0.07)',
                boxShadow: isHovered ? `0 0 0 1px ${mod.accent}, 0 8px 40px ${mod.accent}22` : '0 2px 12px rgba(0,0,0,0.4)',
                transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
              }}
              onMouseEnter={() => setHovered(mod.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onLaunch(mod.id)}
            >
              {/* Icon + accent bar */}
              <div style={{ ...styles.cardAccentBar, background: mod.accent }} />
              <div style={styles.cardIcon}>{mod.icon}</div>

              <h2 style={{ ...styles.cardTitle, color: isHovered ? mod.accent : 'var(--text-primary)' }}>
                {mod.label}
              </h2>
              <p style={styles.cardDesc}>{mod.description}</p>

              {/* Tags */}
              <div style={styles.cardTags}>
                {mod.tags.map(tag => (
                  <span key={tag} style={{ ...styles.cardTag, background: `${mod.accent}18`, color: mod.accent, borderColor: `${mod.accent}35` }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Launch button */}
              <div style={{
                ...styles.launchBtn,
                background: isHovered ? mod.accent : 'rgba(255,255,255,0.05)',
                color: isHovered ? '#000' : 'var(--text-secondary)',
              }}>
                Open {mod.label} →
              </div>
            </button>
          );
        })}
      </div>

      {/* Tools section */}
      <div style={styles.toolsSection}>
        <div style={styles.toolsSectionHeader}>
          <span style={styles.toolsSectionTitle}>Tools</span>
          <span style={styles.toolsSectionSub}>Quick-access calculators for glaziers</span>
        </div>
        <div style={styles.toolsGrid}>
          {TOOLS.map(tool => {
            const isHov = toolHovered === tool.id;
            return (
              <button
                key={tool.id}
                style={{
                  ...styles.toolCard,
                  borderColor: isHov ? tool.accent : 'rgba(255,255,255,0.07)',
                  boxShadow: isHov ? `0 0 0 1px ${tool.accent}, 0 4px 24px ${tool.accent}22` : '0 2px 8px rgba(0,0,0,0.35)',
                  transform: isHov ? 'translateY(-2px)' : 'translateY(0)',
                }}
                onMouseEnter={() => setToolHovered(tool.id)}
                onMouseLeave={() => setToolHovered(null)}
                onClick={() => onLaunch(tool.id)}
              >
                <div style={{ ...styles.toolAccentBar, background: tool.accent }} />
                <div style={styles.toolCardRow}>
                  <span style={styles.toolIcon}>{tool.icon}</span>
                  <span style={{ ...styles.toolLabel, color: isHov ? tool.accent : 'var(--text-primary)' }}>
                    {tool.label}
                  </span>
                </div>
                <p style={styles.toolDesc}>{tool.description}</p>
                <div style={{
                  ...styles.toolBtn,
                  background: isHov ? tool.accent : 'rgba(255,255,255,0.04)',
                  color: isHov ? '#000' : 'var(--text-secondary)',
                }}>
                  Use Tool →
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        GlazeBid AiQ Suite &nbsp;·&nbsp; Commercial Glazing Estimation Platform
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    background: 'var(--bg-deep, #0d1117)',
    padding: '48px 24px 32px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    marginBottom: '48px',
    textAlign: 'center',
    flexDirection: 'column',
  },
  logo: {
    height: 56,
    objectFit: 'contain',
  },
  title: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 900,
    color: 'var(--text-primary, #e6edf3)',
    letterSpacing: '-0.02em',
    textAlign: 'center',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: '1rem',
    color: 'var(--text-secondary, #8b949e)',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
    width: '100%',
    maxWidth: 1200,
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '32px 28px 24px',
    background: 'var(--bg-card, #161b22)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s',
    overflow: 'hidden',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: '16px 16px 0 0',
  },
  cardIcon: {
    fontSize: '2.5rem',
    marginBottom: '14px',
    lineHeight: 1,
  },
  cardTitle: {
    margin: '0 0 10px',
    fontSize: '1.15rem',
    fontWeight: 800,
    transition: 'color 0.15s',
  },
  cardDesc: {
    margin: '0 0 16px',
    fontSize: '0.83rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.6,
    flex: 1,
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '20px',
  },
  cardTag: {
    padding: '2px 9px',
    borderRadius: 20,
    fontSize: '0.7rem',
    fontWeight: 600,
    border: '1px solid',
    letterSpacing: '0.03em',
  },
  launchBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: '0.85rem',
    textAlign: 'center',
    transition: 'background 0.18s, color 0.18s',
    letterSpacing: '0.01em',
  },
  footer: {
    marginTop: '48px',
    fontSize: '0.72rem',
    color: 'var(--text-secondary, #8b949e)',
    opacity: 0.6,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  toolsSection: {
    width: '100%',
    maxWidth: 1200,
    marginTop: '48px',
  },
  toolsSectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    marginBottom: '16px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  toolsSectionTitle: {
    fontSize: '1rem',
    fontWeight: 800,
    color: 'var(--text-primary, #e6edf3)',
    letterSpacing: '-0.01em',
  },
  toolsSectionSub: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary, #8b949e)',
  },
  toolsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  toolCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '20px 18px 16px',
    background: 'var(--bg-card, #161b22)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s',
    overflow: 'hidden',
  },
  toolAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: '12px 12px 0 0',
  },
  toolCardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  toolIcon: {
    fontSize: '1.3rem',
    lineHeight: 1,
  },
  toolLabel: {
    fontSize: '0.92rem',
    fontWeight: 700,
    transition: 'color 0.15s',
  },
  toolDesc: {
    margin: '0 0 14px',
    fontSize: '0.76rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.55,
    flex: 1,
  },
  toolBtn: {
    width: '100%',
    padding: '7px 0',
    borderRadius: 6,
    fontWeight: 700,
    fontSize: '0.78rem',
    textAlign: 'center',
    transition: 'background 0.18s, color 0.18s',
    letterSpacing: '0.01em',
  },
};
