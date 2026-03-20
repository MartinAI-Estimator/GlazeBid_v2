/**
 * useLearningLoop.ts
 *
 * Phase 1 AI: Learning loop — logs every AI correction, validation, and rejection
 * so the system can track accuracy and eventually retrain.
 *
 * Storage: localStorage key `glazebid-learning-log` (JSON, per-browser).
 * This is intentionally lightweight — no server or IPC required for Phase 1.
 * The exported `exportTrainingData()` function returns the full log for future
 * use by the Phase 3 Python retraining daemon.
 *
 * Accuracy formula:
 *   rate = validations / (corrections + validations + rejections)
 *
 * Training becomes viable at ≥ 50 total interactions.
 *
 * Legacy reference: _LEGACY_ARCHIVE/GlazeBid_AIQ/backend/core/learning_logger.py
 */

import { useCallback } from 'react';
import type { GlazingSystemType } from './useFallbackIntelligence';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LearningAction = 'correction' | 'validation' | 'rejection';

export type LearningEntry = {
  timestamp:             string;          // ISO-8601
  shapeId:               string;
  pageId:                string;
  action:                LearningAction;
  aiPrediction?:         { suggestedType: GlazingSystemType; confidence: number };
  userChoice?:           GlazingSystemType;
  correctionMagnitude?:  number;          // Euclidean px distance when user moved a boundary
  reason?:               string;          // 'false_positive' | 'wrong_classification' etc.
};

export type LearningLog = {
  createdAt:   string;
  version:     '1.0';
  corrections: LearningEntry[];
  validations: LearningEntry[];
  rejections:  LearningEntry[];
};

export type LearningStats = {
  totalInteractions:     number;
  accuracyRate:          number;   // 0.0 – 1.0
  avgCorrectionMagnitude: number;  // pixels
  /** True once ≥ 50 interactions have been logged (enough to retrain model). */
  trainingReady:         boolean;
};

export type UseLearningLoopResult = {
  /**
   * Log a user correction — AI suggested A but user changed it to B.
   * Pass `correctionMagnitude` (pixel distance) when the user physically
   * moved a shape boundary rather than just reclassifying type.
   */
  logCorrection: (params: {
    shapeId:             string;
    pageId:              string;
    aiPrediction:        { suggestedType: GlazingSystemType; confidence: number };
    userChoice:          GlazingSystemType;
    correctionMagnitude?: number;
  }) => void;

  /** Log user approval — AI was right, user confirmed. */
  logValidation: (params: {
    shapeId:      string;
    pageId:       string;
    aiPrediction: { suggestedType: GlazingSystemType; confidence: number };
  }) => void;

  /** Log user rejection — AI suggestion was wrong / a false positive. */
  logRejection: (params: {
    shapeId:      string;
    pageId:       string;
    aiPrediction: { suggestedType: GlazingSystemType; confidence: number };
    reason:       string;
    correctType?: GlazingSystemType;
  }) => void;

  /** Compute summary statistics from the persisted log. */
  getStats: () => LearningStats;

  /** Return the full log for export / Phase 3 training pipeline. */
  exportTrainingData: () => LearningLog;

  /** Wipe the local log (useful in tests or when starting a new project). */
  clearLog: () => void;
};

// ── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'glazebid-learning-log';

function emptyLog(): LearningLog {
  return {
    createdAt:   new Date().toISOString(),
    version:     '1.0',
    corrections: [],
    validations: [],
    rejections:  [],
  };
}

function loadLog(): LearningLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LearningLog;
  } catch {
    // Corrupt storage — start fresh
  }
  return emptyLog();
}

function saveLog(log: LearningLog): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage quota exceeded or private-browsing restriction — skip silently.
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLearningLoop(): UseLearningLoopResult {
  const logCorrection = useCallback((params: {
    shapeId:             string;
    pageId:              string;
    aiPrediction:        { suggestedType: GlazingSystemType; confidence: number };
    userChoice:          GlazingSystemType;
    correctionMagnitude?: number;
  }): void => {
    const log = loadLog();
    log.corrections.push({
      timestamp:            new Date().toISOString(),
      shapeId:              params.shapeId,
      pageId:               params.pageId,
      action:               'correction',
      aiPrediction:         params.aiPrediction,
      userChoice:           params.userChoice,
      correctionMagnitude:  params.correctionMagnitude,
    });
    saveLog(log);
  }, []);

  const logValidation = useCallback((params: {
    shapeId:      string;
    pageId:       string;
    aiPrediction: { suggestedType: GlazingSystemType; confidence: number };
  }): void => {
    const log = loadLog();
    log.validations.push({
      timestamp:    new Date().toISOString(),
      shapeId:      params.shapeId,
      pageId:       params.pageId,
      action:       'validation',
      aiPrediction: params.aiPrediction,
    });
    saveLog(log);
  }, []);

  const logRejection = useCallback((params: {
    shapeId:      string;
    pageId:       string;
    aiPrediction: { suggestedType: GlazingSystemType; confidence: number };
    reason:       string;
    correctType?: GlazingSystemType;
  }): void => {
    const log = loadLog();
    log.rejections.push({
      timestamp:    new Date().toISOString(),
      shapeId:      params.shapeId,
      pageId:       params.pageId,
      action:       'rejection',
      aiPrediction: params.aiPrediction,
      userChoice:   params.correctType,
      reason:       params.reason,
    });
    saveLog(log);
  }, []);

  const getStats = useCallback((): LearningStats => {
    const log   = loadLog();
    const total = log.corrections.length + log.validations.length + log.rejections.length;

    const accuracy = total > 0
      ? log.validations.length / total
      : 0;

    const magnitudes = log.corrections
      .filter(e => e.correctionMagnitude !== undefined)
      .map(e => e.correctionMagnitude as number);

    const avgMag = magnitudes.length > 0
      ? magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length
      : 0;

    return {
      totalInteractions:      total,
      accuracyRate:           accuracy,
      avgCorrectionMagnitude: avgMag,
      trainingReady:          total >= 50,
    };
  }, []);

  const exportTrainingData = useCallback((): LearningLog => loadLog(), []);

  const clearLog = useCallback((): void => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { logCorrection, logValidation, logRejection, getStats, exportTrainingData, clearLog };
}
