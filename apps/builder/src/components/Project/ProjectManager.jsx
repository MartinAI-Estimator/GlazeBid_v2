import React, { useState, useEffect, useCallback } from 'react';
import useProjectPersistence from '../../hooks/useProjectPersistence';

/**
 * ProjectManager Modal
 * UI for Save/Load operations
 * 
 * Modes:
 * - 'save': Save current project
 * - 'open': Load existing project
 */
const ProjectManager = ({ mode, onClose }) => {
  const {
    currentProjectName,
    isSaving,
    isLoading,
    error,
    isConfigured,
    saveProject,
    loadProject,
    fetchProjects,
    deleteProject,
    setCurrentProjectName
  } = useProjectPersistence();

  const [projectName, setProjectName] = useState(currentProjectName);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadProjectsList = useCallback(async () => {
    const data = await fetchProjects();
    setProjects(data);
  }, [fetchProjects]);

  // Load projects list when in 'open' mode
  useEffect(() => {
    if (mode === 'open') {
      loadProjectsList();
    }
  }, [mode, loadProjectsList]);

  // Handle Save
  const handleSave = async () => {
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    const projectId = await saveProject(projectName.trim());
    if (projectId) {
      onClose();
    }
  };

  // Handle Load
  const handleLoad = async (projectId) => {
    const success = await loadProject(projectId);
    if (success) {
      onClose();
    } else {
      alert('Failed to load project. Check console for details.');
    }
  };

  // Handle Delete
  const handleDelete = async (projectId) => {
    const success = await deleteProject(projectId);
    if (success) {
      loadProjectsList();
      setDeleteConfirm(null);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Not configured warning
  if (!isConfigured) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, maxWidth: '500px' }}>
          <h2 style={{ color: '#f85149', marginBottom: '16px', fontSize: '18px' }}>
            ⚠️ Database Not Configured
          </h2>
          <p style={{ color: '#8b949e', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' }}>
            Supabase credentials are missing. To enable Save/Load features:
          </p>
          <ol style={{ color: '#c9d1d9', fontSize: '13px', lineHeight: '1.8', paddingLeft: '20px', marginBottom: '20px' }}>
            <li>Create a free account at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#58a6ff' }}>supabase.com</a></li>
            <li>Create a new project</li>
            <li>Add your credentials to <code style={{ backgroundColor: '#21262d', padding: '2px 6px', borderRadius: '3px' }}>.env</code>:
              <pre style={{ backgroundColor: '#0d1117', padding: '12px', borderRadius: '6px', marginTop: '8px', fontSize: '12px', overflow: 'auto' }}>
{`VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}
              </pre>
            </li>
            <li>Restart the development server</li>
          </ol>
          <button onClick={onClose} style={buttonStyle}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid #30363d', paddingBottom: '16px', marginBottom: '20px' }}>
          <h2 style={{ color: '#c9d1d9', fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
            {mode === 'save' ? '💾 Save Project' : '📂 Open Project'}
          </h2>
          <p style={{ color: '#8b949e', fontSize: '13px' }}>
            {mode === 'save' 
              ? 'Save your current work to continue later'
              : 'Load a previously saved project'}
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            backgroundColor: '#f85149',
            color: 'white',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Save Mode */}
        {mode === 'save' && (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: '#8b949e', fontSize: '13px' }}>
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              autoFocus
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '14px',
                marginBottom: '20px'
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#238636',
                  flex: 1
                }}
              >
                {isSaving ? 'Saving...' : '💾 Save Project'}
              </button>
              <button
                onClick={onClose}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Open Mode */}
        {mode === 'open' && (
          <div>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <div style={{ color: '#8b949e', fontSize: '14px' }}>
                  No saved projects yet
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
                {projects.map(project => (
                  <div
                    key={project.id}
                    style={{
                      backgroundColor: selectedProject === project.id ? '#1c2128' : '#0d1117',
                      border: '1px solid',
                      borderColor: selectedProject === project.id ? '#58a6ff' : '#30363d',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => setSelectedProject(project.id)}
                    onDoubleClick={() => handleLoad(project.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ color: '#c9d1d9', fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                          {project.name}
                        </div>
                        <div style={{ color: '#8b949e', fontSize: '12px' }}>
                          {formatDate(project.updated_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          backgroundColor: project.status === 'Draft' ? '#58a6ff' : '#238636',
                          color: 'white',
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: '600'
                        }}>
                          {project.status}
                        </span>
                        {deleteConfirm === project.id ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(project.id);
                              }}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#f85149',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(null);
                              }}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#21262d',
                                color: '#8b949e',
                                border: '1px solid #30363d',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(project.id);
                            }}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'transparent',
                              color: '#f85149',
                              border: '1px solid #30363d',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                            title="Delete project"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => selectedProject && handleLoad(selectedProject)}
                disabled={!selectedProject || isLoading}
                style={{
                  ...buttonStyle,
                  backgroundColor: selectedProject ? '#238636' : '#21262d',
                  flex: 1,
                  opacity: selectedProject ? 1 : 0.5,
                  cursor: selectedProject ? 'pointer' : 'not-allowed'
                }}
              >
                📂 Open Selected
              </button>
              <button
                onClick={onClose}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#21262d',
                  border: '1px solid #30363d'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000
};

const modalStyle = {
  backgroundColor: '#161b22',
  padding: '24px',
  borderRadius: '8px',
  border: '1px solid #30363d',
  width: '90%',
  maxWidth: '600px',
  maxHeight: '80vh',
  overflowY: 'auto'
};

const buttonStyle = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.2s',
  color: 'white'
};

export default ProjectManager;
