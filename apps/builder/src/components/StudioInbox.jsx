/**
 * StudioInbox.jsx
 *
 * Displays the live RawTakeoff[] received from Studio.
 * Shows a table of all measured items with dimensions, type, and label.
 *
 * Designed to slot into the legacy Builder alongside the existing BidSheet.
 */

import React, { useMemo, useCallback } from 'react';
import { useInboxStore } from '../store/useInboxStore';
import useBidStore from '../store/useBidStore';

const TYPE_ICONS = {
  Area:  '⬜',
  LF:    '📏',
  Count: '🔢',
};

function sqFt(w, h) {
  return ((w * h) / 144).toFixed(2);
}

export default function StudioInbox({ className = '' }) {
  const inbox = useInboxStore((s) => s.inbox);
  const addFrame = useBidStore((s) => s.addFrame);

  const addGroupToBid = useCallback((g) => {
    const sqFtEach = (g.widthInches * g.heightInches) / 144;
    addFrame({
      frameId: `studio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      elevationTag: g.label !== '—' ? g.label : `${g.widthInches.toFixed(0)}"x${g.heightInches.toFixed(0)}"`,
      systemType: 'Studio Takeoff',
      inputs: { width: g.widthInches, height: g.heightInches, bays: 1, rows: 1, glassBite: 0.75, sightline: 2 },
      bom: {
        totalAluminumLF: (2 * (g.widthInches + g.heightInches) / 12) * g.qty,
        totalGlassSqFt:  sqFtEach * g.qty,
        glassLitesCount: g.qty,
        cutList: [],
        glassSizes: { widthInches: g.widthInches, heightInches: g.heightInches, qty: g.qty },
      },
    });
  }, [addFrame]);

  // Group by (widthInches × heightInches × type × label) for concise display
  const groups = useMemo(() => {
    const map = {};
    for (const t of inbox) {
      const key = `${t.type}::${(t.widthInches ?? 0).toFixed(2)}x${(t.heightInches ?? 0).toFixed(2)}::${t.label ?? ''}`;
      if (!map[key]) {
        map[key] = {
          key,
          type:         t.type,
          widthInches:  t.widthInches  ?? 0,
          heightInches: t.heightInches ?? 0,
          label:        t.label ?? '—',
          qty:          0,
        };
      }
      map[key].qty += 1;
    }
    return Object.values(map).sort((a, b) => b.widthInches * b.heightInches - a.widthInches * a.heightInches);
  }, [inbox]);

  if (inbox.length === 0) {
    return (
      <div className={`studio-inbox-empty ${className}`} style={styles.empty}>
        <p style={styles.emptyText}>No Studio takeoffs yet.</p>
        <p style={styles.emptyHint}>Open Studio and draw your glazing areas — they'll appear here in real time.</p>
      </div>
    );
  }

  return (
    <div className={`studio-inbox ${className}`} style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Studio Takeoffs</span>
        <span style={styles.headerCount}>{inbox.length} item{inbox.length !== 1 ? 's' : ''} · {groups.length} unique size{groups.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Width (in)</th>
              <th style={styles.th}>Height (in)</th>
              <th style={styles.th}>Area (SF)</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>Total SF</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.key} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                <td style={styles.td}>{TYPE_ICONS[g.type] ?? ''} {g.type}</td>
                <td style={styles.td}>{g.label}</td>
                <td style={{ ...styles.td, ...styles.numCell }}>{g.widthInches.toFixed(2)}"</td>
                <td style={{ ...styles.td, ...styles.numCell }}>{g.heightInches.toFixed(2)}"</td>
                <td style={{ ...styles.td, ...styles.numCell }}>{sqFt(g.widthInches, g.heightInches)}</td>
                <td style={{ ...styles.td, ...styles.numCell }}>{g.qty}</td>
                <td style={{ ...styles.td, ...styles.numCell }}>
                  {(parseFloat(sqFt(g.widthInches, g.heightInches)) * g.qty).toFixed(2)}
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => addGroupToBid(g)}
                    style={styles.addBtn}
                    title="Add to BidSheet"
                  >
                    + Bid
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals bar */}
      <div style={styles.totals}>
        <span>Total frames: <b>{inbox.filter(t => t.type === 'Area').length}</b></span>
        <span style={{ marginLeft: 24 }}>
          Total area: <b>
            {inbox
              .filter(t => t.type === 'Area')
              .reduce((s, t) => s + (t.widthInches ?? 0) * (t.heightInches ?? 0) / 144, 0)
              .toFixed(2)} SF
          </b>
        </span>
        <span style={{ marginLeft: 24 }}>
          Linear feet: <b>
            {inbox
              .filter(t => t.type === 'LF')
              .reduce((s, t) => s + (t.widthInches ?? 0) / 12, 0)
              .toFixed(2)} LF
          </b>
        </span>
      </div>
    </div>
  );
}

// ── Inline styles (no Tailwind dependency — compatible with legacy Builder CSS) ─
const styles = {
  container: {
    background: '#0f1f38',
    border: '1px solid #1e3a5f',
    borderRadius: 8,
    padding: 0,
    overflow: 'hidden',
    fontFamily: 'inherit',
    color: '#e2e8f0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#1a2d4a',
    padding: '10px 16px',
    borderBottom: '1px solid #1e3a5f',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#60a5fa',
    letterSpacing: '0.03em',
  },
  headerCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: 420,
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    background: '#162032',
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1e3a5f',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: '7px 12px',
    borderBottom: '1px solid #1a2d48',
    verticalAlign: 'middle',
  },
  numCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'monospace',
  },
  rowEven: {
    background: 'transparent',
  },
  rowOdd: {
    background: '#0d1a2e',
  },
  totals: {
    padding: '10px 16px',
    background: '#162032',
    borderTop: '1px solid #1e3a5f',
    fontSize: 13,
    color: '#cbd5e1',
  },
  empty: {
    padding: '32px 24px',
    textAlign: 'center',
    background: '#0f1f38',
    border: '1px solid #1e3a5f',
    borderRadius: 8,
  },
  emptyText: {
    color: '#94a3b8',
    marginBottom: 8,
    fontSize: 15,
  },
  emptyHint: {
    color: '#64748b',
    fontSize: 13,
  },
  addBtn: {
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
