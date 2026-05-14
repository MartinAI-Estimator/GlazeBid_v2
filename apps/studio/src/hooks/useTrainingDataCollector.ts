/**
 * useTrainingDataCollector.ts — Collects accept/reject triplets for offline training.
 *
 * Every user ✓ / ✗ decision on a Ghost produces a labeled example:
 *   { anchor: 128D, candidate: 128D, label: 1 | 0, timestamp, pageId, projectId }
 *
 * Examples are accumulated in localStorage under 'glazebid:training-data'
 * so they survive session restarts and can be exported for batch training.
 *
 * Training format (output):
 *   JSONL file — one JSON object per line:
 *   { "anchor": [128 floats], "candidate": [128 floats], "label": 1, "ts": "..." }
 *
 * This format is compatible with PyTorch Dataset and TensorFlow tf.data.
 */

import { useCallback, useRef } from 'react';
import type { FeatureVector } from '../engine/parametric/featureExtract';

const STORAGE_KEY = 'glazebid:training-data';
const MAX_EXAMPLES = 10000; // cap to prevent localStorage overflow

export type TrainingExample = {
  anchor: number[];       // 128D as plain array (JSON-serializable)
  candidate: number[];    // 128D
  label: 1 | 0;          // 1 = accept (positive), 0 = reject (negative)
  timestamp: string;      // ISO 8601
  projectId?: string;
  pageId?: string;
};

export type TrainingDataCollectorAPI = {
  /** Record a positive example (user accepted ghost) */
  recordAccept: (anchor: FeatureVector, candidate: FeatureVector, meta?: { projectId?: string; pageId?: string }) => void;
  /** Record a negative example (user rejected ghost) */
  recordReject: (anchor: FeatureVector, candidate: FeatureVector, meta?: { projectId?: string; pageId?: string }) => void;
  /** Get total count of stored examples */
  getExampleCount: () => number;
  /** Export all examples as a JSONL Blob for download */
  exportJSONL: () => Blob;
  /** Export all examples as a CSV Blob */
  exportCSV: () => Blob;
  /** Clear all stored training data */
  clearAll: () => void;
  /** Get breakdown: total, positives, negatives */
  getSummary: () => { total: number; positives: number; negatives: number };
};

function loadExamples(): TrainingExample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExamples(examples: TrainingExample[]): void {
  try {
    const capped = examples.slice(-MAX_EXAMPLES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // localStorage full — silently skip
  }
}

export function useTrainingDataCollector(): TrainingDataCollectorAPI {
  const countRef = useRef<number>(loadExamples().length);

  const record = useCallback((
    anchor: FeatureVector,
    candidate: FeatureVector,
    label: 1 | 0,
    meta?: { projectId?: string; pageId?: string },
  ) => {
    const examples = loadExamples();
    examples.push({
      anchor: Array.from(anchor),
      candidate: Array.from(candidate),
      label,
      timestamp: new Date().toISOString(),
      ...meta,
    });
    saveExamples(examples);
    countRef.current = examples.length;
  }, []);

  const recordAccept = useCallback((anchor: FeatureVector, candidate: FeatureVector, meta?: { projectId?: string; pageId?: string }) => {
    record(anchor, candidate, 1, meta);
  }, [record]);

  const recordReject = useCallback((anchor: FeatureVector, candidate: FeatureVector, meta?: { projectId?: string; pageId?: string }) => {
    record(anchor, candidate, 0, meta);
  }, [record]);

  const getExampleCount = useCallback(() => loadExamples().length, []);

  const exportJSONL = useCallback((): Blob => {
    const examples = loadExamples();
    const lines = examples.map(e => JSON.stringify(e)).join('\n');
    return new Blob([lines], { type: 'application/jsonlines' });
  }, []);

  const exportCSV = useCallback((): Blob => {
    const examples = loadExamples();
    const header = 'label,timestamp,projectId,pageId,' +
      Array.from({ length: 128 }, (_, i) => `a${i}`).join(',') + ',' +
      Array.from({ length: 128 }, (_, i) => `c${i}`).join(',');
    const rows = examples.map(e =>
      [e.label, e.timestamp, e.projectId ?? '', e.pageId ?? '',
        ...e.anchor, ...e.candidate].join(',')
    );
    return new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    countRef.current = 0;
  }, []);

  const getSummary = useCallback(() => {
    const examples = loadExamples();
    const positives = examples.filter(e => e.label === 1).length;
    return { total: examples.length, positives, negatives: examples.length - positives };
  }, []);

  return { recordAccept, recordReject, getExampleCount, exportJSONL, exportCSV, clearAll, getSummary };
}
