/**
 * ThumbnailSidebar.tsx
 *
 * Left sidebar with two tabs:
 *   • Thumbnails — scrollable page thumbnails with inline-editable labels.
 *   • Bookmarks  — quick-access list of bookmarked pages.
 *
 * Resizable via a drag handle on the right edge (80–320 px).
 * Collapsible: double-click the handle or click the collapse chevron.
 */

import { useState, useRef, useCallback } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';

const MIN_W = 80;
const MAX_W = 320;
const DEFAULT_W = 160;

type Tab = 'thumbnails' | 'bookmarks';

type Props = {
  engine: CanvasEngineAPI | null;
};

export default function ThumbnailSidebar({ engine }: Props) {
  const pages             = useStudioStore(s => s.pages);
  const activePageId      = useStudioStore(s => s.activePageId);
  const pdfFileName       = useStudioStore(s => s.pdfFileName);
  const setActivePage     = useStudioStore(s => s.setActivePage);
  const setPageLabel      = useStudioStore(s => s.setPageLabel);
  const bookmarkedPageIds = useStudioStore(s => s.bookmarkedPageIds);
  const toggleBookmark    = useStudioStore(s => s.toggleBookmark);

  const [tab, setTab]           = useState<Tab>('thumbnails');
  const [width, setWidth]       = useState(DEFAULT_W);
  const [collapsed, setCollapsed] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editValue, setEditValue]         = useState('');
  const lastWidthRef = useRef(DEFAULT_W);
  const dragging     = useRef(false);

  function handlePageClick(pageId: string) {
    setActivePage(pageId);
    requestAnimationFrame(() => engine?.fitToPage());
  }

  // ── Label editing ───────────────────────────────────────────────────────
  function startEditing(pageId: string, currentLabel: string) {
    setEditingPageId(pageId);
    setEditValue(currentLabel);
  }

  function commitLabel() {
    if (editingPageId) {
      const trimmed = editValue.trim();
      if (trimmed) setPageLabel(editingPageId, trimmed);
      setEditingPageId(null);
    }
  }

  function cancelEdit() {
    setEditingPageId(null);
  }

  // ── Collapse / resize ──────────────────────────────────────────────────
  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      if (!prev) lastWidthRef.current = width;
      else setWidth(lastWidthRef.current);
      return !prev;
    });
  }, [width]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newW = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX));
      setWidth(newW);
      setCollapsed(false);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  const sidebarW = collapsed ? 0 : width;
  const bookmarkedPages = pages.filter(p => bookmarkedPageIds.has(p.id));

  return (
    <div className="relative flex-shrink-0 flex" style={{ width: sidebarW }}>
      <aside
        className="bg-slate-950 border-r border-slate-800 flex flex-col overflow-hidden"
        style={{ width: sidebarW, minWidth: 0, transition: dragging.current ? 'none' : 'width 150ms ease' }}
      >
        {!collapsed && (
          <>
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

            {/* Tab bar */}
            <div className="flex border-b border-slate-800 shrink-0">
              <button
                onClick={() => setTab('thumbnails')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  tab === 'thumbnails'
                    ? 'text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Pages
              </button>
              <button
                onClick={() => setTab('bookmarks')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  tab === 'bookmarks'
                    ? 'text-amber-400 border-b-2 border-amber-500'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Bookmarks
                {bookmarkedPages.length > 0 && (
                  <span className="ml-1 text-[9px] text-slate-600">({bookmarkedPages.length})</span>
                )}
              </button>
            </div>

            {/* ── Thumbnails tab ──────────────────────────────────────────── */}
            {tab === 'thumbnails' && (
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-2 px-2">
                {pages.map((page, idx) => {
                  const isActive  = page.id === activePageId;
                  const isBookmarked = bookmarkedPageIds.has(page.id);
                  const isEditing = editingPageId === page.id;

                  return (
                    <div key={page.id} className="group relative">
                      {/* Bookmark toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleBookmark(page.id); }}
                        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                        className={`absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded transition-all ${
                          isBookmarked
                            ? 'text-amber-400 opacity-100'
                            : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:text-amber-400'
                        }`}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                      </button>

                      {/* Thumbnail */}
                      <button
                        onClick={() => handlePageClick(page.id)}
                        className={`w-full rounded overflow-hidden transition-all outline-none focus:outline-none ${
                          isActive
                            ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-slate-950'
                            : 'ring-1 ring-slate-800 hover:ring-slate-600'
                        }`}
                      >
                        {page.thumbnailUrl ? (
                          <img
                            src={page.thumbnailUrl}
                            alt={page.label}
                            className="w-full block bg-white"
                            draggable={false}
                          />
                        ) : (
                          <div
                            className="w-full bg-white"
                            style={{ paddingBottom: `${(page.heightPx / page.widthPx) * 100}%` }}
                          />
                        )}
                      </button>

                      {/* Label row: page number + editable label */}
                      <div
                        className={`mt-0.5 flex items-center gap-1 px-1 py-0.5 rounded ${
                          isActive ? 'bg-brand-600/15' : 'bg-transparent'
                        }`}
                      >
                        <span className={`text-[9px] font-mono shrink-0 ${
                          isActive ? 'text-brand-400' : 'text-slate-600'
                        }`}>
                          {idx + 1}.
                        </span>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitLabel}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitLabel();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-1 py-0 text-[9px] text-slate-100 focus:outline-none focus:border-brand-500"
                          />
                        ) : (
                          <span
                            onDoubleClick={() => startEditing(page.id, page.label)}
                            title="Double-click to edit label"
                            className={`flex-1 min-w-0 truncate text-[9px] cursor-text ${
                              isActive ? 'text-brand-300' : 'text-slate-500'
                            }`}
                          >
                            {page.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Bookmarks tab ──────────────────────────────────────────── */}
            {tab === 'bookmarks' && (
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
                {bookmarkedPages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                    <svg className="w-6 h-6 text-slate-700 mb-2" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                    </svg>
                    <p className="text-[10px] text-slate-600">No bookmarks yet</p>
                    <p className="text-[9px] text-slate-700 mt-0.5">Hover a page thumbnail and click the bookmark icon</p>
                  </div>
                ) : (
                  bookmarkedPages.map(page => {
                    const idx = pages.indexOf(page);
                    const isActive = page.id === activePageId;
                    return (
                      <button
                        key={page.id}
                        onClick={() => handlePageClick(page.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                          isActive
                            ? 'bg-brand-600/15 text-brand-300'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                        }`}
                      >
                        <svg className="w-3 h-3 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                        <span className="text-[9px] font-mono text-slate-600 shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="text-[10px] truncate flex-1">
                          {page.label}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBookmark(page.id); }}
                          title="Remove bookmark"
                          className="text-slate-600 hover:text-red-400 shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </aside>

      {/* Resize handle — right edge */}
      {!collapsed && (
        <div
          onMouseDown={onResizeStart}
          onDoubleClick={toggleCollapse}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group"
        >
          <div className="w-px h-full ml-auto bg-slate-800 group-hover:bg-brand-500 transition-colors" />
        </div>
      )}

      {/* Collapse / expand chevron */}
      <button
        onClick={toggleCollapse}
        title={collapsed ? 'Expand thumbnails' : 'Collapse thumbnails'}
        className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-20 w-3.5 h-8 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-r text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          {collapsed
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />}
        </svg>
      </button>
    </div>
  );
}
