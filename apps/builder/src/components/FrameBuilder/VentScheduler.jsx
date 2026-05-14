/**
 * VentScheduler — Operable Vent Schedule Management
 *
 * Comprehensive vent scheduling tool for glazing frames.
 * Includes vent table, hardware/screen options, labor estimation, and CSV export.
 */

import React, { useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import useVentStore from '../../store/useVentStore';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const VENT_TYPES = {
  'proj-out': 'Project-Out',
  'tilt-turn': 'Tilt-Turn',
  casement: 'Casement',
  slider: 'Slider',
  fixed: 'Fixed (No Vent)',
};

const HARDWARE_SETS = ['standard', 'heavy-duty'];

const LABOR_MAP = {
  'proj-out': 2.0,
  'tilt-turn': 3.0,
  casement: 1.5,
  slider: 1.5,
  fixed: 0,
};

export default function VentScheduler() {
  const { vents, addVent, updateVent, removeVent } = useVentStore();
  const { frames } = useFrameBuilderStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    frameId: frames.length > 0 ? frames[0].frameId : '',
    bayIndex: null,
    rowIndex: 0,
    type: 'proj-out',
    width: 24,
    height: 36,
    ventMark: '',
    quantity: 1,
    hardwareSet: 'standard',
    screenRequired: true,
  });

  // Calculate stats
  const stats = {
    totalVents: vents.length,
    totalSF: 0,
    totalLabor: 0,
  };

  vents.forEach((v) => {
    stats.totalSF += (v.width * v.height) / 144 * (v.quantity || 1);
    const labor = LABOR_MAP[v.type] || 0;
    stats.totalLabor += labor * (v.quantity || 1);
  });

  const handleAddVent = () => {
    if (!formData.frameId) {
      alert('Please select a frame');
      return;
    }

    const newVent = {
      frameId: formData.frameId,
      bayIndex: formData.bayIndex,
      rowIndex: formData.rowIndex,
      type: formData.type,
      width: formData.width,
      height: formData.height,
      ventMark: formData.ventMark || `V-${vents.length + 1}`,
      quantity: formData.quantity,
      hardwareSet: formData.hardwareSet,
      screenRequired: formData.screenRequired,
    };

    addVent(newVent);

    // Reset form
    setFormData({
      frameId: frames.length > 0 ? frames[0].frameId : '',
      bayIndex: null,
      rowIndex: 0,
      type: 'proj-out',
      width: 24,
      height: 36,
      ventMark: '',
      quantity: 1,
      hardwareSet: 'standard',
      screenRequired: true,
    });
    setShowAddForm(false);
  };

  const handleExportCSV = () => {
    const headers = [
      'Mark',
      'Frame',
      'Bay/Row',
      'Type',
      'Width',
      'Height',
      'SF',
      'Qty',
      'Hardware',
      'Screen',
    ];

    const rows = vents.map((v) => {
      const frame = frames.find((f) => f.frameId === v.frameId);
      const frameMark = frame?.mark || 'N/A';
      const bayRow =
        v.bayIndex !== null && v.bayIndex !== undefined
          ? `B${v.bayIndex + 1}/R${v.rowIndex + 1}`
          : `R${v.rowIndex + 1}`;
      const sf = (v.width * v.height) / 144;

      return [
        v.ventMark,
        frameMark,
        bayRow,
        VENT_TYPES[v.type] || v.type,
        v.width,
        v.height,
        sf.toFixed(2),
        v.quantity,
        v.hardwareSet,
        v.screenRequired ? 'Yes' : 'No',
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
      '',
      `Total Vents,${stats.totalVents}`,
      `Total SF,${stats.totalSF.toFixed(2)}`,
      `Total Labor Hours,${stats.totalLabor.toFixed(1)}`,
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vent-schedule.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Vent Schedule</h3>
        <div style={styles.headerButtons}>
          <button onClick={handleExportCSV} style={styles.exportBtn} title="Export as CSV">
            <Download size={14} style={{ marginRight: '4px' }} />
            CSV
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} style={styles.addBtn}>
            <Plus size={14} style={{ marginRight: '4px' }} />
            Add Vent
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.headerRow}>
              <th style={styles.th}>Mark</th>
              <th style={styles.th}>Frame</th>
              <th style={styles.th}>Bay/Row</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>W × H</th>
              <th style={styles.th}>Hardware</th>
              <th style={styles.th}>Screen</th>
              <th style={styles.th}>Qty</th>
              <th style={{ ...styles.th, width: '40px' }}>
                Act
              </th>
            </tr>
          </thead>
          <tbody>
            {vents.length === 0 ? (
              <tr>
                <td colSpan="9" style={styles.emptyCell}>
                  No vents yet. Add one to get started.
                </td>
              </tr>
            ) : (
              vents.map((vent) => {
                const frame = frames.find((f) => f.frameId === vent.frameId);
                const frameMark = frame?.mark || 'N/A';
                const bayRow =
                  vent.bayIndex !== null && vent.bayIndex !== undefined
                    ? `B${vent.bayIndex + 1}/R${vent.rowIndex + 1}`
                    : `R${vent.rowIndex + 1}`;
                const sf = (vent.width * vent.height) / 144;

                return (
                  <tr key={vent.ventId} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#0ea5e9' }}>
                      {vent.ventMark}
                    </td>
                    <td style={styles.td}>{frameMark}</td>
                    <td style={styles.td}>{bayRow}</td>
                    <td style={styles.td}>{VENT_TYPES[vent.type] || vent.type}</td>
                    <td style={styles.td}>
                      {vent.width}" × {vent.height}"
                    </td>
                    <td style={styles.td}>{vent.hardwareSet}</td>
                    <td style={styles.td}>{vent.screenRequired ? 'Yes' : 'No'}</td>
                    <td style={styles.td}>{vent.quantity}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <button
                        onClick={() => removeVent(vent.ventId)}
                        style={styles.deleteBtn}
                        title="Delete vent"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Stats Footer */}
      <div style={styles.statsFooter}>
        <span>Total: {stats.totalVents} vents</span>
        <span>
          {' '}
          | {stats.totalSF.toFixed(1)} SF
        </span>
        <span>
          {' '}
          | Labor: ~{stats.totalLabor.toFixed(1)} hrs
        </span>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={styles.addFormContainer}>
          <div style={styles.formGrid}>
            {/* Frame Selector */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Frame *</label>
              <select
                value={formData.frameId}
                onChange={(e) => setFormData({ ...formData, frameId: e.target.value })}
                style={styles.select}
              >
                {frames.map((frame) => (
                  <option key={frame.frameId} value={frame.frameId}>
                    {frame.mark} ({frame.widthInches}" × {frame.heightInches}")
                  </option>
                ))}
              </select>
            </div>

            {/* Vent Mark */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Vent Mark</label>
              <input
                type="text"
                value={formData.ventMark}
                onChange={(e) => setFormData({ ...formData, ventMark: e.target.value })}
                placeholder={`V-${vents.length + 1}`}
                style={styles.input}
              />
            </div>

            {/* Type */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                style={styles.select}
              >
                {Object.entries(VENT_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Width */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Width"</label>
              <input
                type="number"
                value={formData.width}
                onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) })}
                style={styles.input}
              />
            </div>

            {/* Height */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Height"</label>
              <input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) })}
                style={styles.input}
              />
            </div>

            {/* Quantity */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Qty</label>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                min="1"
                style={styles.input}
              />
            </div>

            {/* Hardware Set */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Hardware</label>
              <select
                value={formData.hardwareSet}
                onChange={(e) => setFormData({ ...formData, hardwareSet: e.target.value })}
                style={styles.select}
              >
                {HARDWARE_SETS.map((hw) => (
                  <option key={hw} value={hw}>
                    {hw}
                  </option>
                ))}
              </select>
            </div>

            {/* Screen Required */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Screen?</label>
              <select
                value={formData.screenRequired ? 'yes' : 'no'}
                onChange={(e) => setFormData({ ...formData, screenRequired: e.target.value === 'yes' })}
                style={styles.select}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Bay Index */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Bay (opt)</label>
              <input
                type="number"
                value={formData.bayIndex ?? ''}
                onChange={(e) => setFormData({ ...formData, bayIndex: e.target.value === '' ? null : parseInt(e.target.value) })}
                placeholder="Leave blank for all"
                style={styles.input}
              />
            </div>

            {/* Row Index */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Row</label>
              <input
                type="number"
                value={formData.rowIndex}
                onChange={(e) => setFormData({ ...formData, rowIndex: parseInt(e.target.value) })}
                style={styles.input}
              />
            </div>
          </div>

          {/* Form Buttons */}
          <div style={styles.formButtonsContainer}>
            <button onClick={handleAddVent} style={styles.submitBtn}>
              Add Vent
            </button>
            <button onClick={() => setShowAddForm(false)} style={styles.cancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#111113',
    color: '#e4e4e7',
    fontSize: '12px',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#1a1a1f',
    borderRadius: '6px',
    border: '1px solid #27272a',
  },

  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#e4e4e7',
  },

  headerButtons: {
    display: 'flex',
    gap: '8px',
  },

  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#0ea5e9',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'opacity 0.15s',
  },

  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'all 0.15s',
  },

  tableWrapper: {
    flex: 1,
    overflow: 'auto',
    border: '1px solid #27272a',
    borderRadius: '6px',
    backgroundColor: '#0d0d0f',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
  },

  headerRow: {
    backgroundColor: '#1a1a1f',
    borderBottom: '1px solid #27272a',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },

  th: {
    padding: '8px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#a1a1aa',
    borderRight: '1px solid #27272a',
  },

  tr: {
    borderBottom: '1px solid #27272a',
    transition: 'background 0.15s',
  },

  td: {
    padding: '8px',
    borderRight: '1px solid #27272a',
    color: '#d4d4d8',
  },

  emptyCell: {
    textAlign: 'center',
    color: '#52525b',
    padding: '24px 8px',
  },

  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    padding: '2px',
    transition: 'opacity 0.15s',
    display: 'flex',
    alignItems: 'center',
  },

  statsFooter: {
    display: 'flex',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: '#1a1a1f',
    borderRadius: '6px',
    border: '1px solid #27272a',
    fontSize: '11px',
    color: '#a1a1aa',
  },

  addFormContainer: {
    padding: '12px',
    backgroundColor: '#1a1a1f',
    borderRadius: '6px',
    border: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
  },

  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  label: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  input: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    backgroundColor: '#0d0d0f',
    color: '#e4e4e7',
    fontSize: '11px',
    fontFamily: 'inherit',
  },

  select: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    backgroundColor: '#0d0d0f',
    color: '#e4e4e7',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  formButtonsContainer: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },

  submitBtn: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#0ea5e9',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'opacity 0.15s',
  },

  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
};
