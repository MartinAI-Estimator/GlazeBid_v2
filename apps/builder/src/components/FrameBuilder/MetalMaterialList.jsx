import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const KERF_IN = 0.125;

const scrapColors = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

function computeBarOpt(totalLFNeeded, stockLengthFt) {
  const usableLengthIn = stockLengthFt * 12 - KERF_IN;
  const totalInNeeded = totalLFNeeded * 12;
  const barsRequired = Math.ceil(totalInNeeded / usableLengthIn);
  const usedIn = totalInNeeded;
  const purchasedIn = barsRequired * usableLengthIn;
  const scrapIn = purchasedIn - usedIn;
  const scrapPercent = purchasedIn > 0 ? (scrapIn / purchasedIn) * 100 : 0;
  const scrapStatus = scrapPercent < 8 ? 'green' : scrapPercent < 10 ? 'yellow' : 'red';
  return { barsRequired, scrapPercent, scrapStatus };
}

const MetalMaterialList = () => {
  const { frames } = useFrameBuilderStore();
  const [stockLengthFt, setStockLengthFt] = useState(21);
  const [sortBy, setSortBy] = useState('role');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Aggregate all BOM lines from all frames
  const allBOMLines = useMemo(() => {
    return frames.flatMap((f) =>
      (f.lastBOM?.bomLines || []).map((line) => ({
        ...line,
        frameMark: f.mark,
        frameQty: f.quantity || 1,
        effectiveTotalLF: line.totalLF * (f.quantity || 1),
      }))
    );
  }, [frames]);

  // Group by part number
  const aggregatedData = useMemo(() => {
    const aggregated = {};

    allBOMLines.forEach((line) => {
      const key = line.partNumber;
      if (!aggregated[key]) {
        aggregated[key] = {
          partNumber: line.partNumber,
          description: line.description,
          role: line.role,
          lbsPerFt: line.lbsPerFt,
          listPrice: line.listPrice,
          finishMultiplier: line.finishMultiplier,
          totalLFNeeded: 0,
          sources: [],
        };
      }
      aggregated[key].totalLFNeeded += line.effectiveTotalLF;
      aggregated[key].sources.push({
        frameMark: line.frameMark,
        lf: line.effectiveTotalLF,
      });
    });

    return Object.values(aggregated);
  }, [allBOMLines]);

  // Sort rows
  const sortedRows = useMemo(() => {
    const rows = [...aggregatedData];

    if (sortBy === 'role') {
      rows.sort((a, b) => (a.role || '').localeCompare(b.role || ''));
    } else if (sortBy === 'part') {
      rows.sort((a, b) => (a.partNumber || '').localeCompare(b.partNumber || ''));
    } else if (sortBy === 'scrap') {
      rows.sort((a, b) => {
        const aOpt = computeBarOpt(a.totalLFNeeded, stockLengthFt);
        const bOpt = computeBarOpt(b.totalLFNeeded, stockLengthFt);
        return bOpt.scrapPercent - aOpt.scrapPercent;
      });
    }

    return rows;
  }, [aggregatedData, sortBy, stockLengthFt]);

  // Calculate summary totals
  const summary = useMemo(() => {
    const totalParts = sortedRows.length;
    const totalLF = sortedRows.reduce((s, r) => s + r.totalLFNeeded, 0);
    const totalLbs = sortedRows.reduce((s, r) => s + r.totalLFNeeded * r.lbsPerFt, 0);
    const totalCost = sortedRows.reduce(
      (s, r) => s + r.totalLFNeeded * r.lbsPerFt * r.listPrice * r.finishMultiplier,
      0
    );
    return { totalParts, totalLF, totalLbs, totalCost };
  }, [sortedRows]);

  const exportCSV = () => {
    const headers = [
      'Part #',
      'Description',
      'Role',
      'Total LF',
      `Bars @ ${stockLengthFt}ft`,
      'Lbs/LF',
      'Total Lbs',
      '$/Lb',
      'Finish Mult',
      'Ext Cost',
      'Scrap %',
    ];

    const csvRows = sortedRows.map((r) => {
      const opt = computeBarOpt(r.totalLFNeeded, stockLengthFt);
      const cost = r.totalLFNeeded * r.lbsPerFt * r.listPrice * r.finishMultiplier;
      return [
        r.partNumber,
        r.description,
        r.role,
        r.totalLFNeeded.toFixed(2),
        opt.barsRequired,
        r.lbsPerFt.toFixed(3),
        (r.totalLFNeeded * r.lbsPerFt).toFixed(1),
        r.listPrice.toFixed(2),
        r.finishMultiplier.toFixed(2),
        cost.toFixed(2),
        opt.scrapPercent.toFixed(1) + '%',
      ];
    });

    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metal_list_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPO = () => {
    const poLines = sortedRows.map((r) => {
      const opt = computeBarOpt(r.totalLFNeeded, stockLengthFt);
      const cost = r.totalLFNeeded * r.lbsPerFt * r.listPrice * r.finishMultiplier;
      return [
        r.partNumber,
        r.description,
        `${opt.barsRequired} bars @ ${stockLengthFt}'`,
        `${r.totalLFNeeded.toFixed(1)} LF`,
        `${(r.totalLFNeeded * r.lbsPerFt).toFixed(1)} lbs`,
        `$${cost.toFixed(2)}`,
      ];
    });

    const po =
      'GlazeBid Material Purchase Order\n' +
      `Generated: ${new Date().toLocaleString()}\n` +
      '=' +
      '='.repeat(100) +
      '\n\n' +
      'ALUMINUM EXTRUSIONS\n' +
      '-'.repeat(120) +
      '\n' +
      ['Part #', 'Description', 'Quantity', 'Linear Feet', 'Weight', 'Cost'].join('\t') +
      '\n' +
      '-'.repeat(120) +
      '\n' +
      poLines.map((row) => row.join('\t')).join('\n') +
      '\n' +
      '-'.repeat(120) +
      '\n' +
      `SUMMARY: ${summary.totalParts} parts | ${summary.totalLF.toFixed(1)} LF | ${summary.totalLbs.toFixed(0)} lbs | Total: $${summary.totalCost.toFixed(2)}\n`;

    const blob = new Blob([po], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `po_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleRowExpanded = (partNumber) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(partNumber)) {
      newExpanded.delete(partNumber);
    } else {
      newExpanded.add(partNumber);
    }
    setExpandedRows(newExpanded);
  };

  // Styles
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      backgroundColor: '#09090b',
      color: '#e4e4e7',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },

    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid #27272a',
      background: '#09090b',
      flexShrink: 0,
    },

    toolbarTitle: {
      fontSize: '13px',
      fontWeight: 600,
      color: '#e4e4e7',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },

    toolbarRight: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },

    toggle: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: '1px solid #27272a',
      backgroundColor: '#1a1a1f',
      color: '#a1a1aa',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 500,
      transition: 'all 0.15s',
    },

    toggleActive: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#0ea5e9',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 500,
    },

    btn: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#27272a',
      color: '#e4e4e7',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 500,
      transition: 'all 0.15s',
    },

    btnPrimary: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#10b981',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 500,
      transition: 'all 0.15s',
    },

    summaryBar: {
      padding: '8px 16px',
      backgroundColor: '#1a1a1f',
      borderBottom: '1px solid #27272a',
      fontSize: '12px',
      color: '#a1a1aa',
      display: 'flex',
      gap: '24px',
      flexWrap: 'wrap',
      flexShrink: 0,
    },

    summaryItem: {
      display: 'flex',
      gap: '6px',
    },

    summaryValue: {
      color: '#e4e4e7',
      fontWeight: 600,
    },

    scrapLegend: {
      display: 'flex',
      gap: '16px',
      padding: '6px 16px',
      fontSize: '11px',
      color: '#52525b',
      borderBottom: '1px solid #1a1a1f',
      flexShrink: 0,
      backgroundColor: '#09090b',
    },

    scrapDot: {
      display: 'inline-block',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      marginRight: '4px',
    },

    tableWrapper: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'auto',
    },

    table: {
      width: '100%',
      borderCollapse: 'collapse',
      backgroundColor: '#09090b',
      fontSize: '12px',
    },

    thead: {
      position: 'sticky',
      top: 0,
      backgroundColor: '#1a1a1f',
      borderBottom: '1px solid #27272a',
      zIndex: 10,
    },

    th: {
      padding: '8px 12px',
      textAlign: 'left',
      fontWeight: 600,
      color: '#e4e4e7',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'nowrap',
      borderRight: '1px solid #27272a',
      transition: 'background 0.15s',
    },

    thLast: {
      borderRight: 'none',
    },

    tbody: {
      display: 'table-row-group',
    },

    tr: {
      borderBottom: '1px solid #1a1a1f',
      height: '36px',
    },

    trAlt: {
      backgroundColor: '#080a0f',
    },

    trHighlight: {
      backgroundColor: 'rgba(239,68,68,0.05)',
    },

    td: {
      padding: '8px 12px',
      color: '#a1a1aa',
      whiteSpace: 'nowrap',
      borderRight: '1px solid #1a1a1f',
    },

    tdLast: {
      borderRight: 'none',
    },

    tdPartNumber: {
      fontFamily: 'monospace',
      color: '#e4e4e7',
      fontSize: '11px',
      letterSpacing: '0.02em',
    },

    tdRole: {
      fontSize: '10px',
      color: '#52525b',
      backgroundColor: '#1a1a1f',
      padding: '4px 8px',
      borderRadius: '3px',
      display: 'inline-block',
    },

    tdCost: {
      color: '#10b981',
      fontWeight: 600,
    },

    sourceRow: {
      backgroundColor: '#080a0f',
      fontSize: '11px',
      color: '#52525b',
      height: 'auto',
    },

    sourceCell: {
      paddingLeft: '32px',
      color: '#52525b',
      fontSize: '11px',
    },

    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#52525b',
    },

    emptyIcon: {
      fontSize: '32px',
      marginBottom: '12px',
    },

    emptyTitle: {
      fontSize: '14px',
      marginBottom: '6px',
    },

    emptySubtitle: {
      fontSize: '12px',
    },

    footer: {
      borderTop: '1px solid #27272a',
      padding: '12px 16px',
      background: '#09090b',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '24px',
      flexShrink: 0,
      fontSize: '12px',
      color: '#52525b',
    },

    footerValue: {
      color: '#e4e4e7',
      fontWeight: 600,
    },

    footerValueGreen: {
      color: '#10b981',
      fontWeight: 600,
    },

    expandIcon: {
      display: 'inline-block',
      marginRight: '4px',
      fontSize: '10px',
      userSelect: 'none',
    },
  };

  // Empty state
  if (sortedRows.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.toolbar}>
          <span style={styles.toolbarTitle}>METAL MATERIAL LIST</span>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⬡</div>
          <div style={styles.emptyTitle}>No aluminum data yet</div>
          <div style={styles.emptySubtitle}>Resolve BOMs on frames to populate this list</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarTitle}>METAL MATERIAL LIST</span>
        <div style={styles.toolbarRight}>
          <span style={{ fontSize: '11px', color: '#52525b' }}>Stock length:</span>
          <button
            onClick={() => setStockLengthFt(21)}
            style={stockLengthFt === 21 ? styles.toggleActive : styles.toggle}
          >
            21'
          </button>
          <button
            onClick={() => setStockLengthFt(24)}
            style={stockLengthFt === 24 ? styles.toggleActive : styles.toggle}
          >
            24'
          </button>
          <button onClick={exportCSV} style={styles.btn}>
            Export CSV
          </button>
          <button onClick={exportPO} style={styles.btnPrimary}>
            Export PO
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div style={styles.summaryBar}>
        <div style={styles.summaryItem}>
          <span>{summary.totalParts} part numbers</span>
        </div>
        <span style={{ color: '#27272a' }}>|</span>
        <div style={styles.summaryItem}>
          <span>
            {summary.totalLF.toFixed(1)} <strong style={styles.summaryValue}>LF</strong>
          </span>
        </div>
        <span style={{ color: '#27272a' }}>|</span>
        <div style={styles.summaryItem}>
          <span>
            {summary.totalLbs.toFixed(0)} <strong style={styles.summaryValue}>lbs</strong>
          </span>
        </div>
        <span style={{ color: '#27272a' }}>|</span>
        <div style={styles.summaryItem}>
          <span>Est. Material:</span>
          <span style={styles.summaryValue}>${summary.totalCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Scrap legend */}
      <div style={styles.scrapLegend}>
        <span>Scrap thresholds:</span>
        <span>
          <span style={{ ...styles.scrapDot, backgroundColor: scrapColors.green }} />
          &lt;8% (target)
        </span>
        <span>
          <span style={{ ...styles.scrapDot, backgroundColor: scrapColors.yellow }} />
          8–10% (review)
        </span>
        <span>
          <span style={{ ...styles.scrapDot, backgroundColor: scrapColors.red }} />
          &gt;10% (optimize cuts)
        </span>
      </div>

      {/* Main table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr style={styles.tr}>
              <th
                style={{
                  ...styles.th,
                  width: '60px',
                  cursor: 'pointer',
                  backgroundColor: sortBy === 'scrap' ? '#0ea5e9' : undefined,
                  color: sortBy === 'scrap' ? '#ffffff' : '#e4e4e7',
                }}
                onClick={() => setSortBy('scrap')}
              >
                Scrap %
              </th>
              <th
                style={{
                  ...styles.th,
                  width: '120px',
                  cursor: 'pointer',
                  backgroundColor: sortBy === 'part' ? '#0ea5e9' : undefined,
                  color: sortBy === 'part' ? '#ffffff' : '#e4e4e7',
                }}
                onClick={() => setSortBy('part')}
              >
                Part #
              </th>
              <th style={{ ...styles.th, width: '200px' }}>Description</th>
              <th
                style={{
                  ...styles.th,
                  width: '80px',
                  cursor: 'pointer',
                  backgroundColor: sortBy === 'role' ? '#0ea5e9' : undefined,
                  color: sortBy === 'role' ? '#ffffff' : '#e4e4e7',
                }}
                onClick={() => setSortBy('role')}
              >
                Role
              </th>
              <th style={{ ...styles.th, width: '80px' }}>Total LF</th>
              <th style={{ ...styles.th, width: '100px' }}>Bars @ {stockLengthFt}'</th>
              <th style={{ ...styles.th, width: '80px' }}>Lbs/LF</th>
              <th style={{ ...styles.th, width: '80px' }}>Total Lbs</th>
              <th style={{ ...styles.th, width: '70px' }}>$/Lb</th>
              <th style={{ ...styles.th, width: '70px' }}>Finish</th>
              <th style={{ ...styles.th, ...styles.thLast, width: '100px' }}>Ext Cost</th>
            </tr>
          </thead>
          <tbody style={styles.tbody}>
            {sortedRows.map((row, idx) => {
              const barOpt = computeBarOpt(row.totalLFNeeded, stockLengthFt);
              const totalLbs = row.totalLFNeeded * row.lbsPerFt;
              const extCost = totalLbs * row.listPrice * row.finishMultiplier;
              const isExpanded = expandedRows.has(row.partNumber);
              const rowBg = idx % 2 === 0 ? 'transparent' : styles.trAlt.backgroundColor;
              const finalBg =
                barOpt.scrapStatus === 'red'
                  ? 'rgba(239,68,68,0.05)'
                  : rowBg;

              return (
                <React.Fragment key={row.partNumber}>
                  <tr
                    style={{
                      ...styles.tr,
                      backgroundColor: finalBg,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleRowExpanded(row.partNumber)}
                  >
                    <td style={styles.td}>
                      <span style={{ color: scrapColors[barOpt.scrapStatus] }}>●</span>{' '}
                      {barOpt.scrapPercent.toFixed(1)}%
                    </td>
                    <td style={{ ...styles.td, ...styles.tdPartNumber }}>
                      <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                      {row.partNumber}
                    </td>
                    <td style={styles.td}>{row.description}</td>
                    <td style={styles.td}>
                      <span style={styles.tdRole}>{row.role}</span>
                    </td>
                    <td style={styles.td}>{row.totalLFNeeded.toFixed(2)} LF</td>
                    <td style={styles.td}>{barOpt.barsRequired} bars</td>
                    <td style={styles.td}>{row.lbsPerFt.toFixed(3)}</td>
                    <td style={styles.td}>{totalLbs.toFixed(1)}</td>
                    <td style={styles.td}>${row.listPrice.toFixed(2)}</td>
                    <td style={styles.td}>{row.finishMultiplier.toFixed(2)}×</td>
                    <td style={{ ...styles.td, ...styles.tdLast, ...styles.tdCost }}>
                      ${extCost.toFixed(2)}
                    </td>
                  </tr>

                  {/* Source rows (expanded) */}
                  {isExpanded &&
                    row.sources.map((source, sidx) => (
                      <tr
                        key={`${row.partNumber}-source-${sidx}`}
                        style={{
                          ...styles.sourceRow,
                          backgroundColor: finalBg,
                        }}
                      >
                        <td colSpan={3} style={{ ...styles.td, ...styles.sourceCell }}>
                          ↳ {source.frameMark}
                        </td>
                        <td style={styles.td}>{source.lf.toFixed(2)} LF</td>
                        <td colSpan={7} style={styles.td} />
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div>
          Total LF: <span style={styles.footerValue}>{summary.totalLF.toFixed(1)}</span>
        </div>
        <div>
          Total Lbs: <span style={styles.footerValue}>{summary.totalLbs.toFixed(0)}</span>
        </div>
        <div>
          Material Total:{' '}
          <span style={styles.footerValueGreen}>${summary.totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default MetalMaterialList;
