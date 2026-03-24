import { useStudioStore, type ToolType } from '../../store/useStudioStore';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';

function TypeLibraryIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" /><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none" /></svg>; }
function AiScanIcon()      { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m9 0h4.5m-4.5 0v4.5m-9 11.25H3.75m0 0v-4.5m16.5 4.5h-4.5m4.5 0v-4.5M9 9l1.5 1.5L13.5 7" /><circle cx="12" cy="12" r="4" strokeDasharray="2 1.5" /></svg>; }

type Props = {
  engine: CanvasEngineAPI | null;
  showTypeLibrary?: boolean;
  onToggleTypeLibrary?: () => void;
  onScanPage?: () => void;
  isScanRunning?: boolean;
};

function ZoomInIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>; }
function ZoomOutIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" /></svg>; }
function FitIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>; }
function GridIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>; }
function SnapIcon()    { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function ScrollIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18" /></svg>; }

function ChevronLeftIcon()  { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>; }
function ChevronRightIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>; }
function SelectIcon()       { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-5.879 5.879a3 3 0 01-4.243-4.243l7.396-7.396A3 3 0 0116.5 7.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 4.5l4 1 1 4 4 1 1 4-4-1-1-4-4-1z" /></svg>; }
function PanIcon()          { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75L12 2.25l4.5 1.5M12 2.25v19.5M4.5 7.5L3 12l1.5 4.5M19.5 7.5L21 12l-1.5 4.5M7.5 20.25L12 21.75l4.5-1.5" /></svg>; }

export default function NavigationBar({ engine, showTypeLibrary, onToggleTypeLibrary, onScanPage, isScanRunning }: Props) {
  const cameraScale      = useStudioStore(s => s.cameraScale);
  const objectSnap       = useStudioStore(s => s.objectSnap);
  const showGrid         = useStudioStore(s => s.showGrid);
  const continuousScroll = useStudioStore(s => s.continuousScroll);
  const activeTool       = useStudioStore(s => s.activeTool);
  const setActiveTool    = useStudioStore(s => s.setActiveTool);
  const toggleSnap       = useStudioStore(s => s.toggleObjectSnap);
  const toggleGrid       = useStudioStore(s => s.toggleGrid);
  const toggleContScroll = useStudioStore(s => s.toggleContinuousScroll);

  const pages        = useStudioStore(s => s.pages);
  const activePageId = useStudioStore(s => s.activePageId);
  const setActivePage = useStudioStore(s => s.setActivePage);

  const pageIndex = pages.findIndex(p => p.id === activePageId);
  const pageNum   = pageIndex + 1;
  const pageTotal = pages.length;

  const Btn = ({
    onClick, title, active, activeClass, children,
  }: {
    onClick?: () => void; title: string; active?: boolean;
    activeClass?: string; children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
        active
          ? (activeClass ?? 'bg-brand-600/25 text-brand-400 ring-1 ring-brand-600/40')
          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );

  const Sep = () => <div className="w-px h-5 bg-slate-800 mx-1" />;

  return (
    <div className="flex items-center gap-0.5 px-3 h-10 bg-slate-900 border-t border-slate-800 shrink-0">
      {/* Select & Pan */}
      <Btn onClick={() => setActiveTool('select')} title="Select (V)" active={activeTool === 'select'}><SelectIcon /></Btn>
      <Btn onClick={() => setActiveTool('pan')} title="Pan (H)" active={activeTool === 'pan'}><PanIcon /></Btn>

      <Sep />

      {/* Zoom controls */}
      <Btn onClick={() => engine?.zoomOut()} title="Zoom Out (−)"><ZoomOutIcon /></Btn>
      <span className="text-[9px] font-mono text-slate-500 tabular-nums select-none w-9 text-center">
        {Math.round(cameraScale * 100)}%
      </span>
      <Btn onClick={() => engine?.zoomIn()} title="Zoom In (+)"><ZoomInIcon /></Btn>
      <Btn onClick={() => engine?.fitToPage()} title="Fit to Page (0)"><FitIcon /></Btn>

      <Sep />

      {/* View toggles */}
      <Btn
        onClick={toggleSnap}
        title={`Object Snap: ${objectSnap ? 'ON' : 'OFF'}`}
        active={objectSnap}
      >
        <SnapIcon />
      </Btn>
      <Btn
        onClick={toggleGrid}
        title={`Grid: ${showGrid ? 'ON' : 'OFF'}`}
        active={showGrid}
        activeClass="bg-slate-700/60 text-slate-300"
      >
        <GridIcon />
      </Btn>
      <Btn
        onClick={toggleContScroll}
        title={`Continuous Scroll: ${continuousScroll ? 'ON' : 'OFF'}`}
        active={continuousScroll}
        activeClass="bg-slate-700/60 text-slate-300"
      >
        <ScrollIcon />
      </Btn>
      <Sep />

      {/* Page navigation */}
      <Btn
        onClick={() => pageIndex > 0 && setActivePage(pages[pageIndex - 1].id)}
        title="Previous Page"
        active={false}
      >
        <ChevronLeftIcon />
      </Btn>
      <span className="text-[9px] font-mono text-slate-500 tabular-nums select-none w-12 text-center">
        {pageNum} / {pageTotal}
      </span>
      <Btn
        onClick={() => pageIndex < pageTotal - 1 && setActivePage(pages[pageIndex + 1].id)}
        title="Next Page"
        active={false}
      >
        <ChevronRightIcon />
      </Btn>
      {/* Active page label */}
      {pages[pageIndex] && (
        <span className="text-[9px] text-slate-500 truncate max-w-[120px] select-none ml-0.5" title={pages[pageIndex].label}>
          {pages[pageIndex].label}
        </span>
      )}

      <Sep />

      {/* Frame Type Library + AI Scan */}
      {onToggleTypeLibrary && (
        <Btn
          onClick={onToggleTypeLibrary}
          title="Frame Type Library"
          active={showTypeLibrary}
          activeClass="bg-brand-600/25 text-brand-300 ring-1 ring-brand-600/40"
        >
          <TypeLibraryIcon />
        </Btn>
      )}
      <Btn
        onClick={onScanPage}
        title={isScanRunning ? 'Scanning…' : 'AI Auto-Scan'}
        active={isScanRunning}
        activeClass="bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30 cursor-wait"
      >
        <AiScanIcon />
      </Btn>
    </div>
  );
}
