/**
 * useAISessionStore.ts — Persists Ghost Detector session state across Studio restarts.
 *
 * The SessionLearner stores all state in refs (fast, no render lag).
 * This store provides a serializable mirror: updated on project save,
 * restored on project open.
 *
 * .gbid schema addition:
 *   aiSession: {
 *     anchor: number[] | null,          // 128D Float32Array serialized as number[]
 *     hardNegatives: number[][],        // each 128D
 *     positiveExamples: number[][],     // each 128D
 *     threshold: number,
 *     savedAt: string,                  // ISO timestamp
 *   }
 */

import { create } from 'zustand';
import type { FeatureVector } from '../engine/parametric/featureExtract';

export type SerializedAISession = {
  anchor: number[] | null;
  hardNegatives: number[][];
  positiveExamples: number[][];
  threshold: number;
  savedAt: string;
};

type AISessionState = {
  /** The last-serialized session data (null = no session saved) */
  savedSession: SerializedAISession | null;

  /** Serialize current SessionLearner refs and store for .gbid save */
  saveSession: (
    anchor: FeatureVector | null,
    hardNegatives: FeatureVector[],
    positiveExamples: FeatureVector[],
    threshold: number,
  ) => void;

  /** Load a serialized session from a .gbid file */
  loadSession: (session: SerializedAISession | null) => void;

  /** Clear stored session */
  clearSession: () => void;
};

export const useAISessionStore = create<AISessionState>((set) => ({
  savedSession: null,

  saveSession: (anchor, hardNegatives, positiveExamples, threshold) => {
    const session: SerializedAISession = {
      anchor: anchor ? Array.from(anchor) : null,
      hardNegatives: hardNegatives.map(v => Array.from(v)),
      positiveExamples: positiveExamples.map(v => Array.from(v)),
      threshold,
      savedAt: new Date().toISOString(),
    };
    set({ savedSession: session });
  },

  loadSession: (session) => {
    set({ savedSession: session });
  },

  clearSession: () => set({ savedSession: null }),
}));

/** Helper: deserialize a stored session back to FeatureVector arrays */
export function deserializeAISession(session: SerializedAISession): {
  anchor: FeatureVector | null;
  hardNegatives: FeatureVector[];
  positiveExamples: FeatureVector[];
  threshold: number;
} {
  return {
    anchor: session.anchor ? new Float32Array(session.anchor) as FeatureVector : null,
    hardNegatives: session.hardNegatives.map(v => new Float32Array(v) as FeatureVector),
    positiveExamples: session.positiveExamples.map(v => new Float32Array(v) as FeatureVector),
    threshold: session.threshold,
  };
}
