/**
 * useBidStore.workspaceSystems — canonical system model tests (AUDIT 3.1)
 *
 * The workspace systems array moved from GlazeBidWorkspace component state
 * (+ per-project localStorage) into useBidStore so BidSheet, ReviewBidPage,
 * the proposal, and the project file all read the same data.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import useBidStore from '../../store/useBidStore';

const sys = (id, extra = {}) => ({
  id,
  type: 'partnerpak-import',
  name: `System ${id}`,
  frames: [],
  materials: [],
  laborTasks: [],
  totals: {},
  ...extra,
});

beforeEach(() => {
  useBidStore.setState({ frames: [], workspaceSystems: [] });
});

describe('workspaceSystems actions', () => {
  it('setWorkspaceSystems accepts an array', () => {
    useBidStore.getState().setWorkspaceSystems([sys('a'), sys('b')]);
    expect(useBidStore.getState().workspaceSystems.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('setWorkspaceSystems accepts a functional updater (setState-style callers)', () => {
    useBidStore.getState().setWorkspaceSystems([sys('a')]);
    useBidStore.getState().setWorkspaceSystems(prev => [...prev, sys('b')]);
    expect(useBidStore.getState().workspaceSystems.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('addWorkspaceSystem appends', () => {
    useBidStore.getState().addWorkspaceSystem(sys('a'));
    useBidStore.getState().addWorkspaceSystem(sys('b'));
    expect(useBidStore.getState().workspaceSystems).toHaveLength(2);
  });

  it('updateWorkspaceSystem patches by id with object or fn', () => {
    useBidStore.getState().setWorkspaceSystems([sys('a'), sys('b')]);
    useBidStore.getState().updateWorkspaceSystem('a', { name: 'Renamed' });
    useBidStore.getState().updateWorkspaceSystem('b', s => ({ ...s, frames: [{ id: 'f1' }] }));
    const [a, b] = useBidStore.getState().workspaceSystems;
    expect(a.name).toBe('Renamed');
    expect(b.frames).toHaveLength(1);
    expect(a.frames).toHaveLength(0); // untouched
  });

  it('removeWorkspaceSystem removes only the target', () => {
    useBidStore.getState().setWorkspaceSystems([sys('a'), sys('b')]);
    useBidStore.getState().removeWorkspaceSystem('a');
    expect(useBidStore.getState().workspaceSystems.map(s => s.id)).toEqual(['b']);
  });

  it('clearBid wipes workspaceSystems too', () => {
    useBidStore.getState().setWorkspaceSystems([sys('a')]);
    useBidStore.getState().clearBid();
    expect(useBidStore.getState().workspaceSystems).toEqual([]);
  });

  it('rehydrateBid restores workspaceSystems when provided, leaves them when absent', () => {
    useBidStore.getState().setWorkspaceSystems([sys('existing')]);
    useBidStore.getState().rehydrateBid({ frames: [] }); // no systems in payload
    expect(useBidStore.getState().workspaceSystems.map(s => s.id)).toEqual(['existing']);
    useBidStore.getState().rehydrateBid({ frames: [], workspaceSystems: [sys('fromFile')] });
    expect(useBidStore.getState().workspaceSystems.map(s => s.id)).toEqual(['fromFile']);
  });
});

describe('dedupe contract with BidSheet sync (AUDIT 3.3)', () => {
  it('a context frame carrying sourceFrameId matches its bidStore origin', () => {
    const bidStoreFrames = [{ frameId: 'studio-123' }, { frameId: 'studio-456' }];
    const contextFrames = [{ id: 'f-999', sourceFrameId: 'studio-123' }];
    const knownIds = new Set(contextFrames.map(f => f.sourceFrameId ?? f.id));
    const syncable = bidStoreFrames.filter(f => !knownIds.has(f.frameId));
    expect(syncable.map(f => f.frameId)).toEqual(['studio-456']);
  });
});
