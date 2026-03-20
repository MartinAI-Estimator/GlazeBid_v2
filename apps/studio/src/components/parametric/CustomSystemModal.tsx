/**
 * CustomSystemModal.tsx
 *
 * Modal opened when the estimator right-clicks a highlight and chooses
 * "Send to Custom System".
 *
 * Flow:
 *   1. Shows a list of existing CustomSystemCards (if any)
 *   2. Estimator picks an existing card  →  highlight ref is appended
 *   3.   … or taps "+ New Custom System" →  name prompt → new card created
 *   4. Success toast + close
 *
 * What counts as a "Custom System"?
 *   Anything outside the 5 standard glazing archetypes:
 *   transaction windows, auto sliders, fire-rated storefront,
 *   sunshades, glazing-only conditions, hollow-metal glaze-ins, etc.
 */

import { useState } from 'react';
import { useProjectStore, type CustomSystemCard } from '../../store/useProjectStore';
import type { RectShape, PolygonShape } from '../../types/shapes';

interface CustomSystemModalProps {
  shape:   RectShape | PolygonShape;
  onClose: () => void;
}

export default function CustomSystemModal({ shape, onClose }: CustomSystemModalProps) {
  const cards               = useProjectStore(s => s.customSystemCards);
  const addCustomSystemCard = useProjectStore(s => s.addCustomSystemCard);
  const addHighlightToCard  = useProjectStore(s => s.addHighlightToCard);
  const syncCustomCards     = useProjectStore(s => s.syncCustomCardsToBuilder);

  const [mode,     setMode]     = useState<'pick' | 'new'>('pick');
  const [newName,  setNewName]  = useState('');
  const [newDesc,  setNewDesc]  = useState('');
  const [toast,    setToast]    = useState('');

  // Geometry from the shape
  const widthIn  = shape.type === 'rect' ? shape.widthInches  : shape.bbWidthInches;
  const heightIn = shape.type === 'rect' ? shape.heightInches : shape.bbHeightInches;
  const areaSF   = (widthIn * heightIn) / 144;
  const perimLF  = (2 * (widthIn + heightIn)) / 12;

  const highlightRef = {
    shapeId:      shape.id,
    pageId:       shape.pageId,
    label:        shape.label,
    widthInches:  widthIn,
    heightInches: heightIn,
    areaSF:       +areaSF.toFixed(3),
    perimeterLF:  +perimLF.toFixed(3),
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(onClose, 1400);
  }

  function handleAddToExisting(card: CustomSystemCard) {
    addHighlightToCard(card.id, highlightRef);
    syncCustomCards();
    showToast(`Added to "${card.name}"`);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = addCustomSystemCard(name, newDesc.trim());
    addHighlightToCard(id, highlightRef);
    syncCustomCards();
    showToast(`Created "${name}"`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden">

        {/* Toast overlay */}
        {toast && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/90 rounded-xl">
            <span className="text-sm font-semibold text-emerald-400">✅ {toast}</span>
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Send to Custom System</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(shape.label ?? 'Highlight')} &nbsp;·&nbsp;
              {widthIn.toFixed(2)}&quot; × {heightIn.toFixed(2)}&quot; &nbsp;·&nbsp;
              {areaSF.toFixed(2)} SF
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none px-1">✕</button>
        </div>

        {/* Mode switch */}
        <div className="flex border-b border-slate-700 shrink-0">
          <TabButton active={mode === 'pick'} onClick={() => setMode('pick')}>
            Add to Existing
          </TabButton>
          <TabButton active={mode === 'new'} onClick={() => setMode('new')}>
            + New System
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {mode === 'pick' ? (
            cards.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-slate-500">No custom systems yet.</p>
                <button
                  className="mt-2 text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  onClick={() => setMode('new')}
                >
                  Create your first one →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {cards.map(card => (
                  <button
                    key={card.id}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-violet-500/60 transition-colors text-left group"
                    onClick={() => handleAddToExisting(card)}
                  >
                    <span className="text-lg mt-0.5 shrink-0">⚙️</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-slate-100 group-hover:text-violet-200 truncate">
                        {card.name}
                      </span>
                      {card.description && (
                        <span className="block text-[10px] text-slate-500 mt-0.5 truncate">
                          {card.description}
                        </span>
                      )}
                      <span className="block text-[10px] text-slate-600 mt-1">
                        {card.totals.count} item{card.totals.count !== 1 ? 's' : ''} &nbsp;·&nbsp;
                        {card.totals.totalAreaSF.toFixed(1)} SF
                      </span>
                    </span>
                    <span className="text-xs text-violet-400 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      Add →
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : (
            /* New card form */
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  System Name *
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="e.g. Transaction Windows, Sunshades Lvl 2"
                  className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Scope Notes (optional)
                </label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="e.g. Glazing-only, 1/4″ monolithic, owner-furnished frames"
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>

              {/* Example categories as chips */}
              <div>
                <p className="text-[10px] text-slate-600 mb-1.5">Common categories:</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-violet-300 transition-colors"
                      onClick={() => setNewName(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-[10px] text-slate-500 space-y-0.5">
                <div className="font-semibold text-slate-400 mb-1">Card will include:</div>
                <div>{widthIn.toFixed(2)}&quot; × {heightIn.toFixed(2)}&quot;</div>
                <div>{areaSF.toFixed(2)} SF &nbsp;/&nbsp; {perimLF.toFixed(2)} LF perimeter</div>
                {shape.label && <div>Label: {shape.label}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'new' && (
          <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 flex justify-end gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors"
            >
              Create & Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`flex-1 py-2 text-xs font-medium transition-colors ${
        active
          ? 'text-violet-300 border-b-2 border-violet-500 bg-slate-800'
          : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const COMMON_CATEGORIES = [
  'Transaction Windows',
  'Auto Sliders',
  'Sunshades',
  'Fire-Rated Storefront',
  'Glazing Only',
  'HM Door Glaze-In',
  'Borrowed Lights',
  'Wood Door Glaze-In',
  'Pass-Through Windows',
  'Fixed Skylights',
];
