/**
 * QuickAssignMenu.tsx
 *
 * Floating panel that appears after the user finishes drawing a frame highlight.
 * Lets the estimator assign the frame to an existing GlazingSystem, or create
 * a new system on the fly.
 *
 * Opens when useStudioStore.pendingFrameBounds is set.
 * Positioned at (screenX, screenY) relative to the StudioCanvas container.
 *
 * On assign:
 *   1. Updates the RectShape's color + frameSystemId/Type in useStudioStore.
 *   2. Adds a FrameEntry to useProjectStore (Studio-side project data).
 *   3. Clears pendingFrameBounds (closes this menu).
 *
 * On dismiss (Escape / outside click / "Skip"):
 *   Frame shape stays on canvas with the neutral "unassigned" colour.
 */

import { useState, useEffect, useRef } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import {
  useProjectStore,
  SYSTEM_TYPE_LABELS,
  SYSTEM_COLORS,
  FRAME_PROFILES,
  DEFAULT_PROFILE_FOR_SYSTEM,
  type SystemType,
  type ProfileKey,
} from '../../store/useProjectStore';

// ── Constants ───────────────────────────────────────────────────────────────

const SYSTEM_TYPES = Object.keys(SYSTEM_TYPE_LABELS) as SystemType[];
const PROFILE_KEYS = Object.keys(FRAME_PROFILES) as ProfileKey[];

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickAssignMenu() {
  const pending             = useStudioStore(s => s.pendingFrameBounds);
  const setPending          = useStudioStore(s => s.setPendingFrameBounds);
  const updateShape         = useStudioStore(s => s.updateShape);
  const setPendingGridEdit  = useStudioStore(s => s.setPendingGridEdit);
  const activePageId        = useStudioStore(s => s.activePageId);

  const systems          = useProjectStore(s => s.systems);
  const addSystem        = useProjectStore(s => s.addSystem);
  const addTakeoff       = useProjectStore(s => s.addTakeoff);

  // Needed to resolve page-pixel coords from the committed shape
  const shapes           = useStudioStore(s => s.shapes);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newType,     setNewType]     = useState<SystemType>('ext-sf-1');
  const [newName,     setNewName]     = useState('');
  const [newProfile,  setNewProfile]  = useState<ProfileKey>('sf-450');
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep profile default in sync with selected system type
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNewProfile(DEFAULT_PROFILE_FOR_SYSTEM[newType]); }, [newType]);

  // ── Dismiss on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!pending) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setPending(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPending(null);
    }
    // Slight delay so the mouseup that opened this menu doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown',   onKeyDown);
    }, 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, [pending, setPending]);

  // Reset new-system form when menu opens
  useEffect(() => {
    if (pending) { setShowNewForm(false); setNewName(''); setNewType('ext-sf-1'); }
  }, [pending]);

  if (!pending) return null;

  // ── Assign to an existing system ─────────────────────────────────────────
  function assignToSystem(systemId: string) {
    if (!pending) return;
    const sys = systems.find(s => s.id === systemId);
    if (!sys) return;

    updateShape(pending.shapeId, {
      color:           sys.color,
      label:           sys.name,
      frameSystemId:   sys.id,
      frameSystemType: sys.systemType,
    } as never);   // cast: frameSystem* are optional extras on RectShape

    // Resolve page-pixel geometry from the canvas shape
    const shape = shapes.find(sh => sh.id === pending.shapeId);
    const origin = shape?.type === 'rect' ? shape.origin : { x: 0, y: 0 };
    const widthPx  = shape?.type === 'rect' ? shape.widthPx  : 0;
    const heightPx = shape?.type === 'rect' ? shape.heightPx : 0;

    addTakeoff({
      shapeId:      pending.shapeId,
      pageId:       activePageId,
      x:            origin.x,
      y:            origin.y,
      widthPx,
      heightPx,
      widthInches:  pending.widthInches,
      heightInches: pending.heightInches,
      type:         'Area',
      systemId:     sys.id,
      label:        sys.name,
    });

    // Trigger GridEditor so the estimator can set mullion layout immediately
    setPendingGridEdit({
      shapeId:      pending.shapeId,
      widthInches:  pending.widthInches,
      heightInches: pending.heightInches,
    });

    setPending(null);
  }

  // ── Create a new system and assign ───────────────────────────────────────
  function createAndAssign() {
    if (!pending) return;
    const name = newName.trim() || undefined;
    const id   = addSystem(newType, name);
    // Apply the chosen profile immediately
    useProjectStore.getState().updateSystem(id, { profileKey: newProfile });
    assignToSystem(id);
  }

  // ── Position the menu ─────────────────────────────────────────────────────
  // The menu is absolutely positioned inside the canvas container.
  // Shift left by 120 px so it appears centred above the drawn rect.
  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left:     Math.max(8, pending.screenX - 120),
    top:      Math.max(8, pending.screenY - 8),
    zIndex:   50,
  };

  const dimLabel = `${pending.widthInches.toFixed(2)}" × ${pending.heightInches.toFixed(2)}"`;

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <span className="font-semibold text-slate-200">Assign Frame</span>
        <span className="font-mono text-slate-400">{dimLabel}</span>
      </div>

      {/* Existing systems list */}
      {systems.length > 0 && (
        <div className="max-h-40 overflow-y-auto divide-y divide-slate-800">
          {systems.map(sys => (
            <button
              key={sys.id}
              onClick={() => assignToSystem(sys.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 transition-colors text-left"
            >
              {/* Colour swatch */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: sys.color }}
              />
              <span className="flex-1 text-slate-200 truncate">{sys.name}</span>
              <span className="text-slate-500 shrink-0 text-[10px]">
                {sys.profileKey ? FRAME_PROFILES[sys.profileKey]?.depth + '"' : SYSTEM_TYPE_LABELS[sys.systemType]}
              </span>
            </button>
          ))}
        </div>
      )}

      {systems.length === 0 && !showNewForm && (
        <p className="px-3 py-2 text-slate-500 italic">No systems yet — create one below.</p>
      )}

      {/* New system form */}
      {showNewForm ? (
        <div className="p-3 border-t border-slate-700 space-y-2">
          <div>
            <label className="block text-slate-400 mb-1">System type</label>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as SystemType)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {SYSTEM_TYPES.map(t => (
                <option key={t} value={t}>{SYSTEM_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createAndAssign(); }}
              placeholder={`${SYSTEM_TYPE_LABELS[newType]} 001`}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {/* System colour preview */}
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: SYSTEM_COLORS[newType] }}
            />
            <span className="text-slate-500">Highlight colour preview</span>
          </div>
          {/* Frame profile / depth */}
          <div>
            <label className="block text-slate-400 mb-1">Frame profile / depth</label>
            <select
              value={newProfile}
              onChange={e => setNewProfile(e.target.value as ProfileKey)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PROFILE_KEYS.map(k => (
                <option key={k} value={k}>{FRAME_PROFILES[k].label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-600">
              {FRAME_PROFILES[newProfile].depth}" depth · {FRAME_PROFILES[newProfile].sightline}" sightline
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createAndAssign}
              className="flex-1 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors"
            >
              Create &amp; Assign
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2 border-t border-slate-700 flex gap-2">
          <button
            onClick={() => setShowNewForm(true)}
            className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
          >
            + New System
          </button>
          <button
            onClick={() => setPending(null)}
            className="px-2 py-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Skip — leave frame unassigned"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
