import { useState } from 'react';
import useFrameBuilderStore from '../../../store/useFrameBuilderStore';
import { ARCHETYPE_CATALOG, VENDOR_CATALOG, getVendorsForArchetype, getVendorSystem } from '@glazebid/frame-engine';

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
  fontSize: '12px',
  color: '#a1a1aa',
};

const infoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  borderBottom: '1px solid #27272a',
};

export default function Tab3System() {
  const { frames, activeFrameId, groups, updateFrame } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === activeFrameId);
  const group = frame ? groups.find((g) => g.groupId === frame.groupId) : null;
  const [focusedField, setFocusedField] = useState(null);

  if (!frame || !group) {
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
          <div style={{ fontSize: '13px' }}>Frame or group not found</div>
        </div>
      </div>
    );
  }

  const systemClassMap = {
    'ext-storefront': 'storefront',
    'cap-curtainwall': 'curtainwall',
    'ssg-curtainwall': 'curtainwall',
    'int-storefront': 'storefront',
  };

  const systemCategory = systemClassMap[frame.systemClass] || 'storefront';
  const archetypes = Object.values(ARCHETYPE_CATALOG).filter(
    (a) => a.category === systemCategory
  );

  const vendorSystem = frame.vendorSystemId ? getVendorSystem(frame.vendorSystemId) : null;
  const selectedArchetypeId = vendorSystem?.archetypeId;
  const vendorsForArchetype = selectedArchetypeId ? getVendorsForArchetype(selectedArchetypeId) : [];

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>System & Finish</div>

      <div style={formRowStyle}>
        <label style={labelStyle}>System/Archetype</label>
        <select
          value={selectedArchetypeId || ''}
          onChange={(e) => {
            const archetypeId = e.target.value;
            const vendors = getVendorsForArchetype(archetypeId);
            if (vendors.length > 0) {
              updateFrame(frame.frameId, { vendorSystemId: vendors[0].id });
            }
          }}
          onFocus={() => setFocusedField('archetype')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'archetype' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="">-- Select Archetype --</option>
          {archetypes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Primary Vendor</label>
        <select
          value={frame.vendorSystemId || ''}
          onChange={(e) => updateFrame(frame.frameId, { vendorSystemId: e.target.value })}
          onFocus={() => setFocusedField('vendor')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'vendor' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="">-- Select Vendor --</option>
          {vendorsForArchetype.map((v) => (
            <option key={v.id} value={v.id}>
              {v.manufacturer} — {v.productLine}
            </option>
          ))}
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Connection Type</label>
        <select
          value={frame.connectionType || 'screw-spline'}
          onChange={(e) => updateFrame(frame.frameId, { connectionType: e.target.value })}
          onFocus={() => setFocusedField('connectionType')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'connectionType' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="screw-spline">Screw Spline</option>
          <option value="shear-block">Shear Block (+0.15x cost)</option>
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Finish</label>
        <select
          value={frame.finishType || 'mill'}
          onChange={(e) => {
            const finishType = e.target.value;
            const multiplierMap = {
              'mill': 1.0,
              'clear-anodized': 1.0,
              'dark-bronze': 1.08,
              'black-anodized': 1.12,
              'paint-2coat': 1.15,
              'kynar-3coat': 1.25,
              'custom': 1.0,
            };
            updateFrame(frame.frameId, {
              finishType,
              finishMultiplier: multiplierMap[finishType] || 1.0,
            });
          }}
          onFocus={() => setFocusedField('finish')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'finish' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="clear-anodized">Clear Anodized (1.0x)</option>
          <option value="dark-bronze">Dark Bronze (1.08x)</option>
          <option value="black-anodized">Black Anodized (1.12x)</option>
          <option value="paint-2coat">2-Coat Paint (1.15x)</option>
          <option value="kynar-3coat">3-Coat Kynar (1.25x)</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {frame.finishType === 'custom' && (
        <div style={formRowStyle}>
          <label style={labelStyle}>Custom Finish Name</label>
          <input
            type="text"
            placeholder="e.g., Anodized Bronze"
            value={frame.customFinishName || ''}
            onChange={(e) => updateFrame(frame.frameId, { customFinishName: e.target.value })}
            onFocus={() => setFocusedField('customFinish')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              borderColor: focusedField === 'customFinish' ? '#0ea5e9' : '#27272a',
            }}
          />
        </div>
      )}

      <div style={formRowStyle}>
        <label style={labelStyle}>Alternate 1 Vendor</label>
        <select
          value={frame.altVendor1Id || ''}
          onChange={(e) => updateFrame(frame.frameId, { altVendor1Id: e.target.value })}
          onFocus={() => setFocusedField('alt1')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'alt1' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="">None</option>
          {vendorsForArchetype.map((v) => (
            <option key={v.id} value={v.id}>
              {v.manufacturer} — {v.productLine}
            </option>
          ))}
        </select>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>Alternate 2 Vendor</label>
        <select
          value={frame.altVendor2Id || ''}
          onChange={(e) => updateFrame(frame.frameId, { altVendor2Id: e.target.value })}
          onFocus={() => setFocusedField('alt2')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...inputStyle,
            borderColor: focusedField === 'alt2' ? '#0ea5e9' : '#27272a',
          }}
        >
          <option value="">None</option>
          {vendorsForArchetype.map((v) => (
            <option key={v.id} value={v.id}>
              {v.manufacturer} — {v.productLine}
            </option>
          ))}
        </select>
      </div>

      {vendorSystem && (
        <div style={infoCardStyle}>
          <div style={infoRowStyle}>
            <span>{vendorSystem.manufacturer}</span>
            <span style={{ color: '#0ea5e9', fontWeight: '600' }}>{vendorSystem.productLine}</span>
          </div>
          {vendorSystem.parts['vertical-mullion'] && (
            <div style={infoRowStyle}>
              <span>Profile:</span>
              <span style={{ color: '#e4e4e7' }}>
                {ARCHETYPE_CATALOG[vendorSystem.archetypeId]?.profileDepth}"
                {' '}depth,{' '}
                {ARCHETYPE_CATALOG[vendorSystem.archetypeId]?.profileWidth}"
                {' '}sightline
              </span>
            </div>
          )}
          {ARCHETYPE_CATALOG[vendorSystem.archetypeId] && (
            <>
              <div style={infoRowStyle}>
                <span>Max Mullion Span:</span>
                <span style={{ color: '#e4e4e7' }}>
                  {ARCHETYPE_CATALOG[vendorSystem.archetypeId].maxSpanMullionIn}"
                </span>
              </div>
              <div style={infoRowStyle}>
                <span>Max Transom Span:</span>
                <span style={{ color: '#e4e4e7' }}>
                  {ARCHETYPE_CATALOG[vendorSystem.archetypeId].maxSpanTransomIn}"
                </span>
              </div>
              <div style={{ ...infoRowStyle, borderBottom: 'none' }}>
                <span>Spec Section:</span>
                <span style={{ color: '#e4e4e7', fontWeight: '600' }}>
                  {ARCHETYPE_CATALOG[vendorSystem.archetypeId].specSection}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
