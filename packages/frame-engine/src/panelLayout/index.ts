/**
 * All-Glass Panel Layout Engine
 *
 * Handles frameless glass-to-glass interior wall panels distributed across a total run.
 * Manages panel states (EQUAL, LINKED, LOCKED), automatic redistribution, validation,
 * and BOM generation for all-glass wall systems.
 *
 * Key principles:
 * - Minimum panel width: 4 inches (hard floor)
 * - Panel states are immutable in terms of semantics; changes flow through redistributePanels()
 * - Door panels are always LOCKED (structural constraint)
 * - Redistribution respects LOCKED and LINKED panels; only EQUAL panels get resized
 * - Joint count = panelCount - 1 (always)
 *
 * @module panelLayout
 */

/** Lightweight ID generator — no external dependency required. */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type PanelState = 'EQUAL' | 'LINKED' | 'LOCKED';

/**
 * Represents a single glass panel in the wall layout.
 */
export type Panel = {
  panelId: string;
  index: number; // 0-based position from left
  widthInches: number;
  state: PanelState;
  linkGroupId?: string; // panels sharing this ID adjust together
  isDoor: boolean; // door panels are always LOCKED
  glassSpecId: string;
  edgeWork: 'polished' | 'seamed' | 'arrised';
  isTempered: boolean;
};

/**
 * Represents the complete wall layout with all panels and constraints.
 */
export type WallLayout = {
  wallId: string;
  totalRunInches: number; // total wall run in decimal inches
  heightInches: number;
  jointWidthInches: number;
  panels: Panel[];
};

/**
 * Result of validation operations.
 */
export type ValidationResult = {
  valid: boolean;
  errorMessage?: string; // e.g. "Panel width below 4\" minimum — adjust door position or reduce panel count"
  affectedPanelIds?: string[];
};

/**
 * Result of layout redistribution operations.
 */
export type LayoutResult = {
  panels: Panel[];
  validation: ValidationResult;
  totalGlassSF: number;
  totalJointLF: number;
  panelWidthSummary: {
    minWidth: number;
    maxWidth: number;
    equalPanelWidth: number | null; // null if no EQUAL panels
  };
};

/**
 * Detailed BOM for all-glass wall fabrication and installation.
 */
export type AllGlassBOM = {
  glassPanels: {
    panelId: string;
    widthInches: number;
    heightInches: number;
    sqft: number;
    quantity: number;
    isDoor: boolean;
    isTempered: boolean;
    edgeWork: string;
    pricePerSqFt?: number;
    extCost?: number;
  }[];
  baseShoeLF: number; // = totalRunInches / 12
  capRailLF: number; // = totalRunInches / 12
  structuralSiliconeJointLF: number; // = (panelCount - 1) × heightInches / 12
  totalGlassSF: number;
  laborHours: number; // all-glass: 0.35 hrs/SF field (frameless more complex)
};

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Generate a unique short panel ID.
 * @returns A unique identifier for a panel (e.g., "panel-abc123ef")
 */
function generatePanelId(): string {
  return `panel-${uuidv4().substring(0, 8)}`;
}

/**
 * Generate a unique link group ID.
 * @returns A unique identifier for a link group (e.g., "link-abc123ef")
 */
function generateLinkGroupId(): string {
  return `link-${uuidv4().substring(0, 8)}`;
}

/**
 * Validate that all panels meet the minimum width requirement.
 * @param panels Array of panels to validate
 * @returns ValidationResult indicating whether all panels are valid
 */
function validateMinimumWidths(panels: Panel[]): ValidationResult {
  const MIN_PANEL_WIDTH = 4; // inches
  const invalidPanels = panels.filter((p) => p.widthInches < MIN_PANEL_WIDTH);

  if (invalidPanels.length > 0) {
    return {
      valid: false,
      errorMessage: `Panel width below ${MIN_PANEL_WIDTH}" minimum — adjust door position or reduce panel count`,
      affectedPanelIds: invalidPanels.map((p) => p.panelId),
    };
  }

  return { valid: true };
}

/**
 * Re-index panels after structural changes (add/remove).
 * Ensures index property matches position in array.
 * @param panels Array of panels to re-index
 * @returns New array with corrected indices
 */
function reindexPanels(panels: Panel[]): Panel[] {
  return panels.map((panel, idx) => ({
    ...panel,
    index: idx,
  }));
}

/**
 * Compute total square footage of glass from panels.
 * @param panels Array of panels
 * @param heightInches Wall height
 * @returns Total glass area in square feet
 */
function computeTotalGlassSF(panels: Panel[], heightInches: number): number {
  const totalSquareInches = panels.reduce(
    (sum, p) => sum + p.widthInches * heightInches,
    0
  );
  return totalSquareInches / 144; // 144 sq in per sq ft
}

/**
 * Compute total linear feet of joint.
 * Joint count = panelCount - 1 (one joint between each adjacent pair).
 * Each joint spans the full height of the wall.
 * @param panelCount Number of panels
 * @param heightInches Wall height
 * @param jointWidthInches Joint width
 * @returns Total joint length in linear feet
 */
function computeTotalJointLF(
  panelCount: number,
  heightInches: number,
  jointWidthInches: number
): number {
  if (panelCount <= 1) return 0;
  const jointCount = panelCount - 1;
  const totalJointSquareInches = jointCount * heightInches * jointWidthInches;
  return totalJointSquareInches / 12; // linear feet (width × height / 12)
}

/**
 * Group panels by their link group ID.
 * @param panels Array of panels
 * @returns Map of linkGroupId -> panels in that group
 */
function groupByLinkId(
  panels: Panel[]
): Map<string, Panel[]> {
  const groups = new Map<string, Panel[]>();
  panels.forEach((panel) => {
    if (panel.linkGroupId) {
      if (!groups.has(panel.linkGroupId)) {
        groups.set(panel.linkGroupId, []);
      }
      groups.get(panel.linkGroupId)!.push(panel);
    }
  });
  return groups;
}

// ============================================================================
// PRIMARY REDISTRIBUTION ENGINE
// ============================================================================

/**
 * Redistribute panel widths based on their states.
 *
 * Distribution logic:
 * 1. Separate panels into LOCKED, LINK groups, and EQUAL
 * 2. Calculate available space after accounting for locked widths and joints
 * 3. Distribute available space equally among EQUAL panels
 * 4. Validate that no panel falls below 4" minimum
 *
 * This is the single source of truth for width computation.
 * All other functions that modify widths must call this.
 *
 * @param layout The wall layout to redistribute
 * @returns LayoutResult with updated panels and validation status
 */
export function redistributePanels(layout: WallLayout): LayoutResult {
  const { panels, totalRunInches, heightInches, jointWidthInches } = layout;

  // Edge case: no panels
  if (panels.length === 0) {
    return {
      panels: [],
      validation: { valid: true },
      totalGlassSF: 0,
      totalJointLF: 0,
      panelWidthSummary: {
        minWidth: 0,
        maxWidth: 0,
        equalPanelWidth: null,
      },
    };
  }

  // Edge case: single panel
  if (panels.length === 1) {
    const panel = panels[0];
    const validation = validateMinimumWidths([panel]);
    return {
      panels: [panel],
      validation,
      totalGlassSF: computeTotalGlassSF([panel], heightInches),
      totalJointLF: 0,
      panelWidthSummary: {
        minWidth: panel.widthInches,
        maxWidth: panel.widthInches,
        equalPanelWidth: panel.state === 'EQUAL' ? panel.widthInches : null,
      },
    };
  }

  // Calculate joint space
  const jointCount = panels.length - 1;
  const totalJointSpaceInches = jointCount * jointWidthInches;

  // Separate panels by state
  const lockedPanels = panels.filter((p) => p.state === 'LOCKED');
  const linkedPanels = panels.filter((p) => p.state === 'LINKED');
  const equalPanels = panels.filter((p) => p.state === 'EQUAL');

  // Group linked panels by linkGroupId
  const linkGroups = groupByLinkId(linkedPanels);

  // Sum LOCKED panel widths
  let lockedTotalInches = lockedPanels.reduce(
    (sum, p) => sum + p.widthInches,
    0
  );

  // Sum LINKED group consumption (representative width × member count per group)
  let linkedTotalInches = 0;
  const linkedGroupWidths = new Map<string, number>();
  linkGroups.forEach((members, groupId) => {
    const representativeWidth = members[0].widthInches;
    const groupConsumption = representativeWidth * members.length;
    linkedGroupWidths.set(groupId, representativeWidth);
    linkedTotalInches += groupConsumption;
  });

  // Calculate available space
  const availableInches =
    totalRunInches -
    lockedTotalInches -
    linkedTotalInches -
    totalJointSpaceInches;

  // Compute equal panel width
  const equalPanelCount = equalPanels.length;
  let equalPanelWidth: number | null = null;
  if (equalPanelCount > 0) {
    equalPanelWidth = availableInches / equalPanelCount;
  }

  // Build updated panels array
  const updatedPanels = panels.map((panel) => {
    if (panel.state === 'LOCKED') {
      return { ...panel };
    }
    if (panel.state === 'LINKED' && panel.linkGroupId) {
      const groupWidth = linkedGroupWidths.get(panel.linkGroupId) || panel.widthInches;
      return { ...panel, widthInches: groupWidth };
    }
    // EQUAL state
    return { ...panel, widthInches: equalPanelWidth || panel.widthInches };
  });

  // Validate
  const validation = validateMinimumWidths(updatedPanels);

  // Compute summary metrics
  const widths = updatedPanels.map((p) => p.widthInches);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);

  return {
    panels: updatedPanels,
    validation,
    totalGlassSF: computeTotalGlassSF(updatedPanels, heightInches),
    totalJointLF: computeTotalJointLF(panels.length, heightInches, jointWidthInches),
    panelWidthSummary: {
      minWidth,
      maxWidth,
      equalPanelWidth,
    },
  };
}

// ============================================================================
// PANEL MODIFICATION OPERATIONS
// ============================================================================

/**
 * Add a new panel to the wall layout.
 *
 * New panels default to EQUAL state (or LOCKED if isDoor).
 * Inserted at the specified position; subsequent panels are re-indexed.
 * Redistribution is applied to reflect the new panel.
 *
 * @param layout Current wall layout
 * @param insertAfterIndex Position after which to insert (-1 = insert at start)
 * @param isDoor Whether this is a door panel
 * @param doorWidthInches Width if isDoor is true (required for doors)
 * @param glassSpecId Glass specification ID (optional)
 * @returns LayoutResult with the new panel inserted and layout redistributed
 */
export function addPanel(
  layout: WallLayout,
  insertAfterIndex: number,
  isDoor: boolean,
  doorWidthInches?: number,
  glassSpecId?: string
): LayoutResult {
  const newPanel: Panel = {
    panelId: generatePanelId(),
    index: 0, // will be corrected after insertion
    widthInches: isDoor && doorWidthInches ? doorWidthInches : 10, // placeholder for EQUAL
    state: isDoor ? 'LOCKED' : 'EQUAL',
    isDoor,
    glassSpecId: glassSpecId || 'default',
    edgeWork: 'polished',
    isTempered: false,
  };

  const insertIndex = insertAfterIndex + 1;
  const newPanels = [
    ...layout.panels.slice(0, insertIndex),
    newPanel,
    ...layout.panels.slice(insertIndex),
  ];

  const reindexed = reindexPanels(newPanels);
  const newLayout: WallLayout = {
    ...layout,
    panels: reindexed,
  };

  return redistributePanels(newLayout);
}

/**
 * Remove a panel from the wall layout.
 *
 * Panel at panelId is removed, subsequent panels are re-indexed,
 * and redistribution is applied.
 *
 * @param layout Current wall layout
 * @param panelId ID of the panel to remove
 * @returns LayoutResult with the panel removed and layout redistributed
 */
export function removePanel(layout: WallLayout, panelId: string): LayoutResult {
  const filtered = layout.panels.filter((p) => p.panelId !== panelId);
  const reindexed = reindexPanels(filtered);

  const newLayout: WallLayout = {
    ...layout,
    panels: reindexed,
  };

  return redistributePanels(newLayout);
}

/**
 * Set the width of a single panel and redistribute.
 *
 * Behavior depends on current panel state:
 * - EQUAL: changes to LOCKED, width is set, other EQUAL panels redistribute
 * - LINKED: all panels in the same link group get the new width
 * - LOCKED: width is set directly, EQUAL panels redistribute
 *
 * Validation ensures no panel falls below 4" minimum.
 *
 * @param layout Current wall layout
 * @param panelId ID of the panel to modify
 * @param newWidthInches New width in inches
 * @returns LayoutResult with updated widths
 */
export function setPanelWidth(
  layout: WallLayout,
  panelId: string,
  newWidthInches: number
): LayoutResult {
  const panelIndex = layout.panels.findIndex((p) => p.panelId === panelId);
  if (panelIndex === -1) {
    return redistributePanels(layout);
  }

  const panel = layout.panels[panelIndex];
  let updatedPanels = [...layout.panels];

  if (panel.state === 'EQUAL') {
    // Convert to LOCKED and set width
    updatedPanels[panelIndex] = {
      ...panel,
      state: 'LOCKED',
      widthInches: newWidthInches,
    };
  } else if (panel.state === 'LINKED' && panel.linkGroupId) {
    // Update all panels in the same link group
    updatedPanels = updatedPanels.map((p) =>
      p.linkGroupId === panel.linkGroupId
        ? { ...p, widthInches: newWidthInches }
        : p
    );
  } else if (panel.state === 'LOCKED') {
    // Update directly
    updatedPanels[panelIndex] = {
      ...panel,
      widthInches: newWidthInches,
    };
  }

  const newLayout: WallLayout = {
    ...layout,
    panels: updatedPanels,
  };

  return redistributePanels(newLayout);
}

/**
 * Link panels together so they share the same width.
 *
 * All specified panels are set to LINKED state with the given linkGroupId.
 * They adopt the average width of the group.
 * Remaining EQUAL panels redistribute.
 *
 * @param layout Current wall layout
 * @param panelIds IDs of panels to link together
 * @param linkGroupId Unique identifier for this link group
 * @returns LayoutResult with linked panels and redistribution applied
 */
export function linkPanels(
  layout: WallLayout,
  panelIds: string[],
  linkGroupId: string
): LayoutResult {
  const panelsToLink = layout.panels.filter((p) => panelIds.includes(p.panelId));
  if (panelsToLink.length === 0) {
    return redistributePanels(layout);
  }

  // Calculate average width for the group
  const averageWidth =
    panelsToLink.reduce((sum, p) => sum + p.widthInches, 0) / panelsToLink.length;

  const updatedPanels = layout.panels.map((p) =>
    panelIds.includes(p.panelId)
      ? {
          ...p,
          state: 'LINKED' as PanelState,
          linkGroupId,
          widthInches: averageWidth,
        }
      : p
  );

  const newLayout: WallLayout = {
    ...layout,
    panels: updatedPanels,
  };

  return redistributePanels(newLayout);
}

/**
 * Unlink panels, reverting them to EQUAL state.
 *
 * Specified panels are set to EQUAL state and lose their linkGroupId.
 * All EQUAL panels (including newly unlinked) redistribute equally.
 *
 * @param layout Current wall layout
 * @param panelIds IDs of panels to unlink
 * @returns LayoutResult with panels converted to EQUAL and redistribution applied
 */
export function unlinkPanels(layout: WallLayout, panelIds: string[]): LayoutResult {
  const updatedPanels = layout.panels.map((p) =>
    panelIds.includes(p.panelId)
      ? {
          ...p,
          state: 'EQUAL' as PanelState,
          linkGroupId: undefined,
        }
      : p
  );

  const newLayout: WallLayout = {
    ...layout,
    panels: updatedPanels,
  };

  return redistributePanels(newLayout);
}

/**
 * Toggle a panel between regular glass and door panel.
 *
 * If panel is not a door: converts to door (LOCKED, isDoor: true, fixed width)
 * If panel is already a door: converts back to regular EQUAL panel
 * Redistribution is applied.
 *
 * @param layout Current wall layout
 * @param panelId ID of the panel to toggle
 * @param doorWidthInches Width if converting to door (required when converting to door)
 * @returns LayoutResult with toggle applied and redistribution applied
 */
export function toggleDoorPanel(
  layout: WallLayout,
  panelId: string,
  doorWidthInches: number
): LayoutResult {
  const panelIndex = layout.panels.findIndex((p) => p.panelId === panelId);
  if (panelIndex === -1) {
    return redistributePanels(layout);
  }

  const panel = layout.panels[panelIndex];
  let updatedPanels = [...layout.panels];

  if (panel.isDoor) {
    // Convert back to regular panel
    updatedPanels[panelIndex] = {
      ...panel,
      isDoor: false,
      state: 'EQUAL' as PanelState,
    };
  } else {
    // Convert to door
    updatedPanels[panelIndex] = {
      ...panel,
      isDoor: true,
      state: 'LOCKED' as PanelState,
      widthInches: doorWidthInches,
    };
  }

  const newLayout: WallLayout = {
    ...layout,
    panels: updatedPanels,
  };

  return redistributePanels(newLayout);
}

// ============================================================================
// WALL CREATION
// ============================================================================

/**
 * Create a default wall layout with initial equal-width panels.
 *
 * All panels default to:
 * - EQUAL state
 * - edgeWork: 'polished'
 * - isTempered: false
 * - glassSpecId: provided or 'default'
 *
 * Redistribution is applied to compute initial equal widths.
 *
 * @param params Configuration for the new wall
 * @returns A complete WallLayout ready for use
 */
export function createDefaultLayout(params: {
  wallId: string;
  totalRunInches: number;
  heightInches: number;
  initialPanelCount: number;
  jointWidthInches?: number;
  glassSpecId?: string;
}): WallLayout {
  const {
    wallId,
    totalRunInches,
    heightInches,
    initialPanelCount,
    jointWidthInches = 0.375, // 3/8" default
    glassSpecId = 'default',
  } = params;

  // Create initial EQUAL panels
  const initialPanels: Panel[] = Array.from({ length: initialPanelCount }, (_, i) => ({
    panelId: generatePanelId(),
    index: i,
    widthInches: 10, // placeholder
    state: 'EQUAL' as PanelState,
    isDoor: false,
    glassSpecId,
    edgeWork: 'polished' as const,
    isTempered: false,
  }));

  const layout: WallLayout = {
    wallId,
    totalRunInches,
    heightInches,
    jointWidthInches,
    panels: initialPanels,
  };

  // Redistribute to compute actual widths
  const result = redistributePanels(layout);

  return {
    ...layout,
    panels: result.panels,
  };
}

// ============================================================================
// BOM GENERATION
// ============================================================================

/**
 * Compute a detailed Bill of Materials for the all-glass wall.
 *
 * Includes individual glass panel specifications, support hardware (base shoe, cap rail),
 * structural silicone joint calculations, and labor estimation.
 *
 * Labor estimate: 0.35 hours per square foot (all-glass frameless is labor-intensive).
 *
 * @param layout The wall layout
 * @param params BOM parameters (thickness, hardware, pricing, door count)
 * @returns Detailed AllGlassBOM for fabrication and installation
 */
export function computeAllGlassBOM(
  layout: WallLayout,
  params: {
    glassThicknessIn: number;
    hardwareVendorId: string;
    pricePerSqFt?: number;
    doorCount: number;
  }
): AllGlassBOM {
  const { glassThicknessIn, hardwareVendorId, pricePerSqFt, doorCount } = params;
  const { panels, totalRunInches, heightInches, jointWidthInches } = layout;

  // Build glass panel details
  const glassPanels = panels.map((panel) => {
    const sqft = (panel.widthInches * heightInches) / 144;
    const extCost = pricePerSqFt ? sqft * pricePerSqFt : undefined;

    return {
      panelId: panel.panelId,
      widthInches: panel.widthInches,
      heightInches,
      sqft,
      quantity: 1,
      isDoor: panel.isDoor,
      isTempered: panel.isTempered,
      edgeWork: panel.edgeWork,
      pricePerSqFt,
      extCost,
    };
  });

  // Calculate support hardware
  const baseShoeLF = totalRunInches / 12;
  const capRailLF = totalRunInches / 12;

  // Calculate structural silicone
  const jointCount = Math.max(0, panels.length - 1);
  const structuralSiliconeJointLF = (jointCount * heightInches) / 12;

  // Calculate total glass SF
  const totalGlassSF = glassPanels.reduce((sum, gp) => sum + gp.sqft, 0);

  // Labor: 0.35 hours per SF for all-glass frameless systems
  const laborHours = totalGlassSF * 0.35;

  return {
    glassPanels,
    baseShoeLF,
    capRailLF,
    structuralSiliconeJointLF,
    totalGlassSF,
    laborHours,
  };
}
