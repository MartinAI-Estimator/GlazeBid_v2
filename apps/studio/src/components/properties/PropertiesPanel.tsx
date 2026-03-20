import { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useProjectStore } from '../../store/useProjectStore';
import { FRAME_PROFILES, FRAME_PROFILES as _FP } from '../../store/useProjectStore';
import { DEFAULT_PDF_PPI } from '../../engine/coordinateSystem';
import { formatArchitecturalInches } from '../../utils/measurementParser';
import { MeasurementInput } from '../ui/MeasurementInput';
import { FrameEditorPanel } from '../parametric/FrameEditorPanel';
import { DEFAULT_GRID } from '../../engine/parametric/gridMath';
import type { GlassType } from '../../engine/parametric/gridMath';
import type { RectShape, LineShape, PolygonShape } from '../../types/shapes';
import { useFallbackIntelligence } from '../../hooks/useFallbackIntelligence';
import { useLearningLoop } from '../../hooks/useLearningLoop';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
// Suppress unused-var warning for _FP alias
void _FP;

export default function PropertiesPanel() {
  const selectedId    = useStudioStore(s => s.selectedShapeId);
  const shapes        = useStudioStore(s => s.shapes);
  const updateShape   = useStudioStore(s => s.updateShape);
  const removeShape   = useStudioStore(s => s.removeShape);
  const selectShape   = useStudioStore(s => s.selectShape);
  const activePageId  = useStudioStore(s => s.activePageId);
  // Select calibration PPI as a scalar — calling getActiveCalibration() inside
  // a selector returns a new object every render and causes an infinite loop.
  const calibPpi = useStudioStore(s =>
    (s.calibrations[s.activePageId]?.pixelsPerInch) ?? DEFAULT_PDF_PPI
  );

  const { suggestions, clusters, applyBulkClassification } = useFallbackIntelligence();
  const { logValidation, logRejection } = useLearningLoop();

  const shape = shapes.find(s => s.id === selectedId);

  if (!shape) {
    return (
      <aside className="w-56 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Properties</p>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
          <p className="text-xs text-slate-600">No shape selected.</p>
          <p className="text-[10px] text-slate-700">Click a shape with the Select tool.</p>
        </div>
        <CalibrationInfo calibPpi={calibPpi} pageId={activePageId} />
      </aside>
    );
  }

  return (
    <aside className="w-56 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Properties</p>
        <button
          onClick={() => selectShape(null)}
          className="text-slate-600 hover:text-slate-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Type badge */}
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-400">
            {shape.type}
          </span>
        </div>

        {/* AI Confidence Badge — only for unassigned rect/polygon shapes */}
        {(shape.type === 'rect' || shape.type === 'polygon') &&
          !(shape as RectShape | PolygonShape).frameSystemType && (() => {
            const suggestion = suggestions.get(shape.id);
            if (!suggestion) return null;

            const clusterIds = suggestion.clusterId
              ? (clusters.find(c => c.clusterId === suggestion.clusterId)?.shapeIds ?? [shape.id])
              : [shape.id];

            return (
              <ConfidenceBadge
                suggestedType={suggestion.suggestedType}
                confidence={suggestion.confidence}
                action={suggestion.action}
                badgeColor={suggestion.badgeColor}
                clusterSize={suggestion.clusterSize}
                onAccept={() => {
                  applyBulkClassification(clusterIds, suggestion.suggestedType);
                  logValidation({
                    shapeId:      shape.id,
                    pageId:       activePageId,
                    aiPrediction: { suggestedType: suggestion.suggestedType, confidence: suggestion.confidence },
                  });
                }}
                onReject={() => {
                  logRejection({
                    shapeId:      shape.id,
                    pageId:       activePageId,
                    aiPrediction: { suggestedType: suggestion.suggestedType, confidence: suggestion.confidence },
                    reason:       'wrong_classification',
                  });
                }}
              />
            );
          })()}

        {/* Label */}
        <Field
          label="Label"
          value={shape.label ?? ''}
          type="text"
          onCommit={(v) => updateShape(shape.id, { label: String(v) })}
        />

        {/* Shape-specific fields */}
        {shape.type === 'rect' && (
          <RectFields
            shape={shape}
            ppi={calibPpi}
            onUpdate={(patch) => updateShape(shape.id, patch)}
          />
        )}
        {shape.type === 'line' && (
          <LineFields
            shape={shape}
            ppi={calibPpi}
          />
        )}
        {shape.type === 'polygon' && (
          <PolygonFields shape={shape} />
        )}

        {/* Delete button */}
        <button
          onClick={() => removeShape(shape.id)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium text-red-400 hover:bg-red-950/40 border border-red-900/30 hover:border-red-700/40 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Delete Shape
        </button>
      </div>

      <CalibrationInfo calibPpi={calibPpi} pageId={activePageId} />
    </aside>
  );
}

// ── Rect fields ───────────────────────────────────────────────────────────────

function RectFields({
  shape,
  ppi,
  onUpdate,
}: {
  shape:    RectShape;
  ppi:      number;
  onUpdate: (patch: Partial<RectShape>) => void;
}) {
  const systems = useProjectStore(s => s.systems);
  const system  = systems.find(s => s.id === (shape as RectShape & { frameSystemId?: string }).frameSystemId);
  const profile = system?.profileKey ? FRAME_PROFILES[system.profileKey] : null;

  /** Called by FrameEditorPanel's Glass tab when user toggles a lite's type. */
  function handleBayTypeChange(col: number, row: number, type: GlassType) {
    const grid     = shape.grid ?? DEFAULT_GRID;
    const bayTypes = { ...(grid.bayTypes ?? {}), [`${col},${row}`]: type };
    onUpdate({ grid: { ...grid, bayTypes } } as Partial<RectShape>);
  }

  return (
    <>
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">
          Width
        </label>
        <MeasurementInput
          value={shape.widthInches}
          onCommit={(v) => onUpdate({ widthInches: v, widthPx: v * ppi })}
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">
          Height
        </label>
        <MeasurementInput
          value={shape.heightInches}
          onCommit={(v) => onUpdate({ heightInches: v, heightPx: v * ppi })}
        />
      </div>

      <InfoRow
        label="SF"
        value={(shape.widthInches * shape.heightInches / 144).toFixed(2)}
        unit="sf"
      />

      {/* Profile / sightline info — shown only for assigned frame shapes */}
      {profile && (
        <div className="border-t border-slate-800 pt-3 mt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Frame Profile
          </p>
          <InfoRow label="Profile"    value={profile.label} />
          <InfoRow label="Depth"      value={formatArchitecturalInches(profile.depth, 'inches')} />
          <InfoRow label="Face"       value={formatArchitecturalInches(profile.faceWidth, 'inches')} />
          <InfoRow label="Sightline"  value={formatArchitecturalInches(profile.sightline, 'inches')} />
          <InfoRow label="Glass Bite" value={formatArchitecturalInches(profile.glassBite, 'inches')} />
        </div>
      )}

      {/* Fabrication BOM panel — Summary / Cut List / Glass tabs */}
      <FrameEditorPanel
        shape={shape}
        onBayTypeChange={handleBayTypeChange}
      />
    </>
  );
}

// ── Line fields ───────────────────────────────────────────────────────────────

function LineFields({ shape, ppi: _ }: { shape: LineShape; ppi: number }) {
  return (
    <>
      <InfoRow label="Length"  value={shape.lengthInches.toFixed(3)} unit="in" />
      <InfoRow label="Length"  value={(shape.lengthInches / 12).toFixed(3)} unit="ft" />
    </>
  );
}

// ── Polygon fields ────────────────────────────────────────────────────────────

function PolygonFields({ shape }: { shape: PolygonShape }) {
  return (
    <>
      <InfoRow label="Vertices" value={String(shape.points.length)} />
      <InfoRow label="BB Width"  value={shape.bbWidthInches.toFixed(3)}  unit="in" />
      <InfoRow label="BB Height" value={shape.bbHeightInches.toFixed(3)} unit="in" />
    </>
  );
}

// ── Reusable field components ─────────────────────────────────────────────────

function Field({
  label,
  value,
  type,
  onCommit,
}: {
  label:    string;
  value:    string;
  type:     'text' | 'number';
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onCommit(draft);
  };

  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(value); }}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

function InfoRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-mono text-slate-300 tabular-nums">
        {value}{unit ? <span className="text-slate-600 ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}

function CalibrationInfo({ calibPpi, pageId }: { calibPpi: number; pageId: string }) {
  return (
    <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/80">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
        Calibration
      </p>
      <p className="text-[10px] text-slate-500">
        {calibPpi === DEFAULT_PDF_PPI
          ? <span className="text-amber-500/70">Default 72 PPI — draw a calibration line to set scale.</span>
          : <span className="text-emerald-500/80">{calibPpi.toFixed(2)} px/in</span>
        }
      </p>
    </div>
  );
}
