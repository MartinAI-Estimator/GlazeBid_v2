import { useRef, useEffect } from 'react';
import { useCanvasEngine, CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useParametricTool } from '../../hooks/useParametricTool';
import { useRakeTool }       from '../../hooks/useRakeTool';
import { useCountTool }      from '../../hooks/useCountTool';
import { useWandTool }       from '../../hooks/useWandTool';
import { useAIAutoScan }     from '../../hooks/useAIAutoScan';
import { useGhostTool }      from '../../hooks/useGhostTool';
import { useGhostDetector }  from '../../hooks/useGhostDetector';
import FrameOverlay          from '../parametric/FrameOverlay';
import GhostOverlay          from './GhostOverlay';
import RakeOverlay           from '../parametric/RakeOverlay';
import { CountOverlay }      from '../parametric/CountOverlay';
import { GridEditor }        from '../parametric/GridEditor';
import type { ScanResult }   from '../../hooks/useAIAutoScan';
import type { ContextMenuTarget } from './ShapeContextMenu';

interface StudioCanvasProps {
  /** Parent receives the engine API so the Toolbar can call fitToPage, zoomIn, zoomOut */
  onEngine:        (api: CanvasEngineAPI) => void;
  /** Parent receives the scan trigger so the Toolbar AI Scan button can call it. */
  onScanReady?:    (runScan: () => void) => void;
  /** Called when scan completes with results for BulkClassifyDialog. */
  onScanComplete?: (results: ScanResult[]) => void;
  /** Called when the user right-clicks a frame/polygon highlight. */
  onContextMenu?:  (target: ContextMenuTarget) => void;
}

/**
 * StudioCanvas
 *
 * Thin wrapper that mounts the <canvas> element and wires up useCanvasEngine.
 * All rendering and event handling lives in the hook; this component only
 * provides the DOM refs and lifts the stable engine API to the layout.
 */
export default function StudioCanvas({ onEngine, onScanReady, onScanComplete, onContextMenu }: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const engine = useCanvasEngine(containerRef, canvasRef, onContextMenu);

  // ── Plugin: Parametric Frame Highlight tool (Task 4.3) ──────────────────
  const { framePreview, calibrationRequired } = useParametricTool(canvasRef, engine);

  // ── Plugin: Raked Frame tool ─────────────────────────────────────────────
  const { rakePreview, calibrationRequired: rakeCal } = useRakeTool(canvasRef, engine);

  // ── Plugin: Count Marker tool ────────────────────────────────────────────
  const { activeGroupId } = useCountTool(canvasRef, engine);

  // ── Plugin: Magic Wand auto-detect tool ─────────────────────────────────
  const { isScanning } = useWandTool(canvasRef, engine);

  // ── Plugin: AI Auto-Scan (Phase 6.2) ─────────────────────────────────────
  const { runScan } = useAIAutoScan(canvasRef, engine, onScanComplete ?? (() => { /* no-op */ }));

  // ── Plugin: Ghost Highlighter (Phase 6.3) ───────────────────────────────
  const ghostDetector = useGhostDetector(canvasRef, engine);
  const { drawPreview: ghostDrawPreview } = useGhostTool(canvasRef, ghostDetector.runDetection);

  // Lift the engine API on mount
  useEffect(() => {
    onEngine(engine);
  }, [engine, onEngine]);

  // Lift runScan so StudioLayout can wire it to the Toolbar button
  useEffect(() => {
    onScanReady?.(runScan);
  }, [runScan, onScanReady]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-slate-950"
    >
      {/* Status bar */}
      <ZoomStatusBar />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full focus:outline-none"
        tabIndex={0}
      />

      {/* ── Task 4.3: Frame Highlight overlay + QuickAssign popup ───────── */}
      <FrameOverlay
        framePreview={framePreview}
        calibrationRequired={calibrationRequired}
      />

      {/* ── Task 5.x: Raked Frame preview overlay ───────────────────────── */}
      <RakeOverlay
        rakePreview={rakePreview}
        calibrationRequired={rakeCal}
        engine={engine}
      />

      {/* ── Task 5.x: Count Marker overlay + legend ─────────────────────── */}
      <CountOverlay engine={engine} activeGroupId={activeGroupId} />

      {/* ── Task 5.x: Grid Editor (opens after frame assignment) ────────── */}
      <GridEditor engine={engine} />

      {/* ── Phase 6.3: Ghost Highlighter overlay ────────────────────────── */}
      <GhostOverlay
        detections={ghostDetector.detections}
        anchorBox={ghostDetector.anchorBox}
        drawPreview={ghostDrawPreview}
        isDetecting={ghostDetector.isDetecting}
        threshold={ghostDetector.threshold}
        positiveCount={ghostDetector.positiveCount}
        negativeCount={ghostDetector.negativeCount}
        onCommit={ghostDetector.commitDetection}
        onReject={ghostDetector.rejectDetection}
        onAcceptAll={ghostDetector.acceptAll}
        onClear={ghostDetector.clearDetections}
      />

      {/* ── Wand scanning indicator ─────────────────────────────────────── */}
      {isScanning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 20 }}>
          <div className="px-4 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-sky-400 font-semibold shadow-xl">
            Scanning boundary…
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny status bar overlay (bottom-left), reads zoom from the store
// ---------------------------------------------------------------------------
import { useStudioStore } from '../../store/useStudioStore';

function ZoomStatusBar() {
  const zoom = useStudioStore(s => s.cameraScale);
  return (
    <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
      <span className="px-2 py-0.5 rounded bg-slate-900/80 text-[10px] font-mono text-slate-400 backdrop-blur-sm border border-slate-800">
        {(zoom * 100).toFixed(0)}%
      </span>
    </div>
  );
}
