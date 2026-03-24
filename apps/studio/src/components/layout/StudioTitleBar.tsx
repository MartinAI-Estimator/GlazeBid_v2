/**
 * StudioTitleBar.tsx
 *
 * Custom dark title bar matching Builder's design.
 * Fixed 40px bar at top with app icon, File/Edit/View menus, and window controls.
 * Uses -webkit-app-region: drag for native window dragging.
 */

import { useState, useEffect, useRef } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { useProjectStore } from '../../store/useProjectStore';

// ── Studio project file format ────────────────────────────────────────────────
type StudioSaveFile = {
  schemaVersion: number;
  systems:      ReturnType<typeof useProjectStore.getState>['systems'];
  inbox:        ReturnType<typeof useProjectStore.getState>['inbox'];
  countGroups:  ReturnType<typeof useProjectStore.getState>['countGroups'];
  counts:       ReturnType<typeof useProjectStore.getState>['counts'];
  shapes:       ReturnType<typeof useStudioStore.getState>['shapes'];
  calibrations: ReturnType<typeof useStudioStore.getState>['calibrations'];
  pdfFileName:  string | null;
};

async function saveStudioProject(): Promise<void> {
  if (!window.electron?.saveProject) return;
  const ps = useProjectStore.getState();
  const ss = useStudioStore.getState();
  const payload: StudioSaveFile = {
    schemaVersion: 1,
    systems:      ps.systems,
    inbox:        ps.inbox,
    countGroups:  ps.countGroups,
    counts:       ps.counts,
    shapes:       ss.shapes,
    calibrations: ss.calibrations,
    pdfFileName:  ss.pdfFileName,
  };
  await window.electron.saveProject(JSON.stringify(payload, null, 2));
}

async function openStudioProject(): Promise<void> {
  if (!window.electron?.openProject) return;
  const result = await window.electron.openProject();
  if (!result.success) return;
  const data = JSON.parse(result.data) as StudioSaveFile;
  useProjectStore.setState({
    systems:     data.systems     ?? [],
    inbox:       data.inbox       ?? [],
    countGroups: data.countGroups ?? [],
    counts:      data.counts      ?? [],
  });
  try { localStorage.setItem('glazebid:inbox', JSON.stringify(data.inbox ?? [])); } catch { /* quota */ }
  useStudioStore.setState({
    shapes:       data.shapes       ?? [],
    calibrations: data.calibrations ?? {},
    pdfFileName:  data.pdfFileName  ?? null,
  });
}

// ── Menu item helper ───────────────────────────────────────────────────────────

function MenuItem({ label, shortcut, onClick, disabled = false }: {
  label: string; shortcut?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      className={`w-full text-left px-4 py-1.5 text-xs flex justify-between items-center transition-colors ${
        disabled
          ? 'text-slate-600 cursor-not-allowed'
          : 'text-slate-200 hover:bg-sky-500 hover:text-white cursor-pointer'
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] text-slate-500 ml-6">{shortcut}</span>}
    </button>
  );
}

function Separator() {
  return <div className="h-px bg-slate-800 my-1" />;
}

// ── Title bar ──────────────────────────────────────────────────────────────────

export default function StudioTitleBar() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActiveMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveMenu(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggle = (name: string) => setActiveMenu(prev => prev === name ? null : name);
  const exec = (fn?: () => void) => { fn?.(); setActiveMenu(null); };

  const minimize = () => window.electron?.windowMinimize?.();
  const maximize = () => window.electron?.windowMaximize?.();
  const close    = () => window.electron?.windowClose?.();

  return (
    <div
      className="h-10 bg-[#09090b] border-b border-[#27272a] flex items-center justify-between px-2 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: icon + menus */}
      <div
        ref={menuRef}
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <img src="/ICON_LOGO.svg" alt="" className="w-5 h-5 mr-2" draggable={false} />

        {/* File */}
        <MenuButton label="File" active={activeMenu === 'File'} onClick={() => toggle('File')}
          onHover={() => activeMenu && setActiveMenu('File')} />
        {activeMenu === 'File' && (
          <Dropdown left={28}>
            <MenuItem label="Open Project…" shortcut="Ctrl+O" onClick={() => exec(() => void openStudioProject())} />
            <MenuItem label="Save Project"  shortcut="Ctrl+S" onClick={() => exec(() => void saveStudioProject())} />
            <Separator />
            <MenuItem label="Open PDF…"     onClick={() => exec(() => window.electron?.openPdf?.())} />
            <Separator />
            <MenuItem label="Exit"          shortcut="Alt+F4" onClick={() => exec(close)} />
          </Dropdown>
        )}

        {/* Edit */}
        <MenuButton label="Edit" active={activeMenu === 'Edit'} onClick={() => toggle('Edit')}
          onHover={() => activeMenu && setActiveMenu('Edit')} />
        {activeMenu === 'Edit' && (
          <Dropdown left={68}>
            <MenuItem label="Undo"       shortcut="Ctrl+Z" onClick={() => exec(() => document.execCommand('undo'))} />
            <MenuItem label="Redo"       shortcut="Ctrl+Y" onClick={() => exec(() => document.execCommand('redo'))} />
            <Separator />
            <MenuItem label="Cut"        shortcut="Ctrl+X" onClick={() => exec(() => document.execCommand('cut'))} />
            <MenuItem label="Copy"       shortcut="Ctrl+C" onClick={() => exec(() => document.execCommand('copy'))} />
            <MenuItem label="Paste"      shortcut="Ctrl+V" onClick={() => exec(() => document.execCommand('paste'))} />
            <MenuItem label="Select All" shortcut="Ctrl+A" onClick={() => exec(() => document.execCommand('selectAll'))} />
          </Dropdown>
        )}

        {/* View */}
        <MenuButton label="View" active={activeMenu === 'View'} onClick={() => toggle('View')}
          onHover={() => activeMenu && setActiveMenu('View')} />
        {activeMenu === 'View' && (
          <Dropdown left={110}>
            <MenuItem label="Zoom In"     shortcut="Ctrl+=" />
            <MenuItem label="Zoom Out"    shortcut="Ctrl+-" />
            <MenuItem label="Fit to Page" shortcut="Ctrl+0" />
            <Separator />
            <MenuItem label="Toggle Fullscreen" shortcut="F11" />
          </Dropdown>
        )}
      </div>

      {/* Right: window controls */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button onClick={minimize} className="title-bar-btn w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-white/10 transition-colors" title="Minimize">
          <span className="block w-2.5 h-px bg-current" />
        </button>
        <button onClick={maximize} className="title-bar-btn w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-white/10 transition-colors" title="Maximize">
          <span className="block w-2.5 h-2.5 border border-current" />
        </button>
        <button onClick={close} className="title-bar-btn-close w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors" title="Close">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function MenuButton({ label, active, onClick, onHover }: {
  label: string; active: boolean; onClick: () => void; onHover: () => void;
}) {
  return (
    <button
      className={`px-2.5 py-1.5 text-xs text-white rounded-sm transition-colors ${
        active ? 'bg-sky-500/15' : 'hover:bg-white/10'
      }`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      {label}
    </button>
  );
}

function Dropdown({ left, children }: { left: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute top-full min-w-[200px] bg-[#18181b] border border-[#27272a] rounded shadow-lg shadow-black/50 py-1 z-[10002]"
      style={{ left }}
    >
      {children}
    </div>
  );
}
