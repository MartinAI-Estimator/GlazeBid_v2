/**
 * CitationCaptureLayer.tsx
 *
 * Drop this component ONCE into the Studio canvas root (StudioCanvas).
 * It owns the full citation capture lifecycle:
 *   - Runs useCitationCapture to watch for new shapes (observer pattern)
 *   - Renders QuickEntryModal when pendingShape is set
 *   - Renders VisualCitationOverlay for all saved citations
 *   - Loads sheet citations when active page changes
 *
 * This is the SINGLE integration point between the canvas engine
 * and the citation feature. If citation breaks, canvas still works.
 */

import { useEffect } from 'react';
import { useCitationCapture }    from '../../hooks/useCitationCapture';
import { useCitationStore }      from '../../store/useCitationStore';
import { useStudioStore }        from '../../store/useStudioStore';
import QuickEntryModal           from '../citation/QuickEntryModal';
import VisualCitationOverlay     from '../citation/VisualCitationOverlay';
import { CitationDiagnostic }    from './CitationDiagnostic';

interface Props {
  pageToScreen: (px: number, py: number) => { x: number; y: number };
}

export default function CitationCaptureLayer({ pageToScreen }: Props) {
  // Activate the shape observer — detects new shapes, fires pendingShape
  useCitationCapture();

  const pendingShape       = useCitationStore(s => s.pendingShape);
  const sheetCitations     = useCitationStore(s => s.sheetCitations);
  const hoveredCitationId  = useCitationStore(s => s.hoveredCitationId);
  const setHoveredId       = useCitationStore(s => s.setHoveredCitationId);
  const loadSheetCitations = useCitationStore(s => s.loadSheetCitations);

  // Primitive selector — getActivePage() returns a new object every call,
  // causing useSyncExternalStore infinite loops. We only need the label.
  const activePageLabel = useStudioStore(s =>
    s.pages.find(p => p.id === s.activePageId)?.label ?? null,
  );

  // Reload citations when sheet changes
  useEffect(() => {
    if (activePageLabel) {
      loadSheetCitations('current', activePageLabel);
    }
  }, [activePageLabel, loadSheetCitations]);

  // Derive screen position from page-space bounding box
  let screenPos = { x: 400, y: 200 };
  if (pendingShape) {
    const bb = pendingShape.boundingBox;
    const center = pageToScreen(bb.x + bb.width / 2, bb.y);
    screenPos = { x: center.x, y: center.y - 12 };
  }

  return (
    <>
      {/* Visual overlay — always rendered, shows all saved citations */}
      <VisualCitationOverlay
        citations={sheetCitations}
        hoveredId={hoveredCitationId ?? undefined}
        onHover={setHoveredId}
        pageToScreen={pageToScreen}
      />

      {/* Quick entry modal — only rendered when a new shape is pending */}
      {pendingShape && (
        <QuickEntryModal screenPosition={screenPos} />
      )}

      {/* Diagnostic panel — remove before shipping */}
      <CitationDiagnostic />
    </>
  );
}
