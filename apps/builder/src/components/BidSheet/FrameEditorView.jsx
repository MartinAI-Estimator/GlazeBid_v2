/**
 * FrameEditorView — opens one saved bid-cart frame in the Parametric Frame
 * Builder for manual editing (grid, doors, raked head, sill step-ups).
 *
 * The Builder is mounted with `initialFrame` and keyed by frameId, so every
 * control is hydrated from the saved payload and Save replaces that frame in
 * place.  Works for AI frames from the Studio inbox and for frames first built
 * by hand — both use the same payload schema (buildFramePayload).
 */

import React from 'react';
import useBidStore from '../../store/useBidStore';
import ParametricFrameBuilder from './ParametricFrameBuilder';

export default function FrameEditorView({ frameId, onBack }) {
  const frame = useBidStore(s => s.frames.find(f => f.frameId === frameId) ?? null);

  // Snapshot the frame at open time: the Builder hydrates once, and the
  // store update on Save must not remount it mid-edit.
  const [snapshot] = React.useState(frame);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-deep, #0b0e11)', overflow: 'hidden' }}>
      <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border-subtle, #2d333b)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, background: 'var(--bg-panel, #0d1117)' }}>
        <button
          onClick={onBack}
          style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle, #2d333b)', borderRadius: 6, color: 'var(--text-secondary, #9ea7b3)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
        >
          ← Back to Bid Summary
        </button>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary, #9ea7b3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Frame Builder
        </span>
        {snapshot && (
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#60a5fa' }}>
            — {snapshot.elevationTag} · {snapshot.systemType}
            {snapshot.source === 'studio' && <span style={{ color: '#a78bfa', marginLeft: 6 }}>(AI baseline)</span>}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {snapshot ? (
          <ParametricFrameBuilder key={snapshot.frameId} initialFrame={snapshot} />
        ) : (
          <div style={{ padding: 32, color: '#9ea7b3', fontSize: 13 }}>
            That frame is no longer in the bid.
          </div>
        )}
      </div>
    </div>
  );
}
