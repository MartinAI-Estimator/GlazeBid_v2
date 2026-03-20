import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const Header = ({ project, projectData, onBack, onBackToProjectHome, onSave, saveState = 'idle' }) => {
  // Extract project metadata if available
  const projectName = projectData?.metadata?.projectName || project || 'Project Intake';
  const projectNumber = projectData?.metadata?.projectNumber;
  const status = projectData?.metadata?.status;

  return (
    <header style={styles.header}>
      <div style={styles.leftSection}>
        {/* Back to Project Home button */}
        {onBackToProjectHome && (
          <button onClick={onBackToProjectHome} style={styles.backButton}>
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
        )}

        {/* Breadcrumb */}
        <nav style={styles.breadcrumb}>
          <span style={styles.breadcrumbRoot}>Projects</span>
          <ChevronRight size={13} color="#52525b" style={{ flexShrink: 0 }} />
          <span style={styles.breadcrumbCurrent}>{projectName}</span>
          {projectNumber && (
            <span style={styles.projectNumber}>#{projectNumber}</span>
          )}
          {status && (
            <span style={{ ...styles.statusBadge, ...getStatusStyle(status) }}>
              {status.toUpperCase()}
            </span>
          )}
        </nav>
      </div>

      {/* Right-side actions */}
      {onSave && (
        <div style={styles.headerActions}>
          <button
            onClick={saveState === 'idle' ? onSave : undefined}
            disabled={saveState === 'saving'}
            style={{
              ...styles.btnPrimary,
              opacity: saveState === 'saving' ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {saveState === 'saving' && (
              <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid #09090b', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            )}
            {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </header>
  );
};

const getStatusStyle = (status) => {
  const statusColors = {
    'draft': { backgroundColor: '#374151', color: '#9ca3af' },
    'in_progress': { backgroundColor: '#1e3a8a', color: '#60a5fa' },
    'under_review': { backgroundColor: '#854d0e', color: '#fbbf24' },
    'complete': { backgroundColor: '#14532d', color: '#4ade80' },
    'archived': { backgroundColor: '#1f2937', color: '#6b7280' },
  };
  return statusColors[status] || statusColors['draft'];
};

const styles = {
  header: {
    height: '48px',
    backgroundColor: '#09090b',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '1px solid #27272a',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'transparent',
    border: '1px solid #27272a',
    color: '#71717a',
    padding: '4px 10px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'border-color 0.15s, color 0.15s',
    flexShrink: 0,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  breadcrumbRoot: {
    fontSize: '13px',
    color: '#52525b',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    whiteSpace: 'nowrap',
  },
  breadcrumbCurrent: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#e4e4e7',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectNumber: {
    fontSize: '11px',
    color: '#0ea5e9',
    fontWeight: '500',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 7px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  headerActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  btnPrimary: {
    backgroundColor: '#0ea5e9',
    color: '#09090b',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '5px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
};
};

export default Header;
