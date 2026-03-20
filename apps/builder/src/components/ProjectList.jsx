import React, { useState, useEffect } from 'react';
import { Folder, Clock, CheckCircle, AlertCircle, Archive } from 'lucide-react';

const ProjectList = ({ onProjectSelect, onNewProject, onSettings }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      // Recover locally saved projects from known keys.
      const projectMap = new Map();

      const addProject = (name, modified = null, status = 'in_progress') => {
        if (!name || typeof name !== 'string') return;
        const cleanName = name.trim();
        if (!cleanName) return;
        const existing = projectMap.get(cleanName);
        const date = modified ? new Date(modified) : new Date();
        const normalizedModified = Number.isNaN(date.getTime())
          ? new Date().toISOString()
          : date.toISOString();

        if (!existing) {
          projectMap.set(cleanName, {
            name: cleanName,
            status,
            modified: normalizedModified,
          });
          return;
        }

        // Keep the most recent modified timestamp if duplicate discovered.
        if (new Date(normalizedModified).getTime() > new Date(existing.modified).getTime()) {
          existing.modified = normalizedModified;
        }
      };

      // 1) Derive names from namespaced per-project keys.
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;

        let match = key.match(/^glazebid:sheets:(.+)$/);
        if (match) {
          addProject(match[1]);
          continue;
        }

        match = key.match(/^glazebid:bidSettings:(.+)$/);
        if (match) {
          addProject(match[1]);
          continue;
        }

        match = key.match(/^glazebid:selectedSheet:(.+)$/);
        if (match) {
          addProject(match[1]);
          continue;
        }
      }

      // 2) Current/singleton project fallbacks.
      addProject(localStorage.getItem('currentProject'));

      try {
        const pdRaw = localStorage.getItem('projectData');
        if (pdRaw) {
          const pd = JSON.parse(pdRaw);
          addProject(pd?.projectName || pd?.name, pd?.updatedAt || pd?.modified);
        }
      } catch {
        // Ignore malformed singleton data.
      }

      // 3) Legacy arrays if present.
      for (const listKey of ['glazebid:projects', 'recentProjects', 'projects']) {
        try {
          const raw = localStorage.getItem(listKey);
          if (!raw) continue;
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) continue;
          arr.forEach((p) => {
            if (typeof p === 'string') {
              addProject(p);
            } else {
              addProject(
                p?.projectName || p?.name || p?.title,
                p?.updatedAt || p?.modified || p?.lastOpened,
                p?.status || 'in_progress'
              );
            }
          });
        } catch {
          // Ignore malformed legacy arrays.
        }
      }

      const recovered = [...projectMap.values()].sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );

      setProjects(recovered);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    const iconProps = { size: 16 };
    switch (status) {
      case 'complete':
        return <CheckCircle {...iconProps} color="#4ade80" />;
      case 'in_progress':
        return <Clock {...iconProps} color="#60a5fa" />;
      case 'under_review':
        return <AlertCircle {...iconProps} color="#fbbf24" />;
      case 'archived':
        return <Archive {...iconProps} color="#6b7280" />;
      default:
        return <Folder {...iconProps} color="#9ca3af" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading projects...</div>
      </div>
    );
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
      <div style={styles.header}>
        <h1 style={styles.title}>Your Projects</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onSettings} style={styles.settingsButton} title="Admin Settings">
            ⚙️ Settings
          </button>
          <button onClick={onNewProject} style={styles.newProjectButton}>
            + New Project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div style={styles.emptyState}>
          <Folder size={64} color="#6b7280" />
          <h2 style={styles.emptyTitle}>No projects yet</h2>
          <p style={styles.emptyText}>Create your first project by uploading drawings and specifications</p>
          <button onClick={onNewProject} style={styles.startButton}>
            Start New Project
          </button>
        </div>
      ) : (
        <div style={styles.projectGrid}>
          {projects.map((project, index) => (
            <div 
              key={index} 
              style={styles.projectCard}
              onClick={() => onProjectSelect(project)}
            >
              <div style={styles.cardHeader}>
                <div style={styles.statusIcon}>
                  {getStatusIcon(project.status)}
                </div>
                <span style={styles.statusText}>{project.status}</span>
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
    minHeight: 'calc(100vh - 70px)',
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
};

export default ProjectList;
