import { useState, useEffect } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const HARDWARE_SETS = {
  'standard': {
    label: 'Standard Storefront',
    items: ['Mortise lockset', 'Door pull (exterior)', 'Push bar (interior)', 'Overhead closer'],
    laborHrs: 8.5,
  },
  'heavy-duty': {
    label: 'Heavy Duty',
    items: ['Mortise lockset (HD)', 'Door pull (exterior)', 'Push bar (interior)', 'Overhead closer (HD)', 'Door stop'],
    laborHrs: 10.0,
  },
  'storefront-panic': {
    label: 'Panic Hardware',
    items: ['Rim exit device', 'Door pull (exterior)', 'Electric strike (opt)', 'Overhead closer'],
    laborHrs: 11.0,
  },
  'push-pull': {
    label: 'Push/Pull Only',
    items: ['Push bar', 'Pull handle', 'Deadbolt'],
    laborHrs: 6.0,
  },
};

const panelStyle = {
  background: '#0f1117',
  border: '1px solid #27272a',
  borderRadius: '6px',
  padding: '14px',
  marginTop: '10px',
  marginBottom: '14px',
  fontSize: '12px',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '12px',
  paddingBottom: '8px',
  borderBottom: '1px solid #27272a',
  fontSize: '13px',
  fontWeight: '600',
  color: '#e4e4e7',
};

const sectionStyle = {
  marginBottom: '12px',
  paddingBottom: '10px',
  borderBottom: '1px solid #27272a',
};

const sectionLabelStyle = {
  fontSize: '11px',
  color: '#52525b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '8px',
  fontWeight: '600',
};

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
  marginBottom: '8px',
};

const inputStyle = {
  background: '#1a1a1f',
  border: '1px solid #27272a',
  borderRadius: '4px',
  color: '#e4e4e7',
  padding: '6px 8px',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '11px',
  color: '#a1a1aa',
  marginBottom: '4px',
  display: 'block',
};

const toggleButtonStyle = {
  background: '#27272a',
  border: '1px solid #27272a',
  borderRadius: '4px',
  color: '#e4e4e7',
  padding: '6px 10px',
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const toggleButtonActiveStyle = {
  ...toggleButtonStyle,
  background: '#0ea5e9',
  borderColor: '#0ea5e9',
  color: '#000',
};

const checkboxStyle = {
  marginRight: '6px',
  cursor: 'pointer',
};

const adaCheckStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  marginBottom: '6px',
  padding: '6px 8px',
  background: '#1a1a1f',
  borderRadius: '4px',
};

const adaPassStyle = {
  color: '#22c55e',
  fontWeight: '600',
};

const adaFailStyle = {
  color: '#ef4444',
  fontWeight: '600',
};

export default function DoorBuilderPanel({ frameId, bayIndex, doorType }) {
  const { frames, updateFrame } = useFrameBuilderStore();
  const frame = frames.find((f) => f.frameId === frameId);
  const bay = frame?.bayConfigs?.[bayIndex];

  const [doorSpec, setDoorSpec] = useState({
    stileWidthIn: 4.5,
    topRailIn: 6.0,
    bottomRailIn: 10.0,
    swingDirection: 'left',
    handingExterior: true,
    transomHeight: 0,
    sideliteLeft: 0,
    sideliteRight: 0,
    hardwareSet: 'standard',
    closer: true,
    kickplate: false,
    doorMark: '',
    finishOverride: '',
  });

  // Initialize from existing bay config
  useEffect(() => {
    if (bay?.doorSpec) {
      setDoorSpec({
        stileWidthIn: bay.doorSpec.stileWidthIn ?? 4.5,
        topRailIn: bay.doorSpec.topRailIn ?? 6.0,
        bottomRailIn: bay.doorSpec.bottomRailIn ?? 10.0,
        swingDirection: bay.doorSpec.swingDirection ?? 'left',
        handingExterior: bay.doorSpec.handingExterior ?? true,
        transomHeight: bay.doorSpec.transomHeight ?? 0,
        sideliteLeft: bay.doorSpec.sideliteLeft ?? 0,
        sideliteRight: bay.doorSpec.sideliteRight ?? 0,
        hardwareSet: bay.doorSpec.hardwareSet ?? 'standard',
        closer: bay.doorSpec.closer ?? true,
        kickplate: bay.doorSpec.kickplate ?? false,
        doorMark: bay.doorSpec.doorMark ?? '',
        finishOverride: bay.doorSpec.finishOverride ?? '',
      });
    }
  }, [bay]);

  // Save changes to store
  const saveDoorSpec = (updates) => {
    const newSpec = { ...doorSpec, ...updates };
    setDoorSpec(newSpec);

    const newConfigs = [...frame.bayConfigs];
    newConfigs[bayIndex] = {
      ...newConfigs[bayIndex],
      doorSpec: newSpec,
    };
    updateFrame(frameId, { bayConfigs: newConfigs });
  };

  // Compute clear width
  const bayWidth = bay?.widthOverride || (frame?.widthInches || 0) / (frame?.bays || 1);
  let clearWidth;
  if (doorType === 'door-pair') {
    clearWidth = (bayWidth / 2) - doorSpec.stileWidthIn - 1.5;
  } else {
    clearWidth = bayWidth - (doorSpec.stileWidthIn * 2);
  }

  // ADA compliance checks
  const adaClearWidthPass = clearWidth >= 32;
  const adaBottomRailPass = doorSpec.bottomRailIn >= 10;

  // Get hardware set info
  const hwSet = HARDWARE_SETS[doorSpec.hardwareSet] || HARDWARE_SETS.standard;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        🚪 DOOR SPEC — Bay {bayIndex + 1} [{doorType === 'door-pair' ? 'PAIR' : 'SINGLE'}]
      </div>

      {/* Door Mark & Clear Width */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Identification</div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Door Mark</label>
            <input
              type="text"
              placeholder={`${frame?.mark}-D${bayIndex + 1}`}
              value={doorSpec.doorMark}
              onChange={(e) => saveDoorSpec({ doorMark: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Clear Width (auto)</label>
            <input
              type="text"
              disabled
              value={clearWidth.toFixed(2) + '"'}
              style={{ ...inputStyle, background: '#1f1f23', color: '#52525b' }}
            />
          </div>
        </div>
      </div>

      {/* Frame Dimensions */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Frame Dimensions</div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Stile Width (in)</label>
            <input
              type="number"
              step="0.125"
              min="2"
              max="8"
              value={doorSpec.stileWidthIn}
              onChange={(e) => saveDoorSpec({ stileWidthIn: parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Top Rail (in)</label>
            <input
              type="number"
              step="0.125"
              min="2"
              max="10"
              value={doorSpec.topRailIn}
              onChange={(e) => saveDoorSpec({ topRailIn: parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ ...rowStyle, marginBottom: 0 }}>
          <div>
            <label style={labelStyle}>Bottom Rail (in)</label>
            <input
              type="number"
              step="0.125"
              min="8"
              max="14"
              value={doorSpec.bottomRailIn}
              onChange={(e) => saveDoorSpec({ bottomRailIn: parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Finish Override</label>
            <input
              type="text"
              placeholder="(frame finish)"
              value={doorSpec.finishOverride}
              onChange={(e) => saveDoorSpec({ finishOverride: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Swing & Handing */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Swing & Handing</div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Swing Direction</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => saveDoorSpec({ swingDirection: 'left' })}
              style={doorSpec.swingDirection === 'left' ? toggleButtonActiveStyle : toggleButtonStyle}
            >
              ◁ Left
            </button>
            <button
              onClick={() => saveDoorSpec({ swingDirection: 'right' })}
              style={doorSpec.swingDirection === 'right' ? toggleButtonActiveStyle : toggleButtonStyle}
            >
              Right ▷
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#e4e4e7', margin: 0 }}>
            <input
              type="checkbox"
              checked={doorSpec.handingExterior}
              onChange={(e) => saveDoorSpec({ handingExterior: e.target.checked })}
              style={checkboxStyle}
            />
            Push from Exterior (vs. Pull)
          </label>
        </div>
      </div>

      {/* Sidelites & Transoms */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Sidelites & Transoms</div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Left Sidelite (in)</label>
            <input
              type="number"
              step="0.125"
              min="0"
              max={bayWidth / 2}
              value={doorSpec.sideliteLeft}
              onChange={(e) => saveDoorSpec({ sideliteLeft: parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Right Sidelite (in)</label>
            <input
              type="number"
              step="0.125"
              min="0"
              max={bayWidth / 2}
              value={doorSpec.sideliteRight}
              onChange={(e) => saveDoorSpec({ sideliteRight: parseFloat(e.target.value) })}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginBottom: 0 }}>
          <label style={labelStyle}>Transom Height (in)</label>
          <input
            type="number"
            step="0.125"
            min="0"
            max={(frame?.heightInches || 0) / 2}
            value={doorSpec.transomHeight}
            onChange={(e) => saveDoorSpec({ transomHeight: parseFloat(e.target.value) })}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Hardware */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Hardware</div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Hardware Set</label>
          <select
            value={doorSpec.hardwareSet}
            onChange={(e) => saveDoorSpec({ hardwareSet: e.target.value })}
            style={inputStyle}
          >
            {Object.entries(HARDWARE_SETS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
        <div
          style={{
            background: '#1a1a1f',
            border: '1px solid #27272a',
            borderRadius: '4px',
            padding: '8px',
            marginBottom: '10px',
            fontSize: '11px',
            color: '#a1a1aa',
          }}
        >
          {hwSet.items.map((item, i) => (
            <div key={i} style={{ marginBottom: i < hwSet.items.length - 1 ? '4px' : 0 }}>
              • {item}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#e4e4e7', margin: 0 }}>
            <input
              type="checkbox"
              checked={doorSpec.closer}
              onChange={(e) => saveDoorSpec({ closer: e.target.checked })}
              style={checkboxStyle}
            />
            Overhead Closer
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#e4e4e7', margin: 0 }}>
            <input
              type="checkbox"
              checked={doorSpec.kickplate}
              onChange={(e) => saveDoorSpec({ kickplate: e.target.checked })}
              style={checkboxStyle}
            />
            Kickplate
          </label>
        </div>
        <div style={{ ...adaCheckStyle, background: '#1a1a1f' }}>
          <strong style={{ color: '#a1a1aa' }}>Hardware Labor:</strong> <span style={{ color: '#0ea5e9' }}>{hwSet.laborHrs} hrs</span>
        </div>
      </div>

      {/* ADA Compliance */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <div style={sectionLabelStyle}>ADA Compliance Check</div>
        <div style={adaCheckStyle}>
          <span>Clear Width: <strong>{clearWidth.toFixed(2)}"</strong></span>
          <span style={adaClearWidthPass ? adaPassStyle : adaFailStyle}>
            {adaClearWidthPass ? '✓' : '✗'} {adaClearWidthPass ? '>=' : '<'} 32"
          </span>
        </div>
        <div style={adaCheckStyle}>
          <span>Bottom Rail: <strong>{doorSpec.bottomRailIn.toFixed(2)}"</strong></span>
          <span style={adaBottomRailPass ? adaPassStyle : adaFailStyle}>
            {adaBottomRailPass ? '✓' : '✗'} {adaBottomRailPass ? '>=' : '<'} 10"
          </span>
        </div>
      </div>
    </div>
  );
}
