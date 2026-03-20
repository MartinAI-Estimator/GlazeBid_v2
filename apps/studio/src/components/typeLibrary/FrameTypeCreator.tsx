/**
 * FrameTypeCreator.tsx
 *
 * Modal for defining a new Frame Type (or editing an existing one).
 * The estimator enters mark, name, dimensions, bays, rows, system and glass type.
 * On Save, a FabricationBOM is computed from the Studio parametric engine and
 * stored on the FrameType record.
 *
 * Deliberately does NOT require Builder to be open — the BOM engine lives in
 * Studio's own engine/parametric/ modules.
 */

import { useState, useEffect } from 'react';
import { useProjectStore, type FrameType, defaultTypeColor } from '../../store/useProjectStore';
import { computeFabricationBOM } from '../../engine/parametric/systemEngine';
import { buildEvenGrid } from '../../engine/parametric/gridMath';
import { ARCHETYPE_CATALOG } from '../../engine/parametric/archetypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert decimal inches to display string e.g. 120 → "10'-0"" */
function fmtInches(val: number): string {
  const ft  = Math.floor(val / 12);
  const rem = val - ft * 12;
  if (rem === 0) return `${ft}'-0"`;
  const whole = Math.floor(rem);
  return ft > 0 ? `${ft}'-${whole}"` : `${whole}"`;
}

/** Parse a string like "10'-6"", "126", or "10.5'" to decimal inches. */
function parseToInches(raw: string, fallback: number): number {
  const s = raw.trim().replace(/["""]/g, '"').replace(/\u2019/g, "'");
  // Check feet-inches format: 10'-6" or 10'6"
  const feetInchMatch = s.match(/^(\d+(?:\.\d+)?)'[-\s]?(\d+(?:\.\d+)?)"?$/);
  if (feetInchMatch) {
    return parseFloat(feetInchMatch[1]) * 12 + parseFloat(feetInchMatch[2]);
  }
  // Feet only: 10'
  const feetMatch = s.match(/^(\d+(?:\.\d+)?)'$/);
  if (feetMatch) return parseFloat(feetMatch[1]) * 12;
  // Inches only
  const inches = parseFloat(s);
  return isNaN(inches) ? fallback : inches;
}

// ── System options derived from archetype catalog ─────────────────────────────

const SYSTEM_OPTIONS = Object.values(ARCHETYPE_CATALOG).map(a => ({
  id:    a.id,
  label: a.label,
}));

const GLASS_OPTIONS = [
  '1" Clear',
  '1" Low-E 366',
  '1" Low-E 270',
  '1" Low-E Solarban 70',
  '1/4" Tempered Clear',
  '1/4" Tempered Bronze',
  '1/4" Laminated Clear',
  'Spandrel (Tinted)',
  'Custom',
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Existing frame type to edit, or null to create new. */
  existing?: FrameType | null;
  onClose: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function FrameTypeCreator({ existing, onClose }: Props) {
  const frameTypes      = useProjectStore(s => s.frameTypes);
  const addFrameType    = useProjectStore(s => s.addFrameType);
  const updateFrameType = useProjectStore(s => s.updateFrameType);

  // Form state
  const [mark,        setMark]        = useState(existing?.mark        ?? '');
  const [name,        setName]        = useState(existing?.name        ?? '');
  const [widthRaw,    setWidthRaw]    = useState(existing ? String(existing.widthInches)  : '120');
  const [heightRaw,   setHeightRaw]   = useState(existing ? String(existing.heightInches) : '120');
  const [bays,        setBays]        = useState(existing?.bays        ?? 4);
  const [rows,        setRows]        = useState(existing?.rows        ?? 1);
  const [systemId,    setSystemId]    = useState(existing ? (SYSTEM_OPTIONS.find(o => o.label === existing.systemLabel)?.id ?? 'sf-450') : 'sf-450');
  const [glassType,   setGlassType]   = useState(existing?.glassType   ?? '1" Low-E 366');
  const [color,       setColor]       = useState(existing?.color ?? defaultTypeColor(frameTypes.length));

  // Computed BOM preview (updates on any input change)
  const [bomPreview, setBomPreview] = useState<{ aluminum: string; glass: string; shopMH: string; fieldMH: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const widthIn  = parseToInches(widthRaw,  120);
  const heightIn = parseToInches(heightRaw, 120);

  useEffect(() => {
    try {
      const archetype = ARCHETYPE_CATALOG[systemId];
      if (!archetype) { setBomPreview(null); return; }
      const profile = {
        label:     archetype.label,
        faceWidth: archetype.profileWidth,
        glassBite: archetype.glassBite,
      };
      const grid = buildEvenGrid(rows, bays);
      const bom = computeFabricationBOM(widthIn, heightIn, profile, grid);
      setBomPreview({
        aluminum: bom.hardware.totalPieceLF.toFixed(1) + ' LF',
        glass:    bom.totalGlassSF.toFixed(1) + ' SF',
        shopMH:   bom.hardware.shopLaborMhs.toFixed(2) + ' mh',
        fieldMH:  bom.hardware.fieldLaborMhs.toFixed(2) + ' mh',
      });
      setError(null);
    } catch (e) {
      setBomPreview(null);
      setError(e instanceof Error ? e.message : 'BOM error');
    }
  }, [widthIn, heightIn, bays, rows, systemId]);

  const handleSave = () => {
    if (!mark.trim()) { setError('Mark / tag is required (e.g. "SF-1A").'); return; }
    if (widthIn  <= 0 || heightIn <= 0) { setError('Width and height must be positive.'); return; }

    const archetype = ARCHETYPE_CATALOG[systemId];
    const profile   = archetype
      ? { label: archetype.label, faceWidth: archetype.profileWidth, glassBite: archetype.glassBite }
      : { label: 'Storefront', faceWidth: 2, glassBite: 0.375 };
    const grid = buildEvenGrid(rows, bays);

    let bom = null;
    try { bom = computeFabricationBOM(widthIn, heightIn, profile, grid); } catch { /* non-fatal */ }

    const entry: Omit<FrameType, 'id' | 'createdAt' | 'updatedAt'> = {
      mark:         mark.trim().toUpperCase(),
      name:         name.trim() || mark.trim().toUpperCase(),
      color,
      widthInches:  widthIn,
      heightInches: heightIn,
      bays,
      rows,
      systemLabel:  archetype?.label ?? systemId,
      glassType,
      bom:          bom ?? null,
    };

    if (existing) {
      updateFrameType(existing.id, entry);
    } else {
      addFrameType(entry);
    }
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              {existing ? 'Edit Frame Type' : 'New Frame Type'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Define once — count many times on the PDF
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-lg leading-none transition-colors"
          >✕</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Mark + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Mark / Tag *
              </label>
              <input
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono font-bold placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="e.g. SF-1A"
                value={mark}
                onChange={e => setMark(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Description
              </label>
              <input
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="Main Entry Storefront..."
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Overall Dimensions
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] text-slate-600 mb-1">Width</span>
                <input
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
                  placeholder='e.g. 120  or  10&apos;-0"'
                  value={widthRaw}
                  onChange={e => setWidthRaw(e.target.value)}
                  onBlur={() => setWidthRaw(String(parseToInches(widthRaw, 120)))}
                />
                <span className="text-[10px] text-slate-600 mt-0.5 block">{fmtInches(widthIn)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-600 mb-1">Height</span>
                <input
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
                  placeholder='e.g. 84  or  7&apos;-0"'
                  value={heightRaw}
                  onChange={e => setHeightRaw(e.target.value)}
                  onBlur={() => setHeightRaw(String(parseToInches(heightRaw, 84)))}
                />
                <span className="text-[10px] text-slate-600 mt-0.5 block">{fmtInches(heightIn)}</span>
              </div>
            </div>
          </div>

          {/* Bays + Rows */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Bays (vertical columns)
              </label>
              <input
                type="number" min={1} max={40} step={1}
                value={bays}
                onChange={e => setBays(Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Rows (glass rows)
              </label>
              <input
                type="number" min={1} max={20} step={1}
                value={rows}
                onChange={e => setRows(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {/* System type */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Glazing System
            </label>
            <select
              value={systemId}
              onChange={e => setSystemId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {SYSTEM_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Glass type */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Glass Type
            </label>
            <select
              value={glassType}
              onChange={e => setGlassType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {GLASS_OPTIONS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Dot colour */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Canvas Dot Colour
            </label>
            <div className="flex gap-2 flex-wrap">
              {['#38bdf8','#f472b6','#34d399','#fb923c','#a78bfa','#facc15','#60a5fa','#f87171','#4ade80','#e879f9'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-70 hover:opacity-100'}`}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Live BOM preview */}
          {bomPreview && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">BOM Preview (per unit)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-500">Aluminum</span>
                <span className="text-slate-200 font-mono font-bold">{bomPreview.aluminum}</span>
                <span className="text-slate-500">Glass</span>
                <span className="text-slate-200 font-mono font-bold">{bomPreview.glass}</span>
                <span className="text-slate-500">Shop labor</span>
                <span className="text-emerald-400 font-mono font-bold">{bomPreview.shopMH}</span>
                <span className="text-slate-500">Field labor</span>
                <span className="text-emerald-400 font-mono font-bold">{bomPreview.fieldMH}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >Cancel</button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {existing ? 'Update Type' : 'Save Type'}
          </button>
        </div>

      </div>
    </div>
  );
}
