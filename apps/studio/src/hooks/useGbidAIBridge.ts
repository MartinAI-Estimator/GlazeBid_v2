/**
 * useGbidAIBridge.ts — Bridges SessionLearner state ↔ .gbid save/load.
 *
 * Call this hook once in the Studio root component (App.tsx or similar).
 * It listens for gbid:save requests and injects aiSession into the payload,
 * and listens for gbid:loaded events to restore AI state.
 */

import { useEffect } from 'react';
import { useAISessionStore, deserializeAISession, type SerializedAISession } from '../store/useAISessionStore';
import type { SessionLearnerAPI } from './useSessionLearner';

export function useGbidAIBridge(learner: SessionLearnerAPI): void {
  const { saveSession, loadSession } = useAISessionStore();

  useEffect(() => {
    // Listen for project save events — inject AI session into the payload
    const handleBeforeSave = (event: CustomEvent<{ payload: Record<string, unknown> }>) => {
      const sessionData = learner.serializeSession();
      saveSession(
        sessionData.anchor,
        sessionData.hardNegatives,
        sessionData.positiveExamples,
        sessionData.threshold,
      );
      // Attach to save payload if event detail is mutable
      if (event.detail?.payload) {
        event.detail.payload.aiSession = useAISessionStore.getState().savedSession;
      }
    };

    // Listen for project load events — restore AI state
    const handleProjectLoaded = (event: CustomEvent<{ aiSession?: SerializedAISession }>) => {
      const session = event.detail?.aiSession;
      if (session) {
        loadSession(session);
        const restored = deserializeAISession(session);
        learner.restoreSession(restored);
      }
    };

    window.addEventListener('glazebid:before-save', handleBeforeSave as EventListener);
    window.addEventListener('glazebid:project-loaded', handleProjectLoaded as EventListener);

    return () => {
      window.removeEventListener('glazebid:before-save', handleBeforeSave as EventListener);
      window.removeEventListener('glazebid:project-loaded', handleProjectLoaded as EventListener);
    };
  }, [learner, saveSession, loadSession]);
}
