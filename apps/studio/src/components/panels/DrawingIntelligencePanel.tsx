/**
 * DrawingIntelligencePanel.tsx
 *
 * Right sidebar panel for the Drawing Intelligence feature.
 * Shows prescan results, scan progress, and candidate list.
 * Follows the PropertiesPanel.tsx pattern for layout.
 */

import React from 'react';
import type {
  DrawingIntelligenceState,
  CandidateWithReview,
} from '../../hooks/useDrawingIntelligence';

interface Props {
  state: DrawingIntelligenceState;
  onRunScan: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onAbort: () => void;
  onReset: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-600',
    checking: 'bg-blue-100 text-blue-700',
    prescanning: 'bg-blue-100 text-blue-700',
    scanning: 'bg-amber-100 text-amber-700',
    complete: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    unavailable: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.idle}`}>
      {status}
    </span>
  );
}

function CandidateRow({
  candidate,
  onConfirm,
  onReject,
}: {
  candidate: CandidateWithReview;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isConfirmed = candidate.userStatus === 'confirmed';
  const isRejected = candidate.userStatus === 'rejected';

  return (
    <div className={`border rounded p-2 text-xs mb-1 ${
      isConfirmed ? 'border-blue-300 bg-blue-50' :
      isRejected  ? 'border-gray-200 bg-gray-50 opacity-50' :
                    'border-amber-300 bg-amber-50'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-gray-600 truncate" style={{ maxWidth: '120px' }}>
          {candidate.candidate_id.split('_').slice(-1)[0]}
        </span>
        <span className="font-bold text-gray-800">
          {(candidate.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-gray-500 mb-1">
        {candidate.system_hint !== 'unknown' ? candidate.system_hint : 'unknown system'} ·
        pg {candidate.pageNum + 1}
        {candidate.width_inches > 0 && (
          <span> · {candidate.width_inches.toFixed(0)}" × {candidate.height_inches.toFixed(0)}"</span>
        )}
      </div>
      {candidate.userStatus === 'pending' && (
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => onConfirm(candidate.candidate_id)}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-0.5 rounded"
          >
            ✓ Confirm
          </button>
          <button
            onClick={() => onReject(candidate.candidate_id)}
            className="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs py-0.5 rounded"
          >
            ✕ Reject
          </button>
        </div>
      )}
      {isConfirmed && (
        <div className="text-blue-600 font-medium text-xs">✓ Added to takeoff</div>
      )}
    </div>
  );
}

export function DrawingIntelligencePanel({
  state,
  onRunScan,
  onConfirm,
  onReject,
  onAbort,
  onReset,
}: Props) {
  const isRunning = ['checking', 'prescanning', 'scanning'].includes(state.status);
  const pending = state.candidates.filter(c => c.userStatus === 'pending');
  const confirmed = state.candidates.filter(c => c.userStatus === 'confirmed');

  return (
    <div className="flex flex-col h-full bg-white text-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-800 text-xs uppercase tracking-wide">
            Drawing Intelligence
          </div>
          <div className="text-xs text-gray-400">AiQ Glazing Detection</div>
        </div>
        <StatusBadge status={state.status} />
      </div>

      {/* Unavailable state */}
      {state.status === 'unavailable' && (
        <div className="p-3 text-xs text-red-600 bg-red-50 border-b">
          <div className="font-medium mb-1">Sidecar not running</div>
          <div className="text-red-500">{state.error}</div>
        </div>
      )}

      {/* Controls */}
      <div className="px-3 py-2 border-b">
        {!isRunning ? (
          <button
            onClick={onRunScan}
            disabled={state.status === 'unavailable'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs py-1.5 rounded font-medium"
          >
            {state.status === 'idle' ? 'Scan Drawing Set' :
             state.status === 'complete' ? 'Re-scan' : 'Scan Drawing Set'}
          </button>
        ) : (
          <button
            onClick={onAbort}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs py-1.5 rounded font-medium"
          >
            Stop Scanning
          </button>
        )}
      </div>

      {/* Progress */}
      {(isRunning || state.status === 'complete') && state.scanProgress.total > 0 && (
        <div className="px-3 py-2 border-b">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>
              {state.status === 'scanning' ? `Scanning page ${state.currentPage + 1}...` :
               state.status === 'prescanning' ? 'Pre-scanning...' :
               state.status === 'complete' ? 'Scan complete' : 'Checking...'}
            </span>
            <span>{state.scanProgress.completed}/{state.scanProgress.total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: state.scanProgress.total > 0
                  ? `${(state.scanProgress.completed / state.scanProgress.total) * 100}%`
                  : '0%'
              }}
            />
          </div>
        </div>
      )}

      {/* Prescan summary */}
      {state.prescan && (
        <div className="px-3 py-2 border-b bg-gray-50">
          <div className="text-xs font-medium text-gray-600 mb-1">Drawing Set</div>
          <div className="text-xs text-gray-500 grid grid-cols-3 gap-1">
            <div className="text-center">
              <div className="font-bold text-blue-700">{state.prescan.scan_pages.length}</div>
              <div>scan</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-600">{state.prescan.reference_pages.length}</div>
              <div>ref</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-400">{state.prescan.skip_pages.length}</div>
              <div>skip</div>
            </div>
          </div>
        </div>
      )}

      {/* Candidate list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {state.candidates.length === 0 && state.status !== 'idle' && (
          <div className="text-xs text-gray-400 text-center py-4">
            {isRunning ? 'Detecting glazing...' : 'No candidates found'}
          </div>
        )}
        {state.candidates.length === 0 && state.status === 'idle' && (
          <div className="text-xs text-gray-400 text-center py-4">
            Load a drawing set and click Scan
          </div>
        )}
        {pending.length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-medium text-amber-700 mb-1">
              Review Required ({pending.length})
            </div>
            {pending.map(c => (
              <CandidateRow key={c.candidate_id} candidate={c} onConfirm={onConfirm} onReject={onReject} />
            ))}
          </div>
        )}
        {confirmed.length > 0 && (
          <div>
            <div className="text-xs font-medium text-blue-700 mb-1">
              Confirmed ({confirmed.length})
            </div>
            {confirmed.map(c => (
              <CandidateRow key={c.candidate_id} candidate={c} onConfirm={onConfirm} onReject={onReject} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {state.status === 'complete' && (
        <div className="px-3 py-2 border-t bg-gray-50">
          <div className="text-xs text-gray-500 mb-1">
            {confirmed.length} confirmed · {pending.length} pending review
          </div>
          <button
            onClick={onReset}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear and reset
          </button>
        </div>
      )}
    </div>
  );
}
