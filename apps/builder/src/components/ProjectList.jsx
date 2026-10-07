import React, { useState, useEffect } from 'react';
import { Folder, Clock, CheckCircle, AlertCircle, Archive, HardDrive, Trash2 } from 'lucide-react';

const isElectron = () => typeof window !== 'undefined' && Boolean(window.electronAPI?.listProjects);

const ProjectList = ({ onProjectSelect, onNewProject, onSettings }) => {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [rootPath, setRootPath]   = useState(null);
  const [rootMissing, setRootMissing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { name, folderName, aiqPath }

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isElectron()) {
        const result = await window.electronAPI.listProjects();
        if (!result.ok) throw new Error(result.error);
        setProjects(result.projects || []);
        setRootPath(result.root || null);
        setRootMissing(Boolean(result.rootMissing));
      } else {
        // Dev-mode fallback — empty list
        setProjects([]);
        setRootPath(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetRoot = async () => {
    if (!isElectron()) return;
    const chosen = await window.electronAPI.setProjectsRoot();
    if (chosen) fetchProjects();
  };

  const handleDelete = async (project) => {
    if (!isElectron()) return;
    const result = await window.electronAPI.deleteProject({
      folderName: project.folderName,
      aiqPath:    project.aiqPath,
    });
    if (result.ok) {
      setDeleteTarget(null);
      fetchProjects();
    } else {
      alert(`Delete failed: ${result.error}`);
    }
  };

  const handleOpenFile = async () => {
    if (!isElectron()) return;
    const result = await window.electronAPI.openProjectDialog();
    if (result?.ok) onProjectSelect({ name: result.payload?.metadata?.projectName, aiqPath: result.aiqPath, payload: result.payload });
  };

  const getStatusIcon = (status) => {
    const iconProps = { size: 16 };
    switch (status) {
      case 'complete':    return <CheckCircle {...iconProps} color="#4ade80" />;
      case 'in_progress': return <Clock      {...iconProps} color="#60a5fa" />;
      case 'under_review':return <AlertCircle {...iconProps} color="#fbbf24" />;
      case 'archived':    return <Archive    {...iconProps} color="#6b7280" />;
      default:            return <Folder     {...iconProps} color="#9ca3af" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return <div style={styles.container}><div style={styles.loading}>Loading projects…</div></div>;
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>Error loading projects: {error}</p>
          <button onClick={fetchProjects} style={styles.retryButton}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={{ color: '#e6edf3', marginBottom: 16 }}>
              Permanently delete <strong>{deleteTarget.name}</strong> and all its files from disk?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} style={styles.deleteBtn}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>Your Projects</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isElectron() && (
            <>
              <button onClick={handleOpenFile} style={styles.settingsButton} title="Open a .aiq file">
                Open File…
              </button>
              <button onClick={handleSetRoot} style={styles.settingsButton} title="Change projects folder">
                <HardDrive size={14} style={{ marginRight: 4 }} />
                {rootPath ? 'Change Drive…' : 'Set Projects Folder…'}
              </button>
            </>
          )}
          <button onClick={onSettings} style={styles.settingsButton} title="Admin Settings">⚙️ Settings</button>
          <button onClick={onNewProject} style={styles.newProjectButton}>+ New Project</button>
        </div>
      </div>

      {/* Drive not configured warning */}
      {isElectron() && !rootPath && (
        <div style={styles.noRootBanner}>
          <HardDrive size={18} style={{ marginRight: 8, flexShrink: 0 }} />
          No projects folder configured. Click <strong style={{ margin: '0 4px' }}>Set Projects Folder…</strong>
          to point GlazeBid at your company's server drive (e.g. Z:\GlazeBid Projects).
        </div>
      )}

      {/* Drive temporarily unreachable warning */}
      {rootMissing && rootPath && (
        <div style={{ ...styles.noRootBanner, borderColor: '#f59e0b', color: '#fbbf24' }}>
          <AlertCircle size={18} style={{ marginRight: 8 }} />
          Projects drive is currently unreachable ({rootPath}). Showing cached list.
        </div>
      )}

      {projects.length === 0 ? (
        <div style={styles.emptyState}>
          <Folder size={64} color="#6b7280" />
          <h2 style={styles.emptyTitle}>No projects yet</h2>
          <p style={styles.emptyText}>Create your first project by uploading drawings and specifications</p>
          <button onClick={onNewProject} style={styles.startButton}>Start New Project</button>
        </div>
      ) : (
        <div style={styles.projectGrid}>
          {projects.map((project, index) => (
            <div key={index} style={styles.projectCard} onClick={() => onProjectSelect(project)}>
              <div style={styles.cardHeader}>
                <div style={styles.statusIcon}>{getStatusIcon(project.status)}</div>
                <span style={styles.statusText}>{project.status || 'in_progress'}</span>
                {isElectron() && (
                  <button
                    style={styles.deleteIcon}
                    title="Delete project"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <h3 style={styles.projectName}>{project.name}</h3>
              <div style={styles.cardFooter}>
                <div style={styles.dateInfo}>
                  <span style={styles.dateLabel}>Modified:</span>
                  <span style={styles.dateValue}>{formatDate(project.modified)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
    backgroundColor: 'var(--bg-deep)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
  },
  settingsButton: {
    padding: '10px 18px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  newProjectButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  projectGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 180px)',
    gap: '50px',
  },
  projectCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '180px',
    height: '180px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
  },
  statusIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  statusText: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  projectName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    lineHeight: '1.3',
    flex: 1,
  },
  cardFooter: {
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: '8px',
    marginTop: 'auto',
  },
  dateInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
  },
  dateLabel: {
    color: '#6b7280',
  },
  dateValue: {
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 40px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginTop: '24px',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '16px',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
    maxWidth: '500px',
  },
  startButton: {
    padding: '14px 32px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
    fontSize: '18px',
    color: '#9ca3af',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '400px',
    color: '#ef4444',
  },
  retryButton: {
    marginTop: '16px',
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  noRootBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    marginBottom: 24,
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.35)',
    borderRadius: 8,
    color: '#93c5fd',
    fontSize: 13,
  },
  deleteIcon: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    lineHeight: 1,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#1c2333',
    border: '1px solid #30363d',
    borderRadius: 10,
    padding: '24px 28px',
    minWidth: 340,
    maxWidth: 480,
  },
  cancelBtn: {
    padding: '8px 18px',
    background: 'transparent',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#e6edf3',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 18px',
    background: '#ef4444',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
};

export default ProjectList;
