import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useFrameBuilderStore from './useFrameBuilderStore';

const useRevisionStore = create(
  persist(
    (set, get) => ({
      revisions: [],  // array of revision objects (see below)
      activeRevisionId: null,
      compareRevisionId: null,  // for side-by-side diff

      // Take a new snapshot of the current frame state
      takeSnapshot: (label) => {
        const frames = useFrameBuilderStore.getState().frames;
        const groups = useFrameBuilderStore.getState().groups;

        const revisionId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Build snapshot: capture key frame data
        const frameSnapshot = frames.map(f => ({
          frameId: f.frameId,
          mark: f.mark,
          groupId: f.groupId,
          widthInches: f.widthInches,
          heightInches: f.heightInches,
          bays: f.bays,
          rows: f.rows,
          quantity: f.quantity,
          scopeTag: f.scopeTag,
          systemClass: f.systemClass,
          vendorSystemId: f.vendorSystemId,
          finishType: f.finishType,
          totalAluminumLF: f.lastBOM?.totalAluminumLF || 0,
          totalGlassSqFt: f.lastBOM?.totalGlassSqFt || 0,
          laborHours: f.lastBOM?.labor?.totalLaborHours || 0,
        }));

        const revision = {
          revisionId,
          timestamp,
          label: label || `Rev ${get().revisions.length + 1}`,
          source: 'manual',
          frameSnapshot,
          frameCount: frames.length,
          groupCount: groups.length,
          accepted: false,
          notes: '',
        };

        set(state => ({
          revisions: [...state.revisions, revision],
          activeRevisionId: revisionId,
        }));
        return revisionId;
      },

      // Accept a revision (mark as reviewed)
      acceptRevision: (revisionId) => {
        set(state => ({
          revisions: state.revisions.map(r =>
            r.revisionId === revisionId ? { ...r, accepted: true } : r
          ),
        }));
      },

      // Update revision notes
      updateRevisionNotes: (revisionId, notes) => {
        set(state => ({
          revisions: state.revisions.map(r =>
            r.revisionId === revisionId ? { ...r, notes } : r
          ),
        }));
      },

      // Delete a revision
      deleteRevision: (revisionId) => {
        set(state => ({
          revisions: state.revisions.filter(r => r.revisionId !== revisionId),
          activeRevisionId: state.activeRevisionId === revisionId ? null : state.activeRevisionId,
          compareRevisionId: state.compareRevisionId === revisionId ? null : state.compareRevisionId,
        }));
      },

      setActiveRevision: (revisionId) => set({ activeRevisionId: revisionId }),
      setCompareRevision: (revisionId) => set({ compareRevisionId: revisionId }),

      // Compute diff between two revision snapshots
      // Returns array of { mark, changeType, widthDelta, heightDelta, qtyDelta, notes }
      computeDiff: (revAId, revBId) => {
        const { revisions } = get();
        const revA = revisions.find(r => r.revisionId === revAId);
        const revB = revisions.find(r => r.revisionId === revBId);
        if (!revA || !revB) return [];

        const mapA = new Map(revA.frameSnapshot.map(f => [f.mark, f]));
        const mapB = new Map(revB.frameSnapshot.map(f => [f.mark, f]));
        const diffs = [];

        // Frames in B but not in A → added
        for (const [mark, frameB] of mapB) {
          if (!mapA.has(mark)) {
            diffs.push({ mark, changeType: 'added', frameB });
          }
        }
        // Frames in A but not in B → removed
        for (const [mark, frameA] of mapA) {
          if (!mapB.has(mark)) {
            diffs.push({ mark, changeType: 'removed', frameA });
          }
        }
        // Frames in both → check modifications
        for (const [mark, frameA] of mapA) {
          const frameB = mapB.get(mark);
          if (!frameB) continue;
          const widthDelta = frameB.widthInches - frameA.widthInches;
          const heightDelta = frameB.heightInches - frameA.heightInches;
          const qtyDelta = frameB.quantity - frameA.quantity;
          const aluminumDelta = frameB.totalAluminumLF - frameA.totalAluminumLF;
          if (Math.abs(widthDelta) > 0.01 || Math.abs(heightDelta) > 0.01 || qtyDelta !== 0) {
            diffs.push({ mark, changeType: 'modified', frameA, frameB, widthDelta, heightDelta, qtyDelta, aluminumDelta });
          }
        }

        return diffs;
      },
    }),
    { name: 'glazebid-revision-store' }
  )
);

export default useRevisionStore;
