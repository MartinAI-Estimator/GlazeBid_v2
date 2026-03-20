/**
 * BulkClassifyDialog.tsx
 *
 * Phase 6.2 — Review dialog shown after an AI Auto-Scan completes.
 *
 * ── What it shows ────────────────────────────────────────────────────────────
 * • Total detections and cluster count.
 * • A row per geometric cluster (shapes with ≥ 92 % bbox similarity grouped
 *   together).  Singleton shapes get their own row.
 * • Each row shows: shape count, suggested type label, confidence badge,
 *   and an Accept / Skip toggle.
 * • Actions: "Apply Selected" (commits accepted shapes) and "Dismiss".
 *
 * ── Wiring ───────────────────────────────────────────────────────────────────
 * Rendered by StudioLayout when scan results are available.
 * Calls `onCommit(accepted)` → useAIAutoScan.commitScanResults().
 * Calls `onDismiss()` → StudioLayout clears scanResults state.
 */

import { useState, useMemo }           from 'react';
import { ConfidenceBadge }             from './ConfidenceBadge';
import type { ScanResult }             from '../../hooks/useAIAutoScan';
import type { GlazingSystemType }      from '../../hooks/useFallbackIntelligence';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  results:   ScanResult[];
  onCommit:  (accepted: ScanResult[]) => void;
  onDismiss: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<GlazingSystemType, string> = {
  door:         'Door',
  window:       'Window',
  storefront:   'Storefront',
  curtain_wall: 'Curtain Wall',
  entrance:     'Entrance',
};

/**
 * Group scan results into display rows:
 * - All shapes sharing the same clusterId → one row
 * - Shapes with no cluster (singletons) → one row each
 */
function groupResults(results: ScanResult[]): Array<{
  rowKey:       string;
  items:        ScanResult[];
  clusterId:    string | null;
  suggestedType: GlazingSystemType | null;
  confidence:   number;
  action:       ScanResult['suggestion'] extends null ? never : NonNullable<ScanResult['suggestion']>['action'];
  badgeColor:   NonNullable<ScanResult['suggestion']>['badgeColor'];
}> {
  const clusterMap = new Map<string, ScanResult[]>();
  const singletons: ScanResult[] = [];

  for (const r of results) {
    const cid = r.suggestion?.clusterId;
    if (cid) {
      const group = clusterMap.get(cid) ?? [];
      group.push(r);
      clusterMap.set(cid, group);
    } else {
      singletons.push(r);
    }
  }

  const rows: ReturnType<typeof groupResults> = [];

  for (const [clusterId, items] of clusterMap) {
    // Take the suggestion from the first item (all in a cluster share the same type)
    const rep = items[0].suggestion;
    rows.push({
      rowKey:        clusterId,
      items,
      clusterId,
      suggestedType: rep?.suggestedType ?? null,
      confidence:    rep?.confidence    ?? 0,
      action:        (rep?.action ?? 'ask') as ReturnType<typeof groupResults>[number]['action'],
      badgeColor:    rep?.badgeColor    ?? 'red',
    });
  }

  for (const r of singletons) {
    const rep = r.suggestion;
    rows.push({
      rowKey:        r.shapeData.id,
      items:         [r],
      clusterId:     null,
      suggestedType: rep?.suggestedType ?? null,
      confidence:    rep?.confidence    ?? 0,
      action:        (rep?.action ?? 'ask') as ReturnType<typeof groupResults>[number]['action'],
      badgeColor:    rep?.badgeColor    ?? 'red',
    });
  }

  // Sort: highest confidence first
  rows.sort((a, b) => b.confidence - a.confidence);
  return rows;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkClassifyDialog({ results, onCommit, onDismiss }: Props) {
  const rows = useMemo(() => groupResults(results), [results]);

  // Track which rows the user has accepted (default: accept all with confidence >= 0.50)
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const row of rows) {
      if ((row.confidence ?? 0) >= 0.50) s.add(row.rowKey);
    }
    return s;
  });

  const toggleRow = (key: string) => {
    setAcceptedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else                next.add(key);
      return next;
    });
  };

  const acceptedCount = useMemo(
    () => rows.reduce((n, row) => n + (acceptedKeys.has(row.rowKey) ? row.items.length : 0), 0),
    [rows, acceptedKeys],
  );

  const handleApply = () => {
    const accepted = rows
      .filter(row => acceptedKeys.has(row.rowKey))
      .flatMap(row => row.items);
    onCommit(accepted);
    onDismiss();
  };

  const handleSelectAll = () => {
    setAcceptedKeys(new Set(rows.map(r => r.rowKey)));
  };

  const handleDeselectAll = () => {
    setAcceptedKeys(new Set());
  };

  const clusterCount = rows.filter(r => r.clusterId !== null).length;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Panel */}
      <div className="relative w-[540px] max-h-[80vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">AI Auto-Scan Results</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Found <span className="text-slate-200 font-medium">{results.length}</span> frame
              {results.length !== 1 ? 's' : ''} across{' '}
              <span className="text-slate-200 font-medium">{clusterCount}</span> cluster
              {clusterCount !== 1 ? 's' : ''}.
              Review and apply below.
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none ml-4 mt-0.5"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Select all / deselect all bar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-800 shrink-0">
          <button
            onClick={handleSelectAll}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            Select all
          </button>
          <span className="text-slate-700">·</span>
          <button
            onClick={handleDeselectAll}
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            Deselect all
          </button>
          <span className="ml-auto text-xs text-slate-500">
            {acceptedCount} of {results.length} selected
          </span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No architectural frames detected on this page.
              <br />
              <span className="text-xs">Try calibrating the page first, or use the Magic Wand for manual detection.</span>
            </div>
          ) : (
            rows.map(row => {
              const accepted = acceptedKeys.has(row.rowKey);
              return (
                <div
                  key={row.rowKey}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors cursor-pointer ${
                    accepted ? 'bg-slate-800/30' : 'opacity-50'
                  }`}
                  onClick={() => toggleRow(row.rowKey)}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    accepted
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'border-slate-600 bg-slate-800'
                  }`}>
                    {accepted && <span className="text-[9px] font-bold leading-none">✓</span>}
                  </div>

                  {/* Count badge */}
                  <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">
                    {row.items.length}×
                  </span>

                  {/* Confidence badge */}
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    {row.suggestedType ? (
                      <ConfidenceBadge
                        suggestedType={row.suggestedType}
                        confidence={row.confidence}
                        action={row.action}
                        badgeColor={row.badgeColor}
                        clusterSize={row.items.length}
                        compact
                      />
                    ) : (
                      <span className="text-xs text-red-400 italic">Unclassified</span>
                    )}
                  </div>

                  {/* Type label */}
                  <span className="text-xs text-slate-300 flex-1 truncate">
                    {row.suggestedType ? TYPE_LABELS[row.suggestedType] : 'Unknown type'}
                    {row.clusterId && (
                      <span className="ml-1.5 text-slate-500 text-[10px]">
                        (cluster of {row.items.length})
                      </span>
                    )}
                  </span>

                  {/* Confidence % */}
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {Math.round(row.confidence * 100)}%
                  </span>

                  {/* Dimensions sample */}
                  <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">
                    {row.items[0].shapeData.widthInches.toFixed(1)}"×
                    {row.items[0].shapeData.heightInches.toFixed(1)}"
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={onDismiss}
            className="px-3 h-8 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={handleApply}
            disabled={acceptedCount === 0}
            className="px-4 h-8 rounded text-xs font-semibold transition-colors bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply {acceptedCount > 0 ? `${acceptedCount} Frame${acceptedCount !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
