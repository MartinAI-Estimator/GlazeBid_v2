import { useState } from 'react';
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

export default function Tab1Identity() {
  const { frames, activeFrameId, groups, updateFrame, addGroup } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === activeFrameId);
  const [focusedField, setFocusedField] = useState(null);

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

  const handleAddGroup = () => {
    addGroup('Default Group', 'sf-450', 'kawneer-451t');
  };

  const formatInches = (val) => {
    if (!val || val === 0) return '';
    const feet = Math.floor(val / 12);
    const inches = (val % 12).toFixed(1);
    return `= ${feet}'-${inches}"`;
  };

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>Identity</div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Frame Mark</label>
        <input
          type="text"
          placeholder="e.g. A-1, SF-3, CW-12"
          value={frame.mark || ''}
          onChange={(e) => updateFrame(frame.frameId, { mark: e.target.value })}
          onFocus={() => setFocusedField('mark')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'mark' ? '#0ea5e9' : '#27272a',
          }}
        />
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Group</label>
        {groups.length === 0 ? (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: '#52525b', fontSize: '12px', marginBottom: '8px' }}>
              Create a group first
            </div>
            <button
              onClick={handleAddGroup}
              style={{
                background: '#0ea5e9',
                color: '#111113',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              + Add Group
            </button>
          </div>
        ) : (
          <select
            value={frame.groupId || ''}
            onChange={(e) => updateFrame(frame.frameId, { groupId: e.target.value })}
            onFocus={() => setFocusedField('group')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'group' ? '#0ea5e9' : '#27272a',
            }}
          >
            <option value="">-- Select Group --</option>
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>System Class</label>
        <select
          value={frame.systemClass || 'ext-storefront'}
          onChange={(e) => updateFrame(frame.frameId, { systemClass: e.target.value })}
          onFocus={() => setFocusedField('systemClass')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'systemClass' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="ext-storefront">Ext Storefront</option>
          <option value="cap-curtainwall">Cap Curtainwall</option>
          <option value="ssg-curtainwall">SSG Curtainwall</option>
          <option value="int-storefront">Int Storefront</option>
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Scope Tag</label>
        <select
          value={frame.scopeTag || 'BASE_BID'}
          onChange={(e) => updateFrame(frame.frameId, { scopeTag: e.target.value })}
          onFocus={() => setFocusedField('scopeTag')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'scopeTag' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="BASE_BID">Base Bid</option>
          <option value="ALT_1">Alt 1</option>
          <option value="ALT_2">Alt 2</option>
          <option value="ALLOWANCE">Allowance</option>
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Quantity</label>
        <input
          type="number"
          min="1"
          value={frame.quantity || 1}
          onChange={(e) =>
            updateFrame(frame.frameId, { quantity: Math.max(1, parseInt(e.target.value, 10)) })
          }
          onFocus={() => setFocusedField('quantity')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'quantity' ? '#0ea5e9' : '#27272a',
          }}
        />
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Sill AFF (inches)</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            step="0.5"
            value={frame.sillAFF || 0}
            onChange={(e) => updateFrame(frame.frameId, { sillAFF: parseFloat(e.target.value) })}
            onFocus={() => setFocusedField('sillAFF')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'sillAFF' ? '#0ea5e9' : '#27272a',
              flex: 1,
            }}
          />
          <div style={{ color: '#52525b', fontSize: '12px', whiteSpace: 'nowrap' }}>
            {formatInches(frame.sillAFF)}
          </div>
        </div>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Estimator Notes</label>
        <textarea
          rows="3"
          value={frame.estimatorNotes || ''}
          onChange={(e) => updateFrame(frame.frameId, { estimatorNotes: e.target.value })}
          onFocus={() => setFocusedField('estimatorNotes')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'estimatorNotes' ? '#0ea5e9' : '#27272a',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={formRowStyle}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#e4e4e7',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={frame.isMockup || false}
            onChange={(e) => updateFrame(frame.frameId, { isMockup: e.target.checked })}
            style={{ cursor: 'pointer', accentColor: '#0ea5e9' }}
          />
          <span>Flag as mock-up frame (separate BOM section)</span>
        </label>
      </div>
    </div>
  );
}
