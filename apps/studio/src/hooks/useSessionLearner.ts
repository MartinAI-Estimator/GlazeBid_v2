/**
 * useSessionLearner.ts  —  Phase 6.3 TypeScript port of the Python SessionLearner.
 *
 * Real-time in-session learning from user accept/reject feedback.
 * No model retraining — threshold and hard-negative filtering update in RAM.
 *
 * ── How it works ─────────────────────────────────────────────────────────────
 *  1. User draws a bounding box on a glazing frame they want to find more of.
 *  2. `setAnchor(embedding)` stores the reference 128D feature embedding.
 *  3. Ghost Detector proposes matching regions at cosine similarity ≥ threshold.
 *  4. User accepts (✓) or rejects (✗) each ghost:
 *       acceptGhost → positive example stored, no threshold change
 *       rejectGhost → hard negative stored, threshold raised above the
 *                     rejected similarity + 0.02 margin
 *  5. `rankCandidates(candidates)` filters out:
 *       • Any candidate below the current threshold
 *       • Any candidate whose embedding is cosine-similar (≥ 0.92) to a
 *         stored hard negative
 *     This provides the "instant hide similar ghosts" UX described in the
 *     legacy executive summary.
 *
 * ── AI state vs display state ────────────────────────────────────────────────
 *  Mutable AI data (anchor, negatives, threshold) lives in refs so that
 *  callbacks such as `rejectGhost` and `rankCandidates` always read the latest
 *  values without stale-closure issues — no need to include them in dependency
 *  arrays.  Reactive display values (threshold, counts, hasAnchor) are mirrored
 *  as useState so GhostOverlay re-renders when they change.
 *
 * ── Tier boundaries ──────────────────────────────────────────────────────────
 *  This is Tier 1 (session-level).  Tier 2 (offline PyTorch fine-tuning via
 *  triplet loss on accumulated user corrections) remains in the Python daemon
 *  and is out of scope for this TypeScript implementation.
 *
 * Legacy reference:
 *   _LEGACY_ARCHIVE/GlazeBid_AIQ/GHOST_HIGHLIGHTER_ARCHITECTURE.md
 *   class SessionLearner — cosine_similarity, user_accepts_ghost,
 *   user_rejects_ghost, re_rank_ghosts
 */

import { useState, useCallback, useRef } from 'react';
import {
  cosineSimilarity,
  type FeatureVector,
} from '../engine/parametric/featureExtract';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default cosine similarity threshold (0–1).
 * Candidates below this score are not shown to the user.
 * Legacy default was 0.85, but architectural PDFs have high intra-class
 * variation so we open a bit wider and let rejections raise it quickly.
 */
const INITIAL_THRESHOLD = 0.75;

/**
 * When a ghost is rejected, the threshold is raised to:
 *   max(current_threshold, rejected_similarity + REJECTION_MARGIN)
 */
const REJECTION_MARGIN = 0.02;

/**
 * A candidate is suppressed if its embedding is cosine-similar above this
 * value to any hard negative.  Slightly lower than INITIAL_THRESHOLD so that
 * "same-ish but different scale" windows are also hidden after a rejection.
 */
const HARD_NEGATIVE_PROXIMITY = 0.92;

// ── Public types ──────────────────────────────────────────────────────────────

export type SessionLearnerAPI = {
  /** Current cosine similarity threshold (reactive — triggers re-render). */
  threshold:     number;
  /** True once `setAnchor` has been called for the current ghost session. */
  hasAnchor:     boolean;
  /** Count of accepted ghosts this session. */
  positiveCount: number;
  /** Count of rejected ghosts (hard negatives) this session. */
  negativeCount: number;

  /** Set the reference embedding from the user's drawn anchor box. */
  setAnchor: (embedding: FeatureVector) => void;
  /** Record a user ✓ acceptance of a ghost candidate. */
  acceptGhost: (embedding: FeatureVector) => void;
  /**
   * Record a user ✗ rejection.  Raises the threshold above the rejected
   * similarity and stores the embedding as a hard negative.
   */
  rejectGhost: (embedding: FeatureVector) => void;
  /**
   * Filter and re-rank a list of candidates against the current anchor and
   * hard negatives.  Returns only candidates that pass the threshold and are
   * not too similar to any rejected example.
   *
   * Reads from refs — always up-to-date regardless of React render cycle.
   *
   * @param candidates  Any array with an `embedding` field.
   * @returns  Filtered & confidence-updated subset, sorted descending.
   */
  rankCandidates: <T extends { embedding: FeatureVector }>(
    candidates: T[],
  ) => (T & { confidence: number })[];
  /** Clear all session state, ready for a new anchor. */
  reset: () => void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSessionLearner(): SessionLearnerAPI {
  // ── Mutable AI state (refs — no render on change) ─────────────────────────
  const anchorRef          = useRef<FeatureVector | null>(null);
  const hardNegativesRef   = useRef<FeatureVector[]>([]);
  const positiveExamplesRef = useRef<FeatureVector[]>([]);
  const thresholdRef       = useRef<number>(INITIAL_THRESHOLD);

  // ── Reactive display state ────────────────────────────────────────────────
  const [threshold,     setThresholdState] = useState<number>(INITIAL_THRESHOLD);
  const [positiveCount, setPositiveCount]  = useState<number>(0);
  const [negativeCount, setNegativeCount]  = useState<number>(0);
  const [hasAnchor,     setHasAnchor]      = useState<boolean>(false);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setAnchor = useCallback((embedding: FeatureVector) => {
    anchorRef.current           = embedding.slice() as FeatureVector;
    hardNegativesRef.current    = [];
    positiveExamplesRef.current = [];
    thresholdRef.current        = INITIAL_THRESHOLD;
    setThresholdState(INITIAL_THRESHOLD);
    setPositiveCount(0);
    setNegativeCount(0);
    setHasAnchor(true);
  }, []);

  const acceptGhost = useCallback((embedding: FeatureVector) => {
    positiveExamplesRef.current = [...positiveExamplesRef.current, embedding.slice() as FeatureVector];
    setPositiveCount(positiveExamplesRef.current.length);
  }, []);

  const rejectGhost = useCallback((embedding: FeatureVector) => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    hardNegativesRef.current = [...hardNegativesRef.current, embedding.slice() as FeatureVector];
    setNegativeCount(hardNegativesRef.current.length);

    // Adaptive threshold adjustment: raise the bar above this false positive.
    const sim = cosineSimilarity(anchor, embedding);
    const newT = Math.min(0.99, Math.max(thresholdRef.current, sim + REJECTION_MARGIN));
    if (newT > thresholdRef.current) {
      thresholdRef.current = newT;
      setThresholdState(newT);
    }
  }, []);

  const rankCandidates = useCallback(<T extends { embedding: FeatureVector }>(
    candidates: T[],
  ): (T & { confidence: number })[] => {
    const anchor   = anchorRef.current;
    const t        = thresholdRef.current;
    const negatives = hardNegativesRef.current;

    if (!anchor) return [];

    const ranked: (T & { confidence: number })[] = [];

    for (const c of candidates) {
      const simToAnchor = cosineSimilarity(anchor, c.embedding);
      if (simToAnchor < t) continue;

      // Suppress if the embedding is too close to any hard negative
      let tooNegative = false;
      for (const neg of negatives) {
        if (cosineSimilarity(c.embedding, neg) > HARD_NEGATIVE_PROXIMITY) {
          tooNegative = true;
          break;
        }
      }
      if (tooNegative) continue;

      ranked.push({ ...c, confidence: simToAnchor });
    }

    // Sort by confidence descending
    ranked.sort((a, b) => b.confidence - a.confidence);
    return ranked;
  }, []);

  const reset = useCallback(() => {
    anchorRef.current           = null;
    hardNegativesRef.current    = [];
    positiveExamplesRef.current = [];
    thresholdRef.current        = INITIAL_THRESHOLD;
    setThresholdState(INITIAL_THRESHOLD);
    setPositiveCount(0);
    setNegativeCount(0);
    setHasAnchor(false);
  }, []);

  return {
    threshold,
    hasAnchor,
    positiveCount,
    negativeCount,
    setAnchor,
    acceptGhost,
    rejectGhost,
    rankCandidates,
    reset,
  };
}
