import React, { useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const FrameBuilderDashboard = () => {
  const { frames, groups } = useFrameBuilderStore();

  // Compute key metrics
  const metrics = useMemo(() => {
    const resolvedFrames = frames.filter(f => f.lastBOM);
    const totalFrames = frames.length;
    const totalResolved = resolvedFrames.length;

    const totalGlassSF = resolvedFrames.reduce((sum, f) => {
      const glassSF = f.lastBOM?.glassSchedule?.reduce((s, g) => s + (g.sqft || 0) * (g.quantity || 1), 0) || 0;
      return sum + glassSF;
    }, 0);

    const totalAlumLbs = resolvedFrames.reduce((sum, f) => {
      const alumLbs = f.lastBOM?.bomLines?.reduce((s, b) => s + (b.totalLbs || 0), 0) || 0;
      return sum + alumLbs;
    }, 0);

    const totalLaborHrs = resolvedFrames.reduce((sum, f) => {
      const labor = f.lastBOM?.labor || {};
      const hrs = (labor.shopHours || 0) + (labor.distHours || 0) + (labor.fieldHours || 0);
      return sum + hrs;
    }, 0);

    return {
      totalFrames,
      totalResolved,
      totalGlassSF,
      totalAlumLbs,
      totalLaborHrs,
    };
  }, [frames]);

  // Count flags
  const flags = useMemo(() => {
    const noBoMFrames = frames.filter(f => !f.lastBOM).length;
    const structuralFlags = frames.filter(f => f.lastBOM?.structural?.status !== 'PASS').length;
    const unassignedGlass = frames.filter(f => !f.glassSpecId && !groups.find(g => g.groupId === f.groupId)?.glassSpecId).length;

    return {
      noBoMFrames,
      structuralFlags,
      unassignedGlass,
    };
  }, [frames, groups]);

  // Group frames by system class
  const bySystemClass = useMemo(() => {
    const classes = {
      'ext-storefront': [],
      'cap-curtainwall': [],
      'ssg-curtainwall': [],
      'int-storefront': [],
    };

    frames.forEach(f => {
      const systemClass = f.systemClass || 'ext-storefront';
      if (classes[systemClass]) {
        classes[systemClass].push(f);
      }
    });

    return classes;
  }, [frames]);

  // Compute scrap metrics
  const scrapMetrics = useMemo(() => {
    let partsCritical = 0; // > 10%
    let partsWarning = 0;  // 8-10%
    let partsGood = 0;     // < 8%

    const KERF_IN = 0.125;

    frames.forEach(f => {
      (f.lastBOM?.bomLines || []).forEach(b => {
        const stockLengthFt = 21;
        const usableLengthIn = stockLengthFt * 12 - KERF_IN;
        const totalInNeeded = (b.totalLF || 0) * 12;
        const barsRequired = Math.ceil(totalInNeeded / usableLengthIn);
        const purchasedIn = barsRequired * usableLengthIn;
        const scrapPercent = purchasedIn > 0 ? ((purchasedIn - totalInNeeded) / purchasedIn) * 100 : 0;

        if (scrapPercent > 10) partsCritical++;
        else if (scrapPercent >= 8) partsWarning++;
        else partsGood++;
      });
    });

    return { partsCritical, partsWarning, partsGood };
  }, [frames]);

  // Compute metal takeoff
  const metalTakeoff = useMemo(() => {
    let totalLF = 0;
    let totalBars = 0;
    let totalCost = 0;

    const KERF_IN = 0.125;

    frames.forEach(f => {
      (f.lastBOM?.bomLines || []).forEach(b => {
        totalLF += (b.totalLF || 0) * (f.quantity || 1);

        const stockLengthFt = 21;
        const usableLengthIn = stockLengthFt * 12 - KERF_IN;
        const totalInNeeded = ((b.totalLF || 0) * (f.quantity || 1)) * 12;
        const barsRequired = Math.ceil(totalInNeeded / usableLengthIn);
        totalBars += barsRequired;

        const unitCost = ((b.totalLF || 0) * (b.lbsPerFt || 0) * (b.listPrice || 0) * (b.finishMultiplier || 1)) || 0;
        totalCost += unitCost * (f.quantity || 1);
      });
    });

    return { totalLF, totalBars, totalCost };
  }, [frames]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>PROJECT SUMMARY DASHBOARD</h2>
      </div>

      {/* Metric Cards Row */}
      <div style={styles.metricsRow}>
        <MetricCard
          label="Frames"
          value={metrics.totalResolved}
          sub={`${metrics.totalFrames} total`}
          color="#0ea5e9"
        />
        <MetricCard
          label="Glass SF"
          value={metrics.totalGlassSF.toFixed(0)}
          sub="square feet"
          color="#10b981"
        />
        <MetricCard
          label="Aluminum"
          value={metrics.totalAlumLbs.toFixed(0)}
          sub="lbs"
          color="#f59e0b"
        />
        <MetricCard
          label="Est Labor"
          value={metrics.totalLaborHrs.toFixed(1)}
          sub="hrs"
          color="#ec4899"
        />
      </div>

      {/* System Class Breakdown */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>By System Class</div>
        <div style={styles.systemClassGrid}>
          {Object.entries(bySystemClass).map(([className, frameList]) => {
            const totalSF = frameList.reduce((s, f) => s + ((f.lastBOM?.glassSchedule || []).reduce((ss, g) => ss + (g.sqft || 0) * (g.quantity || 1), 0) || 0), 0);
            const label = className.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return frameList.length > 0 ? (
              <div key={className} style={styles.systemClassCard}>
                <div style={styles.systemClassName}>{label}</div>
                <div style={styles.systemClassStats}>
                  <span>{frameList.length} frames</span>
                  <span>{totalSF.toFixed(0)} SF</span>
                </div>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Flags & Warnings */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Flags & Warnings</div>
        <div style={styles.flagsContainer}>
          {flags.noBoMFrames > 0 && (
            <Flag type="warn" message={`${flags.noBoMFrames} frames have no BOM resolved`} />
          )}
          {flags.structuralFlags > 0 && (
            <Flag type="warn" message={`${flags.structuralFlags} frames need structural review`} />
          )}
          {flags.unassignedGlass > 0 && (
            <Flag type="warn" message={`${flags.unassignedGlass} frames have unassigned glass specs`} />
          )}
          {flags.noBoMFrames === 0 && flags.structuralFlags === 0 && flags.unassignedGlass === 0 && (
            <Flag type="ok" message="All checks passed" />
          )}
        </div>
      </div>

      {/* Scrap Summary & Metal Takeoff */}
      <div style={styles.bottomRow}>
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Scrap Summary</div>
          <div style={styles.scrapGrid}>
            <ScrapItem label="< 8% Scrap" value={scrapMetrics.partsGood} color="#10b981" />
            <ScrapItem label="8-10% Scrap" value={scrapMetrics.partsWarning} color="#f59e0b" />
            <ScrapItem label="> 10% Scrap" value={scrapMetrics.partsCritical} color="#ef4444" />
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Metal Takeoff Summary</div>
          <div style={styles.takeoffGrid}>
            <TakeoffItem label="Total LF" value={metalTakeoff.totalLF.toFixed(0)} />
            <TakeoffItem label="Total Bars" value={metalTakeoff.totalBars.toString()} />
            <TakeoffItem label="Est Material Cost" value={`$${metalTakeoff.totalCost.toFixed(0)}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color }}>{value}</div>
      {sub && <div style={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function Flag({ type, message }) {
  const iconMap = {
    warn: '⚠',
    error: '✗',
    ok: '✓',
  };
  const colorMap = {
    warn: '#f59e0b',
    error: '#ef4444',
    ok: '#10b981',
  };
  return (
    <div style={styles.flagItem}>
      <span style={{ ...styles.flagIcon, color: colorMap[type] }}>
        {iconMap[type]}
      </span>
      <span style={styles.flagText}>{message}</span>
    </div>
  );
}

function ScrapItem({ label, value, color }) {
  return (
    <div style={styles.scrapItem}>
      <div style={styles.scrapLabel}>{label}</div>
      <div style={{ ...styles.scrapValue, color }}>{value}</div>
    </div>
  );
}

function TakeoffItem({ label, value }) {
  return (
    <div style={styles.takeoffItem}>
      <div style={styles.takeoffLabel}>{label}</div>
      <div style={styles.takeoffValue}>{value}</div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#09090b',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },

  header: {
    paddingBottom: '12px',
    borderBottom: '1px solid #27272a',
  },

  title: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#e4e4e7',
    margin: 0,
  },

  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
  },

  metricCard: {
    background: '#111113',
    border: '1px solid #27272a',
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  metricLabel: {
    fontSize: '11px',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: '600',
  },

  metricValue: {
    fontSize: '28px',
    fontWeight: '700',
    lineHeight: '1',
  },

  metricSub: {
    fontSize: '11px',
    color: '#52525b',
    marginTop: '4px',
  },

  section: {
    background: '#111113',
    border: '1px solid #27272a',
    borderRadius: '10px',
    padding: '16px',
  },

  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#e4e4e7',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #27272a',
  },

  systemClassGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  systemClassCard: {
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  systemClassName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#e4e4e7',
  },

  systemClassStats: {
    display: 'flex',
    gap: '16px',
    fontSize: '11px',
    color: '#a1a1aa',
  },

  flagsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  flagItem: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #1a1a1f',
  },

  flagIcon: {
    fontSize: '14px',
    fontWeight: '600',
  },

  flagText: {
    fontSize: '12px',
    color: '#a1a1aa',
  },

  bottomRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },

  scrapGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },

  scrapItem: {
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '12px',
    textAlign: 'center',
  },

  scrapLabel: {
    fontSize: '11px',
    color: '#52525b',
    marginBottom: '6px',
  },

  scrapValue: {
    fontSize: '20px',
    fontWeight: '700',
  },

  takeoffGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  takeoffItem: {
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '6px',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  takeoffLabel: {
    fontSize: '11px',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  takeoffValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e4e4e7',
  },
};

export default FrameBuilderDashboard;
