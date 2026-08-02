/**
 * Centralized API client for GlazeBid Builder.
 * 
 * All backend calls should use `apiFetch()` instead of raw `fetch()`.
 * When the backend is unreachable, calls fail gracefully with { ok: false, offline: true }.
 */

// RULE 3 (dead backends): the legacy FastAPI backend on :8000 does not exist in
// the Electron app. The ONLY service is the AiQ sidecar on :8100, reached via
// IPC (glazierai:* channels), never from the renderer directly.
//
// apiFetch is kept as a compatibility shim for legacy call sites: it returns
// the standardized offline response IMMEDIATELY, with no network attempt, so
// legacy viewers degrade gracefully with zero hangs and zero dead requests.
// Set VITE_API_URL explicitly (dev experiments only) to re-enable real fetches.
export const API_BASE = import.meta.env.VITE_API_URL || null;

function offlineResponse() {
  return new Response(JSON.stringify({ ok: false, offline: true }), {
    status: 0,
    statusText: 'Offline',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Compatibility wrapper for legacy backend calls.
 * With no VITE_API_URL configured (the shipped configuration) this never
 * touches the network — it resolves to { ok:false, offline:true } instantly.
 */
export async function apiFetch(path, options) {
  if (!API_BASE) return offlineResponse();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    return await fetch(url, options);
  } catch {
    return offlineResponse();
  }
}

/**
 * JSON POST helper.
 * @param {string} path - API path
 * @param {object} body - JSON body
 * @returns {Promise<Response>}
 */
export async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * FormData POST helper (for file uploads / multipart).
 * @param {string} path - API path
 * @param {FormData} formData
 * @returns {Promise<Response>}
 */
export async function apiPostForm(path, formData) {
  return apiFetch(path, {
    method: 'POST',
    body: formData,
  });
}
