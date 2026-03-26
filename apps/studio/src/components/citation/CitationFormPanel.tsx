/**
 * CitationFormPanel.tsx
 *
 * Slides in from the right when `pendingCitation` is set (after a shape is drawn).
 * Shadow heuristic pre-populates fields. Tab-navigable, Enter to save.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { v4 as uuid } from 'uuid';

// ── System type options (matching frozen contract) ───────────────────────────

const SYSTEM_OPTIONS = [
  { value: 'ext-sf-1',          label: 'Exterior Storefront' },
  { value: 'ext-sf-2',          label: 'Exterior Storefront 2' },
  { value: 'int-sf',            label: 'Interior Storefront' },
  { value: 'cap-cw',            label: 'Captured Curtainwall' },
  { value: 'ssg-cw',            label: 'SSG Curtainwall' },
  { value: 'fire-rated',        label: 'Fire-Rated' },
  { value: 'sunshade',          label: 'Sunshade' },
  { value: 'bullet-resistant',  label: 'Bullet-Resistant' },
  { value: 'film',              label: 'Film' },
  { value: 'door-only',         label: 'Door Only' },
  { value: 'hardware-only',     label: 'Hardware Only' },
  { value: 'unknown',           label: 'Unknown' },
] as const;

const UNIT_OPTIONS = ['EA', 'LF', 'SF'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function CitationFormPanel() {
  const pending        = useStudioStore(s => s.pendingCitation);
  const setPending     = useStudioStore(s => s.setPendingCitation);

  // Form fields
  const [architectTag, setArchitectTag] = useState('');
  const [systemType,   setSystemType]   = useState('unknown');
  const [systemLabel,  setSystemLabel]  = useState('');
  const [quantity,     setQuantity]     = useState('1');
  const [unit,         setUnit]         = useState<'EA' | 'LF' | 'SF'>('EA');
  const [reference,    setReference]    = useState('');
  const [description,  setDescription]  = useState('');
  const [saving,       setSaving]       = useState(false);

  const firstRef = useRef<HTMLInputElement>(null);

  // Populate from shadow suggestion whenever pending changes
  useEffect(() => {
    if (!pending) return;
    const s = pending.shadow;
    setArchitectTag(s?.architectTag ?? '');
    setSystemType(s?.systemType ?? 'unknown');
    setSystemLabel(s?.systemLabel ?? '');
    setQuantity('1');
    setUnit('EA');
    setReference(`Sheet ${pending.sheetNumber}`);
    setDescription('');
    // Focus first field after panel renders
    requestAnimationFrame(() => firstRef.current?.focus());
  }, [pending]);

  const handleSave = useCallback(async () => {
    if (!pending || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const citation = {
      id:        uuid(),
      projectId: 'current',            // replaced by Builder on ingest
      createdAt: now,
      updatedAt: now,
      createdBy: 'manual' as const,

      geometry: {
        sheetNumber: pending.sheetNumber,
        boundingBox: { x: 0, y: 0, width: pending.widthInches, height: pending.heightInches },
        realWorldDimensions: {
          widthInches:         pending.widthInches,
          heightInches:        pending.heightInches,
          sillElevationInches: 0,
          headElevationInches: pending.heightInches,
        },
      },

      scope: {
        architectTag: architectTag || 'Unknown',
        systemType,
        systemLabel:  systemLabel || SYSTEM_OPTIONS.find(o => o.value === systemType)?.label || systemType,
        quantity:      Math.max(1, parseInt(quantity, 10) || 1),
        unit,
      },

      sources: [{
        type:        'drawing' as const,
        reference:   reference || `Sheet ${pending.sheetNumber}`,
        description: description || `Measured ${pending.widthInches.toFixed(1)}" × ${pending.heightInches.toFixed(1)}" from PDF`,
        confidence:  pending.shadow?.confidence ?? 0.5,
      }],

      logicType: 'domain_intuition' as const,
      flags:       [],
      implications: [],

      shadowSuggestion: pending.shadow
        ? { systemType: pending.shadow.systemType, confidence: pending.shadow.confidence, suggestedBy: pending.shadow.suggestedBy }
        : undefined,
    };

    try {
      const electron = (window as unknown as { electron?: { writeCitation?: (raw: unknown) => Promise<unknown> } }).electron;
      await electron?.writeCitation?.(citation);
    } catch (err) {
      console.error('[CitationForm] write failed:', err);
    }

    setSaving(false);
    setPending(null);
  }, [pending, saving, architectTag, systemType, systemLabel, quantity, unit, reference, description, setPending]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setPending(null);
    }
  }, [handleSave, setPending]);

  if (!pending) return null;

  const shadow = pending.shadow;

  return (
    <aside
      className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Citation</h3>
        <button
          className="text-slate-500 hover:text-slate-300 text-xs"
          onClick={() => setPending(null)}
        >
          ✕
        </button>
      </div>

      {/* Shadow confidence badge */}
      {shadow && (
        <div className="mx-3 mt-2 px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            shadow.confidence >= 0.7 ? 'bg-green-400' :
            shadow.confidence >= 0.5 ? 'bg-yellow-400' : 'bg-orange-400'
          }`} />
          Shadow: {(shadow.confidence * 100).toFixed(0)}% — {shadow.suggestedBy}
        </div>
      )}

      {/* Dimensions (read-only) */}
      <div className="px-3 mt-3 text-[11px] text-slate-500">
        {pending.widthInches.toFixed(1)}" × {pending.heightInches.toFixed(1)}" — Sheet {pending.sheetNumber}
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-2 px-3 mt-3 text-xs">
        {/* Architect Tag */}
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase">Architect Tag</span>
          <input
            ref={firstRef}
            tabIndex={1}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
            value={architectTag}
            onChange={e => setArchitectTag(e.target.value)}
            placeholder="e.g. A1, SF-01"
          />
        </label>

        {/* System Type */}
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase">System Type</span>
          <select
            tabIndex={2}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
            value={systemType}
            onChange={e => setSystemType(e.target.value)}
          >
            {SYSTEM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {/* System Label */}
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase">System Label</span>
          <input
            tabIndex={3}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
            value={systemLabel}
            onChange={e => setSystemLabel(e.target.value)}
            placeholder="e.g. Storefront 250"
          />
        </label>

        {/* Quantity + Unit (inline) */}
        <div className="flex gap-2">
          <label className="flex flex-col gap-0.5 flex-1">
            <span className="text-slate-500 text-[10px] uppercase">Qty</span>
            <input
              tabIndex={4}
              type="number"
              min="1"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5 w-20">
            <span className="text-slate-500 text-[10px] uppercase">Unit</span>
            <select
              tabIndex={5}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
              value={unit}
              onChange={e => setUnit(e.target.value as typeof unit)}
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>

        {/* Reference */}
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase">Reference</span>
          <input
            tabIndex={6}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Sheet A7.2, Detail 8"
          />
        </label>

        {/* Description */}
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase">Description</span>
          <input
            tabIndex={7}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Head condition, aluminum frame…"
          />
        </label>
      </div>

      {/* Save button */}
      <div className="px-3 mt-4 mb-3">
        <button
          tabIndex={8}
          className="w-full py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-40"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save Citation  ↵'}
        </button>
        <p className="text-[10px] text-slate-600 mt-1 text-center">Enter to save · Esc to dismiss</p>
      </div>
    </aside>
  );
}
