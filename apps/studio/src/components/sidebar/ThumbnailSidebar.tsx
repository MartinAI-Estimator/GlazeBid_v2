/**
 * ThumbnailSidebar.tsx
 *
 * Left sidebar showing a scrollable strip of page thumbnails.
 * - Clicking a thumbnail switches the active page and fits viewport.
 * - The active page is highlighted with a brand-colour ring.
 * - Shows the file name and page count when a PDF is loaded.
 * - Collapses gracefully when no PDF is loaded (single placeholder card).
 */

import { useStudioStore } from '../../store/useStudioStore';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';

type Props = {
  engine: CanvasEngineAPI | null;
};

export default function ThumbnailSidebar({ engine }: Props) {
  const pages         = useStudioStore(s => s.pages);
  const activePageId  = useStudioStore(s => s.activePageId);
  const pdfFileName   = useStudioStore(s => s.pdfFileName);
  const setActivePage = useStudioStore(s => s.setActivePage);

  function handlePageClick(pageId: string) {
    setActivePage(pageId);
    // Fit the viewport to the newly-selected page via the engine API.
    // fitToPage() reads the active page from the store — set first, then fit.
    requestAnimationFrame(() => engine?.fitToPage());
  }

  return (
    <aside className="w-[140px] flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-800 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
          {pdfFileName ?? 'No PDF'}
        </p>
        {pdfFileName && (
          <p className="text-[9px] text-slate-700 mt-0.5">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </p>
        )}
      </div>

      {/* Scrollable thumbnail list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-2 px-2">
        {pages.map((page, idx) => {
          const isActive = page.id === activePageId;
          return (
            <button
              key={page.id}
              onClick={() => handlePageClick(page.id)}
              title={page.label}
              className={`w-full rounded overflow-hidden transition-all outline-none focus:outline-none ${
                isActive
                  ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-slate-950'
                  : 'ring-1 ring-slate-800 hover:ring-slate-600'
              }`}
            >
              {page.thumbnailUrl ? (
                /* Thumbnail rendered during PDF load */
                <img
                  src={page.thumbnailUrl}
                  alt={page.label}
                  className="w-full block bg-white"
                  draggable={false}
                />
              ) : (
                /* Placeholder for pages without a thumbnail (e.g. default page) */
                <div
                  className="w-full bg-white"
                  style={{ paddingBottom: `${(page.heightPx / page.widthPx) * 100}%` }}
                />
              )}

              {/* Page number label */}
              <div className={`py-0.5 text-center text-[9px] font-mono truncate ${
                isActive ? 'bg-brand-600/25 text-brand-400' : 'bg-slate-900 text-slate-600'
              }`}>
                {idx + 1}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
