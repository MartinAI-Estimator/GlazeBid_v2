import { create } from 'zustand';

export const useProjectStore = create((set) => ({
    activeProject: null,
    activeSheet: null,
    selectedTakeoffId: null,
    takeoffs: [],
    
    setProject: (data) => set({ activeProject: data }),
    setSelectedTakeoff: (id) => set({ selectedTakeoffId: id }),
    
    // Optimistic UI Update: Update locally first, then sync with backend
    addTakeoff: (newTakeoff) => set((state) => ({
        takeoffs: [...state.takeoffs, newTakeoff]
    }))
}));
