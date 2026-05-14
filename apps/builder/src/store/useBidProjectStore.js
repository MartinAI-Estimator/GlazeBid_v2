/**
 * useBidProjectStore
 *
 * Bridge store: GlazeBidWorkspace pushes a snapshot of all imported systems
 * (with pre-computed per-system costs) into this store whenever the bid
 * changes. BidCart reads from here so it doesn't need to re-derive costs
 * or thread props through the view hierarchy.
 */
import { create } from 'zustand';

const useBidProjectStore = create((set) => ({
  // Array of system objects with pre-computed cost fields:
  //   _computedMaterialCost: number
  //   _computedLaborCost:    number
  //   _computedEquipCost:    number
  systems: [],

  // Result from calculatePricing() for the whole project
  projectRecap: null,

  // Bid-wide settings at the time of the last snapshot
  bidSettings: {},

  // True when imported systems haven't been saved to a .gbid file
  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),

  // ID of a system to auto-open for editing when BidBuilder mounts
  // Set by BidCart (or Scope/Summary cards) before navigating back to bidsheet
  pendingEditSystemId: null,
  setPendingEditSystemId: (id) => set({ pendingEditSystemId: id }),
  clearPendingEditSystemId: () => set({ pendingEditSystemId: null }),

  /**
   * Called by GlazeBidWorkspace whenever importedSystems or pricing changes.
   * @param {{ systems: Array, projectRecap: Object, bidSettings: Object }} snapshot
   */
  setSnapshot: (snapshot) => set({
    systems:      snapshot.systems      ?? [],
    projectRecap: snapshot.projectRecap ?? null,
    bidSettings:  snapshot.bidSettings  ?? {},
  }),

  clearSnapshot: () => set({ systems: [], projectRecap: null, bidSettings: {}, isDirty: false }),
}));

export default useBidProjectStore;
