/**
 * useVentStore — Operable Vent Schedule State Management
 *
 * Manages operable vent definitions for glazing frames.
 * Stores vent data with hardware specs and labor estimates.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useVentStore = create(
  persist(
    (set, get) => ({
      vents: [],

      addVent: (ventData) => {
        const ventId = crypto.randomUUID();
        const count = get().vents.length + 1;
        const ventMark = ventData.ventMark || `V-${count}`;

        set((state) => ({
          vents: [
            ...state.vents,
            {
              ...ventData,
              ventId,
              ventMark,
            },
          ],
        }));

        return ventId;
      },

      updateVent: (ventId, updates) =>
        set((state) => ({
          vents: state.vents.map((v) =>
            v.ventId === ventId ? { ...v, ...updates } : v
          ),
        })),

      removeVent: (ventId) =>
        set((state) => ({
          vents: state.vents.filter((v) => v.ventId !== ventId),
        })),

      clearAllVents: () => set({ vents: [] }),

      getVentsByFrame: (frameId) => {
        const state = get();
        return state.vents.filter((v) => v.frameId === frameId);
      },

      getTotalVentStats: () => {
        const state = get();
        const stats = {
          totalVents: state.vents.length,
          totalSF: 0,
          totalLabor: 0,
          byType: {},
        };

        state.vents.forEach((v) => {
          // SF calculation
          const ventSF = (v.width * v.height) / 144;
          stats.totalSF += ventSF * (v.quantity || 1);

          // Labor calculation
          const laborMap = {
            'proj-out': 2.0,
            'tilt-turn': 3.0,
            casement: 1.5,
            slider: 1.5,
            fixed: 0,
          };
          const laborHours = laborMap[v.type] || 0;
          stats.totalLabor += laborHours * (v.quantity || 1);

          // By type
          if (!stats.byType[v.type]) {
            stats.byType[v.type] = 0;
          }
          stats.byType[v.type] += v.quantity || 1;
        });

        return stats;
      },
    }),
    {
      name: 'glazebid-vent-store',
    }
  )
);

export default useVentStore;
