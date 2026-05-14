import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const PHASES = [
  { key: 'shop', icon: '🏭', label: 'Shop Fabrication', color: '#f59e0b' },
  { key: 'field', icon: '🏗', label: 'Field Installation', color: '#3b82f6' },
  { key: 'glass', icon: '🪟', label: 'Glass Handling', color: '#8b5cf6' },
  { key: 'door', icon: '🚪', label: 'Door Hardware', color: '#ec4899' },
];

const LaborPhaseReport = () => {
  const { frames, groups } = useFrameBuilderStore();
  const [workdaysAvailable, setWorkdaysAvailable] = useState(20);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [crewSize, setCrewSize] = useState(2);

  // Calculate labor hours per frame
  const frameLabor = useMemo(() => {
    return frames.map((frame) => {
      const labor = frame.lastBOM?.labor || {};
      const quantity = frame.quantity || 1;
      const doorCount = frame.bayConfigs?.filter((b) => b.type === 'door').length || 0;

      return {
        frameId: frame.frameId,
        mark: frame.mark,
        systemType: frame.systemClass || 'unknown',
        quantity,
        shopFab: (labor.shopFabHours || 0) * quantity,
        fieldInstall: (labor.fieldInstallHours || 0) * quantity,
        glassHandling: (labor.glassHandlingHours || 0) * quantity,
        doorHardware: doorCount * 8.5 * quantity,
        total:
          ((labor.shopFabHours || 0) + (labor.fieldInstallHours || 0) + (labor.glassHandlingHours || 0)) * quantity
          + doorCount * 8.5 * quantity,
      };
    });
  }, [frames]);

  // Grand totals
  const totals = useMemo(() => {
    return frameLabor.reduce(
      (acc, f) => ({
        shopFab: acc.shopFab + f.shopFab,
        fieldInstall: acc.fieldInstall + f.fieldInstall,
        glassHandling: acc.glassHandling + f.glassHandling,
        doorHardware: acc.doorHardware + f.doorHardware,
        total: acc.total + f.total,
      }),
      { shopFab: 0, fieldInstall: 0, glassHandling: 0, doorHardware: 0, total: 0 }
    );
  }, [frameLabor]);

  // Crew utilization
  const capacityHours = workdaysAvailable * hoursPerDay * crewSize;
  const utilizationPct = capacityHours > 0 ? (totals.total / capacityHours) * 100 : 0;
  const overtimeHours = Math.max(0, totals.total - capacityHours);

  const getUtilizationColor = () => {
    if (utilizationPct <= 80) return '#10b981';
    if (utilizationPct <= 100) return '#f59e0b';
    return '#ef4444';
  };

  const exportCSV = () => {
    const rows = [
      ['Frame Labor Breakdown', projectName || 'Project'],
      ['Mark', 'Qty', 'Shop Hrs', 'Field Hrs', 'Glass Hrs', 'Door Hrs', 'Total Hrs'],
    ];
    frameLabor.forEach((f) => {
      rows.push([
        f.mark,
        f.quantity,
        f.shopFab.toFixed(2),
        f.fieldInstall.toFixed(2),
        f.glassHandling.toFixed(2),
        f.doorHardware.toFixed(2),
        f.total.toFixed(2),
      ]);
    });
    rows.push([]);
    rows.push(['TOTALS', '', totals.shopFab.toFixed(2), totals.fieldInstall.toFixed(2), totals.glassHandling.toFixed(2), totals.doorHardware.toFixed(2), totals.total.toFixed(2)]);
    rows.push([]);
    rows.push(['Crew Utilization', '']);
    rows.push(['Total Hours', totals.total.toFixed(2)]);
    rows.push(['Capacity Hours', capacityHours.toFixed(2)]);
    rows.push(['Utilization %', utilizationPct.toFixed(1)]);
    rows.push(['Overtime Hours', overtimeHours.toFixed(2)]);

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labor-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getPhasePercentage = (hours) => {
    return totals.total > 0 ? ((hours / totals.total) * 100).toFixed(1) : '0';
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
        <p>No frames available. Add frames to view labor phase breakdown.</p>
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
      {/* Crew Inputs */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#111113',
        borderRadius: '0.5rem',
        border: '1px solid #27272a',
        marginBottom: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
            Workdays Available
          </label>
          <input
            type="number"
            value={workdaysAvailable}
            onChange={(e) => setWorkdaysAvailable(Number(e.target.value))}
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
            Hours per Day
          </label>
          <input
            type="number"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value))}
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
            Crew Size
          </label>
          <input
            type="number"
            value={crewSize}
            onChange={(e) => setCrewSize(Number(e.target.value))}
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

      {/* Phase Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {PHASES.map((phase) => {
          const hours = totals[phase.key] || 0;
          const pct = getPhasePercentage(hours);
          const donutRadius = 40;
          const donutStroke = 8;
          const donutCircumference = 2 * Math.PI * (donutRadius - donutStroke / 2);
          const donutDash = (pct / 100) * donutCircumference;

          return (
            <div key={phase.key} style={{
              padding: '1.25rem',
              backgroundColor: '#111113',
              borderRadius: '0.5rem',
              border: '1px solid #27272a',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
            }}>
              <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
                {/* Background circle */}
                <circle cx="50" cy="50" r={donutRadius} fill="none" stroke="#27272a" strokeWidth={donutStroke} />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius - donutStroke / 2}
                  fill="none"
                  stroke={phase.color}
                  strokeWidth={donutStroke}
                  strokeDasharray={`${donutDash} ${donutCircumference}`}
                  strokeLinecap="round"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50px 50px', transition: 'stroke-dasharray 0.3s ease' }}
                />
                {/* Center text */}
                <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="700" fill={phase.color}>
                  {pct}%
                </text>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  {phase.icon} {phase.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: phase.color, marginBottom: '0.35rem' }}>
                  {hours.toFixed(1)} hrs
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a1a1a6' }}>
                  {pct}% of total
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Crew Utilization */}
      <div style={{
        padding: '1.5rem',
        backgroundColor: '#111113',
        borderRadius: '0.5rem',
        border: '1px solid #27272a',
        marginBottom: '2rem',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0ea5e9', marginBottom: '1rem', margin: 0 }}>
          Crew Capacity & Utilization
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Total Hours Required
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
              {totals.total.toFixed(1)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Crew Capacity
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>
              {capacityHours.toFixed(1)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Utilization
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: getUtilizationColor() }}>
              {utilizationPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Overtime Hours
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: overtimeHours > 0 ? '#ef4444' : '#10b981' }}>
              {overtimeHours.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Utilization Bar */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{
            height: '24px',
            backgroundColor: '#0f0f12',
            borderRadius: '9999px',
            border: `2px solid ${getUtilizationColor()}`,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(utilizationPct, 100)}%`,
              backgroundColor: getUtilizationColor(),
              transition: 'width 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {utilizationPct > 10 && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#09090b' }}>
                  {utilizationPct.toFixed(0)}%
                </span>
              )}
            </div>
            {utilizationPct > 100 && (
              <div style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#ef4444',
              }}>
                ⚠ Overtime!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Frame Breakdown Table */}
      <div style={{
        marginBottom: '2rem',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0ea5e9', margin: 0 }}>
            Frame-Level Breakdown
          </h3>
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
              fontSize: '0.85rem',
            }}
          >
            📥 Export CSV
          </button>
        </div>

        <div style={{
          overflowX: 'auto',
          backgroundColor: '#111113',
          borderRadius: '0.5rem',
          border: '1px solid #27272a',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1d' }}>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '1px solid #27272a',
                }}>Mark</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  fontWeight: 600,
                  color: '#0ea5e9',
                  borderBottom: '1px solid #27272a',
                }}>Qty</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#f59e0b',
                  borderBottom: '1px solid #27272a',
                }}>Shop Hrs</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#3b82f6',
                  borderBottom: '1px solid #27272a',
                }}>Field Hrs</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#8b5cf6',
                  borderBottom: '1px solid #27272a',
                }}>Glass Hrs</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#ec4899',
                  borderBottom: '1px solid #27272a',
                }}>Door Hrs</th>
                <th style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#10b981',
                  borderBottom: '1px solid #27272a',
                }}>Total Hrs</th>
              </tr>
            </thead>
            <tbody>
              {frameLabor.map((f, idx) => (
                <tr key={idx} style={{
                  backgroundColor: idx % 2 === 0 ? '#111113' : '#0f0f12',
                  borderBottom: '1px solid #27272a',
                }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600, color: '#0ea5e9' }}>{f.mark}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>{f.quantity}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{f.shopFab.toFixed(1)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{f.fieldInstall.toFixed(1)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{f.glassHandling.toFixed(1)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{f.doorHardware.toFixed(1)}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{f.total.toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#1a1a1d' }}>
                <td colSpan="2" style={{
                  padding: '0.75rem',
                  fontWeight: 700,
                  color: '#0ea5e9',
                  borderTop: '2px solid #27272a',
                }}>
                  TOTALS
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#f59e0b',
                  borderTop: '2px solid #27272a',
                }}>
                  {totals.shopFab.toFixed(1)}
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#3b82f6',
                  borderTop: '2px solid #27272a',
                }}>
                  {totals.fieldInstall.toFixed(1)}
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#8b5cf6',
                  borderTop: '2px solid #27272a',
                }}>
                  {totals.glassHandling.toFixed(1)}
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#ec4899',
                  borderTop: '2px solid #27272a',
                }}>
                  {totals.doorHardware.toFixed(1)}
                </td>
                <td style={{
                  padding: '0.75rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#10b981',
                  borderTop: '2px solid #27272a',
                }}>
                  {totals.total.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LaborPhaseReport;
