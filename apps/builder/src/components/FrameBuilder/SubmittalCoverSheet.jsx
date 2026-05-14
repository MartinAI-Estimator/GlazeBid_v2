/**
 * SubmittalCoverSheet.jsx
 *
 * Professional submittal package cover sheet — formal document sent to architect/GC
 * for approval of product data and material selections.
 *
 * Data flows from useFrameBuilderStore (frames, groups, glassSpecs).
 * All project header fields are editable and stored in local state.
 * Tables auto-generated from frame and glass spec data.
 * Print-optimized with clean white-page styles.
 */

import React, { useState } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

export default function SubmittalCoverSheet() {
  const { frames, groups, glassSpecs } = useFrameBuilderStore();

  // ─── Local state for editable header fields ──────────────────────────────────
  const [projectName, setProjectName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [architectFirm, setArchitectFirm] = useState('');
  const [generalContractor, setGeneralContractor] = useState('');
  const [submittedBy, setSubmittedBy] = useState('GlazeBid Estimating');
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [specSection, setSpecSection] = useState('08 44 13');
  const [revisionNumber, setRevisionNumber] = useState(0);
  const [revisionDescription, setRevisionDescription] = useState('');

  const [checklist, setChecklist] = useState({
    productDataSheets: true,
    shopDrawings: true,
    glassSpecs: true,
    structuralCalcs: true,
    hardwareSchedules: true,
    testReports: true,
    warrantyDocs: true,
  });

  // ─── Helper: Build unique systems from frames ─────────────────────────────────
  const getSystemsSummary = () => {
    const systemMap = {};

    frames.forEach((frame) => {
      const group = groups.find((g) => g.groupId === frame.groupId);
      if (!group) return;

      const vendorSystemId = frame.vendorSystemId || group?.vendorSystemId || '';
      const archetypeId = group?.archetypeId || '';
      const key = `${vendorSystemId}|${archetypeId}`;

      if (!systemMap[key]) {
        systemMap[key] = {
          vendorSystemId,
          archetypeId,
          description: group?.name || 'Unknown',
          finish: frame.finishType || group?.finishType || 'Mill',
          frameCount: 0,
          totalGlassSF: 0,
        };
      }

      systemMap[key].frameCount += 1;

      // Sum glass SF if BOM is resolved
      if (frame.lastBOM?.totalGlassSqFt) {
        systemMap[key].totalGlassSF += frame.lastBOM.totalGlassSqFt;
      }
    });

    return Object.values(systemMap);
  };

  // ─── Helper: Get only glass specs that are actually used ──────────────────────
  const getUsedGlassSpecs = () => {
    const usedSpecIds = new Set();

    frames.forEach((frame) => {
      const specId = frame.glassSpecId || '';
      if (specId) usedSpecIds.add(specId);
    });

    return glassSpecs.filter((spec) => usedSpecIds.has(spec.specId));
  };

  // ─── Handler: Toggle checklist item ───────────────────────────────────────────
  const toggleChecklist = (key) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // ─── Handler: Print ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const systemsSummary = getSystemsSummary();
  const usedGlassSpecs = getUsedGlassSpecs();

  return (
    <div className="submittal-cover-sheet">
      <style>{`
        /* ═══════════════════════════════════════════════════════════════ */
        /* SCREEN VIEW STYLES (Dark Theme)                                */
        /* ═══════════════════════════════════════════════════════════════ */
        .submittal-cover-sheet {
          background: #09090b;
          color: #e4e4e7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 2rem;
          min-height: 100vh;
        }

        .submittal-container {
          max-width: 900px;
          margin: 0 auto;
          background: #18181b;
          border-radius: 0.5rem;
          box-shadow: 0 20px 25px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        /* ─── Header Section ─────────────────────────────────────────────── */
        .submittal-header {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          color: white;
          padding: 2rem;
          text-align: center;
        }

        .submittal-header h1 {
          margin: 0;
          font-size: 1.875rem;
          font-weight: 700;
          letter-spacing: -0.025em;
        }

        .submittal-header p {
          margin: 0.5rem 0 0 0;
          font-size: 0.875rem;
          opacity: 0.95;
        }

        /* ─── Content Area ───────────────────────────────────────────────── */
        .submittal-content {
          padding: 2rem;
        }

        /* ─── Form Grid (Project Header) ────────────────────────────────── */
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
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
          font-size: 0.75rem;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .form-group input,
        .form-group textarea {
          padding: 0.625rem;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          background: #09090b;
          color: #e4e4e7;
          font-size: 0.875rem;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.1);
        }

        .form-group textarea {
          resize: vertical;
          min-height: 60px;
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

        /* ─── Table Styles ───────────────────────────────────────────────── */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }

        .data-table thead {
          background: #27272a;
          border-bottom: 2px solid #3f3f46;
        }

        .data-table thead th {
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
        }

        .data-table tbody tr {
          border-bottom: 1px solid #3f3f46;
          transition: background-color 0.2s;
        }

        .data-table tbody tr:hover {
          background: rgba(14, 165, 233, 0.05);
        }

        .data-table tbody td {
          padding: 0.75rem;
          color: #e4e4e7;
        }

        /* ─── Badge Styles ───────────────────────────────────────────────── */
        .badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          border-radius: 0.25rem;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .badge.primary {
          background: #10b981;
          color: white;
        }

        .badge.secondary {
          background: #8b5cf6;
          color: white;
        }

        /* ─── Certification Block ────────────────────────────────────────── */
        .cert-block {
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          padding: 1.5rem;
          margin: 2rem 0;
          line-height: 1.6;
          font-size: 0.875rem;
        }

        .cert-signature-lines {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
          margin-top: 2rem;
        }

        .signature-line {
          padding-top: 2rem;
          border-top: 1px solid #3f3f46;
        }

        .signature-line label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          color: #a1a1a6;
          text-transform: uppercase;
          margin-top: 0.5rem;
        }

        /* ─── Checklist ──────────────────────────────────────────────────── */
        .checklist-container {
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 0.375rem;
          padding: 1.5rem;
          margin: 2rem 0;
        }

        .checklist-item {
          display: flex;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid #3f3f46;
        }

        .checklist-item:last-child {
          border-bottom: none;
        }

        .checklist-item input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          margin-right: 0.75rem;
          cursor: pointer;
          accent-color: #0ea5e9;
        }

        .checklist-item label {
          flex: 1;
          cursor: pointer;
          font-size: 0.875rem;
        }

        /* ─── Action Buttons ─────────────────────────────────────────────── */
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

        /* ═══════════════════════════════════════════════════════════════ */
        /* PRINT STYLES (White Page, Optimized)                          */
        /* ═══════════════════════════════════════════════════════════════ */
        @media print {
          * {
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }

          .submittal-cover-sheet {
            background: white;
            color: black;
            padding: 0;
          }

          .submittal-container {
            max-width: 100%;
            box-shadow: none;
            border-radius: 0;
            background: white;
          }

          .submittal-header {
            background: white;
            color: black;
            border-bottom: 3px solid #000;
            padding: 1.5rem;
          }

          .submittal-header h1 {
            color: black;
            margin-bottom: 0.25rem;
          }

          .submittal-header p {
            color: #555;
          }

          .submittal-content {
            padding: 1.5rem;
          }

          .form-grid {
            background: #f5f5f5;
            border: 1px solid #ccc;
          }

          .form-group input,
          .form-group textarea {
            background: white;
            color: black;
            border: 1px solid #999;
          }

          .data-table {
            border: 1px solid #000;
          }

          .data-table thead {
            background: #e0e0e0;
            border-bottom: 2px solid #000;
          }

          .data-table thead th {
            color: black;
          }

          .data-table tbody tr {
            border-bottom: 1px solid #ccc;
          }

          .data-table tbody td {
            color: black;
          }

          .badge {
            border: 1px solid black;
            background: #f5f5f5;
            color: black;
          }

          .cert-block {
            background: #f5f5f5;
            border: 1px solid #999;
          }

          .signature-line {
            border-top: 1px solid #000;
          }

          .checklist-container {
            background: #f5f5f5;
            border: 1px solid #999;
          }

          .checklist-item {
            border-bottom: 1px solid #ddd;
          }

          .button-group {
            display: none;
          }

          .section-title {
            color: black;
            border-bottom: 2px solid #000;
          }

          body {
            margin: 0;
            padding: 0.5in;
          }

          .submittal-header::after {
            content: '';
            display: block;
            height: 1rem;
          }
        }
      `}</style>

      <div className="submittal-container">
        {/* ────────────────────────────────────────────────────────────────── */}
        {/* HEADER */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <div className="submittal-header">
          <h1>SUBMITTAL COVER SHEET</h1>
          <p>Glazing Specifications & Product Data</p>
        </div>

        <div className="submittal-content">
          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 1: PROJECT HEADER (Editable) */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Project Information</div>
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
              <label>Project Number</label>
              <input
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                placeholder="Enter project number"
              />
            </div>

            <div className="form-group">
              <label>Architect / A&E Firm</label>
              <input
                type="text"
                value={architectFirm}
                onChange={(e) => setArchitectFirm(e.target.value)}
                placeholder="Enter architect firm name"
              />
            </div>

            <div className="form-group">
              <label>General Contractor</label>
              <input
                type="text"
                value={generalContractor}
                onChange={(e) => setGeneralContractor(e.target.value)}
                placeholder="Enter GC name"
              />
            </div>

            <div className="form-group">
              <label>Submitted By</label>
              <input
                type="text"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Submission Date</label>
              <input
                type="date"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Specification Section</label>
              <input
                type="text"
                value={specSection}
                onChange={(e) => setSpecSection(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Revision Number</label>
              <input
                type="number"
                value={revisionNumber}
                onChange={(e) => setRevisionNumber(parseInt(e.target.value, 10))}
                min="0"
              />
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Revision Description</label>
              <input
                type="text"
                value={revisionDescription}
                onChange={(e) => setRevisionDescription(e.target.value)}
                placeholder="Describe changes in this revision"
              />
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 2: SYSTEMS SUBMITTED */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Systems Submitted</div>
          {systemsSummary.length === 0 ? (
            <p style={{ color: '#a1a1a6', fontStyle: 'italic' }}>
              No frames configured. Add frames from the Frame Builder to populate systems.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>System No.</th>
                  <th>Description</th>
                  <th>Archetype</th>
                  <th>Vendor / Manufacturer</th>
                  <th>Finish</th>
                  <th>Approx SF</th>
                </tr>
              </thead>
              <tbody>
                {systemsSummary.map((system, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{system.description}</td>
                    <td>{system.archetypeId}</td>
                    <td>
                      {system.vendorSystemId}
                      {idx === 0 && (
                        <>
                          {' '}
                          <span className="badge primary">Basis of Design</span>
                        </>
                      )}
                      {idx > 0 && (
                        <>
                          {' '}
                          <span className="badge secondary">Approved Equal</span>
                        </>
                      )}
                    </td>
                    <td>{system.finish}</td>
                    <td>{system.totalGlassSF.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 3: GLASS SPECIFICATIONS */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Glass Specifications</div>
          {usedGlassSpecs.length === 0 ? (
            <p style={{ color: '#a1a1a6', fontStyle: 'italic' }}>
              No glass specifications assigned to frames.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Spec ID</th>
                  <th>Name</th>
                  <th>Makeup</th>
                  <th>U-Value</th>
                  <th>SHGC</th>
                  <th>Tempered</th>
                  <th>Laminate</th>
                </tr>
              </thead>
              <tbody>
                {usedGlassSpecs.map((spec) => (
                  <tr key={spec.specId}>
                    <td>{spec.specId}</td>
                    <td>{spec.name}</td>
                    <td>{spec.makeup}</td>
                    <td>{spec.uValue ?? '—'}</td>
                    <td>{spec.shgc ?? '—'}</td>
                    <td>{spec.isTempered ? 'Yes' : 'No'}</td>
                    <td>{spec.hasLaminate ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 4: CERTIFICATION BLOCK */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Certification</div>
          <div className="cert-block">
            <p>
              The undersigned hereby certifies that the materials submitted herein comply
              with the contract documents, Division 08 specifications, and applicable
              building codes for the above-referenced project.
            </p>

            <div className="cert-signature-lines">
              <div className="signature-line">
                <div style={{ height: '2rem' }} />
                <label>Signature</label>
              </div>
              <div className="signature-line">
                <div style={{ height: '2rem' }} />
                <label>Date</label>
              </div>
            </div>

            <div className="cert-signature-lines">
              <div className="signature-line">
                <div style={{ height: '1.5rem' }} />
                <label>Company</label>
              </div>
              <div className="signature-line">
                <div style={{ height: '1.5rem' }} />
                <label>Title</label>
              </div>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 5: DOCUMENT CHECKLIST */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="section-title">Documents Included</div>
          <div className="checklist-container">
            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_1"
                checked={checklist.productDataSheets}
                onChange={() => toggleChecklist('productDataSheets')}
              />
              <label htmlFor="check_1">Product Data Sheets</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_2"
                checked={checklist.shopDrawings}
                onChange={() => toggleChecklist('shopDrawings')}
              />
              <label htmlFor="check_2">Shop Drawings — Frame Elevations</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_3"
                checked={checklist.glassSpecs}
                onChange={() => toggleChecklist('glassSpecs')}
              />
              <label htmlFor="check_3">Glass Specifications</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_4"
                checked={checklist.structuralCalcs}
                onChange={() => toggleChecklist('structuralCalcs')}
              />
              <label htmlFor="check_4">Structural Calculations</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_5"
                checked={checklist.hardwareSchedules}
                onChange={() => toggleChecklist('hardwareSchedules')}
              />
              <label htmlFor="check_5">Hardware Schedules</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_6"
                checked={checklist.testReports}
                onChange={() => toggleChecklist('testReports')}
              />
              <label htmlFor="check_6">Test Reports (AAMA / ASTM)</label>
            </div>

            <div className="checklist-item">
              <input
                type="checkbox"
                id="check_7"
                checked={checklist.warrantyDocs}
                onChange={() => toggleChecklist('warrantyDocs')}
              />
              <label htmlFor="check_7">Warranty Documentation</label>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* ACTION BUTTONS */}
          {/* ──────────────────────────────────────────────────────────────── */}
          <div className="button-group">
            <button className="btn primary" onClick={handlePrint}>
              Print Submittal Package
            </button>
            <button
              className="btn secondary"
              onClick={handlePrint}
              title="Same as Print in browser"
            >
              Export PDF (Print)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
