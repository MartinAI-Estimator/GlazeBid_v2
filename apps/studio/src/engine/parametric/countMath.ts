/**
 * countMath.ts  —  Count Tool utilities.
 *
 * Point-based takeoff math: hardware, anchors, corner guards, etc.
 * Ported from the TOOL_MODES.COUNT logic in legacy useMarkupTools.jsx.
 *
 * Multiple MarkerShape instances that share the same `countGroupId` are tallied
 * together.  A CountGroup is a named, coloured bucket for a category of items.
 *
 * All functions are pure: no React, no side-effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A named category for count markers.
 * Stored in `useProjectStore.countGroups`.
 */
export type CountGroup = {
  id:    string;
  label: string;
  color: string;
};

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Standard marker colours (cycles when adding groups). */
export const COUNT_COLORS: string[] = [
  '#f43f5e',  // rose
  '#f97316',  // orange
  '#eab308',  // yellow
  '#22c55e',  // green
  '#06b6d4',  // cyan
  '#8b5cf6',  // violet
  '#ec4899',  // pink
];

export function defaultCountColor(index: number): string {
  return COUNT_COLORS[index % COUNT_COLORS.length];
}

export function defaultGroupLabel(existingCount: number): string {
  return `Count Group ${existingCount + 1}`;
}

// ── Core Math ─────────────────────────────────────────────────────────────────

/**
 * Count how many MarkerShapes belong to a given group.
 *
 * @param shapes  - All MarkerShape instances in the store (or any subset).
 * @param groupId - Target CountGroup id.
 */
export function countForGroup(
  shapes:  ReadonlyArray<{ countGroupId: string }>,
  groupId: string,
): number {
  return shapes.filter(s => s.countGroupId === groupId).length;
}

/**
 * Tally all groups, returning a Map<groupId, totalCount>.
 * Groups that have no markers still appear with a value of 0.
 */
export function tallyAllGroups(
  shapes: ReadonlyArray<{ countGroupId: string }>,
  groups: CountGroup[],
): Map<string, number> {
  const map = new Map<string, number>(groups.map(g => [g.id, 0]));
  for (const s of shapes) {
    const cur = map.get(s.countGroupId);
    if (cur !== undefined) map.set(s.countGroupId, cur + 1);
  }
  return map;
}

/**
 * Summarise a set of groups for display: label + current count.
 */
export function groupSummaries(
  shapes: ReadonlyArray<{ countGroupId: string }>,
  groups: CountGroup[],
): Array<{ group: CountGroup; count: number }> {
  return groups.map(g => ({ group: g, count: countForGroup(shapes, g.id) }));
}
