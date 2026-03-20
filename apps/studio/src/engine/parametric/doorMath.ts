/**
 * doorMath.ts  —  Door insertion math for frame bays.
 *
 * Ported from legacy GlazeBid_AIQ:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/backend/calculations/bidsheet_calculations_v2.py
 *   — calculate_hr_functions(), combine_labor(), DOOR labor rates
 *
 * A door occupies one bay column in the GridSpec.
 * When a bay has a door:
 *   - The bottom sill extrusion for that bay is omitted from frame material.
 *   - The door leaf (or pair of leaves) fills the bay daylight opening width.
 *   - Labor is added per the legacy hr_rates.
 *
 * All functions are pure — no React, no side-effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A door leaf (or pair) placed in a specific bay column of the frame grid.
 *
 * Stored as `GridSpec.doors[]` — fully serializable.
 */
export type DoorSpec = {
  /** 0-based column index of the bay this door occupies. */
  bayCol: number;
  /** 'single' = one leaf; 'pair' = two leaves meeting in the centre. */
  type:   'single' | 'pair';
  /**
   * Door leaf height in decimal inches.
   * If undefined, the door runs the full frame height (floor-to-frame-head).
   */
  heightInches?: number;
};

/**
 * Calculated door quantities derived from DoorSpec[] + frame geometry.
 * Attached to GridAssembly (extends it).
 */
export type DoorAssembly = {
  /** Total count of single-leaf doors across all bays. */
  singlesCount: number;
  /** Total count of door pairs across all bays. */
  pairsCount:   number;
  /** Field installation labor hours (from legacy hr_rates). */
  fieldLaborHrs: number;
  /** Per-door detail: leaf width in inches per bay. */
  doors: Array<{
    bayCol:      number;
    type:        'single' | 'pair';
    leafWidthIn: number;   // DLO width of the bay (or half for pairs)
    heightIn:    number;
  }>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Legacy labor hours per door unit (from bidsheet_calculations_v2.py). */
export const DOOR_LABOR_HRS: Record<'single' | 'pair', number> = {
  single: 8.5,
  pair:   8.5,
};

/** Door clearance deducted from the DLO width to get the leaf width. */
const DOOR_CLEARANCE_IN = 0.125; // 1/8" clearance each side

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Computes door assembly quantities from a door spec list and bay geometry.
 *
 * @param doors      DoorSpec[] from GridSpec.doors
 * @param bayWidths  Inch width of each bay column (from GridAssembly.bayWidthsInch)
 * @param frameH     Frame height in inches (used when door.heightInches is undefined)
 * @param mullionW   Mullion face width in inches (deducted from leaf width calc)
 */
export function computeDoorAssembly(
  doors:     DoorSpec[],
  bayWidths: number[],
  frameH:    number,
  mullionW:  number = 3.0,
): DoorAssembly {
  let singlesCount   = 0;
  let pairsCount     = 0;
  let fieldLaborHrs  = 0;

  const detail: DoorAssembly['doors'] = [];

  for (const door of doors) {
    const bayW = bayWidths[door.bayCol] ?? 0;
    // Leaf width = DLO bay width minus frame clearance
    const dloW      = Math.max(0, bayW - mullionW);
    const leafWidthIn = door.type === 'pair'
      ? Math.max(0, dloW / 2 - DOOR_CLEARANCE_IN)
      : Math.max(0, dloW - DOOR_CLEARANCE_IN * 2);

    const heightIn = door.heightInches ?? frameH;

    if (door.type === 'pair') {
      pairsCount++;
      fieldLaborHrs += DOOR_LABOR_HRS.pair;
    } else {
      singlesCount++;
      fieldLaborHrs += DOOR_LABOR_HRS.single;
    }

    detail.push({ bayCol: door.bayCol, type: door.type, leafWidthIn, heightIn });
  }

  return { singlesCount, pairsCount, fieldLaborHrs, doors: detail };
}

/**
 * Returns true if the given bay column has a door assigned.
 */
export function bayHasDoor(doors: DoorSpec[], bayCol: number): boolean {
  return doors.some(d => d.bayCol === bayCol);
}

/**
 * Returns the door type for a bay, or null if no door.
 */
export function doorTypeForBay(
  doors: DoorSpec[],
  bayCol: number,
): 'single' | 'pair' | null {
  return doors.find(d => d.bayCol === bayCol)?.type ?? null;
}

/**
 * Toggles a door in a bay.
 * - If no door exists: adds a 'single'.
 * - If 'single' exists: upgrades to 'pair'.
 * - If 'pair' exists: removes the door entirely.
 */
export function toggleDoorInBay(doors: DoorSpec[], bayCol: number): DoorSpec[] {
  const existing = doors.find(d => d.bayCol === bayCol);
  if (!existing) {
    return [...doors, { bayCol, type: 'single' }];
  }
  if (existing.type === 'single') {
    return doors.map(d => d.bayCol === bayCol ? { ...d, type: 'pair' as const } : d);
  }
  // pair → remove
  return doors.filter(d => d.bayCol !== bayCol);
}
