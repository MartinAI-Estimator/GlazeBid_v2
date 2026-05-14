import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const BidUnitPriceCalc = () => {
  const { frames } = useFrameBuilderStore();

  const [laborRate, setLaborRate] = useState(85);
  const [markup, setMarkup] = useState(20);
  const [overhead, setOverhead] = useState(10);

  // Aggregate frames by system class
  const byClass = useMemo(() => {
    const aggregated = {};

    frames.forEach((frame) => {
      if (!frame.lastBOM) return;

      const cls = frame.systemClass || 'ext-storefront';
      if (!aggregated[cls]) {
        aggregated[cls] = {
          frames: [],
          totalSF: 0,
          totalLF: 0,
          totalMaterialCost: 0,
          totalLaborHrs: 0,
        };
      }

      const glassSF =
        frame.lastBOM.glassSchedule?.reduce((s, g) => s + (g.sqft || 0) * (g.quantity || 1), 0) ||
        0;
      const alumLF =
        frame.lastBOM.bomLines?.reduce((s, b) => s + (b.totalLF || 0), 0) || 0;
      const materialCost =
        frame.lastBOM.bomLines?.reduce((s, b) => s + (b.extCost || 0), 0) || 0;
      const laborHrs = frame.lastBOM.labor
        ? (frame.lastBOM.labor.shopHours || 0) +
          (frame.lastBOM.labor.distHours || 0) +
          (frame.lastBOM.labor.fieldHours || 0)
        : 0;

      aggregated[cls].frames.push(frame);
      aggregated[cls].totalSF += glassSF * (frame.quantity || 1);
      aggregated[cls].totalLF += alumLF * (frame.quantity || 1);
      aggregated[cls].totalMaterialCost += materialCost * (frame.quantity || 1);
      aggregated[cls].totalLaborHrs += laborHrs * (frame.quantity || 1);
    });

    return aggregated;
  }, [frames]);

  // Compute unit prices for each system class
  const unitPrices = useMemo(() => {
    const prices = {};

    Object.entries(byClass).forEach(([cls, data]) => {
      const materialWithMarkup = data.totalMaterialCost * (1 + markup / 100);
      const laborCost = data.totalLaborHrs * laborRate;
      const totalWithOverhead = (materialWithMarkup + laborCost) * (1 + overhead / 100);
      const perSF = data.totalSF > 0 ? totalWithOverhead / data.totalSF : 0;
      const perLF = data.totalLF > 0 ? totalWithOverhead / data.totalLF : 0;

      prices[cls] = {
        materialWithMarkup,
        laborCost,
        totalWithOverhead,
        perSF,
        perLF,
      };
    });

    return prices;
  }, [byClass, laborRate, markup, overhead]);

  const hasData = Object.keys(byClass).length > 0;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Bid Unit Price Calculator</h3>

      {/* Input Controls */}
      <div style={styles.inputSection}>
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Labor Rate ($/hr)</label>
          <input
            type="number"
            min="0"
            step="5"
            value={laborRate}
            onChange={(e) => setLaborRate(parseFloat(e.target.value) || 0)}
            style={styles.input}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Markup on Material (%)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={markup}
            onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
            style={styles.input}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Overhead (%)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={overhead}
            onChange={(e) => setOverhead(parseFloat(e.target.value) || 0)}
            style={styles.input}
          />
        </div>
      </div>

      {/* Unit Price Cards */}
      {!hasData ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No frames with BOM data available.</p>
          <p style={styles.emptySubtext}>Generate BOMs for frames to see unit prices.</p>
        </div>
      ) : (
        <div style={styles.cardsContainer}>
          {Object.entries(byClass).map(([cls, data]) => {
            const prices = unitPrices[cls];

            return (
              <div key={cls} style={styles.card}>
                <h4 style={styles.cardTitle}>{cls}</h4>

                <div style={styles.cardContent}>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Total Glass SF</span>
                    <span style={styles.statValue}>{data.totalSF.toFixed(1)}</span>
                  </div>

                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Total Alum LF</span>
                    <span style={styles.statValue}>{data.totalLF.toFixed(1)}</span>
                  </div>

                  <div style={styles.divider}></div>

                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Material Cost</span>
                    <span style={styles.statValue}>
                      ${prices.materialWithMarkup.toFixed(2)}
                    </span>
                  </div>

                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Labor Cost</span>
                    <span style={styles.statValue}>${prices.laborCost.toFixed(2)}</span>
                  </div>

                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Total (with Overhead)</span>
                    <span style={styles.statValue}>${prices.totalWithOverhead.toFixed(2)}</span>
                  </div>

                  <div style={styles.divider}></div>

                  <div style={styles.unitPriceSF}>
                    <span style={styles.unitPriceLabel}>Price per SF</span>
                    <span style={styles.unitPriceValue}>${prices.perSF.toFixed(2)}</span>
                  </div>

                  <div style={styles.unitPriceLF}>
                    <span style={styles.unitPriceLabel}>Price per LF</span>
                    <span style={styles.unitPriceValue}>${prices.perLF.toFixed(2)}</span>
                  </div>

                  <p style={styles.cardNote}>
                    These are preliminary unit prices based on current BOM. Verify against final
                    vendor quotes.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
  },

  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0,
  },

  inputSection: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    borderBottom: '1px solid #27272a',
    paddingBottom: '12px',
  },

  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '120px',
  },

  inputLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  input: {
    padding: '6px 8px',
    fontSize: '12px',
    border: '1px solid #27272a',
    borderRadius: '4px',
    backgroundColor: '#18181b',
    color: '#e4e4e7',
    fontFamily: 'inherit',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    borderRadius: '4px',
    backgroundColor: '#1a1a1f',
  },

  emptyText: {
    fontSize: '13px',
    color: '#e4e4e7',
    textAlign: 'center',
    margin: '0 0 6px 0',
  },

  emptySubtext: {
    fontSize: '12px',
    color: '#52525b',
    textAlign: 'center',
    margin: 0,
  },

  cardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '16px',
  },

  card: {
    borderRadius: '4px',
    border: '1px solid #27272a',
    backgroundColor: '#111113',
    overflow: 'hidden',
  },

  cardTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    backgroundColor: '#1a1a1f',
    padding: '10px 12px',
    margin: 0,
    borderBottom: '1px solid #27272a',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    padding: '12px',
  },

  stat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '8px',
    fontSize: '12px',
  },

  statLabel: {
    color: '#a1a1aa',
  },

  statValue: {
    color: '#e4e4e7',
    fontWeight: 500,
  },

  divider: {
    height: '1px',
    backgroundColor: '#27272a',
    margin: '8px 0',
  },

  unitPriceSF: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderTop: '1px solid #27272a',
    borderBottom: '1px solid #27272a',
    marginBottom: '8px',
  },

  unitPriceLF: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    marginBottom: '8px',
  },

  unitPriceLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#a1a1aa',
  },

  unitPriceValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#10b981',
  },

  cardNote: {
    fontSize: '10px',
    color: '#52525b',
    margin: '8px 0 0 0',
    fontStyle: 'italic',
    lineHeight: '1.4',
  },
};

export default BidUnitPriceCalc;
