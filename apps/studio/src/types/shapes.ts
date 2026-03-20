import type { PagePoint } from '../engine/coordinateSystem';
import type { GridSpec }  from '../engine/parametric/gridMath';

// ── In-progress drawing state (NOT in Zustand — lives in a canvas hook ref) ──

export type InProgressShape =
  | { type: 'line';      start: PagePoint | null;  cursor: PagePoint | null }
  | { type: 'rect';      start: PagePoint | null;  cursor: PagePoint | null }
  | { type: 'polygon';   points: PagePoint[];      cursor: PagePoint | null }
  | { type: 'calibrate'; start: PagePoint | null;  cursor: PagePoint | null }
  | { type: 'rake';      points: PagePoint[];      cursor: PagePoint | null };

// ── Committed shapes (stored in useStudioStore) ───────────────────────────────

type ShapeBase = {
  id:      string;
  pageId:  string;
  label?:  string;
  color?:  string;
  locked?: boolean;
};

export type LineShape = ShapeBase & {
  type:         'line';
  start:        PagePoint;
  end:          PagePoint;
  lengthPx:     number;
  lengthInches: number;
};

export type RectShape = ShapeBase & {
  type:         'rect';
  origin:       PagePoint;
  widthPx:      number;
  heightPx:     number;
  widthInches:  number;
  heightInches: number;
  /** Set when this rect was drawn by the Frame Highlight tool (Task 4.3). */
  frameSystemId?:   string | null;
  frameSystemType?: string | null;
  /** Internal grid populated by the GridEditor after a frame is drawn. */
  grid?: GridSpec | null;
};

export type PolygonShape = ShapeBase & {
  type:           'polygon';
  points:         PagePoint[];
  bbWidthPx:      number;
  bbHeightPx:     number;
  bbWidthInches:  number;
  bbHeightInches: number;
  /** Set when this polygon was drawn by the Raked Frame tool. */
  frameSystemId?:   string | null;
  frameSystemType?: string | null;
  isRaked?:         boolean;
  /** Head slope angle in degrees (0 = level head). */
  headSlopeDeg?:    number;
};

/**
 * A single point-based count marker (Count Tool).
 * Rendered as a coloured circle on the HTML overlay — not on the canvas.
 */
export type MarkerShape = ShapeBase & {
  type:         'marker';
  position:     PagePoint;
  countGroupId: string;
};

export type DrawnShape = LineShape | RectShape | PolygonShape | MarkerShape;

// ── Builder Bridge ────────────────────────────────────────────────────────────

/**
 * A DrawnShape projected to a Builder-compatible FrameInput.
 * width/height are in INCHES, matching Builder's pricingEngine FrameInput contract.
 *
 * Compatible with: apps/builder/src/utils/pricingEngine.ts :: FrameInput
 * Use this to pipe Studio measurements into the Estimation Grid (Task 5.4).
 */
export type FrameBridgeData = {
  shapeId:  string;
  pageId:   string;
  width:    number; // inches → FrameInput.width
  height:   number; // inches → FrameInput.height
  quantity: 1;
  label?:   string;
};

export function shapeToFrameBridge(shape: DrawnShape): FrameBridgeData | null {
  if (shape.type === 'rect') {
    return {
      shapeId:  shape.id,
      pageId:   shape.pageId,
      width:    shape.widthInches,
      height:   shape.heightInches,
      quantity: 1,
      label:    shape.label,
    };
  }
  if (shape.type === 'polygon') {
    return {
      shapeId:  shape.id,
      pageId:   shape.pageId,
      width:    shape.bbWidthInches,
      height:   shape.bbHeightInches,
      quantity: 1,
      label:    shape.label,
    };
  }
  if (shape.type === 'line') {
    return {
      shapeId:  shape.id,
      pageId:   shape.pageId,
      width:    shape.lengthInches,
      height:   0,
      quantity: 1,
      label:    shape.label,
    };
  }
  return null;
}
