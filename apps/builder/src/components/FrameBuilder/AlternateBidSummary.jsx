/**
 * AlternateBidSummary.jsx
 *
 * Customer-facing alternate bid summary — clean table showing base bid system vs.
 * approved alternates with pricing deltas. This is the "apples to apples" comparison
 * document sent to the GC.
 *
 * Data flows from useFrameBuilderStore (frames, groups).
 * All fields are fully editable and stored in local state.
 * Pricing auto-computes from BOM costs and deltas.
 * Print-optimized with green/red accent colors and professional layout.
 */

import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

export default function AlternateBidSummary() {
  const { frames, groups } = useFrameBuilderStore();

  // ─── Local state: Project header ──────────────────────────────────────────────
  const [projectName, setProjectName] = useState('');
  const [gcName, setGcName] = useState('');
  const [bidDate, setBidDate] = useState(new Date().toISOString().split('T')[0]);

  // ─── Local state: Unit rates (editable) ───────────────────────────────────────
  const [aluminumRatePerLF, setAluminumRatePerLF] = useState(8.5);
  const [glassRatePerSF, setGlassRatePerSF] = useState(28.0);
  const [laborRatePerHr, setLaborRatePerHr] = useState(95.0);
  const [baseBidMarkup, setBaseBidMarkup] = useState(1.15); // 15% markup

  // ─── Local state: Alternates ──────────────────────────────────────────────────
  const [alternates, setAlternates] = useState([]);

  // ─── Local state: Customer letter template ────────────────────────────────────
  const [letterTemplate, setLetterTemplate] = useState('');

  // ─── Helper: Compute base bid from all frames ─────────────────────────────────
  const baseBidData = useMemo(() => {
    let totalAluminumLF = 0;
    let totalGlassSF = 0;
    let totalLaborHours = 0;

    frames.forEach((frame) => {
      if (frame.lastBOM) {
        totalAluminumLF += frame.lastBOM.totalAluminumLF || 0;
        totalGlassSF += frame.lastBOM.totalGlassSqFt || 0;
        totalLaborHours += frame.lastBOM.totalLaborHours || 0;
      }
    });

    const materialCost = totalAluminumLF * aluminumRatePerLF + totalGlassSF * glassRatePerSF;
    const laborCost = totalLaborHours * laborRatePerHr;
    const baseBidTotal = materialCost + laborCost;
    const baseWithMarkup = baseBidTotal * baseBidMarkup;

    return {
      totalAluminumLF,
      totalGlassSF,
      totalLaborHours,
      materialCost,
      laborCost,
      baseBidTotal,
      baseWithMarkup,
    };
  }, [frames, aluminumRatePerLF, glassRatePerSF, laborRatePerHr, baseBidMarkup]);

  // ─── Handler: Add alternate ───────────────────────────────────────────────────
  const handleAddAlternate = () => {
    const newAlt = {
      altId: crypto.randomUUID(),
      label: `Alternate #${alternates.length + 1}`,
      description: '',
      vendorSystemId: '',
      deltaPercent: 0,
      isDeduct: false,
      notes: '',
    };
    setAlternates([...alternates, newAlt]);
  };

  // ─── Handler: Update alternate field ──────────────────────────────────────────
  const handleUpdateAlternate = (altId, field, value) => {
    setAlternates((prev) =>
      prev.map((alt) =>
        alt.altId === altId ? { ...alt, [field]: value } : alt
      )
    );
  };

  // ─── Handler: Remove alternate ────────────────────────────────────────────────
  const handleRemoveAlternate = (altId) => {
    setAlternates((prev) => prev.filter((alt) => alt.altId !== altId));
  };

  // ─── Helper: Compute alternate deltas ─────────────────────────────────────────
  const getAlternateTotal = (alt) => {
    const deltaAmount =
      (baseBidData.baseWithMarkup * alt.deltaPercent) / 100;
    return baseBidData.baseWithMarkup + deltaAmount;
  };

  // ─── Helper: Format currency ──────────────────────────────────────────────────
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // ─── Handler: Copy letter to clipboard ────────────────────────────────────────
  const handleCopyLetter = () => {
    navigator.clipboard.writeText(letterTemplate).then(() => {
      alert('Letter copied to clipboard');
    });
  };

  // ─── Handler: Export CSV ───────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ['Alternate Bid Summary', projectName].join(','),
      ['GC Name:', gcName].join(','),
      ['Bid Date:', bidDate].join(','),
      [''],
      ['#', 'Description', 'Basis', 'Add / Deduct', 'Delta ($)', 'Total w/ Alt'].join(','),
    ];

    alternates.forEach((alt, idx) => {
      const deltaAmount =
        (baseBidData.baseWithMarkup * alt.deltaPercent) / 100;
      const sign = alt.isDeduct ? '-' : '+';
      rows.push(
        [
          idx + 1,
          alt.description,
          alt.vendorSystemId,
          `${sign}${alt.deltaPercent.toFixed(1)}%`,
          formatCurrency(deltaAmount),
          formatCurrency(getAlternateTotal(alt)),
        ].join(',')
      );
    });

    rows.push(['']);
    rows.push(
      ['Base Bid (no alternates):', formatCurrency(baseBidData.baseWithMarkup)].join(',')
    );

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'alternate-bid-summary.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Handler: Print ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  // Initialize letter template on first render
  React.useEffect(() => {
    if (!letterTemplate) {
      setLetterTemplate(
        `${bidDate}

To: ${gcName}
Re: Glazing Bid — ${projectName}

We are pleased to submit our bid for the above-referenced project as follows:

BASE BID: ${formatCurrency(baseBidData.baseWithMarkup)}

ALTERNATES:
${alternates
  .map((alt, idx) => {
    const deltaAmount =
      (baseBidData.baseWithMarkup * alt.deltaPercent) / 100;
    const sign = alt.isDeduct ? 'DEDUCT' : 'ADD';
    return `  Alternate #${idx + 1}: ${sign} ${formatCurrency(Math.abs(deltaAmount))} — ${alt.description}`;
  })
  .join('\n')}

This bid is valid for 30 days from the date above.

Respectfully submitted,
GlazeBid Estimating`
      );
    }
  }, [bidDate, gcName, projectName, alternates, baseBidData]);

  return (
    <div className="alternate-bid-summary">
      <style>{`
        /* ═══════════════════════════════════════════════════════════════ */
        /* SCREEN VIEW STYLES (Dark Theme)                                */
        /* ═══════════════════════════════════════════════════════════════ */
        .alternate-bid-summary {
          background: #09090b;
          color: #e4e4e7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 2rem;
          min-height: 100vh;
        }

        .abs-container {
          max-width: 1000px;
          margin: 0 auto;
        }

        /* ─── Header ─────────────────────────────────────────────────────── */
        .abs-header {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          color: white;
          padding: 2rem;
          border-radius: 0.5rem 0.5rem 0 0;
          text-align: center;
        }

        .abs-header h1 {
          margin: 0;
          font-size: 1.875rem;
          font-weight: 700;
        }

        .abs-header p {
          margin: 0.5rem 0 0 0;
          font-size: 0.875rem;
          opacity: 0.95;
        }

        /* ─── Content Card ───────────────────────────────────────────────── */
        .abs-content {
          background: #18181b;
          padding: 2rem;
          border-radius: 0 0 0.5rem 0.5rem;
          box-shadow: 0 20px 25px rgba(0, 0, 0, 0.5);
        }

        /* ─── Form Grid ──────────────────────────────────────────────────── */
        .form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: #27272a;
          border-radius: 0.375rem;
          border: 1px solid #3f3f46;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          font-size: 0.7rem;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .form-group input {
          padding: 0.625rem;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          background: #09090b;
          color: #e4e4e7;
          font-size: 0.875rem;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
        }

        /* ─── Section Title ──────────────────────────────────────────────── */
        .section-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #e4e4e7;
          margin: 2rem 0 1rem 0;
          padding-bottom: 0.75rem;
          border-bottom: 2px solid #0ea5e9;
        }

        /* ─── Card Container ─────────────────────────────────────────────── */
        .card {
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          padding: 1.5rem;
          margin: 1rem 0;
        }

        /* ─── Base Bid Card ──────────────────────────────────────────────── */
        .base-bid-card {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .bid-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid #3f3f46;
        }

        .bid-item:last-child {
          border-bottom: none;
        }

        .bid-label {
          font-size: 0.875rem;
          color: #a1a1a6;
        }

        .bid-value {
          font-weight: 600;
          color: #e4e4e7;
        }

        .base-bid-total {
          grid-column: 1 / -1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #0ea5e9;
          border-radius: 0.375rem;
          margin-top: 1rem;
        }

        .base-bid-total .bid-label {
          color: white;
          font-weight: 600;
          font-size: 1rem;
        }

        .base-bid-total .bid-value {
          color: white;
          font-size: 1.5rem;
          font-weight: 700;
        }

        /* ─── Unit Rate Editor ───────────────────────────────────────────── */
        .unit-rate-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #3f3f46;
        }

        .unit-rate-field {
          display: flex;
          flex-direction: column;
        }

        .unit-rate-field label {
          font-size: 0.65rem;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.4rem;
        }

        .unit-rate-field input {
          padding: 0.5rem;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          background: #09090b;
          color: #e4e4e7;
          font-size: 0.8rem;
          font-family: 'Courier New', monospace;
        }

        /* ─── Alternates Table ───────────────────────────────────────────── */
        .alternates-table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }

        .alternates-table thead {
          background: #27272a;
          border-bottom: 2px solid #3f3f46;
        }

        .alternates-table thead th {
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          font-size: 0.7rem;
          letter-spacing: 0.05em;
        }

        .alternates-table tbody tr {
          border-bottom: 1px solid #3f3f46;
        }

        .alternates-table tbody td {
          padding: 0.75rem;
          color: #e4e4e7;
        }

        /* ─── Edit Fields in Table ───────────────────────────────────────── */
        .alt-input {
          padding: 0.375rem 0.5rem;
          border: 1px solid #3f3f46;
          border-radius: 0.25rem;
          background: #09090b;
          color: #e4e4e7;
          font-size: 0.875rem;
          font-family: inherit;
          width: 100%;
          box-sizing: border-box;
        }

        .alt-input:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.2);
        }

        /* ─── Delta Colors ───────────────────────────────────────────────── */
        .delta-add {
          color: #10b981;
          font-weight: 600;
        }

        .delta-deduct {
          color: #ef4444;
          font-weight: 600;
        }

        /* ─── Action Buttons in Table ────────────────────────────────────── */
        .alt-delete-btn {
          background: #dc2626;
          color: white;
          border: none;
          padding: 0.375rem 0.75rem;
          border-radius: 0.25rem;
          font-size: 0.7rem;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.2s;
        }

        .alt-delete-btn:hover {
          background: #991b1b;
        }

        /* ─── Summary Info ───────────────────────────────────────────────── */
        .summary-info {
          display: flex;
          gap: 2rem;
          margin: 2rem 0;
          flex-wrap: wrap;
        }

        .info-block {
          flex: 1;
          min-width: 200px;
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          padding: 1.5rem;
          text-align: center;
        }

        .info-label {
          font-size: 0.75rem;
          color: #a1a1a6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .info-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #e4e4e7;
        }

        /* ─── Letter Template ────────────────────────────────────────────── */
        .letter-section {
          margin: 2rem 0;
        }

        .letter-textarea {
          width: 100%;
          min-height: 300px;
          padding: 1rem;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          background: #09090b;
          color: #e4e4e7;
          font-family: 'Courier New', monospace;
          font-size: 0.875rem;
          resize: vertical;
        }

        .letter-textarea:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
        }

        /* ─── Buttons ────────────────────────────────────────────────────── */
        .button-group {
          display: flex;
          gap: 1rem;
          margin: 2rem 0;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.625rem 1.25rem;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .btn.primary {
          background: #0ea5e9;
          color: white;
        }

        .btn.primary:hover {
          background: #0284c7;
          transform: translateY(-1px);
        }

        .btn.secondary {
          background: #27272a;
          color: #e4e4e7;
          border: 1px solid #3f3f46;
        }

        .btn.secondary:hover {
          background: #3f3f46;
        }

        .btn.success {
          background: #10b981;
          color: white;
        }

        .btn.success:hover {
          background: #059669;
        }

        /* ─── Add Alternate Button ───────────────────────────────────────── */
        .add-alt-btn {
          background: #10b981;
          color: white;
          border: none;
          padding: 0.625rem 1.25rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 1rem;
        }

        .add-alt-btn:hover {
          background: #059669;
        }

        /* ═══════════════════════════════════════════════════════════════ */
        /* PRINT STYLES (White Page, Optimized)                          */
        /* ═══════════════════════════════════════════════════════════════ */
        @media print {
          * {
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }

          .alternate-bid-summary {
            background: white;
            color: black;
            padding: 0;
          }

          .abs-header {
            background: white;
            color: black;
            border-bottom: 3px solid #000;
            padding: 1rem;
          }

          .abs-header h1 {
            color: black;
          }

          .abs-content {
            background: white;
            box-shadow: none;
            border-radius: 0;
          }

          .form-grid {
            background: #f5f5f5;
            border: 1px solid #999;
          }

          .form-group input {
            background: white;
            color: black;
            border: 1px solid #999;
          }

          .card {
            background: #f5f5f5;
            border: 1px solid #999;
          }

          .bid-item {
            border-bottom: 1px solid #ddd;
          }

          .base-bid-total {
            background: #e0e0e0;
            border: 1px solid #999;
          }

          .base-bid-total .bid-label,
          .base-bid-total .bid-value {
            color: black;
          }

          .unit-rate-grid {
            border-top: 1px solid #ddd;
          }

          .unit-rate-field input {
            background: white;
            color: black;
            border: 1px solid #999;
          }

          .alternates-table {
            border: 1px solid #000;
          }

          .alternates-table thead {
            background: #e0e0e0;
            border-bottom: 2px solid #000;
          }

          .alternates-table thead th {
            color: black;
          }

          .alternates-table tbody td {
            color: black;
            border-bottom: 1px solid #ccc;
          }

          .alt-input {
            background: white;
            color: black;
            border: 1px solid #999;
          }

          .delta-add,
          .delta-deduct {
            color: black;
          }

          .alt-delete-btn {
            display: none;
          }

          .summary-info {
            display: none;
          }

          .section-title {
            color: black;
            border-bottom: 2px solid #000;
          }

          .button-group {
            display: none;
          }

          .letter-section {
            display: none;
          }

          body {
            margin: 0;
            padding: 0.5in;
          }
        }
      `}</style>

      <div className="abs-container">
        {/* ────────────────────────────────────────────────────────────────── */}
        {/* HEADER */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <div className="abs-header">
          <h1>ALTERNATE BID SUMMARY</h1>
          <p>Customer-Facing Pricing Comparison</p>
        </div>

        <div className="abs-content">
          {/* ──────────────────────────────────────────────────────────────── */}
          {/* PROJECT HEADER */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="form-grid">
            <div className="form-group">
              <label>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>

            <div className="form-group">
              <label>GC Name</label>
              <input
                type="text"
                value={gcName}
                onChange={(e) => setGcName(e.target.value)}
                placeholder="Enter GC name"
              />
            </div>

            <div className="form-group">
              <label>Bid Date</label>
              <input
                type="date"
                value={bidDate}
                onChange={(e) => setBidDate(e.target.value)}
              />
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* BASE BID SUMMARY CARD */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Base Bid Summary</div>
          <div className="card">
            <div className="base-bid-card">
              <div className="bid-item">
                <span className="bid-label">Total Aluminum (LF)</span>
                <span className="bid-value">
                  {baseBidData.totalAluminumLF.toFixed(1)}
                </span>
              </div>

              <div className="bid-item">
                <span className="bid-label">Total Glass (SF)</span>
                <span className="bid-value">
                  {baseBidData.totalGlassSF.toFixed(1)}
                </span>
              </div>

              <div className="bid-item">
                <span className="bid-label">Total Labor (Hrs)</span>
                <span className="bid-value">
                  {baseBidData.totalLaborHours.toFixed(1)}
                </span>
              </div>

              <div className="bid-item">
                <span className="bid-label">Material Cost</span>
                <span className="bid-value">
                  {formatCurrency(baseBidData.materialCost)}
                </span>
              </div>

              <div className="bid-item">
                <span className="bid-label">Labor Cost</span>
                <span className="bid-value">
                  {formatCurrency(baseBidData.laborCost)}
                </span>
              </div>

              <div className="bid-item">
                <span className="bid-label">Base Bid Total</span>
                <span className="bid-value">
                  {formatCurrency(baseBidData.baseBidTotal)}
                </span>
              </div>

              <div className="base-bid-total">
                <span className="bid-label">
                  BASE BID PRICE (w/ {((baseBidMarkup - 1) * 100).toFixed(0)}% Markup)
                </span>
                <span className="bid-value">
                  {formatCurrency(baseBidData.baseWithMarkup)}
                </span>
              </div>
            </div>

            {/* ─── Unit Rate Editor ─────────────────────────────────────────── */}
            <div className="unit-rate-grid">
              <div className="unit-rate-field">
                <label>Aluminum Rate ($/LF)</label>
                <input
                  type="number"
                  step="0.1"
                  value={aluminumRatePerLF}
                  onChange={(e) => setAluminumRatePerLF(parseFloat(e.target.value))}
                />
              </div>

              <div className="unit-rate-field">
                <label>Glass Rate ($/SF)</label>
                <input
                  type="number"
                  step="0.1"
                  value={glassRatePerSF}
                  onChange={(e) => setGlassRatePerSF(parseFloat(e.target.value))}
                />
              </div>

              <div className="unit-rate-field">
                <label>Labor Rate ($/Hr)</label>
                <input
                  type="number"
                  step="0.1"
                  value={laborRatePerHr}
                  onChange={(e) => setLaborRatePerHr(parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                paddingTop: '1rem',
                borderTop: '1px solid #3f3f46',
              }}
            >
              <label style={{ fontSize: '0.75rem', color: '#a1a1a6' }}>
                Markup Multiplier
              </label>
              <input
                type="number"
                step="0.01"
                value={baseBidMarkup}
                onChange={(e) => setBaseBidMarkup(parseFloat(e.target.value))}
                style={{
                  padding: '0.5rem',
                  marginTop: '0.4rem',
                  border: '1px solid #3f3f46',
                  borderRadius: '0.375rem',
                  background: '#09090b',
                  color: '#e4e4e7',
                  fontSize: '0.875rem',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '0.75rem', color: '#a1a1a6', marginTop: '0.5rem' }}>
                {((baseBidMarkup - 1) * 100).toFixed(1)}% markup
              </div>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* ALTERNATES TABLE */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Alternates</div>

          {alternates.length === 0 ? (
            <p style={{ color: '#a1a1a6', fontStyle: 'italic', margin: '1rem 0' }}>
              No alternates added yet. Click "+ Add Alternate" to create one.
            </p>
          ) : (
            <table className="alternates-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Basis / System</th>
                  <th>Add / Deduct (%)</th>
                  <th>Delta ($)</th>
                  <th>Total w/ Alt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alternates.map((alt, idx) => {
                  const deltaAmount =
                    (baseBidData.baseWithMarkup * alt.deltaPercent) / 100;
                  const sign = alt.isDeduct ? '-' : '+';
                  return (
                    <tr key={alt.altId}>
                      <td>{idx + 1}</td>
                      <td>
                        <input
                          type="text"
                          className="alt-input"
                          value={alt.description}
                          onChange={(e) =>
                            handleUpdateAlternate(alt.altId, 'description', e.target.value)
                          }
                          placeholder="Describe this alternate"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="alt-input"
                          value={alt.vendorSystemId}
                          onChange={(e) =>
                            handleUpdateAlternate(alt.altId, 'vendorSystemId', e.target.value)
                          }
                          placeholder="Vendor / System"
                        />
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="number"
                            className="alt-input"
                            style={{ flex: 1 }}
                            step="0.1"
                            value={alt.deltaPercent}
                            onChange={(e) =>
                              handleUpdateAlternate(
                                alt.altId,
                                'deltaPercent',
                                parseFloat(e.target.value)
                              )
                            }
                          />
                          <input
                            type="checkbox"
                            checked={alt.isDeduct}
                            onChange={(e) =>
                              handleUpdateAlternate(alt.altId, 'isDeduct', e.target.checked)
                            }
                            title="Check if this is a deduction"
                            style={{
                              width: '1.2rem',
                              height: '1.2rem',
                              cursor: 'pointer',
                              accentColor: '#ef4444',
                            }}
                          />
                        </div>
                      </td>
                      <td
                        className={
                          alt.isDeduct ? 'delta-deduct' : 'delta-add'
                        }
                      >
                        {sign}
                        {formatCurrency(Math.abs(deltaAmount))}
                      </td>
                      <td>
                        {formatCurrency(getAlternateTotal(alt))}
                      </td>
                      <td>
                        <button
                          className="alt-delete-btn"
                          onClick={() => handleRemoveAlternate(alt.altId)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <button className="add-alt-btn" onClick={handleAddAlternate}>
            + Add Alternate
          </button>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SUMMARY INFO ────────────────────────────────────────────────────── */}
          {/* ──────────────────────────────────────────────────────────────── */}
          {alternates.length > 0 && (
            <div className="summary-info">
              <div className="info-block">
                <div className="info-label">Base Bid (No Alternates)</div>
                <div className="info-value">
                  {formatCurrency(baseBidData.baseWithMarkup)}
                </div>
              </div>

              <div className="info-block">
                <div className="info-label">If All Alternates Accepted</div>
                <div className="info-value">
                  {formatCurrency(
                    baseBidData.baseWithMarkup +
                      alternates.reduce((sum, alt) => {
                        const deltaAmount =
                          (baseBidData.baseWithMarkup * alt.deltaPercent) / 100;
                        return sum + deltaAmount;
                      }, 0)
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* CUSTOMER LETTER TEMPLATE */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="letter-section">
            <div className="section-title">Customer Letter Template</div>
            <textarea
              className="letter-textarea"
              value={letterTemplate}
              onChange={(e) => setLetterTemplate(e.target.value)}
            />
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* ACTION BUTTONS */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="button-group">
            <button className="btn primary" onClick={handlePrint}>
              Print / Export PDF
            </button>
            <button className="btn success" onClick={handleExportCSV}>
              Export CSV
            </button>
            <button className="btn secondary" onClick={handleCopyLetter}>
              Copy Letter to Clipboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
