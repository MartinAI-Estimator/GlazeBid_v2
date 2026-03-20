import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * History Hook for Undo/Redo functionality
 * Manages a history stack with past and future states
 */
const useHistory = (initialState = []) => {
  const [history, setHistory] = useState({
    past: [],
    present: initialState,
    future: []
  });

  const historyRef = useRef(history);
  historyRef.current = history;
  
  // Track the last synced state to avoid infinite loops
  const lastSyncedStateRef = useRef(initialState);

  // Sync with external state changes (like loading a project)
  // Only update once when external state changes
  useEffect(() => {
    // Check if initialState has actually changed (by reference or length)
    const hasChanged = initialState !== lastSyncedStateRef.current && 
                       initialState.length !== lastSyncedStateRef.current.length;
    
    if (hasChanged) {
      setHistory({
        past: [], // Clear history when syncing
        present: initialState,
        future: []
      });
      lastSyncedStateRef.current = initialState;
    }
  }, [initialState]); // Only trigger when initialState reference changes

  // Push a new state (when user makes a change)
  const pushState = useCallback((newState) => {
    setHistory(prev => ({
      past: [...prev.past, prev.present],
      present: newState,
      future: [] // Clear future when new action is taken
    }));
  }, []);

  // Undo - move back one state
  const undo = useCallback(() => {
    const { past, present, future } = historyRef.current;
    
    if (past.length === 0) {
      console.log('Nothing to undo');
      return null;
    }

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setHistory({
      past: newPast,
      present: previous,
      future: [present, ...future]
    });

    return previous;
  }, []);

  // Redo - move forward one state
  const redo = useCallback(() => {
    const { past, present, future } = historyRef.current;

    if (future.length === 0) {
      console.log('Nothing to redo');
      return null;
    }

    const next = future[0];
    const newFuture = future.slice(1);

    setHistory({
      past: [...past, present],
      present: next,
      future: newFuture
    });

    return next;
  }, []);

  // Clear history
  const clear = useCallback(() => {
    setHistory({
      past: [],
      present: initialState,
      future: []
    });
  }, [initialState]);

  return {
    state: history.present,
    pushState,
    undo,
    redo,
    clear,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  };
};

export default useHistory;
