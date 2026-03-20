/**
 * useInboxSync.js
 *
 * Keeps Builder's inbox store in sync with Studio's live RawTakeoff[] data.
 *
 * Two sync paths:
 *   1. Electron IPC  — window.electronAPI.onInboxUpdate fires whenever Studio
 *      calls window.electron.syncInbox().  Works across different dev origins.
 *   2. Storage event — falls back to same-origin localStorage 'storage' events
 *      (works in production Electron builds where both windows share file://).
 *
 * Mount once at the App root.
 */

import { useEffect } from 'react';
import { useInboxStore } from '../store/useInboxStore';

export function useInboxSync() {
  const hydrateInbox = useInboxStore((s) => s.hydrateInbox);

  useEffect(() => {
    const cleanups = [];

    // ── Path 1: Electron IPC (preferred, works cross-origin in dev) ──────────
    if (window.electronAPI?.onInboxUpdate) {
      const cleanup = window.electronAPI.onInboxUpdate((inbox) => {
        hydrateInbox(inbox);
      });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }

    // ── Path 2: localStorage storage event (production / browser fallback) ────
    const handleStorage = (e) => {
      if (e.key !== 'glazebid:inbox') return;
      if (e.newValue === null) {
        hydrateInbox([]);
        return;
      }
      try {
        const incoming = JSON.parse(e.newValue);
        if (Array.isArray(incoming)) hydrateInbox(incoming);
      } catch {
        // Malformed payload — ignore.
      }
    };
    window.addEventListener('storage', handleStorage);
    cleanups.push(() => window.removeEventListener('storage', handleStorage));

    return () => cleanups.forEach((fn) => fn());
  }, [hydrateInbox]);
}
