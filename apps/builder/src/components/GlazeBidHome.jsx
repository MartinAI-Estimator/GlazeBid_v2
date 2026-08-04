import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import topLogo from '../assets/TOP_LOGO.svg';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  in_progress:  { color: '#60a5fa', label: 'In Progress' },
  complete:     { color: '#4ade80', label: 'Complete'    },
  under_review: { color: '#fbbf24', label: 'Under Review'},
  archived:     { color: '#6b7280', label: 'Archived'    },
};

const DEFAULT_STATUS = STATUS_CONFIG.in_progress;

// ─── Component ─────────────────────────────────────────────────────────────────
export default function GlazeBidHome({ onProjectSelect, onNewProject, onSettings }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hovered, setHovered]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // project | null
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadProjects(); }, []);

  // ── Delete a project: disk folder + registry entry + scoped local state ──────
  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    setDeleting(true);
    try {
      // 1. Remove the project folder from disk (Electron only — no-op in browser).
      //    A disk failure must NEVER block removing the project from the list,
      //    so this is isolated in its own try/catch.
      if (window.electronAPI?.deleteProject) {
        try {
          const result = await window.electronAPI.deleteProject({
            folderName: name,
            aiqPath:    deleteTarget.aiqPath,
          });
          if (!result?.ok && result?.error && result.error !== 'NO_ROOT') {
            console.warn('[GlazeBidHome] disk delete failed:', result.error);
          }
        } catch (err) {
          console.warn('[GlazeBidHome] delete IPC threw:', err);
        }
      }

      // 2. Drop it from the registry
      try {
        const raw = localStorage.getItem('glazebid:projectRegistry');
        const registry = raw ? JSON.parse(raw) : [];
        localStorage.setItem(
          'glazebid:projectRegistry',
          JSON.stringify(registry.filter(p => p?.name !== name)),
        );
      } catch { /* ignore */ }

      // 3. Purge every project-scoped localStorage key so a re-created project
      //    with the same name starts clean.
      try {
        const doomed = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('glazebid') && k.includes(`:${name}`)) doomed.push(k);
        }
        doomed.forEach(k => localStorage.removeItem(k));
        if (localStorage.getItem('currentProject') === name) {
          localStorage.removeItem('currentProject');
          localStorage.removeItem('projectData');
        }
      } catch { /* ignore */ }

      setDeleteTarget(null);
      loadProjects();
    } catch (err) {
      console.error('[GlazeBidHome] delete failed:', err);
      alert(`Delete failed: ${err?.message || err}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── Read project registry from localStorage ──────────────────────────────────
  const loadProjects = () => {
    try {
      let registry = [];

      try {
        const raw = localStorage.getItem('glazebid:projectRegistry');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) registry = parsed;
        }
      } catch { /* ignore malformed */ }

      // One-time migration — discover pre-registry projects from namespaced keys
      if (registry.length === 0) {
        const discovered = new Map();
        const tryAdd = (name, modified) => {
          if (!name?.trim()) return;
          const key = name.trim();
          if (discovered.has(key)) return;
          const ts = modified ? new Date(modified) : null;
          discovered.set(key, (ts && !isNaN(ts)) ? ts.toISOString() : new Date().toISOString());
        };

        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) allKeys.push(k);
        }
        allKeys.sort();

        for (const k of allKeys) {
          const m = k.match(/^glazebid:(?:sheets|bidSettings|selectedSheet|specFolder|specSections|specScanResults|specReaderResults|filePath):(.+)$/);
          if (m) tryAdd(m[1], null);
        }

        tryAdd(localStorage.getItem('currentProject'), null);
        try {
          const pd = JSON.parse(localStorage.getItem('projectData') || 'null');
          if (pd) tryAdd(pd?.projectName || pd?.name, pd?.updatedAt || pd?.modified);
        } catch { /* ignore */ }

        registry = [...discovered.entries()].map(([name, modified]) => ({
          name, modified, status: 'in_progress',
        }));

        if (registry.length > 0) {
          try {
            localStorage.setItem('glazebid:projectRegistry', JSON.stringify(registry));
          } catch { /* ignore */ }
        }
      }

      const sorted = [...registry]
        .filter(e => e?.name)
        .sort((a, b) => {
          const diff = new Date(b.modified).getTime() - new Date(a.modified).getTime();
          if (diff !== 0) return diff;
          return (a.name || '').localeCompare(b.name || '');
        });

      setProjects(sorted);
    } catch (err) {
      console.warn('GlazeBidHome: failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <img
            src={topLogo}
            alt="GlazeBid AiQ"
            style={styles.logo}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div>
            <div style={styles.brandName}>GlazeBid AiQ</div>
            <div style={styles.brandSub}>Commercial Glazing Estimation Suite</div>
          </div>
        </div>
        <button onClick={onSettings} style={styles.settingsBtn} title="Settings">
          ⚙️ Settings
        </button>
      </div>

      {/* ── Projects section ─────────────────────────────────────────────────── */}
      <div style={styles.content}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Your Projects</h2>
            <p style={styles.sectionSub}>
              {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onNewProject} style={styles.newBtn}>
            + New Project
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={styles.loading}>Loading projects…</div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📋</div>
            <h3 style={styles.emptyTitle}>No projects yet</h3>
            <p style={styles.emptySub}>
              Create your first project to start estimating.
            </p>
            <button onClick={onNewProject} style={styles.emptyBtn}>
              + Start New Project
            </button>
          </div>
        )}

        {/* Project grid */}
        {!loading && projects.length > 0 && (
          <div style={styles.grid}>
            {projects.map((project, i) => {
              const cfg = STATUS_CONFIG[project.status] || DEFAULT_STATUS;
              const isHov = hovered === i;
              return (
                <div
                  key={project.name}
                  role="button"
                  tabIndex={0}
                  style={{
                    ...styles.card,
                    borderColor: isHov ? cfg.color : 'rgba(255,255,255,0.07)',
                    boxShadow: isHov
                      ? `0 0 0 1px ${cfg.color}, 0 8px 40px ${cfg.color}22`
                      : '0 2px 12px rgba(0,0,0,0.4)',
                    transform: isHov ? 'translateY(-3px)' : 'none',
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onProjectSelect(project)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onProjectSelect(project); }}
                >
                  {/* Accent top bar */}
                  <div style={{ ...styles.accentBar, background: cfg.color }} />

                  {/* Delete */}
                  <button
                    title={`Delete ${project.name}`}
                    style={{ ...styles.deleteBtn, opacity: isHov ? 1 : 0.35 }}
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                    onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                    onMouseOut={(e)  => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Trash2 size={15} />
                  </button>

                  {/* Icon */}
                  <div style={styles.cardIcon}>📐</div>

                  {/* Project name */}
                  <h3 style={{ ...styles.cardName, color: isHov ? cfg.color : '#e6edf3' }}>
                    {project.name}
                  </h3>

                  {/* Status badge */}
                  <div style={styles.statusBadge}>
                    <span style={{ ...styles.statusDot, background: cfg.color }} />
                    <span style={{ ...styles.statusLabel, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Date */}
                  <div style={styles.cardDate}>
                    Modified {formatDate(project.modified)}
                  </div>

                  {/* Open button */}
                  <div
                    style={{
                      ...styles.openBtn,
                      background: isHov ? cfg.color : 'rgba(255,255,255,0.05)',
                      color: isHov ? '#000' : '#8b949e',
                    }}
                  >
                    Open Project →
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={styles.overlay} onClick={() => !deleting && setDeleteTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Delete Project</h3>
            <p style={styles.modalText}>
              Permanently delete <strong style={{ color: '#e6edf3' }}>{deleteTarget.name}</strong> and
              all of its files? This cannot be undone.
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                style={{ ...styles.confirmDeleteBtn, opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div style={styles.footer}>
        GlazeBid AiQ Suite &nbsp;·&nbsp; Commercial Glazing Estimation Platform
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100%',
    background: 'var(--bg-deep, #0d1117)',
    padding: '40px 40px 32px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  // ── Top bar
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 1200,
    marginBottom: '48px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  logo: {
    height: 48,
    objectFit: 'contain',
  },
  brandName: {
    fontSize: '1.45rem',
    fontWeight: 900,
    color: '#e6edf3',
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  brandSub: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginTop: 3,
  },
  settingsBtn: {
    padding: '9px 18px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#8b949e',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  // ── Content area
  content: {
    width: '100%',
    maxWidth: 1200,
    flex: 1,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 800,
    color: '#e6edf3',
    letterSpacing: '-0.01em',
  },
  sectionSub: {
    margin: '4px 0 0',
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  newBtn: {
    padding: '10px 22px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  // ── Loading / empty
  loading: {
    color: '#6b7280',
    padding: '60px',
    textAlign: 'center',
    fontSize: '0.9rem',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '80px 40px',
    gap: '10px',
  },
  emptyIcon: {
    fontSize: '4rem',
    marginBottom: '8px',
    lineHeight: 1,
  },
  emptyTitle: {
    margin: 0,
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#e6edf3',
  },
  emptySub: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: '16px',
    padding: '12px 28px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  // ── Project grid + cards
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '20px',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '28px 22px 18px',
    background: '#161b22',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s',
  },
  deleteBtn: {
    position: 'absolute',
    top: 12,
    right: 10,
    background: 'transparent',
    border: 'none',
    color: '#8b949e',
    lineHeight: 0,
    padding: 6,
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.18s, color 0.18s, background 0.18s',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#161b22',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: '26px 28px',
    minWidth: 360,
    maxWidth: 460,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#e6edf3',
  },
  modalText: {
    margin: '12px 0 24px',
    fontSize: 14,
    lineHeight: 1.55,
    color: '#8b949e',
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '9px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    color: '#e6edf3',
    fontSize: 13,
    cursor: 'pointer',
  },
  confirmDeleteBtn: {
    padding: '9px 20px',
    background: '#ef4444',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: '14px 14px 0 0',
  },
  cardIcon: {
    fontSize: '2rem',
    marginBottom: '12px',
    marginTop: '4px',
    lineHeight: 1,
  },
  cardName: {
    margin: '0 0 10px',
    fontSize: '1rem',
    fontWeight: 800,
    transition: 'color 0.15s',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  cardDate: {
    flex: 1,
    fontSize: '0.73rem',
    color: '#6b7280',
    paddingBottom: '14px',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'flex-end',
  },
  openBtn: {
    width: '100%',
    padding: '9px 0',
    borderRadius: 7,
    fontWeight: 700,
    fontSize: '0.82rem',
    textAlign: 'center',
    transition: 'background 0.18s, color 0.18s',
    boxSizing: 'border-box',
  },
  // ── Footer
  footer: {
    marginTop: '48px',
    fontSize: '0.73rem',
    color: '#3d4451',
    textAlign: 'center',
  },
};
