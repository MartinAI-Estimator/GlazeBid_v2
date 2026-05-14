/**
 * TrainingDataPanel.tsx — Training data collection and export UI for Studio.
 *
 * Shows session learner statistics and provides export controls for offline training.
 * Displays training data metrics and integrates with the useTrainingDataCollector hook.
 */

import React, { useState, useEffect, type FC } from 'react';
import { Download, Trash2, Info } from 'lucide-react';
import { useTrainingDataCollector } from '../hooks/useTrainingDataCollector';

const TrainingDataPanel: FC = () => {
  const collector = useTrainingDataCollector();
  const [summary, setSummary] = useState({ total: 0, positives: 0, negatives: 0 });
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Refresh summary on mount
  useEffect(() => {
    setSummary(collector.getSummary());
  }, [collector]);

  const handleExportJSONL = () => {
    const blob = collector.exportJSONL();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glazebid-training-${new Date().toISOString().split('T')[0]}.jsonl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const blob = collector.exportCSV();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glazebid-training-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all training data? This cannot be undone.')) {
      collector.clearAll();
      setSummary({ total: 0, positives: 0, negatives: 0 });
      setShowConfirmClear(false);
    }
  };

  const positiveRate = summary.total > 0 ? ((summary.positives / summary.total) * 100).toFixed(1) : 0;
  const progressPercent = summary.total > 0 ? Math.min((summary.total / 500) * 100, 100) : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Training Data Collector</span>
        <span style={styles.badge}>Phase 10.3</span>
      </div>

      {/* Info */}
      <div style={styles.info}>
        <Info size={14} style={{ color: '#0ea5e9' }} />
        <span style={styles.infoText}>
          These examples are used to fine-tune the Ghost Detector AI model.
        </span>
      </div>

      {/* Summary Cards */}
      <div style={styles.statsGrid}>
        <StatCard
          label="Total Examples"
          value={summary.total}
          color="#0ea5e9"
        />
        <StatCard
          label="Positive (✓)"
          value={summary.positives}
          color="#10b981"
        />
        <StatCard
          label="Negative (✗)"
          value={summary.negatives}
          color="#ef4444"
        />
        <StatCard
          label="Positive Rate"
          value={`${positiveRate}%`}
          color="#8b5cf6"
        />
      </div>

      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressLabel}>
          <span style={{ fontSize: 12, color: '#e4e4e7' }}>
            Progress toward minimum (500 examples)
          </span>
          <span style={{ fontSize: 11, color: '#71717a' }}>
            {summary.total} / 500
          </span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      {/* Minimum Recommended Info */}
      <div style={styles.minimumInfo}>
        <span style={styles.minimumText}>
          Minimum recommended: 500 examples (200 pos / 300 neg) per frame type
        </span>
      </div>

      {/* Export Buttons */}
      <div style={styles.buttonGroup}>
        <button
          onClick={handleExportJSONL}
          disabled={summary.total === 0}
          style={buttonStyle('#0ea5e9', summary.total === 0)}
          title="Export as JSONL for PyTorch/TensorFlow training"
        >
          <Download size={14} />
          Export JSONL
        </button>
        <button
          onClick={handleExportCSV}
          disabled={summary.total === 0}
          style={buttonStyle('#8b5cf6', summary.total === 0)}
          title="Export as CSV spreadsheet"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Clear Button */}
      <div style={styles.dangerZone}>
        <button
          onClick={() => setShowConfirmClear(!showConfirmClear)}
          style={buttonStyle('#ef4444', false)}
        >
          <Trash2 size={14} />
          Clear All Data
        </button>
        {showConfirmClear && (
          <div style={styles.confirmation}>
            <span style={styles.confirmText}>
              Are you sure? This cannot be undone.
            </span>
            <div style={styles.confirmButtons}>
              <button
                onClick={handleClearAll}
                style={buttonStyle('#ef4444', false)}
              >
                Yes, Clear
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                style={buttonStyle('#52525b', false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cloud Upload Section (Disabled) */}
      <div style={styles.cloudSection}>
        <div style={styles.cloudHeader}>
          <span style={styles.cloudTitle}>Cloud Training Pipeline</span>
        </div>
        <button
          disabled={true}
          style={buttonStyle('#8b5cf6', true)}
          title="Sign in to GlazeBid Pro to enable cloud training"
        >
          <Upload size={14} />
          Upload to GlazeBid Training Server
        </button>
        <div style={styles.cloudNote}>
          <span style={styles.cloudNoteText}>
            Sign in to GlazeBid Pro to enable automatic model training and one-click model updates.
          </span>
        </div>
      </div>
    </div>
  );
};

type StatCardProps = {
  label: string;
  value: string | number;
  color: string;
};

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color }}>
        {value}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function buttonStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
    background: '#09090b',
    borderRadius: '8px',
    borderTop: '1px solid #27272a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
  },
  badge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#27272a',
    color: '#71717a',
    fontWeight: 500,
  },
  info: {
    display: 'flex',
    gap: '8px',
    padding: '8px',
    background: 'rgba(14, 165, 233, 0.08)',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '11px',
  },
  infoText: {
    color: '#52525b',
    lineHeight: '1.4',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '12px',
  },
  statCard: {
    padding: '8px',
    background: '#111113',
    borderRadius: '6px',
    border: '1px solid #27272a',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '2px',
  },
  statLabel: {
    fontSize: '10px',
    color: '#71717a',
  },
  progressSection: {
    marginBottom: '12px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
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
  minimumInfo: {
    padding: '8px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  minimumText: {
    fontSize: '10px',
    color: '#52525b',
    lineHeight: '1.4',
  },
  buttonGroup: {
    display: 'flex',
    gap: '6px',
    marginBottom: '12px',
  },
  dangerZone: {
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.08)',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  confirmation: {
    marginTop: '8px',
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.12)',
    borderRadius: '4px',
  },
  confirmText: {
    fontSize: '11px',
    color: '#ef4444',
    display: 'block',
    marginBottom: '8px',
  },
  confirmButtons: {
    display: 'flex',
    gap: '6px',
  },
  cloudSection: {
    padding: '8px',
    background: '#111113',
    borderRadius: '6px',
    border: '1px solid #27272a',
  },
  cloudHeader: {
    marginBottom: '8px',
  },
  cloudTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
  },
  cloudNote: {
    marginTop: '8px',
    padding: '6px',
    background: 'rgba(139, 92, 246, 0.08)',
    borderRadius: '4px',
  },
  cloudNoteText: {
    fontSize: '10px',
    color: '#52525b',
    lineHeight: '1.4',
  },
};

export default TrainingDataPanel;
