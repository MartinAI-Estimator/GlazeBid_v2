import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import LaborPhaseReport from './LaborPhaseReport';

const fmtIn = (totalInches) => {
  if (!totalInches) return "0'0\"";
  const feet = Math.floor(totalInches / 12);
  const rem = totalInches - feet * 12;
  const whole = Math.floor(rem);
  const frac = rem - whole;
  const fracs = [[1/2,'1/2'],[1/4,'1/4'],[3/4,'3/4'],[1/8,'1/8'],[3/8,'3/8'],[5/8,'5/8'],[7/8,'7/8']];
  const fracStr = fracs.find(([v]) => Math.abs(frac - v) < 0.02)?.[1] || '';
  const inchStr = whole > 0 || fracStr ? `${whole}${fracStr ? ' ' + fracStr : ''}` : '0';
  return `${feet}'-${inchStr}"`;
};

const FrameScheduleExport = () => {
  const { frames, groups } = useFrameBuilderStore();
  const [projectName, setProjectName] = useState('Project Name');
  const [projectNumber, setProjectNumber] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
  const [laborExpanded, setLaborExpanded] = useState(false);

  // Group frames by group name
  const framesByGroup = useMemo(() => {
    const grouped = {};
    frames.forEach((frame) => {
      const group = groups.find((g) => g.groupId === frame.groupId);
      const groupName = group?.name || 'Ungrouped';
      if (!grouped[groupName]) grouped[groupName] = [];
      grouped[groupName].push(frame);
    });
    return grouped;
  }, [frames, groups]);

  const groupNames = Object.keys(framesByGroup).sort();

  // Calculate totals
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalGlazingArea = 0;
    let totalAluminumLF = 0;

    frames.forEach((frame) => {
      totalQty += frame.quantity || 1;
      const area = (frame.widthInches / 12) * (frame.heightInches / 12);
      totalGlazingArea += area * (frame.quantity || 1);
      if (frame.lastBOM?.bomLines) {
        frame.lastBOM.bomLines.forEach((line) => {
          if (line.role === 'frame' && line.totalLF) {
            totalAluminumLF += line.totalLF * (frame.quantity || 1);
          }
        });
      }
    });

    return { totalQty, totalGlazingArea, totalAluminumLF };
  }, [frames]);

  // Group totals
  const groupTotals = useMemo(() => {
    const totals = {};
    groupNames.forEach((groupName) => {
      let qty = 0;
      let glazingArea = 0;
      let aluminumLF = 0;

      framesByGroup[groupName].forEach((frame) => {
        qty += frame.quantity || 1;
        const area = (frame.widthInches / 12) * (frame.heightInches / 12);
        glazingArea += area * (frame.quantity || 1);
        if (frame.lastBOM?.bomLines) {
          frame.lastBOM.bomLines.forEach((line) => {
            if (line.role === 'frame' && line.totalLF) {
              aluminumLF += line.totalLF * (frame.quantity || 1);
            }
          });
        }
      });

      totals[groupName] = { qty, glazingArea, aluminumLF };
    });
    return totals;
  }, [framesByGroup, groupNames]);

  const exportCSV = () => {
    const rows = [
      ['FRAME SCHEDULE', projectName],
      ['Project Number', projectNumber],
      ['Prepared By', preparedBy],
      ['Date', scheduleDate],
      [],
      ['Mark', 'Qty', 'Width (ft-in)', 'Height (ft-in)', 'System / Archetype', 'Finish', 'Glass Spec', 'Glazing Area SF', 'Notes'],
    ];

    groupNames.forEach((groupName) => {
      rows.push([groupName, '', '', '', '', '', '', '', '']);

      framesByGroup[groupName].forEach((frame) => {
        const group = groups.find((g) => g.groupId === frame.groupId);
        const glassSpec = group?.glassSpecId || 'Not specified';
        const glazingArea = ((frame.widthInches / 12) * (frame.heightInches / 12) * (frame.quantity || 1)).toFixed(2);

        rows.push([
          frame.mark || '',
          frame.quantity || 1,
          fmtIn(frame.widthInches),
          fmtIn(frame.heightInches),
          frame.systemClass || group?.archetypeId || '',
          group?.finishType || '',
          glassSpec,
          glazingArea,
          frame.estimatorNotes || '',
        ]);
      });

      const groupTotal = groupTotals[groupName];
      rows.push(['Group Total:', groupTotal.qty, '', '', '', '', '', groupTotal.glazingArea.toFixed(2), '']);
      rows.push([]);
    });

    rows.push(['GRAND TOTALS', totals.totalQty, '', '', '', '', '', totals.totalGlazingArea.toFixed(2), '']);

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frame-schedule-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printSchedule = () => {
    window.print();
  };

  if (frames.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        backgroundColor: '#09090b',
        borderRadius: '0.5rem',
        color: '#e4e4e7',
        textAlign: 'center',
      }}>
        <p>No frames available. Add frames to generate a frame schedule.</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: '#09090b',
      borderRadius: '0.5rem',
      color: '#e4e4e7',
    }}>
      <style>{`
        @media print {
          body {
            background: white;
            color: black;
            padding: 0;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
          .frame-schedule-container {
            background: white;
            color: black;
            padding: 1rem;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
          }
          th, td {
            border: 1px solid #999;
            padding: 4px 8px;
            font-size: 11px;
            text-align: left;
          }
          th {
            background: #f3f3f3;
            font-weight: bold;
          }
          .print-header {
            page-break-after: avoid;
            margin-bottom: 1rem;
          }
        }
      `}</style>

      {/* Control Panel */}
      <div className="no-print" style={{
        padding: '1rem',
        backgroundColor: '#111113',
        borderRadius: '0.5rem',
        border: '1px solid #27272a',
        marginBottom: '2rem',
      }}>
        <h3 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: '#0ea5e9',
          margin: '0 0 1rem 0',
        }}>
          Schedule Header
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0f0f12',
                border: '1px solid #27272a',
                borderRadius: '0.375rem',
                color: '#e4e4e7',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Project Number
            </label>
            <input
              type="text"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0f0f12',
                border: '1px solid #27272a',
                borderRadius: '0.375rem',
                color: '#e4e4e7',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Prepared By
            </label>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0f0f12',
                border: '1px solid #27272a',
                borderRadius: '0.375rem',
                color: '#e4e4e7',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Date
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0f0f12',
                border: '1px solid #27272a',
                borderRadius: '0.375rem',
                color: '#e4e4e7',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Export Buttons */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          marginTop: '1rem',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={exportCSV}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#0ea5e9',
              color: '#09090b',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            📥 Export CSV
          </button>
          <button
            onClick={printSchedule}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: '#09090b',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            🖨 Print Schedule
          </button>
        </div>
      </div>

      {/* Frame Schedule */}
      <div className="frame-schedule-container" style={{
        padding: '1rem',
        backgroundColor: '#111113',
        borderRadius: '0.5rem',
        border: '1px solid #27272a',
        marginBottom: '2rem',
      }}>
        <div className="print-header" style={{
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid #27272a',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9', margin: '0 0 0.5rem 0' }}>
            FRAME SCHEDULE
          </h1>
          <p style={{ margin: '0.25rem 0', color: '#a1a1a6', fontSize: '0.9rem' }}>
            <strong>Project:</strong> {projectName}
            {projectNumber && <> | <strong>Number:</strong> {projectNumber}</>}
          </p>
          <p style={{ margin: '0.25rem 0', color: '#a1a1a6', fontSize: '0.9rem' }}>
            {preparedBy && <><strong>Prepared By:</strong> {preparedBy} | </>}
            <strong>Date:</strong> {scheduleDate}
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
            backgroundColor: '#0f0f12',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1d' }}>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Mark</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Qty</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Width (ft-in)</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Height (ft-in)</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>System / Archetype</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Finish</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Glass Spec</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Glazing Area SF</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '2px solid #27272a',
                }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {groupNames.map((groupName, groupIdx) => {
                const groupFrames = framesByGroup[groupName];
                const groupTotal = groupTotals[groupName];
                return (
                  <React.Fragment key={groupName}>
                    {/* Group Header */}
                    <tr style={{
                      backgroundColor: '#1a1a1d',
                      fontWeight: 700,
                      borderTop: groupIdx > 0 ? '2px solid #27272a' : 'none',
                    }}>
                      <td colSpan="9" style={{
                        padding: '0.75rem',
                        color: '#0ea5e9',
                        borderBottom: '1px solid #27272a',
                      }}>
                        {groupName}
                      </td>
                    </tr>

                    {/* Group Frames */}
                    {groupFrames.map((frame, frameIdx) => {
                      const group = groups.find((g) => g.groupId === frame.groupId);
                      const glassSpec = group?.glassSpecId || 'Not specified';
                      const glazingArea = ((frame.widthInches / 12) * (frame.heightInches / 12) * (frame.quantity || 1)).toFixed(2);

                      return (
                        <tr key={frame.frameId} style={{
                          backgroundColor: frameIdx % 2 === 0 ? '#111113' : '#0f0f12',
                          borderBottom: '1px solid #27272a',
                        }}>
                          <td style={{ padding: '0.75rem', fontWeight: 600, color: '#0ea5e9' }}>
                            {frame.mark}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {frame.quantity || 1}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontFamily: 'monospace' }}>
                            {fmtIn(frame.widthInches)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontFamily: 'monospace' }}>
                            {fmtIn(frame.heightInches)}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {frame.systemClass || group?.archetypeId || ''}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#a1a1a6' }}>
                            {group?.finishType || ''}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#a1a1a6' }}>
                            {glassSpec}
                          </td>
                          <td style={{
                            padding: '0.75rem',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#10b981',
                          }}>
                            {glazingArea}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#a1a1a6' }}>
                            {frame.estimatorNotes}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Group Subtotal */}
                    <tr style={{
                      backgroundColor: '#1a1a1d',
                      borderTop: '1px solid #27272a',
                      borderBottom: '1px solid #27272a',
                    }}>
                      <td colSpan="2" style={{
                        padding: '0.75rem',
                        fontWeight: 700,
                        color: '#0ea5e9',
                      }}>
                        Group Total
                      </td>
                      <td colSpan="5" />
                      <td style={{
                        padding: '0.75rem',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#10b981',
                      }}>
                        {groupTotal.glazingArea.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Grand Total */}
              <tr style={{
                backgroundColor: '#1a1a1d',
                borderTop: '2px solid #27272a',
              }}>
                <td colSpan="2" style={{
                  padding: '0.75rem',
                  fontWeight: 700,
                  color: '#10b981',
                }}>
                  GRAND TOTALS
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#10b981',
                }}>
                  {totals.totalQty}
                </td>
                <td colSpan="4" />
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#10b981',
                }}>
                  {totals.totalGlazingArea.toFixed(2)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Labor Phase Report */}
      <div className="no-print" style={{
        marginTop: '2rem',
        borderTop: '2px solid #27272a',
        paddingTop: '2rem',
      }}>
        <button
          onClick={() => setLaborExpanded(!laborExpanded)}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: '#111113',
            border: '1px solid #27272a',
            borderRadius: '0.5rem',
            color: '#0ea5e9',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'left',
            marginBottom: laborExpanded ? '1rem' : 0,
            transition: 'all 0.15s ease',
          }}
        >
          {laborExpanded ? '▼' : '▶'} Labor Phase Report
        </button>
        {laborExpanded && (
          <div style={{ marginTop: '1rem' }}>
            <LaborPhaseReport />
          </div>
        )}
      </div>
    </div>
  );
};

export default FrameScheduleExport;
