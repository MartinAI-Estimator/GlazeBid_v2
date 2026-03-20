/**
 * FrameEditorPanel.tsx — Fabrication BOM viewer for the Properties sidebar.
 *
 * Shown inside PropertiesPanel when a RectShape is selected that:
 *  - Is assigned to a glazing system that has a FrameProfile (profileKey set), AND
 *  - Has a grid (even the default single-bay grid counts).
 *
 * Three tabs:
 *   Summary  — kicker stats (frame LF, glass SF, joints), hardware counts,
 *               and production/door labor hours.
 *   Cut List — extrusion cut list: mark, role, qty, cut length.
 *               Omitted sills are shown with a strikethrough note.
 *   Glass    — glass pane list: mark, knife size, SF, and a V/S toggle
 *               for setting Vision vs Spandrel per lite.
 *
 * The component is intentionally self-contained (no external CSS classes).
 * All styling uses inline style objects so it works without Tailwind classnames.
 */

import { useState } from 'react';
import { useProjectStore, FRAME_PROFILES } from '../../store/useProjectStore';
import {
  computeFabricationBOM,
  type FabricationBOM,
  type CutListItem,
  type GlassPane,
} from '../../engine/parametric/systemEngine';
import type { GlassType } from '../../engine/parametric/gridMath';
import { DEFAULT_GRID, type GridSpec } from '../../engine/parametric/gridMath';
import type { RectShape } from '../../types/shapes';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'summary' | 'cuts' | 'glass';

type Props = {
  shape:           RectShape;
  /** Called when the user toggles a bay's glass type in the Glass tab. */
  onBayTypeChange: (col: number, row: number, type: GlassType) => void;
};

// ── Role display ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  head:    'Head',
  sill:    'Sill',
  jamb:    'Jamb',
  mullion: 'Mullion',
  transom: 'Transom',
};

const ROLE_COLORS: Record<string, string> = {
  head:    '#0ea5e9',
  sill:    '#f59e0b',
  jamb:    '#0ea5e9',
  mullion: '#38bdf8',
  transom: '#a78bfa',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FrameEditorPanel({ shape, onBayTypeChange }: Props): React.ReactElement | null {
  const [tab, setTab] = useState<Tab>('summary');

  const systems = useProjectStore(s => s.systems);
  const system  = systems.find(
    s => s.id === (shape as RectShape & { frameSystemId?: string }).frameSystemId,
  );

  // Only render when the frame has a profile assigned.
  if (!system?.profileKey) return null;

  const profile = FRAME_PROFILES[system.profileKey];
  const grid: GridSpec = shape.grid ?? DEFAULT_GRID;

  const bom: FabricationBOM = computeFabricationBOM(
    shape.widthInches,
    shape.heightInches,
    profile,
    grid,
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 6 }}>

      {/* Section header */}
      <p style={styles.sectionLabel}>Fabrication BOM</p>

      {/* Kicker chips */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <KickerChip label="Frame LF" value={bom.totalFramePieceLF.toFixed(1)} />
        <KickerChip label="Glass SF"  value={bom.totalGlassSF.toFixed(2)} />
        <KickerChip label="Joints"   value={String(bom.hardware.joints)} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
        {(['summary', 'cuts', 'glass'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tabBtn,
              background: tab === t ? '#0ea5e9' : '#1e293b',
              color:      tab === t ? '#fff'    : '#94a3b8',
              borderColor: tab === t ? '#0ea5e9' : '#334155',
            }}
          >
            {t === 'summary' ? 'Summary' : t === 'cuts' ? 'Cut List' : 'Glass'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'summary' && <SummaryTab bom={bom} />}
      {tab === 'cuts'    && <CutListTab items={bom.cutList} />}
      {tab === 'glass'   && (
        <GlassTab
          panes={bom.glassList}
          onTypeChange={onBayTypeChange}
        />
      )}
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({ bom }: { bom: FabricationBOM }) {
  const hw = bom.hardware;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SummaryRow label="Profile"      value={bom.profileLabel} />
      <SummaryRow label="Frame W"      value={`${bom.frameWidthInch.toFixed(3)}"`} />
      <SummaryRow label="Frame H"      value={`${bom.frameHeightInch.toFixed(3)}"`} />
      <SummaryRow label="Bays"         value={String(hw.bays)} />
      <SummaryRow label="DLOs"         value={String(hw.dlos)} />
      <SummaryRow label="Joints"       value={String(hw.joints)} />
      <SummaryRow label="Perimeter"    value={`${hw.perimeterLF.toFixed(2)} lf`} />
      <SummaryRow label="Frame LF"     value={`${hw.totalPieceLF.toFixed(2)} lf`} />
      <SummaryRow label="Glass SF"     value={`${bom.totalGlassSF.toFixed(2)} sf`} />
      {hw.sillsOmitted > 0 && (
        <SummaryRow label="Sills omit."  value={String(hw.sillsOmitted)} accent="#f59e0b" />
      )}
      {hw.singles > 0 && (
        <SummaryRow label="Singles"    value={String(hw.singles)} accent="#fb923c" />
      )}
      {hw.pairs > 0 && (
        <SummaryRow label="Pairs"      value={String(hw.pairs)} accent="#fb923c" />
      )}
      {(hw.fieldLaborHrs > 0) && (
        <SummaryRow label="Door Labor"  value={`${hw.fieldLaborHrs} hrs`} accent="#fb923c" />
      )}
      <div style={{ height: 1, background: '#1e293b', margin: '4px 0' }} />
      <SummaryRow label="Shop MHs"    value={`${hw.shopLaborMhs.toFixed(2)} mh`} />
      <SummaryRow label="Field MHs"   value={`${hw.fieldLaborMhs.toFixed(2)} mh`} />
    </div>
  );
}

// ── Cut List Tab ──────────────────────────────────────────────────────────────

function CutListTab({ items }: { items: CutListItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 0, fontSize: 9, color: '#475569', marginBottom: 3 }}>
        <span style={{ flex: '0 0 52px' }}>MARK</span>
        <span style={{ flex: '0 0 52px' }}>ROLE</span>
        <span style={{ flex: '0 0 24px', textAlign: 'right' }}>QTY</span>
        <span style={{ flex: 1, textAlign: 'right' }}>CUT LEN</span>
      </div>

      {items.map((item, i) => {
        const omitted = item.cutLengthInch === 0;
        const roleColor = ROLE_COLORS[item.role] ?? '#94a3b8';
        return (
          <div
            key={i}
            style={{
              display:    'flex',
              gap:        0,
              fontSize:   10,
              padding:    '2px 0',
              borderBottom: '1px solid #0f172a',
              opacity: omitted ? 0.45 : 1,
            }}
          >
            <span style={{ flex: '0 0 52px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: 9 }}>
              {item.mark}
            </span>
            <span style={{ flex: '0 0 52px', color: roleColor, fontSize: 9 }}>
              {ROLE_LABELS[item.role] ?? item.role}
            </span>
            <span style={{ flex: '0 0 24px', textAlign: 'right', color: '#94a3b8' }}>
              {omitted ? '—' : item.qty}
            </span>
            <span style={{ flex: 1, textAlign: 'right', color: omitted ? '#ef4444' : '#e2e8f0', fontFamily: 'monospace', fontSize: 9 }}>
              {omitted ? 'OMIT' : item.cutLengthFt}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Glass Tab ─────────────────────────────────────────────────────────────────

function GlassTab({
  panes,
  onTypeChange,
}: {
  panes:        GlassPane[];
  onTypeChange: (col: number, row: number, type: GlassType) => void;
}) {
  if (panes.length === 0) {
    return (
      <p style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: '8px 0' }}>
        All bays have doors — no glass lites.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 0, fontSize: 9, color: '#475569', marginBottom: 3 }}>
        <span style={{ flex: '0 0 44px' }}>MARK</span>
        <span style={{ flex: 1 }}>SIZE</span>
        <span style={{ flex: '0 0 34px', textAlign: 'right' }}>SF</span>
        <span style={{ flex: '0 0 40px', textAlign: 'right' }}>TYPE</span>
      </div>

      {panes.map((p, i) => {
        const isSpandrel = p.glassType === 'spandrel';
        return (
          <div
            key={i}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         0,
              fontSize:    10,
              padding:     '2px 0',
              borderBottom: '1px solid #0f172a',
            }}
          >
            <span style={{ flex: '0 0 44px', color: '#64748b', fontFamily: 'monospace', fontSize: 9 }}>
              {p.mark}
            </span>
            <span style={{ flex: 1, color: '#cbd5e1', fontFamily: 'monospace', fontSize: 9 }}>
              {p.widthInch.toFixed(2)}&quot;×{p.heightInch.toFixed(2)}&quot;
            </span>
            <span style={{ flex: '0 0 34px', textAlign: 'right', color: '#64748b', fontSize: 9 }}>
              {p.areaSF.toFixed(2)}
            </span>
            {/* V / S toggle */}
            <button
              onClick={() => onTypeChange(p.col, p.row, isSpandrel ? 'vision' : 'spandrel')}
              title={`Click to mark as ${isSpandrel ? 'Vision' : 'Spandrel'}`}
              style={{
                flex:         '0 0 40px',
                textAlign:    'center',
                fontSize:     9,
                padding:      '1px 3px',
                borderRadius: 3,
                border:       '1px solid',
                cursor:       'pointer',
                background:   isSpandrel ? '#1e293b'  : '#0c4a6e',
                color:        isSpandrel ? '#f59e0b'  : '#38bdf8',
                borderColor:  isSpandrel ? '#f59e0b'  : '#0ea5e9',
              }}
            >
              {isSpandrel ? 'SPDR' : 'VIS'}
            </button>
          </div>
        );
      })}

      {/* Totals footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
        <span>{panes.length} lites</span>
        <span>
          {panes.reduce((a, p) => a + p.areaSF, 0).toFixed(2)} sf total
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KickerChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#0f172a',
      border:     '1px solid #1e293b',
      borderRadius: 4,
      padding:    '2px 6px',
      fontSize:   9,
      color:      '#94a3b8',
    }}>
      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{value}</span>
      {' '}{label}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label:   string;
  value:   string;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: accent ?? '#cbd5e1', fontFamily: 'monospace', fontSize: 9 }}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  sectionLabel: {
    fontSize:      10,
    fontWeight:    600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color:         '#64748b',
    marginBottom:  6,
  },
  tabBtn: {
    flex:         1,
    fontSize:     10,
    padding:      '3px 0',
    border:       '1px solid',
    borderRadius: 4,
    cursor:       'pointer',
  } as React.CSSProperties,
} as const;

// ── React import (needed for JSX in non-.tsx files inferred from tsconfig) ─────
import React from 'react';
