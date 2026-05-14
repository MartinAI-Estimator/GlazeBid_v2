import { useState, useEffect } from 'react';
import useFrameBuilderStore from '../../../store/useFrameBuilderStore';

const inputStyle = {
  background: '#1a1a1f',
  border: '1px solid #27272a',
  borderRadius: '6px',
  color: '#e4e4e7',
  padding: '6px 10px',
  fontSize: '13px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '11px',
  color: '#a1a1aa',
  marginBottom: '4px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const sectionHeaderStyle = {
  fontSize: '11px',
  color: '#52525b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '10px',
  paddingBottom: '6px',
  borderBottom: '1px solid #27272a',
};

const containerStyle = {
  padding: '16px',
  overflow: 'auto',
  height: '100%',
  background: '#111113',
};

const formRowStyle = {
  marginBottom: '14px',
};

const infoCardStyle = {
  background: '#0f1117',
  border: '1px solid #27272a',
  borderRadius: '8px',
  padding: '12px',
  marginTop: '12px',
};

const infoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '12px',
  borderBottom: '1px solid #27272a',
};

const infoLabelStyle = {
  color: '#a1a1aa',
};

const infoValueStyle = {
  color: '#e4e4e7',
  fontWeight: '600',
};

export default function Tab2Geometry() {
  const { frames, activeFrameId, updateFrame, resolveBOM } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === activeFrameId);
  const [focusedField, setFocusedField] = useState(null);

  // Auto-trigger BOM resolution when both width and height are >= 12
  useEffect(() => {
    if (!frame) return;
    if ((frame.widthInches ?? 0) >= 12 && (frame.heightInches ?? 0) >= 12) {
      const timer = setTimeout(() => resolveBOM(frame.frameId), 700);
      return () => clearTimeout(timer);
    }
  }, [frame?.widthInches, frame?.heightInches, frame?.frameId, resolveBOM]);

  if (!frame) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#52525b',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px' }}>No frame selected — add or select a frame to begin</div>
        </div>
      </div>
    );
  }

  const formatDimensionDisplay = (val) => {
    if (!val) return '0.00"';
    const feet = Math.floor(val / 12);
    const inches = (val % 12).toFixed(2);
    return feet > 0 ? `${feet}'-${inches}"` : `${inches}"`;
  };

  const calculateDLO = () => {
    if (!frame.widthInches || !frame.bays) return 0;
    const bayWidth = frame.widthInches / Math.max(frame.bays, 1);
    const profileWidth = 1.75;
    return bayWidth - profileWidth;
  };

  const handleBaysChange = (newBays) => {
    newBays = Math.max(1, newBays);
    const newBayConfigs = Array.from({ length: newBays }, (_, i) => ({
      type: frame.bayConfigs[i]?.type || 'glazing',
      widthOverride: frame.bayConfigs[i]?.widthOverride || null,
    }));
    updateFrame(frame.frameId, { bays: newBays, bayConfigs: newBayConfigs });
  };

  const handleRowsChange = (newRows) => {
    newRows = Math.max(1, newRows);
    const newRowConfigs = Array.from({ length: newRows }, (_, i) => ({
      heightOverride: frame.rowConfigs[i]?.heightOverride || null,
    }));
    updateFrame(frame.frameId, { rows: newRows, rowConfigs: newRowConfigs });
  };

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>Dimensions</div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Width (inches)</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            step="0.0625"
            min="12"
            max="2400"
            value={frame.widthInches || 0}
            onChange={(e) => updateFrame(frame.frameId, { widthInches: parseFloat(e.target.value) })}
            onFocus={() => setFocusedField('width')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'width' ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <div
            style={{
              background: '#1a1a1f',
              border: '1px solid #27272a',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              color: '#52525b',
              minWidth: '60px',
              textAlign: 'right',
            }}
          >
            {formatDimensionDisplay(frame.widthInches)}
          </div>
        </div>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Height (inches)</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            step="0.0625"
            min="12"
            max="2400"
            value={frame.heightInches || 0}
            onChange={(e) => updateFrame(frame.frameId, { heightInches: parseFloat(e.target.value) })}
            onFocus={() => setFocusedField('height')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'height' ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <div
            style={{
              background: '#1a1a1f',
              border: '1px solid #27272a',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              color: '#52525b',
              minWidth: '60px',
              textAlign: 'right',
            }}
          >
            {formatDimensionDisplay(frame.heightInches)}
          </div>
        </div>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Shape Type</label>
        <select
          value={frame.shape || 'rectangular'}
          onChange={(e) => updateFrame(frame.frameId, { shape: e.target.value })}
          onFocus={() => setFocusedField('shape')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'shape' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="rectangular">Rectangular</option>
          <option value="raked">Raked/Sloped Head</option>
          <option value="arched-head">Arched Head</option>
          <option value="full-arch">Full Arch</option>
          <option value="circle">Circle/Oval</option>
          <option value="triangle">Triangle</option>
          <option value="custom-polygon">Custom Polygon</option>
          <option value="ribbon">Ribbon/Ganged</option>
        </select>
      </div>

      {frame.shape === 'raked' && (
        <>
          <div style={formRowStyle}>
            <label style={labelStyle}>Left Jamb Height (inches)</label>
            <input
              type="number"
              step="0.0625"
              min="12"
              value={frame.leftJambHeightInches || frame.heightInches}
              onChange={(e) =>
                updateFrame(frame.frameId, { leftJambHeightInches: parseFloat(e.target.value) })
              }
              onFocus={() => setFocusedField('leftJamb')}
              onBlur={() => setFocusedField(null)}
              style={{
                ...inputStyle,
                borderColor: focusedField === 'leftJamb' ? '#0ea5e9' : '#27272a',
              }}
            />
          </div>
          <div style={formRowStyle}>
            <label style={labelStyle}>Right Jamb Height (inches)</label>
            <input
              type="number"
              step="0.0625"
              min="12"
              value={frame.rightJambHeightInches || frame.heightInches}
              onChange={(e) =>
                updateFrame(frame.frameId, { rightJambHeightInches: parseFloat(e.target.value) })
              }
              onFocus={() => setFocusedField('rightJamb')}
              onBlur={() => setFocusedField(null)}
              style={{
                ...inputStyle,
                borderColor: focusedField === 'rightJamb' ? '#0ea5e9' : '#27272a',
              }}
            />
          </div>
        </>
      )}

      {(frame.widthInches >= 12 && frame.heightInches >= 12) && (
        <div style={{ fontSize: 10, color: '#10b981', marginBottom: 12, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>✓</span>
          <span>BOM auto-calculating</span>
        </div>
      )}

      <div style={formRowStyle}>
        <label style={labelStyle}>Joint Width (inches)</label>
        <input
          type="number"
          step="0.0625"
          min="0.125"
          max="1"
          value={frame.jointWidthInches || 0.25}
          onChange={(e) =>
            updateFrame(frame.frameId, { jointWidthInches: parseFloat(e.target.value) })
          }
          onFocus={() => setFocusedField('jointWidth')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'jointWidth' ? '#0ea5e9' : '#27272a',
          }}
        />
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Glass Bite Override (inches)</label>
        <input
          type="number"
          step="0.0625"
          value={frame.glassBiteOverride ?? ''}
          onChange={(e) =>
            updateFrame(frame.frameId, {
              glassBiteOverride: e.target.value ? parseFloat(e.target.value) : null,
            })
          }
          placeholder="Leave empty for archetype default"
          onFocus={() => setFocusedField('glassBite')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'glassBite' ? '#0ea5e9' : '#27272a',
          }}
        />
        <div style={{ fontSize: '11px', color: '#52525b', marginTop: '4px' }}>
          Est. DLO: {calculateDLO().toFixed(3)}" (for equal bays)
        </div>
      </div>

      <div style={infoCardStyle}>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Frame Area</span>
          <span style={infoValueStyle}>
            {((frame.widthInches * frame.heightInches) / 144).toFixed(2)} SF
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Bay Width</span>
          <span style={infoValueStyle}>
            {(frame.widthInches / Math.max(frame.bays, 1)).toFixed(3)}"
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Row Height</span>
          <span style={infoValueStyle}>
            {(frame.heightInches / Math.max(frame.rows, 1)).toFixed(3)}"
          </span>
        </div>
        <div style={{ ...infoRowStyle, borderBottom: 'none' }}>
          <span style={infoLabelStyle}>Rough Opening</span>
          <span style={infoValueStyle}>
            {(frame.widthInches + 0.5).toFixed(3)}" x {(frame.heightInches + 0.5).toFixed(3)}"
          </span>
        </div>
      </div>
    </div>
  );
}
