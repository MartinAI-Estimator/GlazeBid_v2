/**
 * CitationDiagnostic.tsx
 *
 * DROP-IN diagnostic panel for first-run testing ONLY.
 * Shows real-time status of every citation system dependency.
 * Remove before shipping to production.
 */

import React, { useState, useEffect } from 'react';
import { useCitationStore } from '../../store/useCitationStore';
import { useStudioStore }   from '../../store/useStudioStore';

export function CitationDiagnostic() {
  const pendingShape    = useCitationStore(s => s.pendingShape);
  const sheetCitations  = useCitationStore(s => s.sheetCitations);
  const shapes          = useStudioStore(s => s.shapes);
  // Primitive selectors — getActivePage()/getActiveCalibration() return new
  // objects on every call which trips useSyncExternalStore infinite loops.
  const activePageId    = useStudioStore(s => s.activePageId);
  const activePageLabel = useStudioStore(s =>
    s.pages.find(p => p.id === s.activePageId)?.label ?? null,
  );
  const ppi = useStudioStore(s => {
    const cal = s.calibrations?.[s.activePageId];
    return cal?.pixelsPerInch ?? null;
  });

  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [dbError, setDbError]   = useState<string>('');

  // Test IPC bridge on mount
  useEffect(() => {
    if (!window.electron?.getImplications) {
      setDbStatus('error');
      setDbError('window.electron.getImplications not found');
      return;
    }
    window.electron.getImplications({})
      .then(r => {
        if (r.ok) setDbStatus('ok');
        else { setDbStatus('error'); setDbError(r.error ?? 'unknown'); }
      })
      .catch(e => { setDbStatus('error'); setDbError(e.message); });
  }, []);

  const isDefaultPpi = ppi === 72;

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 80, zIndex: 99999,
      background: '#0f172a', border: '1px solid #1e3a5f',
      borderRadius: 8, padding: '10px 14px', fontSize: 11,
      fontFamily: 'monospace', color: '#94a3b8', minWidth: 260,
      pointerEvents: 'auto',
    }}>
      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>
        Citation Diagnostic
      </div>

      <DiagRow
        label="IPC Bridge"
        ok={dbStatus === 'ok'}
        value={dbStatus === 'error' ? `ERR: ${dbError}` : dbStatus === 'ok' ? 'Connected' : 'Checking...'}
      />
      <DiagRow
        label="Active Page"
        ok={!!activePageId}
        value={activePageLabel ?? 'None'}
      />
      <DiagRow
        label="Calibration"
        ok={ppi !== null && !isDefaultPpi}
        value={ppi ? `${ppi.toFixed(2)} px/in${isDefaultPpi ? ' (default)' : ''}` : 'None'}
      />
      <DiagRow
        label="Shapes on page"
        ok={shapes.length > 0}
        value={`${shapes.length} total`}
      />
      <DiagRow
        label="Pending shape"
        ok={pendingShape !== null}
        value={pendingShape
          ? `${pendingShape.widthInches.toFixed(1)}" x ${pendingShape.heightInches.toFixed(1)}"`
          : 'None - draw a shape'}
      />
      <DiagRow
        label="Saved citations"
        ok={sheetCitations.length > 0}
        value={`${sheetCitations.length} on this sheet`}
      />
    </div>
  );
}

function DiagRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
      <span style={{ color: '#475569' }}>{label}</span>
      <span style={{ color: ok ? '#22c55e' : '#f59e0b' }}>{value}</span>
    </div>
  );
}
