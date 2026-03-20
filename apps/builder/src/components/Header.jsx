import React from 'react';
import { ChevronLeft } from 'lucide-react';
import topLogo from '../assets/TOP_LOGO.svg';

const Header = ({ project, projectData, onBack, onBackToProjectHome, onSave, saveState = 'idle' }) => {
  // Extract project metadata if available
  const projectName = projectData?.metadata?.projectName || project || "Project Intake";
  const projectNumber = projectData?.metadata?.projectNumber;
  const status = projectData?.metadata?.status;
  
  return (
    <header style={styles.header}>
      <div style={styles.logoSection}>
        {/* Back to Project Home button */}
        {onBackToProjectHome && (
          <button onClick={onBackToProjectHome} style={styles.backButton}>
            <ChevronLeft size={16} />
            <span>Project Home</span>
          </button>
        )}
        <div style={styles.projectInfo}>
          <span style={styles.projectName}>
            {projectName}
            {projectNumber && <span style={styles.projectNumber}> • {projectNumber}</span>}
            {status && <span style={{...styles.statusBadge, ...getStatusStyle(status)}}>{status.toUpperCase()}</span>}
          </span>
        </div>
      </div>

      {/* Right-side actions */}
      {onSave && (
        <div style={styles.headerActions}>
          <button
            onClick={saveState === 'idle' ? onSave : undefined}
            disabled={saveState === 'saving'}
            style={{
              ...styles.btnPrimary,
              padding: '5px 14px',
              fontSize: '12px',
              opacity: saveState === 'saving' ? 0.7 : 1,
              minWidth: '100px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {saveState === 'saving' && (
              <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid #001F3F', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            )}
            {saveState === 'saved' ? '✓ Saved!' : saveState === 'saving' ? 'Saving…' : '💾 Save Project'}
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
    height: '38px',
    backgroundColor: '#001F3F',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '2px solid #007BFF',
    justifyContent: 'space-between',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    color: '#9ca3af',
    padding: '4px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'all 0.2s',
  },
  logo: {
    height: '32px',
    width: 'auto',
  },
  projectInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  projectName: { fontWeight: '600', color: '#ffffff', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  projectNumber: { fontSize: '12px', color: '#007BFF', fontWeight: 'normal' },
  statusBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '4px',
    alignSelf: 'flex-start',
  },
  headerActions: { display: 'flex', gap: '10px' },
  btnPrimary: { backgroundColor: '#007BFF', color: '#001F3F', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  btnSecondary: { backgroundColor: 'transparent', color: '#007BFF', border: '1px solid #007BFF', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
};

export default Header;
