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
import { useStudioStore } from '../store/useStudioStore';
import { useProjectStore } from '../store/useProjectStore';
import { DEFAULT_PDF_PPI } from '../engine/coordinateSystem';
import type { RectShape } from '../types/shapes';

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
  const runPrescan = useCallback(async (pdfBase64: string) => {
    abortRef.current = false;
    updateState({ status: 'prescanning', error: null, prescan: null, candidates: [] });

    const prescan = await prescanDrawingSet(pdfBase64);
    console.log('[DI] Prescan result:', {
      status: prescan.status,
      total_pages: prescan.total_pages,
      scan_pages: prescan.scan_pages,
      skip_pages: prescan.skip_pages,
      reference_pages: prescan.reference_pages,
      error: prescan.error,
    });
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
    pdfBase64: string,
    pageNum: number,
    sheetType: string = 'elevation'
  ) => {
    if (abortRef.current) return;
    updateState({ status: 'scanning', currentPage: pageNum });

    // Look up Studio calibration for this page (if user has calibrated)
    const { pages, calibrations } = useStudioStore.getState();
    const studioPage = pages.find(p => p.pdfPageIndex === pageNum);
    const cal = studioPage ? calibrations[studioPage.id] : undefined;
    const scaleFactor = cal && cal.pixelsPerInch !== DEFAULT_PDF_PPI ? cal.pixelsPerInch : 0;
    const scaleConfidence = scaleFactor > 0 ? 0.95 : 0;

    const result = await detectGlazing(pdfBase64, pageNum, sheetType, scaleFactor, scaleConfidence);
    console.log('[DI] Page', pageNum, 'sheetType:', sheetType, 'candidates:', result.candidates?.length ?? 0, 'status:', result.status, result.error || '');

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

    // Convert ArrayBuffer to base64 using Blob+FileReader (handles large PDFs
    // without blowing the call stack or freezing the renderer).
    let pdfBase64: string;
    try {
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // dataUrl is "data:application/pdf;base64,XXXX" — strip the prefix
      pdfBase64 = dataUrl.split(',', 2)[1];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateState({ status: 'error', error: `Base64 conversion failed: ${msg}` });
      return;
    }

    try {
      const health = await checkHealth();
      if (health.status === 'unavailable') return;

      const prescan = await runPrescan(pdfBase64);
      if (!prescan) return;

      const pagesToScan = prescan.scan_pages;
      updateState({ scanProgress: { completed: 0, total: pagesToScan.length } });

      for (let i = 0; i < pagesToScan.length; i++) {
        if (abortRef.current) break;
        const pageNum = pagesToScan[i];
        const pageResult = prescan.results.find(r => r.page_num === pageNum);
        const sheetType = pageResult?.sheet_type || 'elevation';

        await scanPage(pdfBase64, pageNum, sheetType);
        onProgress?.(i + 1, pagesToScan.length);
      }

      updateState({ status: 'complete' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[DI] Pipeline error:', e);
      updateState({ status: 'error', error: msg });
    }
  }, [checkHealth, runPrescan, scanPage, updateState]);

  /** User confirms a candidate — creates a RectShape + RawTakeoff and marks confirmed */
  const confirmCandidate = useCallback((candidateId: string) => {
    const candidate = state.candidates.find(c => c.candidate_id === candidateId);
    if (!candidate) return;

    // Find the PageState for this candidate's page (pageNum is 0-based from sidecar)
    const pages = useStudioStore.getState().pages;
    const page = pages.find(p => p.pdfPageIndex === candidate.pageNum);
    if (!page) return;

    // Get calibration for this page
    const calibration = useStudioStore.getState().calibrations[page.id];
    const ppi = calibration?.pixelsPerInch ?? DEFAULT_PDF_PPI;

    const bb = candidate.bounding_box;
    const shapeId = crypto.randomUUID();

    // Create RectShape from candidate bounding box
    const shape: RectShape = {
      id:           shapeId,
      pageId:       page.id,
      type:         'rect',
      origin:       { x: bb.x, y: bb.y },
      widthPx:      bb.width,
      heightPx:     bb.height,
      widthInches:  candidate.width_inches,
      heightInches: candidate.height_inches,
      label:        candidate.system_hint || 'DI Detected',
      color:        '#00C853',
    };

    useStudioStore.getState().addShape(shape);

    // Create RawTakeoff entry (addTakeoff generates id internally)
    useProjectStore.getState().addTakeoff({
      shapeId:      shapeId,
      pageId:       page.id,
      x:            bb.x,
      y:            bb.y,
      widthPx:      bb.width,
      heightPx:     bb.height,
      widthInches:  candidate.width_inches,
      heightInches: candidate.height_inches,
      type:         'Area',
      label:        candidate.system_hint || 'DI Detected',
    });

    // Update local state to mark as confirmed
    setState(prev => ({
      ...prev,
      candidates: prev.candidates.map(c =>
        c.candidate_id === candidateId ? { ...c, userStatus: 'confirmed' as const } : c
      ),
    }));
  }, [state.candidates]);

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
