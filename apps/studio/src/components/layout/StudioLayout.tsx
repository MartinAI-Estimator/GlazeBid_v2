import { useState, useCallback, useEffect, useRef } from 'react';
import Toolbar from '../toolbar/Toolbar';
import StudioCanvas from '../canvas/StudioCanvas';
import PropertiesPanel from '../properties/PropertiesPanel';
import CalibrationModal from '../calibration/CalibrationModal';
import ThumbnailSidebar from '../sidebar/ThumbnailSidebar';
import FrameTypeLibrary from '../typeLibrary/FrameTypeLibrary';
import { BulkClassifyDialog } from '../ui/BulkClassifyDialog';
import ShapeContextMenu, { type ContextMenuTarget } from '../canvas/ShapeContextMenu';
import CustomSystemModal from '../parametric/CustomSystemModal';
import StructuralPanel from '../structural/StructuralPanel';
import { type CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useStudioStore, type PdfTab } from '../../store/useStudioStore';
import type { RectShape, PolygonShape } from '../../types/shapes';
import type { ScanResult } from '../../hooks/useAIAutoScan';

// ── PDF Tab Bar ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<PdfTab['role'], string> = {
  drawings: 'Drawings',
  specs:    'Specs',
  manual:   'PDF',
};

const ROLE_COLOR: Record<PdfTab['role'], string> = {
  drawings: 'text-sky-400 border-sky-500/50',
  specs:    'text-green-400 border-green-500/50',
  manual:   'text-slate-300 border-slate-500/50',
};

function PdfTabBar() {
  const pdfTabs      = useStudioStore(s => s.pdfTabs);
  const activePdfTabId = useStudioStore(s => s.activePdfTabId);
  const switchPdfTab = useStudioStore(s => s.switchPdfTab);
  const closePdfTab  = useStudioStore(s => s.closePdfTab);

  if (pdfTabs.length === 0) return null;

  return (
    <div className="flex items-end gap-0 px-3 bg-slate-950 border-b border-slate-800 shrink-0 overflow-x-auto">
      {pdfTabs.map(tab => {
        const isActive = tab.id === activePdfTabId;
        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? `${ROLE_COLOR[tab.role]} bg-slate-900`
                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-900/50'
            }`}
            onClick={() => switchPdfTab(tab.id)}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              tab.role === 'drawings' ? 'bg-sky-400' :
              tab.role === 'specs'    ? 'bg-green-400' : 'bg-slate-400'
            }`} />
            <span>{ROLE_LABEL[tab.role]}</span>
            <span className="text-slate-600 truncate max-w-[120px]">{tab.fileName}</span>
            <button
              onClick={e => { e.stopPropagation(); closePdfTab(tab.id); }}
              className="ml-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 transition-opacity"
              title="Close tab"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * StudioLayout
 *
 * Full-screen Studio shell:
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  Toolbar  (top, full-width)                     │
 *   ├─────────────────────────────────────────────────┤
 *   │  PDF Tab Bar  (role tabs for open documents)    │
 *   ├────────────┬──────────────────────┬─────────────┤
 *   │ Thumbnails │  Canvas  (flex-1)    │  Properties │
 *   │  (140 px)  │                      │  (224 px)   │
 *   └────────────┴──────────────────────┴─────────────┘
 *
 * CalibrationModal renders as an absolute overlay inside the canvas column.
 */
export default function StudioLayout() {
  const [engine, setEngine] = useState<CanvasEngineAPI | null>(null);
  // Keep a stable ref so the IPC listener can call loadPdfBuffer even after
  // engine state updates (avoids stale closure over null).
  const engineRef = useRef<CanvasEngineAPI | null>(null);

  // ── Frame Type Library panel toggle ───────────────────────────────────────
  const [showTypeLibrary, setShowTypeLibrary] = useState(false);

  // ── AI Auto-Scan state ─────────────────────────────────────────────────────
  const [scanResults,   setScanResults]   = useState<ScanResult[] | null>(null);
  const [isScanRunning, setIsScanRunning] = useState(false);
  // Stable ref to the runScan function lifted from StudioCanvas
  const scanRunnerRef = useRef<(() => void) | null>(null);

  // ── Right-click overlay state ──────────────────────────────────────────────
  const [contextMenuTarget,   setContextMenuTarget]   = useState<ContextMenuTarget | null>(null);
  const [structuralShape,     setStructuralShape]     = useState<RectShape | PolygonShape | null>(null);
  const [customSystemShape,   setCustomSystemShape]   = useState<RectShape | PolygonShape | null>(null);

  const handleScanReady = useCallback((runScan: () => void) => {
    scanRunnerRef.current = runScan;
  }, []);

  const handleScanComplete = useCallback((results: ScanResult[]) => {
    setIsScanRunning(false);
    setScanResults(results);
  }, []);

  const handleScanPage = useCallback(() => {
    if (!scanRunnerRef.current) return;
    setIsScanRunning(true);
    scanRunnerRef.current();
  }, []);

  // ── Context menu handlers ──────────────────────────────────────────────────
  const handleContextMenu = useCallback((target: ContextMenuTarget) => {
    setContextMenuTarget(target);
  }, []);

  const handleContextMenuOpenFrameBuilder = useCallback((shape: RectShape | PolygonShape) => {
    setContextMenuTarget(null);
    // Send shape dims to Builder via IPC → Builder "Needs Work" import card
    const widthIn  = shape.type === 'rect' ? shape.widthInches  : shape.bbWidthInches;
    const heightIn = shape.type === 'rect' ? shape.heightInches : shape.bbHeightInches;
    (window as unknown as { electron?: { sendToFrameBuilder?: (p: unknown) => void } })
      .electron?.sendToFrameBuilder?.({ shapeId: shape.id, label: shape.label, widthInches: widthIn, heightInches: heightIn });
  }, []);

  const handleContextMenuSendToCustom = useCallback((shape: RectShape | PolygonShape) => {
    setContextMenuTarget(null);
    setCustomSystemShape(shape);
  }, []);

  const handleContextMenuCheckStructural = useCallback((shape: RectShape | PolygonShape) => {
    setContextMenuTarget(null);
    setStructuralShape(shape);
  }, []);

  const handleStructuralAttach = useCallback((shapeId: string, verdict: string) => {
    useStudioStore.getState().updateShape(shapeId, { structuralVerdict: verdict } as object);
  }, []);

  const handleDialogCommit = useCallback((accepted: ScanResult[]) => {
    const store = useStudioStore.getState();
    for (const result of accepted) {
      store.addShape(result.shapeData);
      if (result.suggestion?.action === 'auto_apply') {
        store.updateShape(result.shapeData.id, {
          frameSystemType: result.suggestion.suggestedType,
        });
      }
    }
    setScanResults(null);
  }, []);

  const handleDialogDismiss = useCallback(() => setScanResults(null), []);

  const handleEngine = useCallback((api: CanvasEngineAPI) => {
    setEngine(api);
    engineRef.current = api;
  }, []);

  // Register once for IPC PDF inject (Builder → Studio auto-load)
  useEffect(() => {
    // Signal main process that Studio has mounted and is ready to receive
    // project data (triggers load-project-data + pdf:inject delivery).
    window.electron?.studioReady?.();

    if (!window.electron?.onPdfInject) return;
    window.electron.onPdfInject((role, buffer, fileName) => {
      const roleTyped = (role === 'drawings' || role === 'specs') ? role : 'manual' as const;
      const tryLoad = (attempt: number) => {
        if (engineRef.current) {
          void engineRef.current.loadPdfBuffer(buffer, fileName, roleTyped);
        } else if (attempt < 20) {
          // Engine not ready yet; retry every 200 ms for up to 4 s
          setTimeout(() => tryLoad(attempt + 1), 200);
        }
      };
      tryLoad(0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // register once on mount

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 overflow-hidden select-none">
      {/* ── Top toolbar — always in DOM so layout height is stable from first paint ── */}
      <Toolbar
        engine={engine}
        onScanPage={handleScanPage}
        isScanRunning={isScanRunning}
        showTypeLibrary={showTypeLibrary}
        onToggleTypeLibrary={() => setShowTypeLibrary(v => !v)}
      />

      {/* ── PDF Tab Bar — shown only when 1+ PDFs are open ── */}
      <PdfTabBar />

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left thumbnail sidebar */}
        <ThumbnailSidebar engine={engine} />

        {/* Canvas + calibration modal overlay */}
        <div className="relative flex flex-1 min-w-0 min-h-0">
          <StudioCanvas
            onEngine={handleEngine}
            onScanReady={handleScanReady}
            onScanComplete={handleScanComplete}
            onContextMenu={handleContextMenu}
          />
          {/* CalibrationModal renders inside this relative container so
              its `absolute inset-0` covers only the canvas area, not the panels */}
          <CalibrationModal />
        </div>

        {/* Right side: type library | structural panel | properties panel */}
        {structuralShape ? (
          <aside className="w-80 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col">
            <StructuralPanel
              shape={structuralShape}
              onClose={() => setStructuralShape(null)}
              onAttach={handleStructuralAttach}
            />
          </aside>
        ) : showTypeLibrary ? (
          <aside className="w-64 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
            <FrameTypeLibrary />
          </aside>
        ) : (
          <aside className="w-56 flex-shrink-0 bg-slate-900 border-l border-slate-800 overflow-y-auto">
            <PropertiesPanel />
          </aside>
        )}
      </div>

      {/* ── AI Bulk Classify Dialog ────────────────────────────── */}
      {scanResults !== null && (
        <BulkClassifyDialog
          results={scanResults}
          onCommit={handleDialogCommit}
          onDismiss={handleDialogDismiss}
        />
      )}

      {/* ── Right-click context menu ── */}
      {contextMenuTarget && (
        <ShapeContextMenu
          target={contextMenuTarget}
          onClose={() => setContextMenuTarget(null)}
          onEditLabel={() => { setContextMenuTarget(null); /* PropertiesPanel handles label edit */ }}
          onOpenFrameBuilder={() => handleContextMenuOpenFrameBuilder(contextMenuTarget.shape)}
          onSendToCustom={() => handleContextMenuSendToCustom(contextMenuTarget.shape)}
          onCheckStructural={() => handleContextMenuCheckStructural(contextMenuTarget.shape)}
          onDelete={() => {
            useStudioStore.getState().removeShape(contextMenuTarget.shape.id);
            setContextMenuTarget(null);
          }}
        />
      )}

      {/* ── Custom System Modal ── */}
      {customSystemShape && (
        <CustomSystemModal
          shape={customSystemShape}
          onClose={() => setCustomSystemShape(null)}
        />
      )}
    </div>
  );
}
