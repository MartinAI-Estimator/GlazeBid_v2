import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const PRESETS = [
  {
    name: 'Sill Cap',
    legs: [
      { legId: 'l1', lengthIn: 3, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 1.5, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l3', lengthIn: 1.5, bendAngle: 0, bendRadius: 0 },
    ],
  },
  {
    name: 'Head Cap',
    legs: [
      { legId: 'l1', lengthIn: 2, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 3, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l3', lengthIn: 1, bendAngle: 0, bendRadius: 0 },
    ],
  },
  {
    name: 'Jamb Return',
    legs: [
      { legId: 'l1', lengthIn: 4, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 2, bendAngle: 0, bendRadius: 0 },
    ],
  },
  {
    name: 'Z-Flashing',
    legs: [
      { legId: 'l1', lengthIn: 1.5, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 3, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l3', lengthIn: 1.5, bendAngle: 0, bendRadius: 0 },
    ],
  },
  {
    name: 'Subsill Pan',
    legs: [
      { legId: 'l1', lengthIn: 1, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 5, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l3', lengthIn: 1, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l4', lengthIn: 0.75, bendAngle: 0, bendRadius: 0 },
    ],
  },
  {
    name: 'Reglet Cover',
    legs: [
      { legId: 'l1', lengthIn: 0.75, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l2', lengthIn: 1.5, bendAngle: 90, bendRadius: 0.0625 },
      { legId: 'l3', lengthIn: 0.75, bendAngle: 0, bendRadius: 0 },
    ],
  },
];

const GAUGE_THICKNESS = { 14: 0.075, 16: 0.060, 18: 0.048, 20: 0.036 };

function computeFlatPattern(legs, gaugeNum) {
  const thickness = GAUGE_THICKNESS[gaugeNum] || 0.060;
  const K = 0.33;

  let totalLeg = 0;
  let totalBend = 0;

  legs.forEach(leg => {
    totalLeg += leg.lengthIn;
    if (leg.bendAngle > 0) {
      const ba = 0.017453 * leg.bendAngle * (leg.bendRadius + K * thickness);
      totalBend += ba;
    }
  });

  return {
    flatPatternLF: (totalLeg + totalBend) / 12,
    flatPatternIn: totalLeg + totalBend,
    legTotal: totalLeg,
    bendTotal: totalBend,
  };
}

function ProfileDiagram({ legs }) {
  const SCALE = 16;
  let x = 10;
  let y = 60;
  let angle = 0;
  const points = [{ x, y }];

  legs.forEach(leg => {
    const rad = (angle * Math.PI) / 180;
    x += leg.lengthIn * SCALE * Math.cos(rad);
    y += leg.lengthIn * SCALE * -Math.sin(rad);
    points.push({ x, y });
    angle += leg.bendAngle;
  });

  const minX = Math.min(...points.map(p => p.x)) - 10;
  const maxX = Math.max(...points.map(p => p.x)) + 10;
  const minY = Math.min(...points.map(p => p.y)) - 10;
  const maxY = Math.max(...points.map(p => p.y)) + 10;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={viewBox} style={{ width: '100%', height: '120px', background: '#0f1117', borderRadius: '6px' }}>
      <path d={pathD} stroke="#0ea5e9" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0ea5e9" />
      ))}
    </svg>
  );
}

const BrakeMetalSidecar = ({ frameId, onClose }) => {
  const { updateFrame } = useFrameBuilderStore();
  const [profileName, setProfileName] = useState('');
  const [legs, setLegs] = useState([]);
  const [materialGauge, setMaterialGauge] = useState(16);
  const [quantityLF, setQuantityLF] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);

  // Compute flat pattern
  const flatPattern = useMemo(() => {
    return computeFlatPattern(legs, materialGauge);
  }, [legs, materialGauge]);

  const totalLF = flatPattern.flatPatternLF * quantityLF;

  // Estimate weight (aluminum: ~2.7 lbs/in^3)
  const estimatedWeight = useMemo(() => {
    const thickness = GAUGE_THICKNESS[materialGauge] || 0.060;
    const widthIn = 2; // Default assumed width
    const volumeCuIn = flatPattern.flatPatternIn * widthIn * thickness;
    const density = 0.0975; // lbs/in^3 for aluminum
    return volumeCuIn * density;
  }, [flatPattern, materialGauge]);

  const estimatedCost = useMemo(() => {
    const pricePerLb = 0.85; // Base aluminum price
    return estimatedWeight * pricePerLb;
  }, [estimatedWeight]);

  // Handle preset selection
  const handleSelectPreset = (preset) => {
    setProfileName(preset.name);
    setLegs(preset.legs);
    setActiveProfile(preset.name);
  };

  // Add new leg
  const handleAddLeg = () => {
    const newLeg = {
      legId: `l${Date.now()}`,
      lengthIn: 1.5,
      bendAngle: 90,
      bendRadius: 0.0625,
    };
    setLegs([...legs, newLeg]);
  };

  // Update leg
  const handleUpdateLeg = (legId, field, value) => {
    setLegs(legs.map(l => l.legId === legId ? { ...l, [field]: value } : l));
  };

  // Delete leg
  const handleDeleteLeg = (legId) => {
    setLegs(legs.filter(l => l.legId !== legId));
  };

  // Add to frame BOM
  const handleAddToBOM = () => {
    if (!profileName || legs.length === 0) {
      alert('Please create a profile first');
      return;
    }

    const newBrakeMetal = {
      id: `bm${Date.now()}`,
      name: profileName,
      legs,
      gauge: materialGauge,
      flatPatternLF: flatPattern.flatPatternLF,
      quantityLF,
      totalLF,
      estimatedWeight,
      estimatedCost,
    };

    // Update frame with brake metal
    updateFrame(frameId, {
      brakeMetal: [...(profiles), newBrakeMetal],
    });

    // Reset form
    setProfileName('');
    setLegs([]);
    setMaterialGauge(16);
    setQuantityLF(0);
    setActiveProfile(null);
    setProfiles([...profiles, newBrakeMetal]);
  };

  return (
    <div style={styles.sidecar}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>BRAKE METAL</h3>
        <button style={styles.closeBtn} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Presets Section */}
      <div style={styles.presetsSection}>
        <div style={styles.sectionLabel}>PRESETS</div>
        <div style={styles.presetsGrid}>
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              style={{
                ...styles.presetBtn,
                ...(activeProfile === preset.name ? styles.presetBtnActive : {}),
              }}
              onClick={() => handleSelectPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Name & Gauge */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>PROFILE SETUP</div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Profile Name</label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g., Custom Sill Cap"
            style={styles.input}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Gauge</label>
          <select value={materialGauge} onChange={(e) => setMaterialGauge(Number(e.target.value))} style={styles.input}>
            <option value={20}>20ga (0.036")</option>
            <option value={18}>18ga (0.048")</option>
            <option value={16}>16ga (0.060")</option>
            <option value={14}>14ga (0.075")</option>
          </select>
        </div>
      </div>

      {/* Profile Diagram */}
      {legs.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>PROFILE CROSS-SECTION</div>
          <ProfileDiagram legs={legs} />
        </div>
      )}

      {/* Legs Table */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>LEGS</div>
        {legs.length === 0 ? (
          <div style={styles.emptyMessage}>No legs yet</div>
        ) : (
          <div style={styles.legsTable}>
            <div style={styles.tableHeader}>
              <div style={styles.tableCol}>Length"</div>
              <div style={styles.tableCol}>Bend°</div>
              <div style={styles.tableCol}>Radius"</div>
              <div style={styles.tableCol} />
            </div>
            {legs.map(leg => (
              <div key={leg.legId} style={styles.tableRow}>
                <input
                  type="number"
                  step="0.125"
                  value={leg.lengthIn}
                  onChange={(e) => handleUpdateLeg(leg.legId, 'lengthIn', Number(e.target.value))}
                  style={styles.tableInput}
                />
                <input
                  type="number"
                  step="15"
                  value={leg.bendAngle}
                  onChange={(e) => handleUpdateLeg(leg.legId, 'bendAngle', Number(e.target.value))}
                  style={styles.tableInput}
                />
                <input
                  type="number"
                  step="0.0625"
                  value={leg.bendRadius}
                  onChange={(e) => handleUpdateLeg(leg.legId, 'bendRadius', Number(e.target.value))}
                  style={styles.tableInput}
                />
                <button style={styles.deleteBtn} onClick={() => handleDeleteLeg(leg.legId)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button style={styles.addLegBtn} onClick={handleAddLeg}>
          <Plus size={14} /> Add Leg
        </button>
      </div>

      {/* Results Section */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>RESULTS</div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>Flat Pattern</span>
          <span style={styles.resultValue}>{flatPattern.flatPatternLF.toFixed(2)}" per LF</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.formGroup}>
          <label style={styles.label}>Quantity LF</label>
          <input
            type="number"
            step="0.5"
            value={quantityLF}
            onChange={(e) => setQuantityLF(Number(e.target.value))}
            placeholder="Enter total LF needed"
            style={styles.input}
          />
        </div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>Total Material</span>
          <span style={styles.resultValue}>{totalLF.toFixed(2)} LF</span>
        </div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>Est Weight</span>
          <span style={styles.resultValue}>{estimatedWeight.toFixed(1)} lbs</span>
        </div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>Est Cost</span>
          <span style={styles.resultValue}>${estimatedCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Button */}
      <button style={styles.addToBOMBtn} onClick={handleAddToBOM}>
        Add to Frame BOM
      </button>
    </div>
  );
};

const styles = {
  sidecar: {
    width: '100%',
    height: '100%',
    background: '#111113',
    border: '1px solid #27272a',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    padding: '0 16px',
    backgroundColor: '#1a1a1f',
    borderBottom: '1px solid #27272a',
    flexShrink: 0,
  },

  title: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#e4e4e7',
    margin: 0,
    letterSpacing: '0.05em',
  },

  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    background: '#27272a',
    color: '#a1a1aa',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  presetsSection: {
    padding: '12px 16px',
    borderBottom: '1px solid #27272a',
    flexShrink: 0,
  },

  sectionLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },

  presetsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '6px',
  },

  presetBtn: {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    background: '#1a1a1f',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
    transition: 'all 0.15s',
  },

  presetBtnActive: {
    background: '#0ea5e9',
    color: '#ffffff',
    borderColor: '#0ea5e9',
  },

  section: {
    padding: '12px 16px',
    borderBottom: '1px solid #27272a',
    flexShrink: 0,
  },

  formGroup: {
    marginBottom: '10px',
  },

  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: '4px',
  },

  input: {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #27272a',
    background: '#1a1a1f',
    color: '#e4e4e7',
    fontSize: '11px',
    boxSizing: 'border-box',
  },

  emptyMessage: {
    fontSize: '11px',
    color: '#52525b',
    padding: '8px 0',
    textAlign: 'center',
  },

  legsTable: {
    marginBottom: '8px',
  },

  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 28px',
    gap: '4px',
    marginBottom: '4px',
    paddingBottom: '4px',
    borderBottom: '1px solid #27272a',
  },

  tableCol: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 28px',
    gap: '4px',
    marginBottom: '4px',
    alignItems: 'center',
  },

  tableInput: {
    padding: '4px 6px',
    borderRadius: '3px',
    border: '1px solid #27272a',
    background: '#0f1117',
    color: '#e4e4e7',
    fontSize: '11px',
  },

  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '3px',
    border: 'none',
    background: '#27272a',
    color: '#ef4444',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  addLegBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    borderRadius: '4px',
    border: 'none',
    background: '#0ea5e9',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
    transition: 'opacity 0.15s',
    width: '100%',
    justifyContent: 'center',
  },

  divider: {
    height: '1px',
    background: '#27272a',
    margin: '8px 0',
  },

  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: '11px',
  },

  resultLabel: {
    color: '#a1a1aa',
  },

  resultValue: {
    color: '#0ea5e9',
    fontWeight: '600',
  },

  addToBOMBtn: {
    margin: '12px 16px',
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    background: '#10b981',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    transition: 'opacity 0.15s',
    flexShrink: 0,
  },
};

export default BrakeMetalSidecar;
