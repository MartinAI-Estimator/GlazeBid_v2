import { useEffect, useState } from 'react';
import StudioLayout from './components/layout/StudioLayout';

/** Shared localStorage key — must match apps/builder/src/utils/launchStudio.ts */
const LS_INBOX_KEY = 'glazebid:inbox';

export default function App() {
  const [linkedProject, setLinkedProject] = useState<string | null>(null);

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const rawParam  = params.get('projectId');

    if (rawParam) {
      const projectId = decodeURIComponent(rawParam);
      setLinkedProject(projectId);

      // Clear any stale inbox data left from a previous Studio session so
      // Builder does not receive ghost takeoffs when the new session starts.
      try { localStorage.removeItem(LS_INBOX_KEY); } catch { /* ignore */ }

      console.info('[Studio] Linked to Builder — projectId:', projectId);
    }
  }, []);

  return (
    <>
      <StudioLayout />

      {/* "Connected to Builder" badge — fixed overlay, pointer-events disabled */}
      {linkedProject && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/80 border border-emerald-700/60 text-[10px] font-semibold text-emerald-300 backdrop-blur-sm pointer-events-none select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Builder Linked
        </div>
      )}
    </>
  );
}

