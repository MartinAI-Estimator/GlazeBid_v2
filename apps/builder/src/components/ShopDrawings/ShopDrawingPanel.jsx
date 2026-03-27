/**
 * ShopDrawingPanel.jsx
 *
 * UI panel that lives inside the Builder app.
 * Reads all frames from useBidStore, collects project metadata,
 * and triggers shop drawing PDF generation via generateShopDrawings().
 *
 * Route: accessible from the Builder sidebar nav.
 * Place this component anywhere in the Builder routing tree.
 */

import React, { useState } from 'react';
import useBidStore from '../../store/useBidStore';
import { generateShopDrawings } from './shopDrawingGenerator';

// ─── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    idle:       'bg-zinc-700 text-zinc-300',
    generating: 'bg-blue-600 text-white animate-pulse',
    success:    'bg-emerald-600 text-white',
    error:      'bg-red-600 text-white',
  };
  const labels = {
    idle:       'Ready',
    generating: 'Generating...',
    success:    'Complete',
    error:      'Error',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Frame preview row ────────────────────────────────────────────────────────

function FrameRow({ frame, index }) {
  const w = frame.inputs?.width || 0;
  const h = frame.inputs?.height || 0;
  const wFt = (w / 12).toFixed(2);
  const hFt = (h / 12).toFixed(2);

  return (
    <tr className="border-b border-zinc-700 hover:bg-zinc-800 transition-colors">
      <td className="px-3 py-2 text-sm text-zinc-300 font-mono">
        {frame.elevationTag || `F-${index + 1}`}
      </td>
      <td className="px-3 py-2 text-sm text-zinc-300">
        {frame.systemType || '—'}
      </td>
      <td className="px-3 py-2 text-sm text-zinc-400 font-mono">
        {wFt}′ × {hFt}′
      </td>
      <td className="px-3 py-2 text-sm text-zinc-400">
        {(frame.bom?.totalGlassSqFt || 0).toFixed(1)} SF
      </td>
      <td className="px-3 py-2 text-sm text-zinc-400">
        {(frame.bom?.totalAluminumLF || 0).toFixed(1)} LF
      </td>
      <td className="px-3 py-2 text-sm text-emerald-400">
        {frame.bom?.glassLitesCount || 0} lites
      </td>
    </tr>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function ShopDrawingPanel() {
  const frames = useBidStore(s => s.frames);

  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastPdfUrl, setLastPdfUrl] = useState(null);

  const [meta, setMeta] = useState({
    projectName: '',
    client: '',
    address: '',
    contractor: '',
  });

  const handleMetaChange = (field, value) => {
    setMeta(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!frames || frames.length === 0) {
      setErrorMsg('No frames in the bid. Add frames in the Bid Sheet first.');
      setStatus('error');
      return;
    }

    setStatus('generating');
    setErrorMsg('');

    try {
      // Run in next tick so UI updates before heavy computation
      await new Promise(resolve => setTimeout(resolve, 50));

      const blob = generateShopDrawings(frames, meta);

      // Revoke previous URL to avoid memory leak
      if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);

      const url = URL.createObjectURL(blob);
      setLastPdfUrl(url);
      setStatus('success');

      // Auto-download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meta.projectName || 'GlazeBid'}_ShopDrawings_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

    } catch (err) {
      console.error('Shop drawing generation failed:', err);
      setErrorMsg(err.message || 'Unknown error during generation.');
      setStatus('error');
    }
  };

  const totalGlassSF = frames.reduce((s, f) => s + (f.bom?.totalGlassSqFt || 0), 0);
  const totalAlumLF  = frames.reduce((s, f) => s + (f.bom?.totalAluminumLF  || 0), 0);
  const totalSheets  = frames.length + 3; // cover + elevations + glass sched + cut list

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Shop Drawing Generator
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Generate a submittal-ready PDF set from your current bid frames.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* ── Left column: Project Metadata + Generate button ── */}
        <div className="col-span-1 space-y-4">

          {/* Project info card */}
          <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wide">
              Project Info
            </h2>
            {[
              { field: 'projectName', label: 'Project Name', placeholder: 'Acme Office Building' },
              { field: 'client',      label: 'Client / Owner', placeholder: 'Acme Corp' },
              { field: 'address',     label: 'Project Address', placeholder: '123 Main St, Denver CO' },
              { field: 'contractor',  label: 'Glazing Contractor', placeholder: 'Your Company Name' },
            ].map(({ field, label, placeholder }) => (
              <div key={field} className="mb-3">
                <label className="block text-xs text-zinc-400 mb-1">{label}</label>
                <input
                  type="text"
                  value={meta[field]}
                  onChange={e => handleMetaChange(field, e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2
                             text-sm text-zinc-100 placeholder-zinc-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>

          {/* Scope summary card */}
          <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wide">
              Scope Summary
            </h2>
            <div className="space-y-2">
              {[
                { label: 'Total Frames',    value: frames.length },
                { label: 'Total Sheets',    value: totalSheets },
                { label: 'Total Glass SF',  value: `${totalGlassSF.toFixed(1)} SF` },
                { label: 'Total Alum LF',   value: `${totalAlumLF.toFixed(1)} LF` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">{label}</span>
                  <span className="text-sm font-mono text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={status === 'generating' || frames.length === 0}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all
                       bg-blue-600 hover:bg-blue-500 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {status === 'generating'
              ? 'Generating PDF...'
              : `Generate Shop Drawings (${totalSheets} sheets)`}
          </button>

          {/* View PDF button (after generation) */}
          {status === 'success' && lastPdfUrl && (
            <a
              href={lastPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 px-4 rounded-xl font-semibold text-sm text-center
                         bg-emerald-700 hover:bg-emerald-600 text-white transition-all"
            >
              View PDF in Browser
            </a>
          )}

          {/* Error message */}
          {status === 'error' && errorMsg && (
            <div className="bg-red-900/40 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{errorMsg}</p>
            </div>
          )}

          {/* Success message */}
          {status === 'success' && (
            <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-3">
              <p className="text-xs text-emerald-300">
                PDF generated and downloaded successfully.
                {totalSheets} sheets — FOR COORDINATION ONLY.
              </p>
            </div>
          )}
        </div>

        {/* ── Right columns: Frame table ── */}
        <div className="col-span-2">
          <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
                Frames in Current Bid ({frames.length})
              </h2>
            </div>

            {frames.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                No frames found. Add frames in the Bid Sheet to generate shop drawings.
              </div>
            ) : (
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-left">
                  <thead className="bg-zinc-750 sticky top-0">
                    <tr className="border-b border-zinc-600">
                      {['Elev Tag', 'System', 'Dimensions', 'Glass SF', 'Alum LF', 'Lites'].map(h => (
                        <th key={h} className="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {frames.map((frame, i) => (
                      <FrameRow key={frame.frameId || i} frame={frame} index={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sheet breakdown */}
          {frames.length > 0 && (
            <div className="mt-4 bg-zinc-800 rounded-xl border border-zinc-700 p-4">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
                Sheet Breakdown
              </h2>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>G-001 — Cover Sheet / Scope Summary</span>
                  <span className="text-zinc-500">1 sheet</span>
                </div>
                {frames.map((frame, i) => (
                  <div key={i} className="flex justify-between text-xs text-zinc-400">
                    <span>A-{String(i + 1).padStart(3, '0')} — Elevation: {frame.elevationTag || `F-${i + 1}`}</span>
                    <span className="text-zinc-500">1 sheet</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>GS-001 — Glass Schedule</span>
                  <span className="text-zinc-500">1+ sheets</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>CL-001 — Aluminum Cut List</span>
                  <span className="text-zinc-500">1+ sheets</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
