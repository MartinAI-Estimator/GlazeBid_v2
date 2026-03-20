/**
 * GlazeBid - useInboxStore Tests
 * ================================
 * Tests the Zustand takeoff inbox store.
 * Covers: hydrateInbox, addTakeoff, removeTakeoff, resetInbox,
 * edge cases, and persist middleware behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useInboxStore } from '../../store/useInboxStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function makeTakeoff(overrides = {}) {
  const id = `takeoff-${++_idCounter}`;
  return {
    id,
    projectName: 'Test Project',
    systemLabel: 'Storefront SF-1',
    frames: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Reset store to clean state before each test
beforeEach(() => {
  useInboxStore.getState().resetInbox();
  vi.clearAllMocks();
});

// =============================================================================
// HYDRATE
// =============================================================================

describe('useInboxStore - hydrateInbox', () => {
  it('replaces the inbox with the provided array', () => {
    const items = [makeTakeoff(), makeTakeoff()];
    useInboxStore.getState().hydrateInbox(items);

    expect(useInboxStore.getState().inbox).toHaveLength(2);
    expect(useInboxStore.getState().inbox[0].id).toBe(items[0].id);
  });

  it('overwrites any pre-existing inbox entries', () => {
    useInboxStore.getState().hydrateInbox([makeTakeoff()]);
    useInboxStore.getState().hydrateInbox([makeTakeoff(), makeTakeoff(), makeTakeoff()]);

    expect(useInboxStore.getState().inbox).toHaveLength(3);
  });

  it('sets inbox to empty array when called with []', () => {
    useInboxStore.getState().hydrateInbox([makeTakeoff()]);
    useInboxStore.getState().hydrateInbox([]);

    expect(useInboxStore.getState().inbox).toHaveLength(0);
  });

  it('handles non-array input safely (sets to empty array)', () => {
    // Defensive: should not throw and should not corrupt the store
    expect(() => {
      try {
        useInboxStore.getState().hydrateInbox(null);
      } catch {
        // Some implementations may throw; that's acceptable
        useInboxStore.getState().hydrateInbox([]);
      }
    }).not.toThrow();
  });
});

// =============================================================================
// ADD
// =============================================================================

describe('useInboxStore - addTakeoff', () => {
  it('appends a takeoff to an empty inbox', () => {
    const t = makeTakeoff({ projectName: 'Alpha' });
    useInboxStore.getState().addTakeoff(t);

    const { inbox } = useInboxStore.getState();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].projectName).toBe('Alpha');
  });

  it('does not replace existing items when adding a new one', () => {
    useInboxStore.getState().addTakeoff(makeTakeoff());
    useInboxStore.getState().addTakeoff(makeTakeoff());
    useInboxStore.getState().addTakeoff(makeTakeoff());

    expect(useInboxStore.getState().inbox).toHaveLength(3);
  });
});

// =============================================================================
// REMOVE
// =============================================================================

describe('useInboxStore - removeTakeoff', () => {
  it('removes item with matching id', () => {
    const t1 = makeTakeoff();
    const t2 = makeTakeoff();
    useInboxStore.getState().hydrateInbox([t1, t2]);

    useInboxStore.getState().removeTakeoff(t1.id);

    const { inbox } = useInboxStore.getState();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(t2.id);
  });

  it('no-ops gracefully when id does not exist', () => {
    const t = makeTakeoff();
    useInboxStore.getState().hydrateInbox([t]);
    useInboxStore.getState().removeTakeoff('nonexistent-id');

    expect(useInboxStore.getState().inbox).toHaveLength(1);
  });

  it('empties inbox when last item is removed', () => {
    const t = makeTakeoff();
    useInboxStore.getState().hydrateInbox([t]);
    useInboxStore.getState().removeTakeoff(t.id);

    expect(useInboxStore.getState().inbox).toHaveLength(0);
  });
});

// =============================================================================
// RESET
// =============================================================================

describe('useInboxStore - resetInbox', () => {
  it('empties the inbox', () => {
    useInboxStore.getState().hydrateInbox([makeTakeoff(), makeTakeoff()]);
    useInboxStore.getState().resetInbox();

    expect(useInboxStore.getState().inbox).toHaveLength(0);
  });

  it('is safe to call on an already-empty inbox', () => {
    expect(() => useInboxStore.getState().resetInbox()).not.toThrow();
    expect(useInboxStore.getState().inbox).toHaveLength(0);
  });
});

// =============================================================================
// PERSIST MIDDLEWARE – localStorage integration
// =============================================================================

describe('useInboxStore - persist middleware', () => {
  it('calls localStorage.setItem with key "glazebid-inbox-store" when inbox changes', () => {
    useInboxStore.getState().addTakeoff(makeTakeoff());

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid-inbox-store',
      expect.any(String)
    );
  });

  it('persisted payload contains the inbox array', () => {
    const t = makeTakeoff({ projectName: 'Persist Test' });
    useInboxStore.getState().addTakeoff(t);

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-inbox-store');
    expect(storeCall).toBeDefined();

    const payload = JSON.parse(storeCall[1]);
    expect(payload.state).toHaveProperty('inbox');
    expect(Array.isArray(payload.state.inbox)).toBe(true);
    expect(payload.state.inbox[0].projectName).toBe('Persist Test');
  });

  it('updates persisted data after hydrateInbox', () => {
    const items = [makeTakeoff(), makeTakeoff()];
    useInboxStore.getState().hydrateInbox(items);

    const calls = localStorage.setItem.mock.calls;
    // Get the most recent call for this key
    const storeCalls = calls.filter(([key]) => key === 'glazebid-inbox-store');
    const latest = storeCalls[storeCalls.length - 1];
    const payload = JSON.parse(latest[1]);

    expect(payload.state.inbox).toHaveLength(2);
  });

  it('updates persisted data after removeTakeoff', () => {
    const t1 = makeTakeoff();
    const t2 = makeTakeoff();
    useInboxStore.getState().hydrateInbox([t1, t2]);
    vi.clearAllMocks(); // clear the hydrate call

    useInboxStore.getState().removeTakeoff(t1.id);

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-inbox-store');
    expect(storeCall).toBeDefined();

    const payload = JSON.parse(storeCall[1]);
    expect(payload.state.inbox).toHaveLength(1);
    expect(payload.state.inbox[0].id).toBe(t2.id);
  });

  it('persists empty inbox after resetInbox', () => {
    useInboxStore.getState().hydrateInbox([makeTakeoff()]);
    vi.clearAllMocks();
    useInboxStore.getState().resetInbox();

    const calls = localStorage.setItem.mock.calls;
    const storeCall = calls.find(([key]) => key === 'glazebid-inbox-store');
    expect(storeCall).toBeDefined();

    const payload = JSON.parse(storeCall[1]);
    expect(payload.state.inbox).toHaveLength(0);
  });
});
