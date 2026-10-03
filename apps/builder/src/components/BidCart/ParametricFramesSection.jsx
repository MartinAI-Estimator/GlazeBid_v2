/**
 * ParametricFramesSection — the bid's engineered frames (useBidStore.frames)
 * on the Bid Summary page, each one openable in the Parametric Frame Builder.
 *
 * Why this exists (Gap 8 handshake, 2026-09-18): frames added from the Studio
 * inbox (AI / Box & Snap) land in useBidStore, but the only list of them was
 * BidCartPanel's Frame Log, inside a drawer nothing opens.  Commercial glazing
 * is custom — the AI's frame is a baseline the estimator must be able to open
 * and adjust (grid, doors, raked head) before RFQs go out.  This is that list.
 */

import React from 'react';
import useBidStore from '../../store/useBidStore';
import { formatInches } from '../../engine/parametricFrameMath';

const SOURCE_BADGE = {
  studio:  { label: 'AI / Studio', color: '#a78bfa' },
  builder: { label: 'Builder',     color: '#60a5fa' },
};

function sizeText(f) {
  const i = f.inputs ?? {};
  const w = formatInches(Number(i.width) || 0);
  if (i.shapeMode === 'raked_head') {
    return `${w} × ${formatInches(Number(i.leftLegHeight) || 0)} / ${formatInches(Number(i.rightLegHeight) || 0)}`;
  }
  return `${w} × ${formatInches(Number(i.height) || 0)}`;
}

function gridText(f) {
  const i = f.inputs ?? {};
  const door = i.door?.type && i.door.type !== 'none' ? ` · ${i.door.type === 'pair' ? 'pair' : 'single'} door B${i.door.bay}` : '';
  const custom = i.bayHorizontals && Object.keys(i.bayHorizontals).length ? ' · custom rows' : '';
  return `${i.bays ?? 1}×${i.rows ?? 1}${door}${custom}`;
}

export default function ParametricFramesSection({ onEditFrame }) {
  const frames = useBidStore(s => s.frames);
  const removeFrame = useBidStore(s => s.removeFrame);

  if (!frames || frames.length === 0) return null;

  return (
    <section data-testid="parametric-frames">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Frames ({frames.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Engineered frames in this bid. Open one to adjust its grid, doors or raked head before sending RFQs.
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-slate-500">
              <th className="px-4 py-2 text-left">Tag</th>
              <th className="px-4 py-2 text-left">System</th>
              <th className="px-4 py-2 text-left">Size (W × H)</th>
              <th className="px-4 py-2 text-left">Grid</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Metal LF</th>
              <th className="px-4 py-2 text-right">Glass SF</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {frames.map(f => {
              const badge = SOURCE_BADGE[f.source] ?? { label: f.source ?? '—', color: '#94a3b8' };
              const legacy = !f.bom?.rfq;
              const warnings = f.bom?.warnings?.length ?? 0;
              return (
                <tr
                  key={f.frameId}
                  data-testid={`frame-row-${f.frameId}`}
                  className="hover:bg-white/[0.03] cursor-pointer"
                  onClick={() => onEditFrame?.(f.frameId)}
                >
                  <td className="px-4 py-2.5 font-bold text-blue-300 whitespace-nowrap">{f.elevationTag}</td>
                  <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{f.systemType}</td>
                  <td className="px-4 py-2.5 text-slate-300 tabular-nums whitespace-nowrap">{sizeText(f)}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{gridText(f)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{f.quantity ?? 1}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{(f.bom?.totalAluminumLF ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{(f.bom?.totalGlassSqFt ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span style={{ color: badge.color, fontWeight: 700 }}>{badge.label}</span>
                    {f.ai?.gridSource === 'default' && (
                      <span className="ml-1.5 text-amber-400" title="The AI could not read this frame's grid — defaulted to 1×1">grid?</span>
                    )}
                    {legacy && (
                      <span className="ml-1.5 text-amber-400" title="Saved before the die-level BOM — open and update to add it to RFQs">legacy</span>
                    )}
                    {warnings > 0 && (
                      <span className="ml-1.5 text-amber-400" title={f.bom.warnings.join('\n')}>⚠ {warnings}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      data-testid={`open-frame-${f.frameId}`}
                      onClick={(e) => { e.stopPropagation(); onEditFrame?.(f.frameId); }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-600/15 border border-blue-500/30 text-blue-300 hover:bg-blue-600/25"
                    >
                      Open in Frame Builder
                    </button>
                    <button
                      title="Remove frame from bid"
                      onClick={(e) => { e.stopPropagation(); removeFrame(f.frameId); }}
                      className="ml-1.5 px-2 py-1 rounded-md text-[11px] font-bold border border-red-500/25 text-red-400 hover:bg-red-500/10"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
