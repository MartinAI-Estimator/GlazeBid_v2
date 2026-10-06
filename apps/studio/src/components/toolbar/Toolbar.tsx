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
  engine: CanvasEngineAPI | null;
};

// ── Icon components ────────────────────────────────────────────────────────────

function LineIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 20l16-16" /></svg>; }
function RectIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /></svg>; }
function TextIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" d="M5 6h14M12 6v13" /></svg>; }
function CalloutIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="9" y="3" width="12" height="8" rx="1" /><path strokeLinecap="round" d="M9 9L3 20" /></svg>; }
function CloudIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" d="M6 17a3 3 0 010-6 4 4 0 017.5-2A3.5 3.5 0 0118 12a2.5 2.5 0 010 5H6z" /></svg>; }
function ArrowIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 19L19 5M19 5h-7M19 5v7" /></svg>; }
function PolylineIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-8 5 5 8-9" /><circle cx="3" cy="17" r="1.2" fill="currentColor" /><circle cx="21" cy="5" r="1.2" fill="currentColor" /></svg>; }
function PolygonIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 18l5-13 7 4 3-5 3 14H3z" /></svg>; }
function CalibrateIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>; }
function FrameIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="2 1.5" /></svg>; }
function OpenPdfIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>; }
function CountIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" /><circle cx="16" cy="16" r="2.5" /></svg>; }


// ── Tool definitions ──────────────────────────────────────────────────────────

type ToolDef = {
  id:      ToolType;
  label:   string;
  icon:    React.ReactNode;
  shortcut: string;
};

const TOOLS: ToolDef[] = [
  { id: 'line',      label: 'Line',            icon: <LineIcon />,      shortcut: 'L' },
  { id: 'rect',      label: 'Rectangle',       icon: <RectIcon />,      shortcut: 'R' },
  { id: 'polygon',   label: 'Polygon',         icon: <PolygonIcon />,   shortcut: 'P' },
  { id: 'polyline',  label: 'Polylength',      icon: <PolylineIcon />,  shortcut: 'N' },
  { id: 'text',      label: 'Text Box',        icon: <TextIcon />,      shortcut: 'T' },
  { id: 'callout',   label: 'Callout',         icon: <CalloutIcon />,   shortcut: 'Q' },
  { id: 'cloud',     label: 'Cloud',           icon: <CloudIcon />,     shortcut: 'C' },
  { id: 'arrow',     label: 'Arrow',           icon: <ArrowIcon />,     shortcut: 'A' },
  { id: 'calibrate', label: 'Calibrate',       icon: <CalibrateIcon />, shortcut: 'K' },
  { id: 'frame',     label: 'Frame Highlight', icon: <FrameIcon />,     shortcut: 'F' },
];

// ── Toolbar ────────────────────────────────────────────────────────────────────

export default function Toolbar({ engine }: Props) {
  const activeTool         = useStudioStore(s => s.activeTool);
  const pdfFileName        = useStudioStore(s => s.pdfFileName);
  const activeFrameTypeId  = useStudioStore(s => s.activeFrameTypeId);
  const setActiveTool      = useStudioStore(s => s.setActiveTool);
  const setActiveFrameTypeId = useStudioStore(s => s.setActiveFrameTypeId);

  const frameTypes         = useProjectStore(s => s.frameTypes);
  const activeType         = activeFrameTypeId ? frameTypes.find(ft => ft.id === activeFrameTypeId) : null;

  const Btn = ({ onClick, title, active, activeClass, children, disabled }: {
    onClick?: () => void; title: string; active?: boolean;
    activeClass?: string; children: React.ReactNode; disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
        active
          ? (activeClass ?? 'bg-brand-600/25 text-brand-400 ring-1 ring-brand-600/40')
          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-0.5 w-11 py-2 bg-slate-900 border-l border-slate-800 shrink-0 overflow-y-auto overflow-x-hidden">

      {/* Open PDF */}
      <Btn
        onClick={() => engine?.openPdf()}
        title={pdfFileName ? `PDF: ${pdfFileName}` : 'Open PDF'}
        active={!!pdfFileName}
        activeClass="bg-brand-600/20 text-brand-400 ring-1 ring-brand-600/30"
      >
        <OpenPdfIcon />
      </Btn>

      <div className="h-px w-7 bg-slate-800 my-1" />

      {/* Drawing tools */}
      {TOOLS.map(tool => (
        <Btn
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          active={activeTool === tool.id}
        >
          {tool.icon}
        </Btn>
      ))}

      {/* Active frame-type badge */}
      {activeTool === 'count' && activeType && (
        <>
          <div className="h-px w-7 bg-slate-800 my-1" />
          <div
            className="flex flex-col items-center justify-center w-8 h-8 rounded-md bg-slate-800/80 ring-1 ring-slate-700 cursor-pointer"
            title={`${activeType.mark} — ${activeType.name}. Click to deselect.`}
            onClick={() => { setActiveFrameTypeId(null); setActiveTool('select'); }}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: activeType.color }} />
            <span className="font-mono font-bold text-[9px] text-slate-200 mt-0.5">{activeType.mark}</span>
          </div>
        </>
      )}

      {/* Calibration hint */}
      {activeTool === 'calibrate' && (
        <>
          <div className="h-px w-7 bg-slate-800 my-1" />
          <div className="w-8 flex items-center justify-center" title="Draw a line over a known dimension, then enter its real-world length.">
            <svg className="w-4 h-4 text-amber-400/80" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>
        </>
      )}


    </div>
  );
}
