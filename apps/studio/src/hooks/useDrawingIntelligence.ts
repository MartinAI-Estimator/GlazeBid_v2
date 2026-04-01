/**
 * useDrawingIntelligence.ts
 *
 * Orchestration hook for the Drawing Intelligence pipeline.
 * Manages sidecar health, prescan, and per-page candidate detection.
 * Results are stored in local state and displayed via DrawingIntelligenceOverlay.
 */

import { useState, useCallback, useRef } from 'react';
import {
  checkSidecarHealth,
  prescanDrawingSet,
  detectGlazing,
  type SidecarHealth,
  type PrescanResult,
  type GlazingCandidateResult,
} from './useSidecarClient';

export type IntelligenceStatus =
  | 'idle'
  | 'checking'
  | 'prescanning'
  | 'scanning'
  | 'complete'
  | 'error'
  | 'unavailable';

export interface CandidateWithReview extends GlazingCandidateResult {
  userStatus: 'pending' | 'confirmed' | 'rejected';
  pageNum: number;
}

export interface DrawingIntelligenceState {
  status: IntelligenceStatus;
  health: SidecarHealth | null;
  prescan: PrescanResult | null;
  candidates: CandidateWithReview[];
  currentPage: number;
  scanProgress: { completed: number; total: number };
  error: string | null;
}

const initialState: DrawingIntelligenceState = {
  status: 'idle',
  health: null,
  prescan: null,
  candidates: [],
  currentPage: 0,
  scanProgress: { completed: 0, total: 0 },
  error: null,
};

export function useDrawingIntelligence() {
  const [state, setState] = useState<DrawingIntelligenceState>(initialState);
  const abortRef = useRef<boolean>(false);

  const updateState = useCallback((patch: Partial<DrawingIntelligenceState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  /** Check if the sidecar service is running */
  const checkHealth = useCallback(async () => {
    updateState({ status: 'checking' });
    const health = await checkSidecarHealth();
    if (health.status === 'unavailable') {
      updateState({ status: 'unavailable', health, error: 'Sidecar not running. Start GlazeBid AiQ service.' });
    } else {
      updateState({ status: 'idle', health });
    }
    return health;
  }, [updateState]);

  /** Run prescan on a PDF drawing set */
  const runPrescan = useCallback(async (pdfBuffer: ArrayBuffer) => {
    abortRef.current = false;
    updateState({ status: 'prescanning', error: null, prescan: null, candidates: [] });

    const prescan = await prescanDrawingSet(pdfBuffer);
    if (prescan.status !== 'ok') {
      updateState({ status: 'error', error: prescan.error || 'Prescan failed' });
      return;
    }

    updateState({
      prescan,
      status: 'idle',
      scanProgress: { completed: 0, total: prescan.scan_pages.length },
    });

    return prescan;
  }, [updateState]);

  /** Run glazing detection on a specific page */
  const scanPage = useCallback(async (
    pdfBuffer: ArrayBuffer,
    pageNum: number,
    sheetType: string = 'elevation'
  ) => {
    if (abortRef.current) return;
    updateState({ status: 'scanning', currentPage: pageNum });

    const result = await detectGlazing(pdfBuffer, pageNum, sheetType);

    if (result.status === 'ok' && result.candidates.length > 0) {
      const withReview: CandidateWithReview[] = result.candidates
        .filter(c => c.status !== 'rejected')
        .map(c => ({ ...c, userStatus: 'pending' as const, pageNum }));

      setState(prev => ({
        ...prev,
        candidates: [...prev.candidates, ...withReview],
        scanProgress: {
          completed: prev.scanProgress.completed + 1,
          total: prev.scanProgress.total,
        },
      }));
    } else {
      setState(prev => ({
        ...prev,
        scanProgress: {
          completed: prev.scanProgress.completed + 1,
          total: prev.scanProgress.total,
        },
      }));
    }
  }, [updateState]);

  /** Run the full pipeline: prescan → scan all elevation pages */
  const runFullPipeline = useCallback(async (
    pdfBuffer: ArrayBuffer,
    onProgress?: (page: number, total: number) => void
  ) => {
    abortRef.current = false;

    const health = await checkHealth();
    if (health.status === 'unavailable') return;

    const prescan = await runPrescan(pdfBuffer);
    if (!prescan) return;

    const pagesToScan = prescan.scan_pages;
    updateState({ scanProgress: { completed: 0, total: pagesToScan.length } });

    for (let i = 0; i < pagesToScan.length; i++) {
      if (abortRef.current) break;
      const pageNum = pagesToScan[i];
      const pageResult = prescan.results.find(r => r.page_num === pageNum);
      const sheetType = pageResult?.sheet_type || 'elevation';

      await scanPage(pdfBuffer, pageNum, sheetType);
      onProgress?.(i + 1, pagesToScan.length);
    }

    updateState({ status: 'complete' });
  }, [checkHealth, runPrescan, scanPage, updateState]);

  /** User confirms a candidate — routes to takeoff */
  const confirmCandidate = useCallback((candidateId: string) => {
    setState(prev => ({
      ...prev,
      candidates: prev.candidates.map(c =>
        c.candidate_id === candidateId ? { ...c, userStatus: 'confirmed' as const } : c
      ),
    }));
  }, []);

  /** User rejects a candidate */
  const rejectCandidate = useCallback((candidateId: string) => {
    setState(prev => ({
      ...prev,
      candidates: prev.candidates.map(c =>
        c.candidate_id === candidateId ? { ...c, userStatus: 'rejected' as const } : c
      ),
    }));
  }, []);

  /** Stop any in-progress scan */
  const abort = useCallback(() => {
    abortRef.current = true;
    updateState({ status: 'idle' });
  }, [updateState]);

  /** Reset to initial state */
  const reset = useCallback(() => {
    abortRef.current = true;
    setState(initialState);
  }, []);

  return {
    state,
    checkHealth,
    runPrescan,
    scanPage,
    runFullPipeline,
    confirmCandidate,
    rejectCandidate,
    abort,
    reset,
  };
}
