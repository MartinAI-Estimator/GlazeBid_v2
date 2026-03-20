import React, { useState } from 'react';
import { Ruler } from 'lucide-react';

const ARCH_SCALES = [
  { label: '1/4" = 1\'-0"', factor: 48 },
  { label: '1/8" = 1\'-0"', factor: 96 },
  { label: '3/16" = 1\'-0"', factor: 64 },
  { label: '1" = 1\'-0"', factor: 12 }
];

const CalibrationTool = ({ onCalibrate, onApplyPreset }) => {
  const [realDist, setRealDist] = useState("3.0");

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Ruler size={14} style={{ marginRight: '8px' }} />
        SET SCALE
      </div>
      <div style={styles.body}>
        <p style={styles.text}>Click two points on a known dimension line.</p>
        <div style={styles.inputRow}>
          <input 
            type="number" 
            value={realDist} 
            onChange={(e) => setRealDist(e.target.value)}
            style={styles.input}
          />
          <span style={styles.unit}>FT</span>
        </div>
        <button 
          onClick={() => onCalibrate(parseFloat(realDist))}
          style={styles.btn}
        >
          Start Calibration
        </button>

        <div style={styles.divider}>OR USE PRESET</div>
        
        <div style={styles.presetGrid}>
          {ARCH_SCALES.map(scale => (
            <button 
              key={scale.label}
              onClick={() => onApplyPreset(scale.factor)}
              style={styles.presetBtn}
            >
              {scale.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { position: 'absolute', top: '60px', left: '10px', background: '#111', border: '1px solid #333', borderRadius: '4px', width: '220px', zIndex: 100 },
  header: { padding: '10px', background: '#222', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center' },
  body: { padding: '15px' },
  text: { fontSize: '10px', color: '#888', marginBottom: '10px' },
  inputRow: { display: 'flex', alignItems: 'center', marginBottom: '15px' },
  input: { background: '#000', border: '1px solid #444', color: '#fff', padding: '5px', width: '60px', borderRadius: '3px' },
  unit: { marginLeft: '10px', fontSize: '12px', color: '#666' },
  btn: { width: '100%', padding: '8px', background: 'orange', border: 'none', borderRadius: '3px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px', marginBottom: '15px' },
  divider: { fontSize: '9px', color: '#555', textAlign: 'center', margin: '10px 0', fontWeight: 'bold', letterSpacing: '0.5px' },
  presetGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  presetBtn: { background: '#222', border: '1px solid #444', color: '#aaa', padding: '8px 4px', borderRadius: '3px', fontSize: '9px', cursor: 'pointer', transition: '0.2s', fontWeight: '500' }
};

export default CalibrationTool;