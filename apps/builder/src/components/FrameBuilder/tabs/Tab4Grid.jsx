import { useState } from 'react';
import useFrameBuilderStore from '../../../store/useFrameBuilderStore';
import DoorBuilderPanel from '../DoorBuilderPanel';

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

export default function Tab4Grid() {
  const { frames, activeFrameId, updateFrame } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === activeFrameId);
  const [focusedField, setFocusedField] = useState(null);
  const [expandedRows, setExpandedRows] = useState(false);
  const [expandedDoorBay, setExpandedDoorBay] = useState(null);

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

  const handleBaysChange = (newBays) => {
    newBays = Math.max(1, Math.min(20, parseInt(newBays, 10)));
    const newBayConfigs = Array.from({ length: newBays }, (_, i) => ({
      type: frame.bayConfigs[i]?.type || 'glazing',
      widthOverride: frame.bayConfigs[i]?.widthOverride || null,
    }));
    updateFrame(frame.frameId, { bays: newBays, bayConfigs: newBayConfigs });
  };

  const handleRowsChange = (newRows) => {
    newRows = Math.max(1, Math.min(10, parseInt(newRows, 10)));
    const newRowConfigs = Array.from({ length: newRows }, (_, i) => ({
      heightOverride: frame.rowConfigs[i]?.heightOverride || null,
    }));
    updateFrame(frame.frameId, { rows: newRows, rowConfigs: newRowConfigs });
  };

  const handleBayTypeChange = (idx, type) => {
    const newConfigs = [...frame.bayConfigs];
    newConfigs[idx].type = type;
    updateFrame(frame.frameId, { bayConfigs: newConfigs });
  };

  const handleBayWidthChange = (idx, width) => {
    const newConfigs = [...frame.bayConfigs];
    newConfigs[idx].widthOverride = width ? parseFloat(width) : null;
    updateFrame(frame.frameId, { bayConfigs: newConfigs });
  };

  const handleRowHeightChange = (idx, height) => {
    const newConfigs = [...frame.rowConfigs];
    newConfigs[idx].heightOverride = height ? parseFloat(height) : null;
    updateFrame(frame.frameId, { rowConfigs: newConfigs });
  };

  const totalBays = Math.max(frame.bays, 1);
  const totalRows = Math.max(frame.rows, 1);
  const equalBayWidth = (frame.widthInches || 0) / totalBays;
  const equalRowHeight = (frame.heightInches || 0) / totalRows;

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>Bay & Row Configuration</div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Bay Count</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => handleBaysChange(frame.bays - 1)}
            style={{
              background: '#27272a',
              border: 'none',
              borderRadius: '4px',
              color: '#e4e4e7',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            −
          </button>
          <input
            type="number"
            min="1"
            max="20"
            value={frame.bays || 1}
            onChange={(e) => handleBaysChange(e.target.value)}
            onFocus={() => setFocusedField('bays')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'bays' ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <button
            onClick={() => handleBaysChange(frame.bays + 1)}
            style={{
              background: '#27272a',
              border: 'none',
              borderRadius: '4px',
              color: '#e4e4e7',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            +
          </button>
        </div>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Row Count</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => handleRowsChange(frame.rows - 1)}
            style={{
              background: '#27272a',
              border: 'none',
              borderRadius: '4px',
              color: '#e4e4e7',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            −
          </button>
          <input
            type="number"
            min="1"
            max="10"
            value={frame.rows || 1}
            onChange={(e) => handleRowsChange(e.target.value)}
            onFocus={() => setFocusedField('rows')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'rows' ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <button
            onClick={() => handleRowsChange(frame.rows + 1)}
            style={{
              background: '#27272a',
              border: 'none',
              borderRadius: '4px',
              color: '#e4e4e7',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            +
          </button>
        </div>
      </div>

      <div
        style={{
          background: '#0f1117',
          border: '1px solid #27272a',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '14px',
          fontSize: '12px',
          color: '#a1a1aa',
        }}
      >
        <div style={{ marginBottom: '6px' }}>
          <strong>Equal bay width:</strong> {equalBayWidth.toFixed(3)}"
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Equal row height:</strong> {equalRowHeight.toFixed(3)}"
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Total lites:</strong> {totalBays * totalRows}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Total mullions:</strong> {Math.max(0, totalBays - 1)}
        </div>
        <div>
          <strong>Total transoms:</strong> {Math.max(0, totalRows - 1)}
        </div>
      </div>

      {frame.bays > 1 && (
        <div style={formRowStyle}>
          <div style={sectionHeaderStyle}>Bay Configuration</div>
          <div style={{ background: '#0f1117', borderRadius: '6px', marginBottom: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 140px 120px 100px',
                gap: '8px',
                padding: '12px',
                fontSize: '11px',
                color: '#a1a1aa',
                borderBottom: frame.bayConfigs.some(c => c.type === 'door-single' || c.type === 'door-pair') ? '1px solid #27272a' : 'none',
              }}
            >
              <div style={{ fontWeight: '600', color: '#52525b' }}>Bay</div>
              <div style={{ fontWeight: '600', color: '#52525b' }}>Type</div>
              <div style={{ fontWeight: '600', color: '#52525b' }}>Width Override</div>
              <div style={{ fontWeight: '600', color: '#52525b' }}></div>

              {frame.bayConfigs.map((config, idx) => (
                <div key={idx} style={{ display: 'contents' }}>
                  <div style={{ padding: '8px', background: idx % 2 === 0 ? '#111113' : '#0f1117' }}>
                    Bay {idx + 1}
                  </div>
                  <select
                    value={config.type || 'glazing'}
                    onChange={(e) => handleBayTypeChange(idx, e.target.value)}
                    style={{
                      ...inputStyle,
                      padding: '4px 8px',
                      fontSize: '12px',
                      background: idx % 2 === 0 ? '#111113' : '#0f1117',
                    }}
                  >
                    <option value="glazing">Glazing</option>
                    <option value="door-single">Single Door</option>
                    <option value="door-pair">Pair of Doors</option>
                  </select>
                  <input
                    type="number"
                    step="0.0625"
                    placeholder="Equal width"
                    value={config.widthOverride ?? ''}
                    onChange={(e) => handleBayWidthChange(idx, e.target.value)}
                    style={{
                      ...inputStyle,
                      padding: '4px 8px',
                      fontSize: '12px',
                      background: idx % 2 === 0 ? '#111113' : '#0f1117',
                    }}
                  />
                  {(config.type === 'door-single' || config.type === 'door-pair') && (
                    <button
                      onClick={() => setExpandedDoorBay(expandedDoorBay === idx ? null : idx)}
                      style={{
                        fontSize: '11px',
                        color: '#0ea5e9',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        textAlign: 'center',
                      }}
                    >
                      {expandedDoorBay === idx ? '▲' : '▼'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Door Builder Panel - render below the grid */}
            {expandedDoorBay !== null && (frame.bayConfigs[expandedDoorBay].type === 'door-single' || frame.bayConfigs[expandedDoorBay].type === 'door-pair') && (
              <div style={{ padding: '0 12px 12px 12px' }}>
                <DoorBuilderPanel
                  frameId={frame.frameId}
                  bayIndex={expandedDoorBay}
                  doorType={frame.bayConfigs[expandedDoorBay].type}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div style={formRowStyle}>
        <button
          onClick={() => setExpandedRows(!expandedRows)}
          style={{
            background: '#27272a',
            border: 'none',
            borderRadius: '4px',
            color: '#e4e4e7',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            width: '100%',
          }}
        >
          {expandedRows ? '▼' : '▶'} Row Configuration
        </button>
      </div>

      {expandedRows && frame.rows > 1 && (
        <div style={formRowStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr',
              gap: '8px',
              padding: '12px',
              background: '#0f1117',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '11px',
              color: '#a1a1aa',
            }}
          >
            <div style={{ fontWeight: '600', color: '#52525b' }}>Row</div>
            <div style={{ fontWeight: '600', color: '#52525b' }}>Height Override</div>

            {frame.rowConfigs.map((config, idx) => (
              <div key={idx} style={{ display: 'contents' }}>
                <div style={{ padding: '8px', background: idx % 2 === 0 ? '#111113' : '#0f1117' }}>
                  Row {idx + 1}
                </div>
                <input
                  type="number"
                  step="0.0625"
                  placeholder="Equal height"
                  value={config.heightOverride ?? ''}
                  onChange={(e) => handleRowHeightChange(idx, e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: '4px 8px',
                    fontSize: '12px',
                    background: idx % 2 === 0 ? '#111113' : '#0f1117',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={formRowStyle}>
        <div style={sectionHeaderStyle}>Grid Visualization</div>
        <div
          style={{
            display: 'flex',
            height: Math.min(120, (frame.heightInches / frame.widthInches) * 200) + 'px',
            gap: '1px',
            background: '#27272a',
            border: '1px solid #27272a',
            borderRadius: '4px',
            overflow: 'hidden',
            marginTop: '8px',
          }}
        >
          {frame.bayConfigs.map((bay, i) => (
            <div
              key={i}
              style={{
                flex: bay.widthOverride || 1,
                background:
                  bay.type === 'glazing' ? '#1a2433' : 'rgba(251, 146, 60, 0.15)',
                borderRight: i < frame.bays - 1 ? '1px solid #27272a' : 'none',
                transition: 'background 0.15s',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
