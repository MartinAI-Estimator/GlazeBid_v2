/**
 * QuickEntryModal.tsx
 *
 * The "Frictionless Capture" modal — appears near cursor after a shape is drawn.
 * Keyboard-first, shadow-pre-populated, vanishes on Enter.
 *
 * 70% case: shadow correct → Tab-confirm → Enter-save → gone in <2 seconds.
 * 30% case: one extra keystroke to correct system type → still <5 seconds.
 *
 * Renders as a fixed-position overlay, positioned near the drawn shape
 * via screenPosition prop computed by CitationCaptureLayer.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCitationStore, recordImplicationUsage } from '../../store/useCitationStore';
import { useImplicationTrigger, type TriggerResult } from '../../hooks/useImplicationTrigger';
import { buildShadowSuggestion } from '../../engine/parametric/shadowHeuristic';
import { v4 as uuid } from 'uuid';

interface QuickEntryModalProps {
  screenPosition: { x: number; y: number };
}

// ── System types (frozen contract) ───────────────────────────────────────────

const SYSTEM_TYPES = [
  { value: 'ext-sf-1',          label: 'Ext Storefront — Std' },
  { value: 'ext-sf-2',          label: 'Ext Storefront — Heavy' },
  { value: 'int-sf',            label: 'Int Storefront' },
  { value: 'cap-cw',            label: 'Curtain Wall — Cap' },
  { value: 'ssg-cw',            label: 'Curtain Wall — SSG' },
  { value: 'fire-rated',        label: 'Fire Rated' },
  { value: 'sunshade',          label: 'Sunshade' },
  { value: 'bullet-resistant',  label: 'Bullet Resistant' },
  { value: 'film',              label: 'Window Film' },
  { value: 'door-only',         label: 'Door Only' },
  { value: 'hardware-only',     label: 'Hardware Only' },
  { value: 'unknown',           label: 'Unknown' },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function QuickEntryModal({ screenPosition }: QuickEntryModalProps) {
  const pending    = useCitationStore(s => s.pendingShape);
  const addCitation = useCitationStore(s => s.addCitation);
  const dismiss    = useCitationStore(s => s.dismissPending);

  // Compute shadow locally from shape dimensions
  const shadow = useMemo(() => {
    if (!pending) return undefined;
    return buildShadowSuggestion({ widthInches: pending.widthInches, heightInches: pending.heightInches });
  }, [pending?.widthInches, pending?.heightInches]);

  const [architectTag, setArchitectTag]   = useState('');
  const [systemType,   setSystemType]     = useState('ext-sf-1');
  const [selectedImpls, setSelectedImpls] = useState<string[]>([]);
  const [activeImplIdx, setActiveImplIdx] = useState(-1);
  const [phase, setPhase]                 = useState<'tag' | 'system' | 'implications' | 'done'>('tag');
  const [saving, setSaving]               = useState(false);

  const tagRef    = useRef<HTMLInputElement>(null);
  const systemRef = useRef<HTMLSelectElement>(null);

  // Real-time implication triggers
  const { triggered } = useImplicationTrigger({
    systemType,
    architectTag,
    widthInches:  pending?.widthInches,
    heightInches: pending?.heightInches,
  });

  // Populate from shadow + focus on open
  useEffect(() => {
    if (!pending) return;
    setArchitectTag(shadow?.architectTag ?? '');
    setSystemType(shadow?.systemType ?? 'ext-sf-1');
    setSelectedImpls([]);
    setActiveImplIdx(-1);
    setPhase('tag');
    requestAnimationFrame(() => tagRef.current?.focus());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const toggleImpl = useCallback((id: string) => {
    setSelectedImpls(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!pending || saving) return;
    if (!architectTag.trim()) {
      tagRef.current?.focus();
      setPhase('tag');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const systemLabel = SYSTEM_TYPES.find(s => s.value === systemType)?.label ?? systemType;

    const selectedImpl = triggered
      .filter(t => selectedImpls.includes(t.implication.id ?? ''))
      .map(t => ({
        id:          t.implication.id,
        category:    t.implication.category,
        description: t.implication.description,
        action:      t.implication.action,
        costImpact:  t.implication.costImpact,
      }));

    const citation = {
      id:        uuid(),
      projectId: 'current',
      createdAt: now,
      updatedAt: now,
      createdBy: 'manual' as const,

      geometry: {
        sheetNumber: pending.sheetNumber,
        boundingBox: pending.boundingBox,
        realWorldDimensions: {
          widthInches:         pending.widthInches,
          heightInches:        pending.heightInches,
          sillElevationInches: 0,
          headElevationInches: pending.heightInches,
        },
      },

      scope: {
        architectTag: architectTag.trim().toUpperCase(),
        systemType,
        systemLabel,
        quantity: 1,
        unit: systemType === 'film' ? 'SF' as const : 'EA' as const,
      },

      sources: [{
        type:        'drawing' as const,
        reference:   `Sheet ${pending.sheetNumber}`,
        description: `Measured ${pending.widthInches.toFixed(1)}" × ${pending.heightInches.toFixed(1)}" from PDF`,
        confidence:  shadow?.confidence ?? 0.5,
      }],

      logicType: 'visual_match' as const,
      flags:       [],
      implications: selectedImpl,

      shadowSuggestion: shadow
        ? { systemType: shadow.systemType, confidence: shadow.confidence, suggestedBy: shadow.suggestedBy }
        : undefined,
    };

    try {
      await addCitation(citation);

      // Record usage for selected implications
      for (const id of selectedImpls) {
        await recordImplicationUsage(id);
      }
    } catch (err) {
      console.error('[QuickEntry] write failed:', err);
    }

    setSaving(false);
  }, [pending, saving, architectTag, systemType, selectedImpls, triggered, shadow, addCitation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { dismiss(); return; }

    if (phase === 'tag' && e.key === 'Tab') {
      e.preventDefault();
      setPhase('system');
      setTimeout(() => systemRef.current?.focus(), 20);
      return;
    }

    if (phase === 'system' && e.key === 'Tab') {
      e.preventDefault();
      if (triggered.length > 0) {
        setPhase('implications');
        setActiveImplIdx(0);
      } else {
        handleSave();
      }
      return;
    }

    if (phase === 'implications') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveImplIdx(i => Math.min(i + 1, triggered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveImplIdx(i => Math.max(i - 1, 0));
      } else if (e.key === ' ') {
        e.preventDefault();
        const id = triggered[activeImplIdx]?.implication.id;
        if (id) toggleImpl(id);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSave();
      }
      return;
    }

    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
  }, [phase, triggered, activeImplIdx, handleSave, toggleImpl, dismiss]);

  if (!pending) return null;

  const strength = shadow?.confidence ?? 0;
  const shadowColor = strength > 0.7 ? '#22c55e' : strength > 0.5 ? '#f59e0b' : '#6b7280';

  // Position near the shape, clamped to viewport
  const left = Math.min(screenPosition.x + 12, window.innerWidth - 340);
  const top  = Math.min(screenPosition.y - 20, window.innerHeight - 440);

  return (
    <div
      style={{
        position:     'fixed',
        left, top,
        width:        320,
        zIndex:       9999,
        background:   '#0f172a',
        border:       '1px solid #1e3a5f',
        borderRadius: 10,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily:   'Inter, monospace, sans-serif',
        fontSize:     13,
        color:        '#e2e8f0',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div style={{
        padding:        '8px 14px',
        borderBottom:   '1px solid #1e3a5f',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        background:     '#0d1a2e',
        borderRadius:   '10px 10px 0 0',
      }}>
        <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 12 }}>
          📐 Log Scope Item
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#475569', fontSize: 11 }}>
            {fmtFeet(pending.widthInches)} × {fmtFeet(pending.heightInches)}
          </span>
          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Shadow confidence indicator */}
        {shadow && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)', fontSize: 10, color: '#64748b',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: shadowColor, flexShrink: 0 }} />
            Shadow: {Math.round(strength * 100)}% — {shadow.suggestedBy}
          </div>
        )}

        {/* Architect Tag */}
        <div>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Architect Tag
          </label>
          <input
            ref={tagRef}
            value={architectTag}
            onChange={e => setArchitectTag(e.target.value.toUpperCase())}
            placeholder="W-1, CW-A, SF-2…"
            style={{
              width:        '100%',
              marginTop:    4,
              padding:      '7px 10px',
              background:   phase === 'tag' ? '#1e293b' : '#0f172a',
              border:       `1px solid ${phase === 'tag' ? '#3b82f6' : '#1e3a5f'}`,
              borderRadius: 6,
              color:        '#f1f5f9',
              fontSize:     14,
              fontWeight:   600,
              fontFamily:   'monospace',
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
        </div>

        {/* System Type */}
        <div>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            System Type
            {shadow && (
              <span style={{ marginLeft: 8, color: shadowColor, fontSize: 10 }}>
                ● AI {Math.round(strength * 100)}%
              </span>
            )}
          </label>
          <select
            ref={systemRef}
            value={systemType}
            onChange={e => setSystemType(e.target.value)}
            style={{
              width:        '100%',
              marginTop:    4,
              padding:      '7px 10px',
              background:   phase === 'system' ? '#1e293b' : '#0f172a',
              border:       `1px solid ${phase === 'system' ? '#3b82f6' : '#1e3a5f'}`,
              borderRadius: 6,
              color:        '#f1f5f9',
              fontSize:     13,
              outline:      'none',
              cursor:       'pointer',
              boxSizing:    'border-box',
            }}
          >
            {SYSTEM_TYPES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Real-time implications */}
        {triggered.length > 0 && (
          <div>
            <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ⚠️ Implications Detected
            </label>
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {triggered.map((t, i) => (
                <ImplicationRow
                  key={t.implication.id}
                  result={t}
                  isActive={phase === 'implications' && i === activeImplIdx}
                  isSelected={selectedImpls.includes(t.implication.id ?? '')}
                  onToggle={() => toggleImpl(t.implication.id ?? '')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Keyboard hint + save */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{ color: '#334155', fontSize: 10 }}>
            {phase === 'tag'          && 'Tab → System'}
            {phase === 'system'       && (triggered.length > 0 ? 'Tab → Implications' : 'Enter to save')}
            {phase === 'implications' && '↑↓ nav · Space toggle · Enter save'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding:      '6px 16px',
              background:   saving ? '#334155' : '#1d4ed8',
              border:       'none',
              borderRadius: 6,
              color:        '#fff',
              fontSize:     12,
              fontWeight:   700,
              cursor:       saving ? 'default' : 'pointer',
              opacity:      saving ? 0.5 : 1,
            }}
          >
            {saving ? '…' : 'Save ↵'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Implication row sub-component ────────────────────────────────────────────

function ImplicationRow({ result, isActive, isSelected, onToggle }: {
  result:     TriggerResult;
  isActive:   boolean;
  isSelected: boolean;
  onToggle:   () => void;
}) {
  const borderColor =
    result.matchStrength === 'exact'   ? '#ef4444' :
    result.matchStrength === 'partial' ? '#f59e0b' : '#475569';

  const costBg =
    result.implication.costImpact === 'high'   ? 'rgba(239,68,68,0.2)' :
    result.implication.costImpact === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(71,85,105,0.3)';

  const costColor =
    result.implication.costImpact === 'high'   ? '#fca5a5' :
    result.implication.costImpact === 'medium' ? '#fcd34d' : '#94a3b8';

  return (
    <div
      onClick={onToggle}
      style={{
        padding:      '7px 10px',
        borderRadius: 6,
        border:       `1px solid ${isActive ? '#3b82f6' : borderColor}`,
        background:   isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.2)',
        cursor:       'pointer',
        transition:   'all 0.1s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ color: isSelected ? '#60a5fa' : '#cbd5e1', fontSize: 12, fontWeight: 600, flex: 1 }}>
          {isSelected ? '✓ ' : '○ '}{result.implication.description}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 10,
          background: costBg, color: costColor, marginLeft: 8, flexShrink: 0,
        }}>
          {result.implication.costImpact}
        </span>
      </div>
      <div style={{ color: '#475569', fontSize: 10, marginTop: 3 }}>
        {result.matchReason}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFeet(inches: number): string {
  const ft = inches / 12;
  return ft % 1 === 0 ? `${ft}'` : `${ft.toFixed(1)}'`;
}
