/**
 * ConfidenceBadge.tsx
 *
 * Displays the AI classification suggestion for an unassigned shape.
 *
 * Colour coding (from legacy fallback_intelligence.py confidence thresholds):
 *   ✓ green  (≥ 85%) — auto_apply          — shown directly on shape
 *   ⚠ yellow (70-85%) — suggest_with_verify — shown with Accept / Skip buttons
 *   ? orange (50-70%) — flag               — shown with Accept / Skip buttons
 *   ! red    (< 50%)  — ask                — shows "Unclassified" prompt only
 *
 * Usage:
 *   <ConfidenceBadge
 *     suggestedType="storefront"
 *     confidence={0.82}
 *     action="suggest_with_verify"
 *     badgeColor="yellow"
 *     clusterSize={5}
 *     onAccept={() => applyBulkClassification(clusterIds, 'storefront')}
 *     onReject={() => { }}
 *   />
 */

import type { GlazingSystemType, ConfidenceAction } from '../../hooks/useFallbackIntelligence';

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  suggestedType: GlazingSystemType;
  confidence:    number;
  action:        ConfidenceAction;
  badgeColor:    'green' | 'yellow' | 'orange' | 'red';
  /** Number of shapes in the geometric cluster — shows "N similar shapes" when > 1. */
  clusterSize?:  number;
  /** Called when user clicks Accept / Apply. */
  onAccept?:     () => void;
  /** Called when user clicks Skip / Reject. */
  onReject?:     () => void;
  /** When true, renders as a tiny inline pill (no action buttons). */
  compact?:      boolean;
};

// ── Static maps ──────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<'green' | 'yellow' | 'orange' | 'red', string> = {
  green:  'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  yellow: 'bg-yellow-500/15  border-yellow-500/40  text-yellow-300',
  orange: 'bg-orange-500/15  border-orange-500/40  text-orange-300',
  red:    'bg-red-500/15     border-red-500/40     text-red-300',
};

const ACTION_ICONS: Record<ConfidenceAction, string> = {
  auto_apply:          '✓',
  suggest_with_verify: '⚠',
  flag:                '?',
  ask:                 '!',
};

const TYPE_LABELS: Record<GlazingSystemType, string> = {
  door:         'Door',
  window:       'Window',
  storefront:   'Storefront',
  curtain_wall: 'Curtain Wall',
  entrance:     'Entrance',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfidenceBadge({
  suggestedType,
  confidence,
  action,
  badgeColor,
  clusterSize,
  onAccept,
  onReject,
  compact = false,
}: Props) {
  const colorClass = COLOR_CLASSES[badgeColor];
  const icon       = ACTION_ICONS[action];
  const label      = TYPE_LABELS[suggestedType];
  const pct        = Math.round(confidence * 100);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${colorClass}`}
        title={`AI suggestion: ${label} (${pct}% confidence)`}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
        <span className="opacity-60">{pct}%</span>
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 rounded border px-2.5 py-2 select-none ${colorClass}`}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
        <span className="ml-auto opacity-60 font-normal tabular-nums">{pct}%</span>
      </div>

      {/* Cluster hint */}
      {clusterSize !== undefined && clusterSize > 1 && (
        <p className="text-[10px] opacity-60 leading-snug">
          {clusterSize} similar shapes found
        </p>
      )}

      {/* Action buttons */}
      {(onAccept || onReject) && (
        <div className="flex gap-1 mt-0.5">
          {onAccept && (
            <button
              onClick={onAccept}
              className="flex-1 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-[10px] py-0.5 font-medium transition-colors"
            >
              Apply{clusterSize && clusterSize > 1 ? ` all ${clusterSize}` : ''}
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="flex-1 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-[10px] py-0.5 font-medium transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
