import React, { useState, useMemo } from 'react';
import { Download, FileUp } from 'lucide-react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import useAllGlassStore from '../../store/useAllGlassStore';

const GlassTakeoutSheet = () => {
  const { frames } = useFrameBuilderStore();
  const { walls } = useAllGlassStore();
  const [priceInputs, setPriceInputs] = useState({}); // { mark: pricePerSqFt } for framed, { 'ag-{panelId}': price } for all-glass
  const [edgeWorkOverrides, setEdgeWorkOverrides] = useState({}); // { mark: 'polished' | 'seamed' | 'arrised' }
  const [groupBySize, setGroupBySize] = useState(true);

  // ─── Data Aggregation ─────────────────────────────────────────────────────

  /**
   * Collect all glass rows from framed frames
   */
  const framedGlass = useMemo(() => {
    return frames
      .flatMap((f) => {
        const bom = f.lastBOM;
        if (!bom || !bom.glassSchedule || bom.glassSchedule.length === 0) return [];
        return bom.glassSchedule.map((row) => ({
          source: 'framed',
          frameId: f.frameId,
          frameMark: f.mark || '',
          mark: row.mark,
          widthInches: row.widthInches || 0,
          heightInches: row.heightInches || 0,
          shape: row.shape || 'rectangular',
          glassSpecId: row.glassSpecId || 'GL-1',
          quantity: row.quantity || 1,
          sqft: row.sqft || 0,
          isTempered: row.isTempered || false,
          isSpandrel: row.isSpandrel || false,
          edgeWork: edgeWorkOverrides[row.mark] || row.edgeWork || 'seamed',
          pricePerSqFt: priceInputs[row.mark] || null,
          extCost: priceInputs[row.mark]
            ? (row.sqft || 0) * (row.quantity || 1) * priceInputs[row.mark]
            : null,
        }));
      });
  }, [frames, priceInputs, edgeWorkOverrides]);

  /**
   * Collect all-glass wall panels
   */
  const agGlass = useMemo(() => {
    return walls
      .flatMap((w) => {
        const bom = w.lastBOM;
        if (!bom || !bom.glassPanels || bom.glassPanels.length === 0) return [];
        return bom.glassPanels.map((p) => {
          const panelKey = `ag-${p.panelId || p.id || ''}`;
          return {
            source: 'all-glass',
            wallId: w.wallId,
            frameMark: w.mark || '',
            mark: `${w.mark || 'AG'}-P${(p.panelId || p.id || '').slice(-4) || ''}`,
            widthInches: p.widthInches || 0,
            heightInches: p.heightInches || 0,
            shape: 'rectangular',
            glassSpecId: w.glassSpecId || 'GL-1',
            quantity: p.quantity || 1,
            sqft: p.sqft || 0,
            isTempered: p.isTempered || false,
            isSpandrel: false,
            isDoor: p.isDoor || false,
            edgeWork: edgeWorkOverrides[panelKey] || p.edgeWork || 'polished',
            pricePerSqFt: priceInputs[panelKey] || null,
            extCost: priceInputs[panelKey]
              ? (p.sqft || 0) * (p.quantity || 1) * priceInputs[panelKey]
              : null,
          };
        });
      });
  }, [walls, priceInputs, edgeWorkOverrides]);

  const allGlass = [...framedGlass, ...agGlass];

  // ─── Grouping Logic ─────────────────────────────────────────────────────

  /**
   * Group by size: same W × H × spec = same group
   * Returns array of { key, rows, groupLabel }
   */
  const groupedGlass = useMemo(() => {
    if (!groupBySize) {
      return allGlass.map((row, idx) => ({
        key: `ungrouped-${idx}`,
        rows: [row],
        groupLabel: row.mark,
      }));
    }

    const groups = new Map(); // key: "W×H×spec" -> rows[]

    allGlass.forEach((row) => {
      const key = `${row.widthInches.toFixed(4)}×${row.heightInches.toFixed(4)}×${row.glassSpecId}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });

    const result = [];
    groups.forEach((rows, key) => {
      const firstRow = rows[0];
      const marks = rows.map((r) => r.mark).join(', ');
      const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
      const groupLabel = `${totalQty}x ${marks} ${firstRow.widthInches.toFixed(1)}"×${firstRow.heightInches.toFixed(1)}"`;
      result.push({ key, rows, groupLabel });
    });

    return result;
  }, [allGlass, groupBySize]);

  // ─── Summary Calculations ─────────────────────────────────────────────────

  const totalLites = allGlass.reduce((sum, r) => sum + r.quantity, 0);
  const totalSF = allGlass.reduce((sum, r) => sum + (r.sqft * r.quantity), 0);
  const temperedLites = allGlass
    .filter((r) => r.isTempered)
    .reduce((sum, r) => sum + r.quantity, 0);
  const totalCost = allGlass.reduce((sum, r) => sum + (r.extCost || 0), 0);

  // ─── Unique Glass Specs ──────────────────────────────────────────────────

  const uniqueSpecs = useMemo(() => {
    const specs = new Set(allGlass.map((r) => r.glassSpecId).filter(Boolean));
    return Array.from(specs).sort();
  }, [allGlass]);

  // ─── Event Handlers ──────────────────────────────────────────────────────

  /**
   * Apply a price to all rows matching a glassSpecId
   */
  const applyPriceToSpec = (specId, price) => {
    const updates = { ...priceInputs };

    // For framed glass: find all rows with this spec and set their price
    framedGlass.forEach((row) => {
      if (row.glassSpecId === specId) {
        updates[row.mark] = isNaN(price) ? null : price;
      }
    });

    // For all-glass: find all rows with this spec and set their price
    agGlass.forEach((row) => {
      if (row.glassSpecId === specId) {
        const panelKey = `ag-${row.wallId}`;
        updates[panelKey] = isNaN(price) ? null : price;
      }
    });

    setPriceInputs(updates);
  };

  /**
   * Update price for a single row mark
   */
  const handlePriceChange = (mark, value) => {
    const price = isNaN(parseFloat(value)) ? null : parseFloat(value);
    setPriceInputs((prev) => ({
      ...prev,
      [mark]: price,
    }));
  };

  /**
   * Update edge work for a single row mark
   */
  const handleEdgeWorkChange = (mark, edgeWork) => {
    setEdgeWorkOverrides((prev) => ({
      ...prev,
      [mark]: edgeWork,
    }));
  };

  /**
   * Export glass list as CSV
   */
  const exportCSV = () => {
    const headers = [
      'Mark',
      'Width (in)',
      'Height (in)',
      'Shape',
      'Glass Spec',
      'Qty',
      'SF',
      'Tempered',
      'Edge Work',
      '$/SF',
      'Ext Cost',
    ];
    const rows = allGlass.map((r) => [
      r.mark,
      r.widthInches.toFixed(4),
      r.heightInches.toFixed(4),
      r.shape,
      r.glassSpecId,
      r.quantity,
      (r.sqft * r.quantity).toFixed(2),
      r.isTempered ? 'T' : '',
      r.edgeWork,
      r.pricePerSqFt?.toFixed(2) || '',
      r.extCost?.toFixed(2) || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glass_rfq.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Styles ──────────────────────────────────────────────────────────────

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      backgroundColor: '#0f1117',
      overflow: 'hidden',
    },

    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid #27272a',
      backgroundColor: '#09090b',
      flexShrink: 0,
    },

    toolbarTitle: {
      fontSize: '13px',
      fontWeight: 600,
      color: '#e4e4e7',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },

    toolbarButtons: {
      display: 'flex',
      gap: '8px',
    },

    btn: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: '1px solid #27272a',
      backgroundColor: '#18181b',
      color: '#a1a1aa',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500,
      transition: 'background 0.15s, color 0.15s',
    },

    btnActive: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: '1px solid #0ea5e9',
      backgroundColor: '#0ea5e9',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500,
      transition: 'background 0.15s, color 0.15s',
    },

    btnPrimary: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#0ea5e9',
      color: '#ffffff',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'opacity 0.15s',
    },

    summaryBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      padding: '12px 16px',
      borderBottom: '1px solid #27272a',
      backgroundColor: '#0f1117',
      fontSize: '12px',
      color: '#e4e4e7',
      flexShrink: 0,
    },

    tableContainer: {
      flex: 1,
      overflow: 'auto',
      backgroundColor: '#0f1117',
    },

    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '12px',
    },

    th: {
      textAlign: 'left',
      padding: '7px 10px',
      fontSize: '10px',
      color: '#52525b',
      textTransform: 'uppercase',
      borderBottom: '1px solid #27272a',
      backgroundColor: '#0f1117',
      position: 'sticky',
      top: 0,
      zIndex: 1,
      fontWeight: 600,
      letterSpacing: '0.05em',
    },

    td: {
      padding: '6px 10px',
      borderBottom: '1px solid #1a1a1f',
      color: '#e4e4e7',
      verticalAlign: 'middle',
    },

    badge: {
      display: 'inline-block',
      padding: '2px 6px',
      borderRadius: '3px',
      fontSize: '10px',
      fontWeight: 600,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    },

    badgeFramed: {
      backgroundColor: '#0ea5e9',
      color: '#ffffff',
    },

    badgeAG: {
      backgroundColor: '#fb923c',
      color: '#ffffff',
    },

    badgeTempered: {
      backgroundColor: '#ef4444',
      color: '#ffffff',
    },

    inputPricePerSF: {
      width: '72px',
      background: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '4px',
      color: '#e4e4e7',
      padding: '4px 6px',
      fontSize: '12px',
    },

    selectEdgeWork: {
      background: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '4px',
      color: '#e4e4e7',
      padding: '4px 6px',
      fontSize: '12px',
      cursor: 'pointer',
    },

    extCostCell: {
      color: '#e4e4e7',
      fontWeight: 500,
    },

    extCostCellMuted: {
      color: '#52525b',
      fontSize: '11px',
    },

    quickPriceSection: {
      background: '#0f1117',
      borderTop: '1px solid #27272a',
      padding: '12px 16px',
      display: 'flex',
      gap: '16px',
      flexWrap: 'wrap',
      alignItems: 'center',
      flexShrink: 0,
    },

    quickPriceLabel: {
      fontSize: '12px',
      color: '#a1a1aa',
      alignSelf: 'center',
    },

    quickPriceGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },

    quickPriceSpecLabel: {
      fontSize: '11px',
      color: '#52525b',
    },

    quickPriceInput: {
      width: '72px',
      background: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '4px',
      color: '#e4e4e7',
      padding: '4px 6px',
      fontSize: '12px',
    },

    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#52525b',
    },

    emptyStateIcon: {
      fontSize: '32px',
      marginBottom: '12px',
    },

    emptyStateTitle: {
      fontSize: '14px',
      marginBottom: '6px',
      color: '#e4e4e7',
    },

    emptyStateSubtitle: {
      fontSize: '12px',
      color: '#52525b',
    },
  };

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (allGlass.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.toolbar}>
          <span style={styles.toolbarTitle}>Glass Takeout Sheet</span>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>🪟</div>
          <div style={styles.emptyStateTitle}>No glass data yet</div>
          <div style={styles.emptyStateSubtitle}>
            Build frames in the Framed Systems tab to populate this sheet
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarTitle}>Glass Takeout Sheet</span>
        <div style={styles.toolbarButtons}>
          <button
            onClick={() => setGroupBySize(!groupBySize)}
            style={groupBySize ? styles.btnActive : styles.btn}
          >
            Group by Size
          </button>
          <button onClick={exportCSV} style={styles.btnPrimary}>
            <Download size={14} />
            Export RFQ CSV
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div style={styles.summaryBar}>
        <span>{totalLites} lites</span>
        <span>|</span>
        <span>{totalSF.toFixed(1)} SF total</span>
        <span>|</span>
        <span>{temperedLites} tempered</span>
        <span>|</span>
        <span>
          Est. Cost: {totalCost > 0 ? `$${totalCost.toFixed(2)}` : 'TBD'}
        </span>
      </div>

      {/* Glass Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Source</th>
              <th style={styles.th}>Frame</th>
              <th style={styles.th}>Mark</th>
              <th style={styles.th}>W × H</th>
              <th style={styles.th}>Spec</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>SF</th>
              <th style={styles.th}>T</th>
              <th style={styles.th}>Edge Work</th>
              <th style={styles.th}>$/SF</th>
              <th style={styles.th}>Ext Cost</th>
            </tr>
          </thead>
          <tbody>
            {groupedGlass.map((group, groupIdx) => {
              const firstRow = group.rows[0];
              const isEven = groupIdx % 2 === 0;
              const rowBgColor = isEven ? '#111113' : '#0f1117';

              return (
                <React.Fragment key={group.key}>
                  {group.rows.map((row, rowIdx) => {
                    const rowKey = `${group.key}-${rowIdx}`;
                    const isFirstInGroup = rowIdx === 0;
                    const rowMark = row.source === 'framed' ? row.mark : `ag-${row.wallId}`;

                    return (
                      <tr
                        key={rowKey}
                        style={{ backgroundColor: rowBgColor }}
                      >
                        {/* Source Badge */}
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.badge,
                              ...(row.source === 'framed'
                                ? styles.badgeFramed
                                : styles.badgeAG),
                            }}
                          >
                            {row.source === 'framed' ? 'FRMD' : 'AG'}
                          </span>
                        </td>

                        {/* Frame */}
                        <td style={styles.td}>{row.frameMark}</td>

                        {/* Mark */}
                        <td style={styles.td}>{row.mark}</td>

                        {/* W × H */}
                        <td style={styles.td}>
                          {row.widthInches.toFixed(1)}" × {row.heightInches.toFixed(1)}"
                        </td>

                        {/* Spec */}
                        <td style={styles.td}>{row.glassSpecId}</td>

                        {/* Qty */}
                        <td style={styles.td}>{row.quantity}</td>

                        {/* SF */}
                        <td style={styles.td}>
                          {(row.sqft * row.quantity).toFixed(2)}
                        </td>

                        {/* Tempered Badge */}
                        <td style={styles.td}>
                          {row.isTempered && (
                            <span
                              style={{
                                ...styles.badge,
                                ...styles.badgeTempered,
                              }}
                            >
                              T
                            </span>
                          )}
                        </td>

                        {/* Edge Work Select */}
                        <td style={styles.td}>
                          <select
                            value={edgeWorkOverrides[rowMark] || row.edgeWork}
                            onChange={(e) =>
                              handleEdgeWorkChange(rowMark, e.target.value)
                            }
                            style={styles.selectEdgeWork}
                          >
                            <option value="polished">Polished</option>
                            <option value="seamed">Seamed</option>
                            <option value="arrised">Arrised</option>
                          </select>
                        </td>

                        {/* $/SF Input */}
                        <td style={styles.td}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={priceInputs[rowMark] ?? ''}
                            onChange={(e) =>
                              handlePriceChange(rowMark, e.target.value)
                            }
                            style={styles.inputPricePerSF}
                          />
                        </td>

                        {/* Ext Cost */}
                        <td
                          style={{
                            ...styles.td,
                            ...(row.extCost ? styles.extCostCell : styles.extCostCellMuted),
                          }}
                        >
                          {row.extCost
                            ? `$${row.extCost.toFixed(2)}`
                            : 'TBD'}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick Price Section */}
      <div style={styles.quickPriceSection}>
        <span style={styles.quickPriceLabel}>Quick Price:</span>
        {uniqueSpecs.length > 0 ? (
          uniqueSpecs.map((specId) => (
            <div key={specId} style={styles.quickPriceGroup}>
              <label style={styles.quickPriceSpecLabel}>{specId}</label>
              <span style={styles.quickPriceSpecLabel}>$/SF</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                onChange={(e) =>
                  applyPriceToSpec(specId, parseFloat(e.target.value))
                }
                style={styles.quickPriceInput}
              />
            </div>
          ))
        ) : (
          <span style={styles.quickPriceSpecLabel}>
            No glass specs available
          </span>
        )}
      </div>
    </div>
  );
};

export default GlassTakeoutSheet;
