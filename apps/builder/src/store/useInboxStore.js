/**
 * useInboxStore.js — Builder-side mirror of Studio's RawTakeoff inbox.
 *
 * Stores the RawTakeoff[] records captured by Studio.
 * Hydrated via IPC (onInboxUpdate) or via the storage event (same-origin prod).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useInboxStore = create(
  persist(
    (set) => ({
      /** RawTakeoff[] from Studio */
      inbox: [],

      /**
       * Replace the full inbox (called when a full snapshot arrives).
       * @param {Array} items
       */
      hydrateInbox: (items) => set({ inbox: Array.isArray(items) ? items : [] }),

      /**
       * Append a single takeoff (IPC live-sync).
       * @param {object} item
       */
      addTakeoff: (item) => set((s) => ({ inbox: [...s.inbox, item] })),

      /** Remove a single takeoff by id. */
      removeTakeoff: (id) => set((s) => ({ inbox: s.inbox.filter((t) => t.id !== id) })),

      /** Reset to empty state (new project in Studio). */
      resetInbox: () => set({ inbox: [] }),
    }),
    {
      name: 'glazebid-inbox-store',
    }
  )
);
