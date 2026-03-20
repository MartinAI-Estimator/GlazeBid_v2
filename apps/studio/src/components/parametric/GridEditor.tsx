/**
 * GridEditor.tsx  —  Interactive grid overlay for the Frame Highlight tool.
 *
 * Appears when the user has drawn a frame and wants to define its internal
 * mullion grid (rows × columns of glass lites).
 *
 * ── Trigger ──────────────────────────────────────────────────────────────────
 * Shown when `useStudioStore.pendingGridEdit` is set (non-null).
 * Cleared when the user clicks "Done" or "Cancel."
 *
 * ── Positioning ──────────────────────────────────────────────────────────────
 * The overlay is an absolute inset-0 div (fills the canvas container).
 * Mullion lines are positioned at relative-percentage offsets inside the
 * frame's screen-space bounding rect, computed via engine.pageToScreen().
 *
 * ── Interaction ──────────────────────────────────────────────────────────────
 * - "+ Row" / "- Row" buttons: add/remove evenly-spaced horizontal mullions.
 * - "+ Col" / "- Col" buttons: add/remove evenly-spaced vertical mullions.
 * - Draggable mullion lines: drag to reposition individual mullions.
 * - "Done": saves GridSpec to the shape via updateShape({grid: spec}).
 * - "Cancel": discards changes.
 * - Daylight opening dimensions are shown live in each cell.
 */

import React, { useState, useCallback, type PointerEvent } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import {
  buildEvenGrid,
  addVerticalMullion,
  addHorizontalMullion,
  removeClosestVertical,
  removeClosestHorizontal,
  computeGridAssembly,
  DEFAULT_GRID,
  type GridSpec,
} from '../../engine/parametric/gridMath';
import { toggleDoorInBay, doorTypeForBay, bayHasDoor, computeDoorAssembly } from '../../engine/parametric/doorMath';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import type { RectShape }       from '../../types/shapes';

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  engine: CanvasEngineAPI;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GridEditor({ engine }: Props): React.ReactElement | null {
  const pendingGridEdit = useStudioStore(s => s.pendingGridEdit);
  const shapes          = useStudioStore(s => s.shapes);
  const updateShape     = useStudioStore(s => s.updateShape);
  const setPending      = useStudioStore(s => s.setPendingGridEdit);

  // ── ALL hooks must be called unconditionally ───────────────────────────────

  // Local grid state — initialised from the shape's existing grid (or default).
  const [localGrid, setLocalGrid] = useState<GridSpec | null>(null);

  // Drag state for mullion line repositioning
  type DragState = { axis: 'vert' | 'horiz'; origRelPos: number; idx: number } | null;
  const [dragging, setDragging] = useState<DragState>(null);

  // Initialise local grid when pendingGridEdit changes
  React.useEffect(() => {
    if (!pendingGridEdit) {
      setLocalGrid(null);
      return;
    }
    const shape = shapes.find(s => s.id === pendingGridEdit.shapeId) as RectShape | undefined;
    setLocalGrid(shape?.grid ?? { ...DEFAULT_GRID });
  }, [pendingGridEdit, shapes]);

  // ── Derived values (safe to compute even when null — used below guard) ─────
  const shape = shapes.find(s => s.id === pendingGridEdit?.shapeId) as RectShape | undefined;

  const tl = shape ? engine.pageToScreen(shape.origin.x, shape.origin.y)                           : { x: 0, y: 0 };
  const br = shape ? engine.pageToScreen(shape.origin.x + shape.widthPx, shape.origin.y + shape.heightPx) : { x: 0, y: 0 };
  const sw = br.x - tl.x;
  const sh = br.y - tl.y;

  const asm = (localGrid && shape)
    ? computeGridAssembly(shape.widthInches, shape.heightInches, localGrid)
    : null;

  // ── Callbacks (all unconditional) ─────────────────────────────────────────

  const handleLineDragStart = useCallback(
    (axis: 'vert' | 'horiz', idx: number, origRelPos: number, e: PointerEvent) => {
      e.stopPropagation();
      setDragging({ axis, origRelPos, idx });
    },
    [],
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const { axis } = dragging;
      const newRel =
        axis === 'vert'
          ? (e.nativeEvent.offsetX - tl.x) / sw
          : (e.nativeEvent.offsetY - tl.y) / sh;
      const clamped = Math.min(0.97, Math.max(0.03, newRel));

      setLocalGrid(prev => {
        if (!prev) return prev;
        if (axis === 'vert') {
          const next = [...prev.vertRelPositions];
          next[dragging.idx] = clamped;
          return { ...prev, vertRelPositions: next };
        } else {
          const next = [...prev.horizRelPositions];
          next[dragging.idx] = clamped;
          return { ...prev, horizRelPositions: next };
        }
      });
    },
    [dragging, sw, sh, tl],
  );

  const handleOverlayPointerUp = useCallback(() => setDragging(null), []);

  const handleDone = useCallback(() => {
    if (!pendingGridEdit) return;
    updateShape(pendingGridEdit.shapeId, { grid: localGrid } as never);
    setPending(null);
  }, [pendingGridEdit, localGrid, updateShape, setPending]);

  const handleCancel = useCallback(() => setPending(null), [setPending]);

  // ── Early-exit guard (after all hooks) ────────────────────────────────────
  if (!pendingGridEdit || !localGrid || !shape || shape.type !== 'rect' || !asm) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: dragging ? 'auto' : 'none' }}
      onPointerMove={handleOverlayPointerMove}
      onPointerUp={handleOverlayPointerUp}
    >
      {/* Frame outline */}
      <div
        style={{
          position:  'absolute',
          left:      tl.x,
          top:       tl.y,
          width:     sw,
          height:    sh,
          border:    '2px solid #38bdf8',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />

      {/* Vertical mullion lines */}
      {localGrid.vertRelPositions.map((rel, idx) => (
        <div
          key={`v-${idx}`}
          onPointerDown={e => handleLineDragStart('vert', idx, rel, e)}
          style={{
            position:  'absolute',
            left:      tl.x + rel * sw - 3,
            top:       tl.y,
            width:     6,
            height:    sh,
            cursor:    'ew-resize',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              position:   'absolute',
              left:       3,
              top:        0,
              width:      1,
              height:     '100%',
              background: '#38bdf8',
              opacity:    0.9,
            }}
          />
        </div>
      ))}

      {/* Horizontal mullion lines */}
      {localGrid.horizRelPositions.map((rel, idx) => (
        <div
          key={`h-${idx}`}
          onPointerDown={e => handleLineDragStart('horiz', idx, rel, e)}
          style={{
            position:  'absolute',
            left:      tl.x,
            top:       tl.y + rel * sh - 3,
            width:     sw,
            height:    6,
            cursor:    'ns-resize',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              position:   'absolute',
              left:       0,
              top:        3,
              width:      '100%',
              height:     1,
              background: '#38bdf8',
              opacity:    0.9,
            }}
          />
        </div>
      ))}

      {/* Daylight opening dimension labels + door toggles */}
      {asm.daylightOpenings.map((dlo, i) => {
        // Compute cell screen rect
        const colEdges  = [0, ...localGrid.vertRelPositions,  1];
        const rowEdges  = [0, ...localGrid.horizRelPositions, 1];
        const cellLeft  = tl.x + colEdges[dlo.col]  * sw;
        const cellRight = tl.x + colEdges[dlo.col + 1] * sw;
        const cellTop   = tl.y + rowEdges[dlo.row]  * sh;
        const cellBot   = tl.y + rowEdges[dlo.row + 1] * sh;
        const cx        = (cellLeft + cellRight) / 2;
        const cy        = (cellTop  + cellBot)   / 2;
        // Door state for this bay column
        const doors      = localGrid.doors ?? [];
        const doorType   = doorTypeForBay(doors, dlo.col);
        const isLastRow  = dlo.row === localGrid.rows - 1; // door toggle only on bottom row
        // Glass type for this specific bay
        const bayKey     = `${dlo.col},${dlo.row}`;
        const glassType  = (localGrid.bayTypes ?? {})[bayKey] ?? 'vision';
        const isSpandrel = glassType === 'spandrel';
        return (
          <div
            key={`dlo-${i}`}
            style={{
              position:   'absolute',
              left:       cx,
              top:        cy,
              transform:  'translate(-50%, -50%)',
              display:    'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap:        4,
            }}
          >
            {/* Dimension label */}
            <div
              style={{
                background: doorType ? 'rgba(251,146,60,0.2)' : 'rgba(15,23,42,0.75)',
                color:      doorType ? '#fb923c' : '#e2e8f0',
                fontSize:   11,
                padding:    '1px 4px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                border: doorType ? '1px solid #fb923c' : 'none',
              }}
            >
              {doorType === 'pair'
                ? `⋡ DOOR PAIR (${dlo.widthInch.toFixed(1)}")` 
                : doorType === 'single'
                  ? `⋡ DOOR (${dlo.widthInch.toFixed(1)}")` 
                  : `${dlo.widthInch.toFixed(2)}" × ${dlo.heightInch.toFixed(2)}"`
              }
            </div>
            {/* Door toggle — only visible on the bottom bay row */}
            {isLastRow && (
              <button
                onClick={() => setLocalGrid(g => {
                  if (!g) return g;
                  return { ...g, doors: toggleDoorInBay(g.doors ?? [], dlo.col) };
                })}
                title="Click to cycle: None → Single → Pair → None"
                style={{
                  ...btnStyle,
                  fontSize:   10,
                  padding:    '1px 5px',
                  background: doorType ? '#7c2d12' : '#1e293b',
                  border:     doorType ? '1px solid #fb923c' : '1px solid #475569',
                  color:      doorType ? '#fb923c' : '#94a3b8',
                  pointerEvents: 'auto',
                }}
              >
                {doorType ? '⋡' : '+'} Door
              </button>
            )}
            {/* Vision / Spandrel toggle — shown for non-door bays */}
            {!doorType && (
              <button
                onClick={() => setLocalGrid(g => {
                  if (!g) return g;
                  const next = glassType === 'vision' ? 'spandrel' : 'vision';
                  return { ...g, bayTypes: { ...(g.bayTypes ?? {}), [bayKey]: next } };
                })}
                title={`Glass type: ${glassType}. Click to toggle.`}
                style={{
                  ...btnStyle,
                  fontSize:   9,
                  padding:    '1px 4px',
                  background: isSpandrel ? '#1e293b' : '#0c4a6e',
                  border:     isSpandrel ? '1px solid #f59e0b' : '1px solid #0ea5e9',
                  color:      isSpandrel ? '#f59e0b' : '#38bdf8',
                  pointerEvents: 'auto',
                }}
              >
                {isSpandrel ? 'S' : 'V'}
              </button>
            )}
          </div>
        );
      })}

      {/* Control panel */}
      <div
        style={{
          position:   'absolute',
          left:       Math.min(tl.x + sw + 8, window.innerWidth - 220),
          top:        tl.y,
          background: '#1e293b',
          border:     '1px solid #334155',
          borderRadius: 8,
          padding:    12,
          width:      200,
          pointerEvents: 'auto',
          display:    'flex',
          flexDirection: 'column',
          gap:        8,
          zIndex:     100,
          color:      '#f1f5f9',
          fontSize:   12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#38bdf8' }}>
          Grid Editor
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1 }}>Rows: {localGrid.rows}</span>
          <button
            onClick={() => setLocalGrid(g => g ? buildEvenGrid(Math.max(1, g.rows - 1), g.cols, g.mullionWidthInch) : g)}
            style={btnStyle}
          >−</button>
          <button
            onClick={() => setLocalGrid(g => g ? buildEvenGrid(g.rows + 1, g.cols, g.mullionWidthInch) : g)}
            style={btnStyle}
          >+</button>
        </div>

        {/* Cols */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1 }}>Cols: {localGrid.cols}</span>
          <button
            onClick={() => setLocalGrid(g => g ? buildEvenGrid(g.rows, Math.max(1, g.cols - 1), g.mullionWidthInch) : g)}
            style={btnStyle}
          >−</button>
          <button
            onClick={() => setLocalGrid(g => g ? buildEvenGrid(g.rows, g.cols + 1, g.mullionWidthInch) : g)}
            style={btnStyle}
          >+</button>
        </div>

        {/* Summary */}
        <div style={{ color: '#94a3b8', fontSize: 11, borderTop: '1px solid #334155', paddingTop: 6 }}>
          <div>{asm.panels} lites</div>
          <div>Mullion LF: {asm.totalMullionLF.toFixed(1)}</div>
          {(() => {
            const doors = localGrid.doors ?? [];
            if (doors.length === 0) return null;
            const doorAsm = computeDoorAssembly(
              doors,
              asm.bayWidthsInch,
              pendingGridEdit!.heightInches,
              localGrid.mullionWidthInch,
            );
            return (
              <div style={{ color: '#fb923c', marginTop: 4 }}>
                {doorAsm.singlesCount > 0 && <div>{doorAsm.singlesCount} single door{doorAsm.singlesCount > 1 ? 's' : ''}</div>}
                {doorAsm.pairsCount   > 0 && <div>{doorAsm.pairsCount} door pair{doorAsm.pairsCount   > 1 ? 's' : ''}</div>}
                <div style={{ fontSize: 10 }}>+{doorAsm.fieldLaborHrs}h field labor</div>
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={handleDone}   style={{ ...btnStyle, flex: 1, background: '#0ea5e9', color: '#fff' }}>Done</button>
          <button onClick={handleCancel} style={{ ...btnStyle, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  background:   '#334155',
  border:       '1px solid #475569',
  borderRadius: 4,
  color:        '#f1f5f9',
  cursor:       'pointer',
  fontSize:     11,
  padding:      '2px 8px',
};
