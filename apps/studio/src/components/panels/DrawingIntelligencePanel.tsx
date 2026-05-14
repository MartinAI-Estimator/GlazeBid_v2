/**
 * DrawingIntelligencePanel.tsx
 *
 * Right sidebar panel for the Drawing Intelligence feature.
 * Shows prescan results, scan progress, and candidate list.
 * Includes confidence / page / system-type filters and bulk actions
 * to reduce 300+ raw candidates to a reviewable shortlist.
 */

import React, { useState, useMemo } from 'react';
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
  hasPdf?: boolean;
}

type SortKey = 'confidence' | 'page' | 'system';

/**
 * Compute IoU (Intersection over Union) for two bounding boxes.
 */
function boxIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.width, b.x + b.width);
  const iy2 = Math.min(a.y + a.height, b.y + b.height);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Remove overlapping candidates on the same page, keeping higher confidence.
 * Two candidates overlap if IoU > threshold (default 0.60).
 */
function deduplicateCandidates<T extends CandidateWithReview>(
  candidates: T[],
  threshold = 0.60,
): T[] {
  // Sort by confidence descending so we always keep the best
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: T[] = [];
  for (const c of sorted) {
    const dominated = kept.some(
      k => k.pageNum === c.pageNum && boxIoU(k.bounding_box, c.bounding_box) > threshold,
    );
    if (!dominated) kept.push(c);
  }
  return kept;
}

/* ── tiny reusable pill toggle ──────────────────────────────── */
function FilterPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
        active
          ? 'bg-blue-100 border-blue-400 text-blue-700'
          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="ml-0.5 opacity-60">{count}</span>
      )}
    </button>
  );
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
      <div className="text-gray-500 mb-0.5">
        {candidate.system_hint !== 'unknown' ? candidate.system_hint : 'unknown system'} ·
        pg {candidate.pageNum + 1}
      </div>
      <div className="text-gray-600 font-mono text-[10px] mb-1">
        {candidate.width_inches > 0 && candidate.height_inches > 0
          ? `${(candidate.width_inches / 12).toFixed(1)}ft × ${(candidate.height_inches / 12).toFixed(1)}ft`
          : 'dimensions unknown'}
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
  hasPdf = false,
}: Props) {
  const isRunning = ['checking', 'prescanning', 'scanning'].includes(state.status);

  /* ── Filter state ─────────────────────────────────────────── */
  const [minConfidence, setMinConfidence] = useState(50);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('confidence');
  const [filtersOpen, setFiltersOpen] = useState(true);

  /* ── Derived: unique pages / systems from all candidates ──── */
  const uniquePages = useMemo(() => {
    const set = new Set(state.candidates.map(c => c.pageNum));
    return Array.from(set).sort((a, b) => a - b);
  }, [state.candidates]);

  const uniqueSystems = useMemo(() => {
    const set = new Set(state.candidates.map(c => c.system_hint || 'unknown'));
    return Array.from(set).sort();
  }, [state.candidates]);

  /* ── Filtered + sorted candidates ─────────────────────────── */
  const filtered = useMemo(() => {
    let list = state.candidates.filter(c => {
      if (c.confidence * 100 < minConfidence) return false;
      if (selectedPages.size > 0 && !selectedPages.has(c.pageNum)) return false;
      if (selectedSystems.size > 0 && !selectedSystems.has(c.system_hint || 'unknown')) return false;
      return true;
    });
    // Deduplicate overlapping candidates on the same page (>60% IoU)
    list = deduplicateCandidates(list);
    list.sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'page') return a.pageNum - b.pageNum || b.confidence - a.confidence;
      // system
      return (a.system_hint || '').localeCompare(b.system_hint || '') || b.confidence - a.confidence;
    });
    return list;
  }, [state.candidates, minConfidence, selectedPages, selectedSystems, sortBy]);

  const pending = filtered.filter(c => c.userStatus === 'pending');
  const confirmed = filtered.filter(c => c.userStatus === 'confirmed');
  const rejected = filtered.filter(c => c.userStatus === 'rejected');

  /* ── Summary stats ────────────────────────────────────────── */
  const totalCandidates = state.candidates.length;
  const tiers = useMemo(() => {
    const t = { high: 0, mid: 0, low: 0, reject: 0 };
    for (const c of state.candidates) {
      const pct = c.confidence * 100;
      if (pct >= 90) t.high++;
      else if (pct >= 70) t.mid++;
      else if (pct >= 50) t.low++;
      else t.reject++;
    }
    return t;
  }, [state.candidates]);

  /* ── Toggle helpers ───────────────────────────────────────── */
  const togglePage = (pg: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      next.has(pg) ? next.delete(pg) : next.add(pg);
      return next;
    });
  };
  const toggleSystem = (sys: string) => {
    setSelectedSystems(prev => {
      const next = new Set(prev);
      next.has(sys) ? next.delete(sys) : next.add(sys);
      return next;
    });
  };
  const clearFilters = () => {
    setMinConfidence(50);
    setSelectedPages(new Set());
    setSelectedSystems(new Set());
  };

  /* ── Bulk actions ─────────────────────────────────────────── */
  const confirmAllVisible = () => {
    for (const c of pending) onConfirm(c.candidate_id);
  };
  const rejectAllVisible = () => {
    for (const c of pending) onReject(c.candidate_id);
  };

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

      {/* Sidecar connected (idle with health) */}
      {state.status === 'idle' && state.health?.status === 'ok' && (
        <div className="p-3 text-xs text-green-600 bg-green-50 border-b">
          <div className="font-medium">AiQ Sidecar connected</div>
          <div className="text-green-500">v{state.health.version || '?'} · {state.health.layers?.length || 0} layers</div>
        </div>
      )}

      {/* Error / unavailable state */}
      {state.status === 'unavailable' && (
        <div className="p-3 text-xs text-red-600 bg-red-50 border-b">
          <div className="font-medium mb-1">Sidecar not running</div>
          <div className="text-red-500">{state.error}</div>
        </div>
      )}
      {state.status === 'error' && state.error && (
        <div className="p-3 text-xs text-red-600 bg-red-50 border-b">
          <div className="font-medium mb-1">Scan failed</div>
          <div className="text-red-500">{state.error}</div>
        </div>
      )}

      {/* Controls */}
      <div className="px-3 py-2 border-b">
        {!isRunning ? (
          <button
            onClick={onRunScan}
            disabled={state.status === 'unavailable' || !hasPdf}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs py-1.5 rounded font-medium"
          >
            {!hasPdf ? 'Load a PDF first' :
             state.status === 'idle' ? 'Scan Drawing Set' :
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

      {/* ── Summary stats ───────────────────────────────────── */}
      {totalCandidates > 0 && (
        <div className="px-3 py-2 border-b bg-gray-50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">
              {totalCandidates} detected
            </span>
            <span className="text-[10px] text-gray-400">
              showing {filtered.length}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">{tiers.high} high</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">{tiers.mid} mid</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{tiers.low} low</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">{tiers.reject} reject</span>
          </div>
        </div>
      )}

      {/* ── Filter toolbar ──────────────────────────────────── */}
      {totalCandidates > 0 && (
        <div className="border-b">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <span>Filters {filtered.length !== totalCandidates && `(${filtered.length}/${totalCandidates})`}</span>
            <span className="text-gray-400">{filtersOpen ? '▾' : '▸'}</span>
          </button>

          {filtersOpen && (
            <div className="px-3 pb-2 space-y-2">
              {/* Confidence slider */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500">Min confidence</span>
                  <span className="text-[10px] font-mono text-gray-700">{minConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={minConfidence}
                  onChange={e => setMinConfidence(Number(e.target.value))}
                  className="w-full h-1 accent-blue-600"
                />
              </div>

              {/* Page pills */}
              {uniquePages.length > 1 && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">Pages</div>
                  <div className="flex flex-wrap gap-0.5">
                    {uniquePages.map(pg => {
                      const pageCount = state.candidates.filter(c => c.pageNum === pg).length;
                      return (
                        <FilterPill
                          key={pg}
                          label={`${pg + 1}`}
                          active={selectedPages.has(pg)}
                          count={pageCount}
                          onClick={() => togglePage(pg)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* System type pills */}
              {uniqueSystems.length > 1 && (
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">System type</div>
                  <div className="flex flex-wrap gap-0.5">
                    {uniqueSystems.map(sys => {
                      const sysCount = state.candidates.filter(c => (c.system_hint || 'unknown') === sys).length;
                      return (
                        <FilterPill
                          key={sys}
                          label={sys}
                          active={selectedSystems.has(sys)}
                          count={sysCount}
                          onClick={() => toggleSystem(sys)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sort + clear */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Sort:</span>
                  {(['confidence', 'page', 'system'] as SortKey[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setSortBy(k)}
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        sortBy === k ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button onClick={clearFilters} className="text-[10px] text-gray-400 hover:text-gray-600 underline">
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bulk actions ────────────────────────────────────── */}
      {pending.length > 1 && (
        <div className="px-3 py-1.5 border-b flex gap-1">
          <button
            onClick={confirmAllVisible}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-[10px] py-1 rounded font-medium"
          >
            Confirm All ({pending.length})
          </button>
          <button
            onClick={rejectAllVisible}
            className="flex-1 bg-red-400 hover:bg-red-500 text-white text-[10px] py-1 rounded font-medium"
          >
            Reject All ({pending.length})
          </button>
        </div>
      )}

      {/* ── Candidate list ──────────────────────────────────── */}
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
        {filtered.length > 0 && totalCandidates > 0 && filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-4">
            No candidates match filters
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
          <div className="mb-2">
            <div className="text-xs font-medium text-blue-700 mb-1">
              Confirmed ({confirmed.length})
            </div>
            {confirmed.map(c => (
              <CandidateRow key={c.candidate_id} candidate={c} onConfirm={onConfirm} onReject={onReject} />
            ))}
          </div>
        )}
        {rejected.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-400 mb-1">
              Rejected ({rejected.length})
            </div>
            {rejected.map(c => (
              <CandidateRow key={c.candidate_id} candidate={c} onConfirm={onConfirm} onReject={onReject} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {state.status === 'complete' && (
        <div className="px-3 py-2 border-t bg-gray-50">
          <div className="text-xs text-gray-500 mb-1">
            {confirmed.length} confirmed · {pending.length} pending · {rejected.length} rejected
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
