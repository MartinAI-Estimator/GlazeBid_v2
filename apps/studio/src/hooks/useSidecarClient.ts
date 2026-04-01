/**
 * useSidecarClient.ts
 *
 * HTTP client for the GlazeBid AiQ sidecar service running on localhost:8100.
 * All functions return structured results — never throw to the caller.
 * The sidecar is optional: if unavailable, all functions return error states
 * and the Studio UI gracefully disables Drawing Intelligence features.
 */

const SIDECAR_URL = 'http://localhost:8100';

export interface SidecarHealth {
  status: 'ok' | 'error' | 'unavailable';
  version?: string;
  layers?: string[];
  error?: string;
}

export interface PrescanPageResult {
  page_num: number;
  relevance_score: number;
  should_scan: boolean;
  sheet_type: string;
  sheet_number: string;
  path_count: number;
  keywords_found: string[];
  processing_role: string;
  skip_reason: string;
}

export interface PrescanResult {
  status: 'ok' | 'error';
  total_pages: number;
  scan_pages: number[];
  reference_pages: number[];
  skip_pages: number[];
  results: PrescanPageResult[];
  errors: string[];
  error?: string;
}

export interface GlazingCandidateResult {
  candidate_id: string;
  bounding_box: { x: number; y: number; width: number; height: number };
  width_pts: number;
  height_pts: number;
  width_inches: number;
  height_inches: number;
  scale_factor: number;
  scale_confidence: number;
  bay_count: number;
  confidence: number;
  rules_passed: string[];
  rules_failed: string[];
  system_hint: string;
  source_sheet: string;
  status: 'auto_accepted' | 'needs_review' | 'rejected';
}

export interface DetectResult {
  status: 'ok' | 'error';
  candidates: GlazingCandidateResult[];
  page_num: number;
  error?: string;
}

async function pdfToBase64(pdfBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(pdfBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function checkSidecarHealth(): Promise<SidecarHealth> {
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { status: 'unavailable', error: 'Sidecar not running' };
  }
}

export async function prescanDrawingSet(
  pdfBuffer: ArrayBuffer
): Promise<PrescanResult> {
  try {
    const pdf_base64 = await pdfToBase64(pdfBuffer);
    const res = await fetch(`${SIDECAR_URL}/prescan-drawing-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_base64 }),
      signal: AbortSignal.timeout(120000), // 2 min for large sets
    });
    return await res.json();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: 'error', total_pages: 0,
      scan_pages: [], reference_pages: [], skip_pages: [],
      results: [], errors: [], error: message,
    };
  }
}

export async function detectGlazing(
  pdfBuffer: ArrayBuffer,
  pageNum: number,
  sheetType: string = 'elevation'
): Promise<DetectResult> {
  try {
    const pdf_base64 = await pdfToBase64(pdfBuffer);
    const res = await fetch(`${SIDECAR_URL}/detect-glazing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_base64,
        page_num: pageNum,
        sheet_type: sheetType,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    return {
      status: data.status,
      candidates: data.candidates || [],
      page_num: pageNum,
      error: data.error,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { status: 'error', candidates: [], page_num: pageNum, error: message };
  }
}
