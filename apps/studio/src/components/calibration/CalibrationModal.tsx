import { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { calibrateFromLine } from '../../engine/coordinateSystem';

/**
 * CalibrationModal
 *
 * Shown when the user finishes drawing a calibration line (Calibrate tool).
 * The user enters the known real-world length; the engine computes
 * pixelsPerInch = distPx / knownInches and stores it for the active page.
 */
export default function CalibrationModal() {
  const pending       = useStudioStore(s => s.pendingCalibrationLine);
  const activePageId  = useStudioStore(s => s.activePageId);
  const setCalibration = useStudioStore(s => s.setCalibration);
  const setPending     = useStudioStore(s => s.setPendingCalibrationLine);
  const setActiveTool  = useStudioStore(s => s.setActiveTool);

  const [inputValue, setInputValue] = useState('');
  const [error,      setError]      = useState('');

  if (!pending) return null;

  const handleConfirm = () => {
    const inches = parseFloat(inputValue);
    if (isNaN(inches) || inches <= 0) {
      setError('Enter a positive number of inches.');
      return;
    }
    const cal = calibrateFromLine(pending.start, pending.end, inches, activePageId);
    setCalibration(cal);
    setPending(null);
    setInputValue('');
    setError('');
    setActiveTool('select');
  };

  const handleCancel = () => {
    setPending(null);
    setInputValue('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    /* Overlay */
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6">
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

        {/* Input */}
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
