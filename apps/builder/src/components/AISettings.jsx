/**
 * AISettings.jsx — Comprehensive AI settings panel for GlazeBid Builder.
 *
 * Displays AI feature status, training data collection, and cloud pipeline configuration.
 * All data stored locally in localStorage.
 */

import React, { useState, useEffect } from 'react';
import {
  Brain,
  CheckCircle,
  AlertCircle,
  Settings,
  Upload,
  Download,
  Radio,
  Wifi,
  WifiOff,
  Copy,
  Check,
} from 'lucide-react';

const AISettings = () => {
  const [trainingCount, setTrainingCount] = useState(0);
  const [trainingPositives, setTrainingPositives] = useState(0);
  const [trainingNegatives, setTrainingNegatives] = useState(0);
  const [lastSaved, setLastSaved] = useState(null);
  const [onnxStatus, setOnnxStatus] = useState('Canvas Native');
  const [serverUrl, setServerUrl] = useState(
    localStorage.getItem('glazebid:training-server-url') || ''
  );
  const [serverOnline, setServerOnline] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [aiSettings, setAiSettings] = useState({
    enableGhostDetector: localStorage.getItem('glazebid:ai-enable-ghost') !== 'false',
    enableSessionLearning: localStorage.getItem('glazebid:ai-enable-session') !== 'false',
    autoSaveSession: localStorage.getItem('glazebid:ai-auto-save') !== 'false',
    collectTrainingData: localStorage.getItem('glazebid:ai-collect-data') !== 'false',
  });

  // Load training data summary on mount
  useEffect(() => {
    loadTrainingDataSummary();
    checkOnnxStatus();
  }, []);

  const loadTrainingDataSummary = () => {
    try {
      const raw = localStorage.getItem('glazebid:training-data');
      if (raw) {
        const examples = JSON.parse(raw);
        const positives = examples.filter(e => e.label === 1).length;
        const negatives = examples.filter(e => e.label === 0).length;
        setTrainingCount(examples.length);
        setTrainingPositives(positives);
        setTrainingNegatives(negatives);
        setLastSaved(new Date().toLocaleString());
      }
    } catch (e) {
      console.error('Failed to load training data summary:', e);
    }
  };

  const checkOnnxStatus = () => {
    const modelName = localStorage.getItem('glazebid:onnx-model-name');
    if (modelName) {
      setOnnxStatus('ONNX Model Active');
    } else {
      setOnnxStatus('Canvas Native');
    }
  };

  const handleServerUrlChange = (e) => {
    const newUrl = e.target.value;
    setServerUrl(newUrl);
    localStorage.setItem('glazebid:training-server-url', newUrl);
  };

  const handleTestConnection = async () => {
    if (!serverUrl) {
      setTestResult({ success: false, message: 'Please enter a server URL' });
      return;
    }

    setTestingConnection(true);
    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      if (response.ok) {
        setServerOnline(true);
        setTestResult({ success: true, message: 'Connected successfully' });
      } else {
        setServerOnline(false);
        setTestResult({ success: false, message: `Server returned ${response.status}` });
      }
    } catch (error) {
      setServerOnline(false);
      setTestResult({ success: false, message: error.message || 'Connection failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleToggle = (key) => {
    const newValue = !aiSettings[key];
    setAiSettings({ ...aiSettings, [key]: newValue });

    // Map to localStorage keys
    const storageKeyMap = {
      enableGhostDetector: 'glazebid:ai-enable-ghost',
      enableSessionLearning: 'glazebid:ai-enable-session',
      autoSaveSession: 'glazebid:ai-auto-save',
      collectTrainingData: 'glazebid:ai-collect-data',
    };

    localStorage.setItem(storageKeyMap[key], newValue ? 'true' : 'false');
  };

  const handleExportTrainingData = (format) => {
    try {
      const raw = localStorage.getItem('glazebid:training-data');
      if (!raw) {
        alert('No training data to export');
        return;
      }

      const examples = JSON.parse(raw);
      let content, filename, mimeType;

      if (format === 'jsonl') {
        content = examples.map(e => JSON.stringify(e)).join('\n');
        filename = `glazebid-training-${new Date().toISOString().split('T')[0]}.jsonl`;
        mimeType = 'application/jsonlines';
      } else if (format === 'csv') {
        const header = 'label,timestamp,projectId,pageId,' +
          Array.from({ length: 128 }, (_, i) => `a${i}`).join(',') + ',' +
          Array.from({ length: 128 }, (_, i) => `c${i}`).join(',');
        const rows = examples.map(e =>
          [e.label, e.timestamp, e.projectId ?? '', e.pageId ?? '',
            ...e.anchor, ...e.candidate].join(',')
        );
        content = [header, ...rows].join('\n');
        filename = `glazebid-training-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  };

  const copyToClipboard = () => {
    if (serverUrl) {
      navigator.clipboard.writeText(serverUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const positiveRate = trainingCount > 0 ? ((trainingPositives / trainingCount) * 100).toFixed(1) : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <Brain size={24} style={{ color: '#8b5cf6' }} />
          <h1 style={styles.title}>GlazeBid AI Settings</h1>
        </div>
      </div>

      {/* Ghost Detector Status Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Ghost Detector Status</h2>
        <div style={styles.statusCard}>
          <div style={styles.statusHeader}>
            <div style={styles.statusLeft}>
              <span style={styles.statusLabel}>Current Mode</span>
              <span style={styles.statusValue}>{onnxStatus}</span>
            </div>
            <div style={styles.statusBadge(onnxStatus === 'ONNX Model Active')}>
              {onnxStatus === 'ONNX Model Active' ? (
                <CheckCircle size={16} style={{ color: '#10b981' }} />
              ) : (
                <AlertCircle size={16} style={{ color: '#60a5fa' }} />
              )}
              <span>{onnxStatus === 'ONNX Model Active' ? 'Active' : 'Ready'}</span>
            </div>
          </div>
          <p style={styles.statusInfo}>
            Ghost Detector automatically finds matching glazing frames on PDF drawings.
          </p>
          <button style={buttonStyle('#0ea5e9')}>
            Open Studio to Configure
          </button>
        </div>
      </div>

      {/* Session Learner Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Session Learner</h2>
        <div style={styles.statsContainer}>
          <StatBox
            label="Training Examples Collected"
            value={trainingCount}
            sublabel={`${trainingPositives} positive, ${trainingNegatives} negative`}
            color="#0ea5e9"
          />
          <StatBox
            label="Positive Rate"
            value={`${positiveRate}%`}
            sublabel="Accuracy indicator"
            color="#10b981"
          />
        </div>

        {lastSaved && (
          <div style={styles.lastSavedInfo}>
            <span style={styles.lastSavedLabel}>Last session saved:</span>
            <span style={styles.lastSavedTime}>{lastSaved}</span>
          </div>
        )}

        <div style={styles.progressContainer}>
          <div style={styles.progressLabel}>
            <span>Progress toward recommended minimum (500 examples)</span>
            <span style={styles.progressValue}>{trainingCount} / 500</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.min((trainingCount / 500) * 100, 100)}%`,
              }}
            />
          </div>
        </div>

        <div style={styles.exportButtonGroup}>
          <button
            onClick={() => handleExportTrainingData('jsonl')}
            disabled={trainingCount === 0}
            style={buttonStyle('#0ea5e9', trainingCount === 0)}
          >
            <Download size={14} />
            Export JSONL
          </button>
          <button
            onClick={() => handleExportTrainingData('csv')}
            disabled={trainingCount === 0}
            style={buttonStyle('#8b5cf6', trainingCount === 0)}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Cloud Training Pipeline Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Cloud Training Pipeline</h2>
        <div style={styles.timelineContainer}>
          <TimelineStep
            number={1}
            title="Collect Examples"
            status="complete"
            details={`${trainingCount} collected`}
          />
          <TimelineStep
            number={2}
            title="Export & Upload"
            status="current"
            details="Export JSONL to send to training server"
          />
          <TimelineStep
            number={3}
            title="Download Model"
            status="pending"
            details="Requires Pro account"
          />
        </div>

        {/* Server Configuration */}
        <div style={styles.serverConfig}>
          <label style={styles.label}>Training Server URL</label>
          <div style={styles.urlInputContainer}>
            <input
              type="text"
              value={serverUrl}
              onChange={handleServerUrlChange}
              placeholder="https://train.glazebid.com/api/v1/upload"
              style={styles.urlInput}
            />
            <button
              onClick={copyToClipboard}
              style={buttonStyle('#52525b', !serverUrl)}
              title="Copy URL"
            >
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Test Connection */}
        <div style={styles.connectionTest}>
          <button
            onClick={handleTestConnection}
            disabled={testingConnection || !serverUrl}
            style={buttonStyle('#0ea5e9', testingConnection || !serverUrl)}
          >
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <div
              style={{
                ...styles.testResult,
                ...(testResult.success ? styles.testResultSuccess : styles.testResultError),
              }}
            >
              <div style={styles.testResultIcon}>
                {testResult.success ? (
                  <Wifi size={14} style={{ color: '#10b981' }} />
                ) : (
                  <WifiOff size={14} style={{ color: '#ef4444' }} />
                )}
              </div>
              <div style={styles.testResultText}>
                <div style={styles.testResultStatus}>
                  {testResult.success ? 'Online' : 'Offline'}
                </div>
                <div style={styles.testResultMessage}>{testResult.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Pro Callout */}
        <div style={styles.proCallout}>
          <div style={styles.proIcon}>✨</div>
          <div style={styles.proText}>
            <div style={styles.proTitle}>GlazeBid Pro</div>
            <div style={styles.proDescription}>
              Upgrade to GlazeBid Pro for automatic model training and one-click model updates.
            </div>
          </div>
        </div>
      </div>

      {/* AI Feature Toggles Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>AI Feature Toggles</h2>
        <div style={styles.toggleList}>
          <Toggle
            label="Enable Ghost Detector"
            checked={aiSettings.enableGhostDetector}
            onChange={() => handleToggle('enableGhostDetector')}
            description="Automatically find matching frames on PDFs"
          />
          <Toggle
            label="Enable Session Learning"
            checked={aiSettings.enableSessionLearning}
            onChange={() => handleToggle('enableSessionLearning')}
            description="Learn from your accept/reject decisions in real-time"
          />
          <Toggle
            label="Auto-save session on project close"
            checked={aiSettings.autoSaveSession}
            onChange={() => handleToggle('autoSaveSession')}
            description="Automatically save learning state"
          />
          <Toggle
            label="Collect training data"
            checked={aiSettings.collectTrainingData}
            onChange={() => handleToggle('collectTrainingData')}
            description="Anonymous usage only — helps improve the model"
          />
        </div>
      </div>

      {/* About Section */}
      <div style={styles.section}>
        <div style={styles.aboutCard}>
          <div style={styles.aboutIcon}>🧠</div>
          <div style={styles.aboutContent}>
            <div style={styles.aboutTitle}>GlazeBid AI v2.0</div>
            <div style={styles.aboutText}>
              Powered by canvas-native feature extraction + real-time session learning.
              ONNX model support available with GlazeBid Pro.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * StatBox — displays a metric with label and sublabel
 */
function StatBox({ label, value, sublabel, color }) {
  return (
    <div style={styles.statBox}>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sublabel && <div style={styles.statSublabel}>{sublabel}</div>}
    </div>
  );
}

/**
 * TimelineStep — displays a step in the cloud pipeline
 */
function TimelineStep({ number, title, status, details }) {
  const statusColors = {
    complete: { bg: '#052e16', text: '#10b981', icon: '✓' },
    current: { bg: '#0c2340', text: '#0ea5e9', icon: '→' },
    pending: { bg: '#27272a', text: '#71717a', icon: '—' },
  };

  const colors = statusColors[status];

  return (
    <div style={styles.timelineStep}>
      <div style={{ ...styles.timelineNumber, ...colors }}>
        {colors.icon}
      </div>
      <div style={styles.timelineContent}>
        <div style={styles.timelineTitle}>{title}</div>
        <div style={styles.timelineDetails}>{details}</div>
      </div>
    </div>
  );
}

/**
 * Toggle — checkbox toggle with label and description
 */
function Toggle({ label, checked, onChange, description }) {
  return (
    <div style={styles.toggleItem}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={styles.toggleCheckbox}
        id={label}
      />
      <label htmlFor={label} style={styles.toggleLabel}>
        <div style={styles.toggleLabelText}>{label}</div>
        <div style={styles.toggleDescription}>{description}</div>
      </label>
    </div>
  );
}

/**
 * Button style helper
 */
function buttonStyle(color, disabled = false) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? '#27272a' : color,
    color: disabled ? '#52525b' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.15s',
    opacity: disabled ? 0.5 : 1,
  };
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    background: '#09090b',
    color: '#e4e4e7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #27272a',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f4f4f5',
    margin: 0,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f4f4f5',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusCard: {
    padding: '12px',
    background: '#111113',
    borderRadius: '8px',
    border: '1px solid #27272a',
    marginBottom: '12px',
  },
  statusHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  statusLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statusLabel: {
    fontSize: '11px',
    color: '#71717a',
    fontWeight: 500,
  },
  statusValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#e4e4e7',
  },
  statusBadge: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(96, 165, 250, 0.1)',
    fontSize: '11px',
    fontWeight: 500,
    color: active ? '#10b981' : '#60a5fa',
  }),
  statusInfo: {
    fontSize: '12px',
    color: '#71717a',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  statBox: {
    padding: '12px',
    background: '#111113',
    borderRadius: '8px',
    border: '1px solid #27272a',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#71717a',
    fontWeight: 500,
    marginBottom: '4px',
  },
  statSublabel: {
    fontSize: '10px',
    color: '#52525b',
  },
  lastSavedInfo: {
    padding: '8px 12px',
    background: 'rgba(14, 165, 233, 0.08)',
    borderRadius: '6px',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
  },
  lastSavedLabel: {
    color: '#71717a',
  },
  lastSavedTime: {
    color: '#0ea5e9',
    fontWeight: 500,
  },
  progressContainer: {
    marginBottom: '12px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
    fontSize: '11px',
    color: '#71717a',
  },
  progressValue: {
    fontWeight: 600,
    color: '#0ea5e9',
  },
  progressBar: {
    width: '100%',
    height: '6px',
    background: '#27272a',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #0ea5e9, #10b981)',
    transition: 'width 0.3s ease',
  },
  exportButtonGroup: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  timelineContainer: {
    marginBottom: '16px',
  },
  timelineStep: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
  },
  timelineNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 600,
    flexShrink: 0,
  },
  timelineContent: {
    paddingTop: '4px',
  },
  timelineTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    marginBottom: '2px',
  },
  timelineDetails: {
    fontSize: '11px',
    color: '#71717a',
  },
  serverConfig: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    marginBottom: '8px',
  },
  urlInputContainer: {
    display: 'flex',
    gap: '6px',
  },
  urlInput: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #27272a',
    background: '#111113',
    color: '#e4e4e7',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  connectionTest: {
    marginBottom: '12px',
  },
  testResult: {
    marginTop: '8px',
    padding: '8px',
    borderRadius: '6px',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  },
  testResultSuccess: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  testResultError: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  testResultIcon: {
    paddingTop: '2px',
    flexShrink: 0,
  },
  testResultText: {
    fontSize: '11px',
  },
  testResultStatus: {
    fontWeight: 600,
    marginBottom: '2px',
  },
  testResultMessage: {
    color: '#71717a',
  },
  proCallout: {
    padding: '12px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderRadius: '8px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    display: 'flex',
    gap: '12px',
  },
  proIcon: {
    fontSize: '20px',
  },
  proText: {
    flex: 1,
  },
  proTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#8b5cf6',
    marginBottom: '4px',
  },
  proDescription: {
    fontSize: '11px',
    color: '#71717a',
    lineHeight: '1.4',
  },
  toggleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  toggleItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  toggleCheckbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    cursor: 'pointer',
    accentColor: '#8b5cf6',
  },
  toggleLabel: {
    cursor: 'pointer',
    flex: 1,
  },
  toggleLabelText: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#e4e4e7',
    marginBottom: '2px',
  },
  toggleDescription: {
    fontSize: '11px',
    color: '#71717a',
  },
  aboutCard: {
    padding: '12px',
    background: '#111113',
    borderRadius: '8px',
    border: '1px solid #27272a',
    display: 'flex',
    gap: '12px',
  },
  aboutIcon: {
    fontSize: '24px',
  },
  aboutContent: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    marginBottom: '4px',
  },
  aboutText: {
    fontSize: '11px',
    color: '#71717a',
    lineHeight: '1.5',
  },
};

export default AISettings;
