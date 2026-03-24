/**
 * Centralized API client for GlazeBid Builder.
 * 
 * All backend calls should use `apiFetch()` instead of raw `fetch()`.
 * When the backend is unreachable, calls fail gracefully with { ok: false, offline: true }.
 */

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/**
 * Wrapper around fetch that:
 * 1) Prepends API_BASE to relative paths
 * 2) Returns a standardized { ok, data, offline } response on network failure
 * 
 * @param {string} path - Relative path (e.g. '/api/admin/settings') or full URL
 * @param {RequestInit} [options] - Standard fetch options
 * @returns {Promise<Response>} Native Response on success, synthetic offline response on network error
 */
export async function apiFetch(path, options) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    return await fetch(url, options);
  } catch {
    // Network error — backend unreachable
    return new Response(JSON.stringify({ ok: false, offline: true }), {
      status: 0,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' },
    });
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
