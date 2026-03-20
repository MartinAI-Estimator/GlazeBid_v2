import React, { useState, useEffect } from 'react';
import { Settings, FolderOpen, Check, X, AlertCircle, HardDrive, Cloud, Network } from 'lucide-react';

/**
 * AdminSettings Component
 * Allows configuration of GlazeBid application settings
 * Key feature: Configurable project save path for local/network/cloud storage
 */
const AdminSettings = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [newPath, setNewPath] = useState('');
  const [pathValidation, setPathValidation] = useState(null);
  const [examples, setExamples] = useState([]);
  const [testingPath, setTestingPath] = useState(false);

  // Load current settings on mount
  useEffect(() => {
    loadSettings();
    loadExamples();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:8000/api/admin/settings/');
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings);
        setNewPath(data.settings.projects_base_path);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load settings. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const loadExamples = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/admin/settings/network-paths');
      const data = await response.json();
      
      if (data.success) {
        setExamples(data.examples || []);
      }
    } catch (error) {
      console.error('Failed to load examples:', error);
    }
  };

  const testPath = async () => {
    if (!newPath.trim()) return;
    
    try {
      setTestingPath(true);
      const response = await fetch('http://127.0.0.1:8000/api/admin/settings/test-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath.trim() })
      });
      
      const data = await response.json();
      setPathValidation(data);
    } catch (error) {
      console.error('Failed to test path:', error);
      setPathValidation({
        success: false,
        valid: false,
        error: error.message
      });
    } finally {
      setTestingPath(false);
    }
  };

  const savePath = async () => {
    if (!pathValidation?.valid) {
      alert('Please test the path first to ensure it is valid.');
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('http://127.0.0.1:8000/api/admin/settings/projects-path', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects_base_path: newPath.trim() })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings);
        alert(`✅ Projects save path updated successfully!\n\nNew path: ${data.settings.projects_base_path}`);
        if (onClose) onClose();
      } else {
        alert(`❌ Failed to update path: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to save path:', error);
      alert('Failed to save path. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  const selectExample = (examplePath) => {
    setNewPath(examplePath);
    setPathValidation(null);
  };

  const resetToDefaults = async () => {
    if (!window.confirm('Reset all settings to defaults? This will set the project path back to the local "Projects" folder.')) {
      return;
    }
    
    try {
      setSaving(true);
      const response = await fetch('http://127.0.0.1:8000/api/admin/settings/reset', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings);
        setNewPath(data.settings.projects_base_path);
        setPathValidation(null);
        alert('✅ Settings reset to defaults');
      }
    } catch (error) {
      console.error('Failed to reset:', error);
      alert('Failed to reset settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <div>Loading settings...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, maxWidth: '800px' }}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Settings size={24} color="#58a6ff" />
            <div>
              <h2 style={styles.title}>Admin Settings</h2>
              <p style={styles.subtitle}>Configure GlazeBid application settings</p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {/* Current Path Info */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Current Project Save Location</h3>
          <div style={styles.currentPathCard}>
            <FolderOpen size={20} color="#8b949e" />
            <div style={{ flex: 1 }}>
              <div style={styles.currentPathLabel}>Projects are currently saved to:</div>
              <div style={styles.currentPath}>{settings?.projects_base_path || 'Projects'}</div>
            </div>
          </div>
        </div>

        {/* Configure New Path */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Configure Save Location</h3>
          <p style={styles.help}>
            Set where GlazeBid should save project files. This can be a local folder, network drive, or cloud storage (like Egnyte).
          </p>

          {/* Path Input */}
          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Project Save Path</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newPath}
                onChange={(e) => {
                  setNewPath(e.target.value);
                  setPathValidation(null);
                }}
                placeholder="C:/MyEstimates or E:/Egnyte/Estimating/Projects"
                style={styles.input}
              />
              <button
                onClick={testPath}
                disabled={!newPath.trim() || testingPath}
                style={{
                  ...styles.button,
                  backgroundColor: '#238636',
                  minWidth: '100px'
                }}
              >
                {testingPath ? 'Testing...' : 'Test Path'}
              </button>
            </div>
          </div>

          {/* Validation Result */}
          {pathValidation && (
            <div style={{
              ...styles.validationCard,
              borderColor: pathValidation.valid ? '#238636' : '#f85149',
              backgroundColor: pathValidation.valid ? 'rgba(35, 134, 54, 0.1)' : 'rgba(248, 81, 73, 0.1)'
            }}>
              {pathValidation.valid ? (
                <Check size={20} color="#238636" />
              ) : (
                <X size={20} color="#f85149" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  {pathValidation.valid ? '✅ Path is valid!' : '❌ Path is invalid'}
                </div>
                <div style={{ fontSize: '13px', color: '#8b949e' }}>
                  {pathValidation.is_network && '🌐 Network path detected'}
                  {pathValidation.exists ? ' • Path exists' : ' • Path will be created'}
                  {pathValidation.writable && ' • Writable'}
                </div>
                {pathValidation.error && (
                  <div style={{ marginTop: '8px', color: '#f85149', fontSize: '13px' }}>
                    <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    {pathValidation.error}
                  </div>
                )}
                {pathValidation.valid && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={savePath}
                      disabled={saving}
                      style={{
                        ...styles.button,
                        backgroundColor: '#1f6feb',
                        fontWeight: '600'
                      }}
                    >
                      {saving ? 'Saving...' : '💾 Save This Path'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Examples */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Example Paths</h3>
          <div style={styles.examplesGrid}>
            {examples.map((example, idx) => (
              <div
                key={idx}
                onClick={() => selectExample(example.path)}
                style={styles.exampleCard}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  {example.type === 'local' && <HardDrive size={16} color="#58a6ff" />}
                  {example.type === 'network' && <Network size={16} color="#a371f7" />}
                  {example.type === 'cloud' && <Cloud size={16} color="#f0883e" />}
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#58a6ff', textTransform: 'uppercase' }}>
                    {example.type}
                  </span>
                </div>
                <div style={styles.examplePath}>{example.path}</div>
                <div style={styles.exampleDescription}>{example.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            onClick={resetToDefaults}
            style={{
              ...styles.button,
              backgroundColor: '#21262d',
              border: '1px solid #30363d'
            }}
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            style={{
              ...styles.button,
              backgroundColor: '#21262d',
              border: '1px solid #30363d'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  },
  modal: {
    backgroundColor: '#0d1117',
    borderRadius: '12px',
    border: '1px solid #30363d',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 16px 32px rgba(0, 0, 0, 0.4)'
  },
  header: {
    padding: '24px',
    borderBottom: '1px solid #30363d',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start'
  },
  title: {
    color: '#c9d1d9',
    fontSize: '20px',
    fontWeight: '700',
    margin: 0
  },
  subtitle: {
    color: '#8b949e',
    fontSize: '14px',
    margin: '4px 0 0 0'
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#8b949e',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  section: {
    padding: '24px',
    borderBottom: '1px solid #30363d'
  },
  sectionTitle: {
    color: '#c9d1d9',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '16px'
  },
  help: {
    color: '#8b949e',
    fontSize: '14px',
    marginBottom: '16px',
    lineHeight: '1.6'
  },
  label: {
    display: 'block',
    color: '#8b949e',
    fontSize: '13px',
    marginBottom: '8px',
    fontWeight: '500'
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#c9d1d9',
    fontSize: '14px',
    fontFamily: 'monospace'
  },
  button: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  currentPathCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px'
  },
  currentPathLabel: {
    color: '#8b949e',
    fontSize: '12px',
    marginBottom: '4px'
  },
  currentPath: {
    color: '#58a6ff',
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: '600'
  },
  validationCard: {
    display: 'flex',
    alignItems: 'start',
    gap: '12px',
    padding: '16px',
    border: '2px solid',
    borderRadius: '6px',
    marginTop: '12px'
  },
  examplesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px'
  },
  exampleCard: {
    padding: '16px',
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  examplePath: {
    color: '#c9d1d9',
    fontSize: '13px',
    fontFamily: 'monospace',
    marginBottom: '8px',
    wordBreak: 'break-all'
  },
  exampleDescription: {
    color: '#8b949e',
    fontSize: '12px',
    lineHeight: '1.5'
  },
  footer: {
    padding: '24px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  loadingContainer: {
    padding: '40px',
    textAlign: 'center',
    color: '#8b949e'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #30363d',
    borderTop: '3px solid #58a6ff',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite'
  }
};

export default AdminSettings;
