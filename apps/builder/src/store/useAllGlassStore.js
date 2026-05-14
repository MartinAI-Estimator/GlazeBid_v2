/**
 * useAllGlassStore — All-Glass Walls State Management (Zustand)
 *
 * Separate store for all-glass wall definitions and panel layouts.
 * Each wall contains its own panel layout (derived from the panelLayout engine)
 * and BOM calculation.
 *
 * Store shape:
 * - walls: AllGlassWall[] - complete wall definitions with layouts
 * - activeWallId: string | null - currently selected wall
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultLayout,
  redistributePanels,
  addPanel,
  removePanel,
  setPanelWidth,
  toggleDoorPanel,
  computeAllGlassBOM,
} from '@glazebid/frame-engine';

/**
 * Generate next mark for a new wall by examining existing walls.
 * Assumes marks follow pattern: AG-1, AG-2, etc.
 */
function getNextWallMark(walls) {
  if (!walls || walls.length === 0) return 'AG-1';

  let maxNum = 0;
  const marks = walls.map((w) => w.mark).filter(Boolean);

  for (const mark of marks) {
    const parts = mark.split('-');
    if (parts.length === 2) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `AG-${maxNum + 1}`;
}

const useAllGlassStore = create(
  persist(
    (set, get) => ({
      walls: [],
      activeWallId: null,

      /**
       * Add a new wall with defaults and auto-generated mark
       */
      addWall: () => {
        const { walls } = get();
        const wallId = crypto.randomUUID();
        const newWall = {
          wallId,
          mark: getNextWallMark(walls),
          scopeTag: 'BASE_BID',
          quantity: 1,
          totalRunInches: 0,
          heightInches: 0,
          glassThicknessIn: 0.5, // 1/2"
          jointWidthInches: 0.375, // 3/8"
          hardwareVendorId: 'crl',
          glassSpecId: 'GL-1',
          estimatorNotes: '',
          isMockup: false,
          layout: null,
          lastBOM: null,
        };

        set((state) => ({
          walls: [...state.walls, newWall],
          activeWallId: wallId,
        }));

        return wallId;
      },

      /**
       * Update a wall's properties and trigger layout/BOM recomputation if needed
       */
      updateWall: (wallId, updates) => {
        set((state) => {
          const wall = state.walls.find((w) => w.wallId === wallId);
          if (!wall) return state;

          const updatedWall = { ...wall, ...updates };

          // If dimensions changed, reinitialize layout
          const dimensionsChanged =
            updates.totalRunInches !== undefined ||
            updates.heightInches !== undefined ||
            updates.jointWidthInches !== undefined;

          if (dimensionsChanged && updatedWall.totalRunInches > 0 && updatedWall.heightInches > 0) {
            const layout = createDefaultLayout({
              wallId: updatedWall.wallId,
              totalRunInches: updatedWall.totalRunInches,
              heightInches: updatedWall.heightInches,
              initialPanelCount: Math.max(
                1,
                Math.round(updatedWall.totalRunInches / 36)
              ),
              jointWidthInches: updatedWall.jointWidthInches,
              glassSpecId: updatedWall.glassSpecId,
            });
            updatedWall.layout = layout;
          }

          return {
            walls: state.walls.map((w) =>
              w.wallId === wallId ? updatedWall : w
            ),
          };
        });

        // Recompute BOM after update completes
        setTimeout(() => get().resolveBOM(wallId), 0);
      },

      /**
       * Set the active wall
       */
      setActiveWall: (wallId) => {
        set({ activeWallId: wallId });
      },

      /**
       * Remove a wall from the list
       */
      removeWall: (wallId) => {
        set((state) => {
          const newActiveWallId =
            state.activeWallId === wallId ? null : state.activeWallId;
          return {
            walls: state.walls.filter((w) => w.wallId !== wallId),
            activeWallId: newActiveWallId,
          };
        });
      },

      /**
       * Add a panel to a wall at the specified position
       */
      addPanelToWall: (wallId, insertAfterIndex, isDoor = false, doorWidthInches = 36) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || !wall.layout) return;

        try {
          const newLayout = addPanel(
            wall.layout,
            insertAfterIndex,
            isDoor,
            doorWidthInches
          );
          set((state) => ({
            walls: state.walls.map((w) =>
              w.wallId === wallId ? { ...w, layout: newLayout } : w
            ),
          }));
          get().resolveBOM(wallId);
        } catch (err) {
          console.warn('addPanelToWall error:', err);
        }
      },

      /**
       * Remove a panel from a wall
       */
      removePanelFromWall: (wallId, panelId) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || !wall.layout) return;

        try {
          const newLayout = removePanel(wall.layout, panelId);
          set((state) => ({
            walls: state.walls.map((w) =>
              w.wallId === wallId ? { ...w, layout: newLayout } : w
            ),
          }));
          get().resolveBOM(wallId);
        } catch (err) {
          console.warn('removePanelFromWall error:', err);
        }
      },

      /**
       * Update a panel's width within a wall
       */
      setPanelWidthOnWall: (wallId, panelId, newWidthInches) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || !wall.layout) return;

        try {
          const newLayout = setPanelWidth(wall.layout, panelId, newWidthInches);
          set((state) => ({
            walls: state.walls.map((w) =>
              w.wallId === wallId ? { ...w, layout: newLayout } : w
            ),
          }));
          get().resolveBOM(wallId);
        } catch (err) {
          console.warn('setPanelWidthOnWall error:', err);
        }
      },

      /**
       * Toggle a panel between door and glass
       */
      toggleDoorOnWall: (wallId, panelId, doorWidthInches) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || !wall.layout) return;

        try {
          const newLayout = toggleDoorPanel(wall.layout, panelId, doorWidthInches);
          set((state) => ({
            walls: state.walls.map((w) =>
              w.wallId === wallId ? { ...w, layout: newLayout } : w
            ),
          }));
          get().resolveBOM(wallId);
        } catch (err) {
          console.warn('toggleDoorOnWall error:', err);
        }
      },

      /**
       * Initialize layout when dimensions become valid (> 0)
       */
      initLayout: (wallId) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || wall.totalRunInches <= 0 || wall.heightInches <= 0) return;

        const layout = createDefaultLayout({
          wallId: wall.wallId,
          totalRunInches: wall.totalRunInches,
          heightInches: wall.heightInches,
          initialPanelCount: Math.max(1, Math.round(wall.totalRunInches / 36)),
          jointWidthInches: wall.jointWidthInches,
          glassSpecId: wall.glassSpecId,
        });

        set((state) => ({
          walls: state.walls.map((w) =>
            w.wallId === wallId ? { ...w, layout } : w
          ),
        }));

        get().resolveBOM(wallId);
      },

      /**
       * Compute and cache BOM for a wall
       */
      resolveBOM: (wallId) => {
        const { walls } = get();
        const wall = walls.find((w) => w.wallId === wallId);
        if (!wall || !wall.layout) return;

        try {
          const bom = computeAllGlassBOM(wall.layout, {
            glassThicknessIn: wall.glassThicknessIn,
            hardwareVendorId: wall.hardwareVendorId,
            doorCount: wall.layout.panels.filter((p) => p.isDoor).length,
          });

          set((state) => ({
            walls: state.walls.map((w) =>
              w.wallId === wallId ? { ...w, lastBOM: bom } : w
            ),
          }));
        } catch (err) {
          console.warn('resolveBOM all-glass error:', err);
        }
      },

      /**
       * Get the currently active wall
       */
      getActiveWall: () => {
        const { walls, activeWallId } = get();
        return walls.find((w) => w.wallId === activeWallId) || null;
      },
    }),
    {
      name: 'glazebid-all-glass-store',
    }
  )
);

export default useAllGlassStore;
