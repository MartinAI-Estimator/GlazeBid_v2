import { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { calibrateFromLine } from '../../engine/coordinateSystem';

// ── Standard architectural / engineering scales ───────────────────────────────
// ratio = how many real-world inches one paper-inch represents.
// E.g. 1/4" = 1'-0"  →  1 paper inch = 4 feet = 48 real inches  →  ratio = 48
const STANDARD_SCALES: { label: string; ratio: number }[] = [
  // Architectural
  { label: 'Full Size (1:1)',         ratio: 1 },
  { label: 'Half Size (1:2)',         ratio: 2 },
  { label: '3" = 1\'-0"',            ratio: 4 },
  { label: '1-1/2" = 1\'-0"',        ratio: 8 },
  { label: '1" = 1\'-0"',            ratio: 12 },
  { label: '3/4" = 1\'-0"',          ratio: 16 },
  { label: '1/2" = 1\'-0"',          ratio: 24 },
  { label: '3/8" = 1\'-0"',          ratio: 32 },
  { label: '1/4" = 1\'-0"',          ratio: 48 },
  { label: '3/16" = 1\'-0"',         ratio: 64 },
  { label: '1/8" = 1\'-0"',          ratio: 96 },
  { label: '3/32" = 1\'-0"',         ratio: 128 },
  { label: '1/16" = 1\'-0"',         ratio: 192 },
  // Engineering
  { label: '1" = 10\'',              ratio: 120 },
  { label: '1" = 20\'',              ratio: 240 },
  { label: '1" = 30\'',              ratio: 360 },
  { label: '1" = 40\'',              ratio: 480 },
  { label: '1" = 50\'',              ratio: 600 },
  { label: '1" = 60\'',              ratio: 720 },
  { label: '1" = 100\'',             ratio: 1200 },
];

/** PDF base resolution — standard PDF coordinate unit. */
const PDF_PPI = 72;

/**
 * CalibrationModal
 *
 * Shown when the user finishes drawing a calibration line (Calibrate tool).
 * Two modes:
 *   • Standard Scale — pick from a dropdown; PPI is computed from the known ratio.
 *   • Custom — enter a real-world length for the drawn line (original behaviour).
 */
export default function CalibrationModal() {
  const pending       = useStudioStore(s => s.pendingCalibrationLine);
  const activePageId  = useStudioStore(s => s.activePageId);
  const setCalibration = useStudioStore(s => s.setCalibration);
  const setPending     = useStudioStore(s => s.setPendingCalibrationLine);
  const setActiveTool  = useStudioStore(s => s.setActiveTool);

  const [mode,       setMode]       = useState<'standard' | 'custom'>('standard');
  const [scaleIdx,   setScaleIdx]   = useState<number>(-1);   // index into STANDARD_SCALES
  const [inputValue, setInputValue] = useState('');
  const [error,      setError]      = useState('');

  if (!pending) return null;

  // ── Derived values for the "standard" path ──────────────────────────────
  const selectedScale = scaleIdx >= 0 ? STANDARD_SCALES[scaleIdx] : null;
  // pixelsPerInch when using a standard scale:  PDF_PPI / ratio
  const standardPPI  = selectedScale ? PDF_PPI / selectedScale.ratio : null;
  // What the drawn line would measure at the selected scale (for feedback):
  const impliedInches = standardPPI ? pending.distPx / standardPPI : null;

  const formatLength = (inches: number) => {
    const ft  = Math.floor(inches / 12);
    const rem = inches % 12;
    if (ft === 0) return `${rem.toFixed(2)}″`;
    return `${ft}'-${rem.toFixed(2)}″`;
  };

  // ── Confirm ─────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (mode === 'standard') {
      if (!selectedScale) { setError('Select a scale from the list.'); return; }
      const cal = calibrateFromLine(
        pending.start, pending.end,
        pending.distPx / (PDF_PPI / selectedScale.ratio),   // known inches
        activePageId,
      );
      setCalibration(cal);
    } else {
      const inches = parseFloat(inputValue);
      if (isNaN(inches) || inches <= 0) {
        setError('Enter a positive number of inches.');
        return;
      }
      const cal = calibrateFromLine(pending.start, pending.end, inches, activePageId);
      setCalibration(cal);
    }
    setPending(null);
    setInputValue('');
    setScaleIdx(-1);
    setError('');
    setActiveTool('select');
  };

  const handleCancel = () => {
    setPending(null);
    setInputValue('');
    setScaleIdx(-1);
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    /* Overlay */
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Set Scale Calibration</h3>
            <p className="text-[11px] text-slate-500">Active page will use this measurement.</p>
          </div>
        </div>

        {/* Reference line info */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">
          <p className="text-[11px] text-slate-400">
            Reference line drawn:{' '}
            <span className="font-mono text-slate-200">{pending.distPx.toFixed(1)} px</span>
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-slate-800 border border-slate-700 p-0.5 mb-4">
          <button
            onClick={() => { setMode('standard'); setError(''); }}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'standard'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Standard Scale
          </button>
          <button
            onClick={() => { setMode('custom'); setError(''); }}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'custom'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Custom
          </button>
        </div>

        {/* ── Standard Scale ──────────────────────────────────────────────── */}
        {mode === 'standard' && (
          <>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Select plan scale
            </label>
            <select
              value={scaleIdx}
              onChange={e => { setScaleIdx(Number(e.target.value)); setError(''); }}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value={-1} disabled>— Choose a scale —</option>
              <optgroup label="Architectural">
                {STANDARD_SCALES.slice(0, 13).map((s, i) => (
                  <option key={i} value={i}>{s.label}</option>
                ))}
              </optgroup>
              <optgroup label="Engineering">
                {STANDARD_SCALES.slice(13).map((s, i) => (
                  <option key={i + 13} value={i + 13}>{s.label}</option>
                ))}
              </optgroup>
            </select>

            {/* Feedback: implied measurement of the drawn line */}
            {impliedInches != null && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <p className="text-[11px] text-slate-400">
                  Drawn line at this scale ≈{' '}
                  <span className="font-mono text-amber-300">{formatLength(impliedInches)}</span>
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Custom ──────────────────────────────────────────────────────── */}
        {mode === 'custom' && (
          <>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Real-world length of this line (inches)
            </label>
            <input
              autoFocus
              type="number"
              min="0.01"
              step="any"
              placeholder='e.g. 36 for a 3-foot door header'
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-800 border border-slate-700 focus:border-brand-500 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </>
        )}

        {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={handleConfirm}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            Apply Calibration
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
