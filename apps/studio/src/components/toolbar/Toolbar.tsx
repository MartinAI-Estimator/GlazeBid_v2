import { useStudioStore, type ToolType } from '../../store/useStudioStore';
import { useProjectStore } from '../../store/useProjectStore';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';

// ── Studio project file format ────────────────────────────────────────────────
type StudioSaveFile = {
  schemaVersion: number;
  systems:      ReturnType<typeof useProjectStore.getState>['systems'];
  inbox:        ReturnType<typeof useProjectStore.getState>['inbox'];
  countGroups:  ReturnType<typeof useProjectStore.getState>['countGroups'];
  counts:       ReturnType<typeof useProjectStore.getState>['counts'];
  shapes:       ReturnType<typeof useStudioStore.getState>['shapes'];
  calibrations: ReturnType<typeof useStudioStore.getState>['calibrations'];
  pdfFileName:  string | null;
};

async function saveStudioProject(): Promise<void> {
  if (!window.electron?.saveProject) return;
  const ps = useProjectStore.getState();
  const ss = useStudioStore.getState();
  const payload: StudioSaveFile = {
    schemaVersion: 1,
    systems:      ps.systems,
    inbox:        ps.inbox,
    countGroups:  ps.countGroups,
    counts:       ps.counts,
    shapes:       ss.shapes,
    calibrations: ss.calibrations,
    pdfFileName:  ss.pdfFileName,
  };
  await window.electron.saveProject(JSON.stringify(payload, null, 2));
}

async function openStudioProject(): Promise<void> {
  if (!window.electron?.openProject) return;
  const result = await window.electron.openProject();
  if (!result.success) return;
  const data = JSON.parse(result.data) as StudioSaveFile;
  // Hydrate project (takeoff/system) store
  useProjectStore.setState({
    systems:     data.systems     ?? [],
    inbox:       data.inbox       ?? [],
    countGroups: data.countGroups ?? [],
    counts:      data.counts      ?? [],
  });
  // Keep Builder's localStorage inbox in sync
  try { localStorage.setItem('glazebid:inbox', JSON.stringify(data.inbox ?? [])); } catch { /* quota */ }
  // Hydrate canvas store (shapes + calibrations; pages reloaded when PDF is re-opened)
  useStudioStore.setState({
    shapes:       data.shapes       ?? [],
    calibrations: data.calibrations ?? {},
    pdfFileName:  data.pdfFileName  ?? null,
  });
}

type Props = {
  engine:        CanvasEngineAPI | null;
  onScanPage?:   () => void;
  isScanRunning?: boolean;
  /** When true, the right panel shows the Frame Type Library. */
  showTypeLibrary?: boolean;
  onToggleTypeLibrary?: () => void;
};

// ── Icon components ────────────────────────────────────────────────────────────

function SelectIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-5.879 5.879a3 3 0 01-4.243-4.243l7.396-7.396A3 3 0 0116.5 7.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 4.5l4 1 1 4 4 1 1 4-4-1-1-4-4-1z" /></svg>; }
function PanIcon()       { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75L12 2.25l4.5 1.5M12 2.25v19.5M4.5 7.5L3 12l1.5 4.5M19.5 7.5L21 12l-1.5 4.5M7.5 20.25L12 21.75l4.5-1.5" /></svg>; }
function LineIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 20l16-16" /></svg>; }
function RectIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /></svg>; }
function PolygonIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 18l5-13 7 4 3-5 3 14H3z" /></svg>; }
function CalibrateIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>; }
function FrameIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="2 1.5" /></svg>; }
function FitIcon()       { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>; }
function ZoomInIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>; }
function ZoomOutIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" /></svg>; }
function GridIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>; }
function SnapIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function OpenPdfIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>; }
function ScrollIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18" /></svg>; }
function RakeIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5L7 5.5l10 2L21 19.5H3z" /></svg>; }
function CountIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" /><circle cx="16" cy="16" r="2.5" /></svg>; }
function WandIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>; }
function GhostIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.134 2 5 5.134 5 9v7l2-2 2 2 2-2 2 2 2-2 2 2V9c0-3.866-3.134-7-7-7z" /><circle cx="9.5" cy="9.5" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" /></svg>; }
function AiScanIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m9 0h4.5m-4.5 0v4.5m-9 11.25H3.75m0 0v-4.5m16.5 4.5h-4.5m4.5 0v-4.5M9 9l1.5 1.5L13.5 7" /><circle cx="12" cy="12" r="4" strokeDasharray="2 1.5" /></svg>; }

// ── Tool definitions ──────────────────────────────────────────────────────────

type ToolDef = {
  id:      ToolType;
  label:   string;
  icon:    React.ReactNode;
  shortcut: string;
};

const TOOLS: ToolDef[] = [
  { id: 'select',    label: 'Select',          icon: <SelectIcon />,    shortcut: 'V' },
  { id: 'pan',       label: 'Pan',             icon: <PanIcon />,       shortcut: 'H' },
  { id: 'line',      label: 'Line',            icon: <LineIcon />,      shortcut: 'L' },
  { id: 'rect',      label: 'Rectangle',       icon: <RectIcon />,      shortcut: 'B' },
  { id: 'polygon',   label: 'Polygon',         icon: <PolygonIcon />,   shortcut: 'P' },
  { id: 'calibrate', label: 'Calibrate',       icon: <CalibrateIcon />, shortcut: 'A' },
  { id: 'frame',     label: 'Frame Highlight', icon: <FrameIcon />,     shortcut: 'F' },
  { id: 'rake',      label: 'Raked Frame',     icon: <RakeIcon />,      shortcut: 'R' },
  { id: 'count',     label: 'Count Marker',    icon: <CountIcon />,     shortcut: 'C' },
  { id: 'wand',      label: 'Magic Wand',      icon: <WandIcon />,      shortcut: 'W' },
  { id: 'ghost',     label: 'Ghost Detector',  icon: <GhostIcon />,     shortcut: 'G' },
];

// ── Toolbar ────────────────────────────────────────────────────────────────────

export default function Toolbar({ engine, onScanPage, isScanRunning = false, showTypeLibrary = false, onToggleTypeLibrary }: Props) {
  const activeTool         = useStudioStore(s => s.activeTool);
  const objectSnap         = useStudioStore(s => s.objectSnap);
  const showGrid           = useStudioStore(s => s.showGrid);
  const cameraScale        = useStudioStore(s => s.cameraScale);
  const pdfFileName        = useStudioStore(s => s.pdfFileName);
  const continuousScroll   = useStudioStore(s => s.continuousScroll);
  const activeFrameTypeId  = useStudioStore(s => s.activeFrameTypeId);
  const setActiveTool      = useStudioStore(s => s.setActiveTool);
  const setActiveFrameTypeId = useStudioStore(s => s.setActiveFrameTypeId);
  const toggleSnap         = useStudioStore(s => s.toggleObjectSnap);
  const toggleGrid         = useStudioStore(s => s.toggleGrid);
  const toggleContScroll   = useStudioStore(s => s.toggleContinuousScroll);

  const frameTypes         = useProjectStore(s => s.frameTypes);
  const activeType         = activeFrameTypeId ? frameTypes.find(ft => ft.id === activeFrameTypeId) : null;

  return (
    <div className="flex items-center gap-1 h-11 px-3 bg-slate-900 border-b border-slate-800 shrink-0 overflow-x-auto">
      {/* Brand badge */}
      <div className="flex items-center gap-2 pr-3 mr-2 border-r border-slate-800 shrink-0">
        <img
          src="/ICON_LOGO.svg"
          alt="GlazeBid icon"
          className="w-6 h-6 shrink-0"
          draggable={false}
        />
        <img
          src="/TOP_LOGO.svg"
          alt="GlazeBid AiQ"
          className="h-4 w-auto shrink-0"
          draggable={false}
        />
        <span className="text-[9px] font-semibold text-brand-400 uppercase tracking-widest">Studio</span>
      </div>

      {/* File actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => { void openStudioProject(); }}
          title="Open Project (Ctrl+O)"
          className="flex items-center gap-1 px-2 h-8 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
          Open
        </button>
        <button
          onClick={() => { void saveStudioProject(); }}
          title="Save Project (Ctrl+S)"
          className="flex items-center gap-1 px-2 h-8 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Save
        </button>
      </div>

      <div className="w-px h-5 bg-slate-800 mx-1 shrink-0" />

      {/* Open PDF button */}
      <button
        onClick={() => engine?.openPdf()}
        title="Open PDF (Ctrl+O)"
        className="flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 ring-1 ring-brand-600/30 shrink-0"
      >
        <OpenPdfIcon />
        <span>{pdfFileName ?? 'Open PDF'}</span>
      </button>

      <div className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />
      <div className="flex items-center gap-0.5 shrink-0">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
              activeTool === tool.id
                ? 'bg-brand-600/25 text-brand-400 ring-1 ring-brand-600/40'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />

      {/* View controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => engine?.zoomOut()}
          title="Zoom Out (−)"
          className="flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ZoomOutIcon />
        </button>

        <span className="w-14 text-center text-xs font-mono text-slate-400 tabular-nums select-none">
          {Math.round(cameraScale * 100)}%
        </span>

        <button
          onClick={() => engine?.zoomIn()}
          title="Zoom In (+)"
          className="flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ZoomInIcon />
        </button>

        <button
          onClick={() => engine?.fitToPage()}
          title="Fit to Page (0)"
          className="flex items-center justify-center w-8 h-8 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <FitIcon />
        </button>
      </div>

      <div className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />

      {/* Toggles */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={toggleSnap}
          title={`Object Snap: ${objectSnap ? 'ON' : 'OFF'}`}
          className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs transition-colors ${
            objectSnap
              ? 'bg-brand-600/20 text-brand-400 ring-1 ring-brand-600/30'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <SnapIcon />
          <span>Snap</span>
        </button>

        <button
          onClick={toggleGrid}
          title={`Grid: ${showGrid ? 'ON' : 'OFF'}`}
          className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs transition-colors ${
            showGrid
              ? 'bg-slate-700/60 text-slate-300'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <GridIcon />
          <span>Grid</span>
        </button>

        <button
          onClick={toggleContScroll}
          title={`Continuous Scroll: ${continuousScroll ? 'ON' : 'OFF'}`}
          className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs transition-colors ${
            continuousScroll
              ? 'bg-slate-700/60 text-slate-300'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <ScrollIcon />
          <span>Scroll</span>
        </button>
      </div>

      {/* Calibration hint */}
      {activeTool === 'calibrate' && (
        <>
          <div className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />
          <span className="text-[10px] text-amber-400/80 italic shrink-0">
            Draw a line over a known dimension, then enter its real-world length.
          </span>
        </>
      )}

      {/* Active frame-type badge — shown when count tool + type selected */}
      {activeTool === 'count' && activeType && (
        <>
          <div className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />
          <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-slate-800/80 ring-1 ring-slate-700 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: activeType.color }} />
            <span className="font-mono font-bold text-[11px] text-slate-200">{activeType.mark}</span>
            <span className="text-slate-500 text-[10px] hidden sm:block">{activeType.name}</span>
            <button
              onClick={() => { setActiveFrameTypeId(null); setActiveTool('select'); }}
              title="Deselect type"
              className="text-slate-600 hover:text-red-400 ml-0.5 transition-colors"
            >✕</button>
          </div>
        </>
      )}

      {/* AI Scan + Type Library toggle — far right */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {/* Frame Type Library toggle */}
        {onToggleTypeLibrary && (
          <>
            <div className="w-px h-5 bg-slate-800 mx-0.5" />
            <button
              onClick={onToggleTypeLibrary}
              title="Frame Type Library"
              className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors shrink-0 ${
                showTypeLibrary
                  ? 'bg-brand-600/25 text-brand-300 ring-1 ring-brand-600/40'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {/* Grid-with-checkmark icon = type library */}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" />
                <circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span>Types</span>
            </button>
          </>
        )}
        <div className="w-px h-5 bg-slate-800 mx-1.5" />
        <button
          onClick={onScanPage}
          disabled={!onScanPage || isScanRunning}
          title="AI Auto-Scan — detect all frames on this page"
          className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors shrink-0 ${
            isScanRunning
              ? 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30 cursor-wait'
              : 'bg-violet-600/15 text-violet-300 hover:bg-violet-600/25 ring-1 ring-violet-600/25 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          <AiScanIcon />
          <span>{isScanRunning ? 'Scanning…' : 'AI Scan'}</span>
        </button>
      </div>
    </div>
  );
}
