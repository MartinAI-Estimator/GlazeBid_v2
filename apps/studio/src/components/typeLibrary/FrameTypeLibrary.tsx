/**
 * FrameTypeLibrary.tsx
 *
 * Left-panel sidebar that holds the Frame Type Library.
 *
 *  ┌──────────────────────────────┐
 *  │  FRAME TYPE LIBRARY          │
 *  │  ┌────────────────────────┐  │
 *  │  │ ● SF-1A  10'-0"×7'-0" │←── active = ring, click to switch
 *  │  │    Storefront 4B×1R   │  │
 *  │  │    ██ 12 dots  ✎ 🗑  │  │
 *  │  └────────────────────────┘  │
 *  │  + New Type                  │
 *  │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
 *  │  [Send BOM to Builder →]     │
 *  └──────────────────────────────┘
 */

import { useState } from 'react';
import { useProjectStore, type FrameType } from '../../store/useProjectStore';
import { useStudioStore } from '../../store/useStudioStore';
import FrameTypeCreator from './FrameTypeCreator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDim(inches: number): string {
  const ft  = Math.floor(inches / 12);
  const rem = inches - ft * 12;
  if (rem === 0) return `${ft}'-0"`;
  return ft > 0 ? `${ft}'-${rem}"` : `${rem}"`;
}

// ── Sub-component: individual type card ───────────────────────────────────────

function TypeCard({
  type,
  isActive,
  dotCount,
  onSelect,
  onEdit,
  onDelete,
}: {
  type:     FrameType;
  isActive: boolean;
  dotCount: number;
  onSelect: () => void;
  onEdit:   () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={`
        relative rounded-lg border cursor-pointer transition-all duration-150 group
        ${isActive
          ? 'border-brand-400/80 bg-slate-800/80 shadow-lg shadow-brand-900/30'
          : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60'}
      `}
    >
      {/* Active indicator - left edge stripe */}
      {isActive && (
        <div
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={{ background: type.color }}
        />
      )}

      <div className="px-3 py-2.5 pl-4">
        {/* Top row: colored swatch + mark + action buttons */}
        <div className="flex items-center gap-2">
          {/* Colour swatch */}
          <div
            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-md"
            style={{ background: type.color }}
          />

          {/* Mark — always prominent */}
          <span className="font-mono font-extrabold text-xs text-slate-100 tracking-wider flex-1 truncate">
            {type.mark}
          </span>

          {/* Dot count badge */}
          {dotCount > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
              style={{ background: type.color + 'cc' }}
            >
              ×{dotCount}
            </span>
          )}

          {/* Action icons — visible on hover or when active */}
          <div className={`flex gap-1 shrink-0 transition-opacity ${isActive || confirmDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
               onClick={e => e.stopPropagation()}>
            <button
              title="Edit type"
              onClick={onEdit}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              {/* Pencil */}
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064l6.286-6.286zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086z"/>
              </svg>
            </button>

            {confirmDelete ? (
              <>
                <button
                  title="Confirm delete"
                  onClick={() => { onDelete(); setConfirmDelete(false); }}
                  className="text-[10px] text-red-400 hover:text-red-300 px-1.5 h-5 rounded bg-red-900/30 hover:bg-red-900/50 transition-colors font-bold"
                >✓</button>
                <button
                  title="Cancel"
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] text-slate-500 hover:text-slate-300 px-1 h-5 rounded transition-colors"
                >✕</button>
              </>
            ) : (
              <button
                title="Delete type"
                onClick={() => setConfirmDelete(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-red-400 hover:bg-slate-700 transition-colors"
              >
                {/* Trash */}
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.748 1.748 0 0 1-1.741-1.576l-.66-6.6a.75.75 0 1 1 1.492-.149zM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25z"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {type.name && type.name !== type.mark && (
          <p className="text-[10px] text-slate-500 mt-0.5 truncate pl-5">{type.name}</p>
        )}

        {/* Dimensions + system row */}
        <div className="flex items-center gap-2 mt-1.5 pl-5">
          <span className="text-[10px] font-mono text-slate-400">
            {fmtDim(type.widthInches)} × {fmtDim(type.heightInches)}
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-[10px] text-slate-500 truncate">
            {type.bays}B×{type.rows}R
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-[10px] text-slate-500 truncate">{type.systemLabel}</span>
        </div>

        {/* BOM quick stats when type has a computed BOM */}
        {type.bom && dotCount > 0 && (
          <div className="mt-2 pl-5 flex gap-3">
            <span className="text-[10px] text-slate-600">
              Al: <span className="text-slate-400 font-mono">{(type.bom.hardware.totalPieceLF * dotCount).toFixed(0)} LF</span>
            </span>
            <span className="text-[10px] text-slate-600">
              Glass: <span className="text-slate-400 font-mono">{(type.bom.totalGlassSF * dotCount).toFixed(0)} SF</span>
            </span>
          </div>
        )}

        {/* Active tool hint */}
        {isActive && (
          <div className="mt-2 pl-5">
            <span className="text-[10px] text-brand-400 font-semibold animate-pulse">
              ● Click PDF to place dots
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FrameTypeLibrary() {
  const frameTypes          = useProjectStore(s => s.frameTypes);
  const typeDots            = useProjectStore(s => s.typeDots);
  const removeFrameType     = useProjectStore(s => s.removeFrameType);
  const syncFrameTypesToBuilder = useProjectStore(s => s.syncFrameTypesToBuilder);

  const activeFrameTypeId   = useStudioStore(s => s.activeFrameTypeId);
  const setActiveFrameTypeId = useStudioStore(s => s.setActiveFrameTypeId);
  const setActiveTool       = useStudioStore(s => s.setActiveTool);

  const [creatorOpen, setCreatorOpen]       = useState(false);
  const [editingType, setEditingType]       = useState<FrameType | null>(null);

  const totalDots = typeDots.length;

  const handleSelectType = (typeId: string) => {
    if (activeFrameTypeId === typeId) {
      // Deselect — clicking same type again toggles off
      setActiveFrameTypeId(null);
      setActiveTool('select');
    } else {
      setActiveFrameTypeId(typeId);
      setActiveTool('count'); // Switch to count tool automatically
    }
  };

  const handleNewType = () => {
    setEditingType(null);
    setCreatorOpen(true);
  };

  const handleEdit = (type: FrameType) => {
    setEditingType(type);
    setCreatorOpen(true);
  };

  const handleDelete = (typeId: string) => {
    if (activeFrameTypeId === typeId) {
      setActiveFrameTypeId(null);
      setActiveTool('select');
    }
    removeFrameType(typeId);
  };

  const handleSync = () => {
    syncFrameTypesToBuilder();
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full bg-slate-900 select-none" style={{ minWidth: 0 }}>

        {/* ── Header ── */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-300">
                Frame Types
              </h3>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {frameTypes.length === 0
                  ? 'Define types, then count on the PDF'
                  : `${frameTypes.length} type${frameTypes.length === 1 ? '' : 's'}  ·  ${totalDots} dot${totalDots === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={handleNewType}
              title="New frame type"
              className="w-6 h-6 flex items-center justify-center rounded-md bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors shrink-0"
            >+</button>
          </div>
        </div>

        {/* ── Type list ── */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {frameTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pb-8 gap-3">
              {/* Empty state icon */}
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-slate-600">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-500">No frame types yet</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Click + to define your first type</p>
              </div>
              <button
                onClick={handleNewType}
                className="text-xs font-bold text-brand-400 hover:text-brand-300 transition-colors"
              >+ New Frame Type</button>
            </div>
          ) : (
            frameTypes.map(ft => {
              const dotCount = typeDots.filter(d => d.frameTypeId === ft.id).length;
              return (
                <TypeCard
                  key={ft.id}
                  type={ft}
                  isActive={activeFrameTypeId === ft.id}
                  dotCount={dotCount}
                  onSelect={() => handleSelectType(ft.id)}
                  onEdit={() => handleEdit(ft)}
                  onDelete={() => handleDelete(ft.id)}
                />
              );
            })
          )}
        </div>

        {/* ── Footer: Add + Sync ── */}
        <div className="px-2 pb-3 pt-2 border-t border-slate-800 space-y-1.5 shrink-0">
          {/* New type button */}
          {frameTypes.length > 0 && (
            <button
              onClick={handleNewType}
              className="w-full py-1.5 rounded-lg border border-dashed border-slate-700 hover:border-brand-500/50 text-slate-600 hover:text-brand-400 text-xs font-semibold transition-all"
            >
              + New Frame Type
            </button>
          )}

          {/* Send to Builder */}
          {frameTypes.length > 0 && (
            <button
              onClick={handleSync}
              disabled={totalDots === 0}
              title={totalDots === 0 ? 'Place at least one dot before syncing' : 'Send aggregated BOM to Builder'}
              className={`
                w-full py-2 rounded-lg text-xs font-bold transition-all
                ${totalDots > 0
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'}
              `}
            >
              {totalDots > 0
                ? `Send ${totalDots} dot${totalDots !== 1 ? 's' : ''} to Builder →`
                : 'Place dots to sync BOM'}
            </button>
          )}
        </div>
      </div>

      {/* ── Frame Type Creator modal ── */}
      {creatorOpen && (
        <FrameTypeCreator
          existing={editingType}
          onClose={() => { setCreatorOpen(false); setEditingType(null); }}
        />
      )}
    </>
  );
}
