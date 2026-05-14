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

const containerStyle = {
  padding: '16px',
  background: '#111113',
  color: '#e4e4e7',
};

const sectionHeaderStyle = {
  fontSize: '13px',
  fontWeight: '600',
  color: '#e4e4e7',
  marginBottom: '12px',
  paddingBottom: '8px',
  borderBottom: '1px solid #27272a',
};

const tableContainerStyle = {
  marginBottom: '24px',
  background: '#0f1117',
  border: '1px solid #27272a',
  borderRadius: '6px',
  overflow: 'auto',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};

const thStyle = {
  background: '#1a1a1f',
  color: '#a1a1aa',
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid #27272a',
  fontSize: '11px',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid #27272a',
  color: '#e4e4e7',
};

const alternateRowStyle = {
  ...tdStyle,
  background: '#111113',
};

const emptyMessageStyle = {
  padding: '20px',
  textAlign: 'center',
  color: '#52525b',
  fontSize: '13px',
};

const buttonStyle = {
  background: '#0ea5e9',
  border: 'none',
  borderRadius: '4px',
  color: '#000',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: '600',
  cursor: 'pointer',
  marginBottom: '12px',
};

const hwItemStyle = {
  padding: '8px 12px',
  background: '#1a1a1f',
  borderRadius: '4px',
  marginBottom: '6px',
  fontSize: '12px',
  border: '1px solid #27272a',
};

const totalsRowStyle = {
  ...tdStyle,
  background: '#1a1a1f',
  fontWeight: '600',
  color: '#0ea5e9',
};

export default function DoorScheduleOutput() {
  const { frames } = useFrameBuilderStore();

  // Collect all door bays
  const doorEntries = frames.flatMap((frame) =>
    (frame.bayConfigs || [])
      .map((bay, bayIndex) => ({
        frameMark: frame.mark || `F-${frames.indexOf(frame) + 1}`,
        bayIndex,
        frame,
        bay,
        isDoor: bay.type === 'door-single' || bay.type === 'door-pair',
      }))
      .filter((entry) => entry.isDoor)
      .map((entry) => {
        const { frame, bay, frameMark, bayIndex } = entry;
        const bayWidth = bay.widthOverride || (frame.widthInches || 0) / (frame.bays || 1);
        let clearWidth;
        const stileWidth = bay.doorSpec?.stileWidthIn || 4.5;
        if (bay.type === 'door-pair') {
          clearWidth = (bayWidth / 2) - stileWidth - 1.5;
        } else {
          clearWidth = bayWidth - (stileWidth * 2);
        }
        const hwSet = HARDWARE_SETS[bay.doorSpec?.hardwareSet || 'standard'] || HARDWARE_SETS.standard;

        return {
          frameMark,
          bayIndex,
          doorMark: bay.doorSpec?.doorMark || `${frameMark}-D${bayIndex + 1}`,
          type: bay.type === 'door-pair' ? 'Pair' : 'Single',
          clearWidthIn: clearWidth,
          frameHeightIn: frame.heightInches,
          stileWidth: stileWidth,
          topRail: bay.doorSpec?.topRailIn || 6.0,
          bottomRail: bay.doorSpec?.bottomRailIn || 10.0,
          swing: bay.doorSpec?.swingDirection || 'left',
          hardwareSet: bay.doorSpec?.hardwareSet || 'standard',
          hardwareLabel: hwSet.label,
          closer: bay.doorSpec?.closer ?? true,
          kickplate: bay.doorSpec?.kickplate ?? false,
          laborHrs: hwSet.laborHrs,
          transomHeight: bay.doorSpec?.transomHeight || 0,
          sideliteLeft: bay.doorSpec?.sideliteLeft || 0,
          sideliteRight: bay.doorSpec?.sideliteRight || 0,
          doorSpec: bay.doorSpec || {},
        };
      })
  );

  const handleExportCSV = () => {
    if (doorEntries.length === 0) {
      alert('No doors to export');
      return;
    }

    const headers = [
      'Door Mark',
      'Frame',
      'Type',
      'Clear Width (in)',
      'Frame Height (in)',
      'Stile (in)',
      'Top Rail (in)',
      'Bottom Rail (in)',
      'Swing',
      'Hardware Set',
      'Closer',
      'Kickplate',
      'Transom (in)',
      'Left Sidelite (in)',
      'Right Sidelite (in)',
      'Labor (hrs)',
    ];

    const rows = doorEntries.map((entry) => [
      entry.doorMark,
      entry.frameMark,
      entry.type,
      entry.clearWidthIn.toFixed(2),
      entry.frameHeightIn.toFixed(2),
      entry.stileWidth.toFixed(2),
      entry.topRail.toFixed(2),
      entry.bottomRail.toFixed(2),
      entry.swing,
      entry.hardwareLabel,
      entry.closer ? 'Yes' : 'No',
      entry.kickplate ? 'Yes' : 'No',
      entry.transomHeight.toFixed(2),
      entry.sideliteLeft.toFixed(2),
      entry.sideliteRight.toFixed(2),
      entry.laborHrs.toFixed(1),
    ]);

    const totalLaborHrs = doorEntries.reduce((sum, entry) => sum + entry.laborHrs, 0);
    rows.push(['', '', '', '', '', '', '', '', '', 'TOTAL', '', '', '', '', '', totalLaborHrs.toFixed(1)]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'door-schedule.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (doorEntries.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={sectionHeaderStyle}>Door Schedule</div>
        <div style={tableContainerStyle}>
          <div style={emptyMessageStyle}>
            No doors configured. Add door bays in Tab 4 Grid to see door schedule here.
          </div>
        </div>
      </div>
    );
  }

  // Aggregate hardware sets for Hardware Schedule
  const hardwareBySet = {};
  doorEntries.forEach((entry) => {
    if (!hardwareBySet[entry.hardwareSet]) {
      hardwareBySet[entry.hardwareSet] = {
        label: entry.hardwareLabel,
        items: HARDWARE_SETS[entry.hardwareSet]?.items || [],
        count: 0,
        laborTotal: 0,
      };
    }
    hardwareBySet[entry.hardwareSet].count += 1;
    hardwareBySet[entry.hardwareSet].laborTotal += entry.laborHrs;
  });

  const totalLaborHrs = doorEntries.reduce((sum, entry) => sum + entry.laborHrs, 0);

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>🚪 Door Schedule</div>

      <button onClick={handleExportCSV} style={buttonStyle}>
        ↓ Export as CSV
      </button>

      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Door Mark</th>
              <th style={thStyle}>Frame</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Clear W (in)</th>
              <th style={thStyle}>Height (in)</th>
              <th style={thStyle}>Swing</th>
              <th style={thStyle}>Hardware Set</th>
              <th style={thStyle}>Closer</th>
              <th style={thStyle}>Kick</th>
              <th style={thStyle}>Labor (hrs)</th>
            </tr>
          </thead>
          <tbody>
            {doorEntries.map((entry, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#0f1117' : '#111113' }}>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.doorMark}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.frameMark}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.type}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.clearWidthIn.toFixed(2)}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.frameHeightIn.toFixed(2)}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.swing}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.hardwareLabel}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.closer ? 'Yes' : 'No'}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.kickplate ? 'Yes' : 'No'}</td>
                <td style={idx % 2 === 0 ? tdStyle : alternateRowStyle}>{entry.laborHrs.toFixed(1)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan="9" style={totalsRowStyle} align="right">
                TOTAL LABOR:
              </td>
              <td style={totalsRowStyle}>{totalLaborHrs.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '24px' }}>
        <div style={sectionHeaderStyle}>Hardware Summary</div>
        {Object.entries(hardwareBySet).map(([key, hwGroup]) => (
          <div
            key={key}
            style={{
              marginBottom: '14px',
              padding: '12px',
              background: '#0f1117',
              border: '1px solid #27272a',
              borderRadius: '6px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#0ea5e9',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{hwGroup.label}</span>
              <span>{hwGroup.count} door(s) • {hwGroup.laborTotal.toFixed(1)} hrs</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {hwGroup.items.map((item, i) => (
                <div key={i} style={hwItemStyle}>
                  • {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
