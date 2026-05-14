/**
 * ShapeContextMenu.tsx
 *
 * Right-click context menu for frame highlights (RectShape / PolygonShape).
 *
 * Actions:
 *   📋  Copy / Paste / Duplicate
 *   ✏️  Edit label
 *   🔲  Edit Bays / Rows
 *   📐  Open in Frame Builder   → sends highlight dims to Builder via IPC
 *   ⚙️  Send to Custom System   → opens CustomSystemModal
 *   🏗️  Check Structural        → opens StructuralPanel slide-in
 *   🗑️  Delete highlight
 *
 * Positioning: absolutely placed at the right-click screen coordinate.
 * Closes on any outside click or Escape key.
 */

import { useEffect, useRef } from 'react';
import type { RectShape, PolygonShape } from '../../types/shapes';
import { getClipboard, setClipboard, hasClipboard } from '../../utils/clipboard';
import { useStudioStore } from '../../store/useStudioStore';

export type ContextMenuTarget = {
  shape:   RectShape | PolygonShape;
  screenX: number;  // canvas-local CSS px
  screenY: number;
};

interface ShapeContextMenuProps {
  target:              ContextMenuTarget;
  onClose:             () => void;
  onEditLabel:         (shape: RectShape | PolygonShape) => void;
  onOpenFrameBuilder:  (shape: RectShape | PolygonShape) => void;
  onSendToCustom:      (shape: RectShape | PolygonShape) => void;
  onCheckStructural:   (shape: RectShape | PolygonShape) => void;
  onDelete:            (shapeId: string) => void;
}

export default function ShapeContextMenu({
  target,
  onClose,
  onEditLabel,
  onOpenFrameBuilder,
  onSendToCustom,
  onCheckStructural,
  onDelete,
}: ShapeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { shape, screenX, screenY } = target;

  const widthIn  = shape.type === 'rect' ? shape.widthInches  : shape.bbWidthInches;
  const heightIn = shape.type === 'rect' ? shape.heightInches : shape.bbHeightInches;
  const label    = shape.label ?? 'Unnamed';

  // Close on outside click or Escape
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown',   onKeyDown,   true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown',   onKeyDown,   true);
    };
  }, [onClose]);

  // ── Copy / Paste / Duplicate handlers ──────────────────────────────────
  function handleCopy() {
    setClipboard({ ...shape });
    onClose();
  }

  function handlePaste() {
    const clip = getClipboard();
    if (!clip || (clip.type !== 'rect' && clip.type !== 'polygon')) return;
    const store = useStudioStore.getState();
    const cloned = { ...clip, id: crypto.randomUUID(), pageId: store.activePageId };
    // Offset by 20 page-px so it doesn't sit directly on top
    if (cloned.type === 'rect') {
      cloned.origin = { x: cloned.origin.x + 20, y: cloned.origin.y + 20 };
    } else if (cloned.type === 'polygon') {
      cloned.points = cloned.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
    }
    store.addShape(cloned);
    store.selectShape(cloned.id);
    onClose();
  }

  function handleDuplicate() {
    const store = useStudioStore.getState();
    const cloned = { ...shape, id: crypto.randomUUID() } as typeof shape;
    if (cloned.type === 'rect') {
      cloned.origin = { x: cloned.origin.x + 20, y: cloned.origin.y + 20 };
    } else if (cloned.type === 'polygon') {
      cloned.points = cloned.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
    }
    store.addShape(cloned);
    store.selectShape(cloned.id);
    onClose();
  }

  function handleEditBaysRows() {
    const store = useStudioStore.getState();
    store.setPendingGridEdit({
      shapeId:      shape.id,
      widthInches:  widthIn,
      heightInches: heightIn,
    });
    onClose();
  }

  // Keep menu inside the viewport
  const MENU_W = 240;
  const MENU_H = 360; // approximate — taller with new items
  const left   = Math.min(screenX, window.innerWidth  - MENU_W - 8);
  const top    = Math.min(screenY, window.innerHeight - MENU_H - 8);

  const canPaste = hasClipboard();
  const canEditGrid = shape.type === 'rect';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden select-none"
      style={{ left, top, minWidth: MENU_W }}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-slate-900 border-b border-slate-700">
        <div className="text-xs font-semibold text-slate-200 truncate">{label}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {widthIn.toFixed(2)}&quot; × {heightIn.toFixed(2)}&quot;
          {shape.type === 'polygon' && (shape as PolygonShape).isRaked && (
            <span className="ml-1.5 text-violet-400">
              raked {((shape as PolygonShape).headSlopeDeg ?? 0).toFixed(1)}°
            </span>
          )}
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <MenuItem
          icon="📋"
          label="Copy"
          shortcut="Ctrl+C"
          onClick={handleCopy}
        />
        <MenuItem
          icon="📋"
          label="Paste"
          shortcut="Ctrl+V"
          onClick={handlePaste}
          disabled={!canPaste}
        />
        <MenuItem
          icon="🔲"
          label="Duplicate"
          shortcut="Ctrl+D"
          onClick={handleDuplicate}
        />
        <Divider />
        <MenuItem
          icon="✏️"
          label="Edit label"
          onClick={() => { onEditLabel(shape); onClose(); }}
        />
        {canEditGrid && (
          <MenuItem
            icon="⊞"
            label="Edit Bays / Rows"
            sublabel="Mullion grid layout"
            onClick={handleEditBaysRows}
          />
        )}
        <Divider />
        <MenuItem
          icon="📐"
          label="Open in Frame Builder"
          sublabel="Pre-fills width × height + system"
          onClick={() => { onOpenFrameBuilder(shape); onClose(); }}
          accent="sky"
        />
        <MenuItem
          icon="⚙️"
          label="Send to Custom System"
          sublabel="Transaction windows, sunshades, misc"
          onClick={() => { onSendToCustom(shape); onClose(); }}
          accent="violet"
        />
        <MenuItem
          icon="🏗️"
          label="Check Structural"
          sublabel="Wind load, deflection, steel sizing"
          onClick={() => { onCheckStructural(shape); onClose(); }}
          accent="amber"
        />
        <Divider />
        <MenuItem
          icon="🗑️"
          label="Delete highlight"
          shortcut="Del"
          onClick={() => { onDelete(shape.id); onClose(); }}
          danger
        />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-px mx-3 my-0.5 bg-slate-700" />;
}

type AccentColor = 'sky' | 'violet' | 'amber';

function MenuItem({
  icon,
  label,
  sublabel,
  shortcut,
  onClick,
  accent,
  danger = false,
  disabled = false,
}: {
  icon:      string;
  label:     string;
  sublabel?: string;
  shortcut?: string;
  onClick:   () => void;
  accent?:   AccentColor;
  danger?:   boolean;
  disabled?: boolean;
}) {
  const accentClass: Record<AccentColor, string> = {
    sky:    'group-hover:text-sky-300',
    violet: 'group-hover:text-violet-300',
    amber:  'group-hover:text-amber-300',
  };

  return (
    <button
      className={`group w-full flex items-start gap-2.5 px-3 py-1.5 text-left transition-colors
        ${disabled
          ? 'opacity-40 cursor-default'
          : danger
            ? 'hover:bg-red-900/30 text-red-400 hover:text-red-300'
            : 'hover:bg-slate-700/60 text-slate-200'
        }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="mt-0.5 text-sm shrink-0">{icon}</span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className={`text-xs font-medium leading-tight ${accent ? accentClass[accent] : ''} truncate`}>
          {label}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-500 mt-0.5 leading-tight truncate">
            {sublabel}
          </span>
        )}
      </span>
      {shortcut && (
        <span className="text-[10px] text-slate-600 mt-0.5 shrink-0 ml-auto">{shortcut}</span>
      )}
    </button>
  );
}
