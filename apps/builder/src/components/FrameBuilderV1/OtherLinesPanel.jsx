/**
 * OtherLinesPanel — the takeoff lines that aren't frames (decision 7).
 *
 *   Glass only       glazing-only lites (glass into HM frames / doors by others).  An opening
 *                    size read off the drawing is listed but never ordered — type the lite size
 *                    and the lite goes on the glass report.
 *   Bid cart lines   mirrors, translucent panels, pass-thru, railings, frameless glass, doors in
 *                    existing frames…  "Send to Bid Cart" puts each group on the bid as a
 *                    material scope to price.
 *   Brake metal      the pieces on the frames vs the length the takeoff measured on the
 *                    elevations — a cross-check, not a second count.
 */
import React, { useMemo, useState } from 'react';
import { formatFeetInches } from '@glazebid/frame-engine/core';
import { DimInput, NumInput, TextInput, Select } from './ui';

const r1 = (v) => Math.round(v * 10) / 10;

export function otherLinesCount(takeoff) {
  return (takeoff?.glassOnly?.length ?? 0) + (takeoff?.bidLines?.length ?? 0);
}

export default function OtherLinesPanel({ takeoff, result, store, onClose }) {
  const [tab, setTab] = useState(() => (takeoff.glassOnly?.length ? 'glass' : 'bid'));
  const glass = takeoff.glassOnly ?? [];
  const bid = takeoff.bidLines ?? [];
  const types = takeoff.glassTypes ?? [];
  const groups = useMemo(() => {
    const m = new Map();
    for (const b of bid) { if (!m.has(b.group)) m.set(b.group, []); m.get(b.group).push(b); }
    return [...m.entries()];
  }, [bid]);
  const brakeLF = (result?.brakeRows ?? []).reduce((s, b) => s + (b.length * b.qtyTotal) / 12, 0);
  const brakeFrames = new Set((result?.brakeRows ?? []).map((b) => b.frame)).size;
  const measured = takeoff.brakeMeasured ?? [];
  const typeOpts = [{ value: '', label: 'Project default' }, ...types.map((g) => ({ value: g.id, label: `${g.mark} — ${g.description}` }))];

  return (
    <div className="fbv1-modal" role="dialog" aria-modal="true" aria-label="Other lines">
      <div className="fbv1-modal-box wide">
        <header>
          <h3>Other lines <span className="fbv1-sub">— not frames</span></h3>
          <button type="button" className="fbv1-x" onClick={onClose}>×</button>
        </header>
        <div className="fbv1-row">
          {[['glass', `Glass only (${glass.length})`], ['bid', `Bid cart lines (${bid.length})`], ['brake', 'Brake metal check']].map(([k, label]) => (
            <button key={k} type="button" className={`fbv1-btn small ${tab === k ? 'primary' : 'ghost'}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {tab === 'glass' && (
          <>
            <p className="fbv1-sub">Glass into frames or doors by others. A size read off the drawing is the opening / frame — it is not ordered
              until you type the lite size (DLO + bite). Sized lites are on the glass report and the glass RFQ.</p>
            <div className="fbv1-scroll">
              <table className="fbv1-table compact">
                <thead><tr><th>Mark</th><th>Width</th><th>Height</th><th>Qty</th><th>Glass</th><th>Status</th><th>Drawing</th><th /></tr></thead>
                <tbody>{glass.map((g) => {
                  const ordered = g.sizeIs === 'lite' || (g.sizeIs == null && g.width && g.height);
                  const needs = (g.needs ?? []).map((n) => n.reason);
                  return (
                    <tr key={g.id} className={ordered ? '' : 'fbv1-flag-row'}>
                      <td><TextInput value={g.mark} onChange={(v) => store.updateGlassOnly(g.id, { mark: v })} /></td>
                      <td><DimInput feet={false} value={g.width} onChange={(v) => store.updateGlassOnly(g.id, { width: v })} /></td>
                      <td><DimInput feet={false} value={g.height} onChange={(v) => store.updateGlassOnly(g.id, { height: v })} /></td>
                      <td><NumInput min={1} value={g.qty} onChange={(v) => store.updateGlassOnly(g.id, { qty: v })} /></td>
                      <td><Select value={g.glassTypeId ?? ''} onChange={(v) => store.updateGlassOnly(g.id, { glassTypeId: v || null })} options={typeOpts} /></td>
                      <td className="fbv1-meta">{ordered ? 'On the glass report' : <span title={needs.join(' ')}>⚑ {needs[0] ?? 'Needs a lite size'}</span>}
                        {g.drawingSays?.length ? <div>Drawing now says {g.drawingSays.map((d) => `${d.field} ${d.drawing ?? '—'}`).join(', ')}{' '}
                          <button type="button" className="fbv1-btn small" onClick={() => store.acceptGlassOnlyDrawing(g.id)}>Use drawing</button></div> : null}</td>
                      <td className="fbv1-meta" title={g.description}>{String(g.description ?? '').slice(0, 60)}</td>
                      <td><button type="button" className="fbv1-btn ghost danger small" onClick={() => store.removeGlassOnly(g.id)}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <button type="button" className="fbv1-btn small" onClick={() => store.addGlassOnly()}>+ Glass-only lite</button>
          </>
        )}

        {tab === 'bid' && (
          <>
            <p className="fbv1-sub">"Send to Bid Cart" puts each group on the bid as its own material scope ("… — from takeoff"), one line per item, to price there.
              Prices you enter on the bid are kept when you send again.</p>
            <div className="fbv1-scroll">
              {groups.map(([group, rows]) => (
                <div key={group} className="fbv1-card">
                  <div className="fbv1-row"><b>{group}</b><span className="fbv1-meta">{rows.length} line(s)</span><span style={{ flex: 1 }} />
                    <button type="button" className="fbv1-btn ghost small" onClick={() => store.addBidLine(group)}>+ Line</button></div>
                  <table className="fbv1-table compact">
                    <tbody>{rows.map((b) => (
                      <tr key={b.id} className={b.flags?.length ? 'fbv1-flag-row' : ''}>
                        <td style={{ width: 110 }}>{b.itemId}</td>
                        <td style={{ width: 80 }}><NumInput min={0} step={0.1} value={b.quantity ?? ''} onChange={(v) => store.updateBidLine(b.id, { quantity: v })} /></td>
                        <td style={{ width: 70 }}><Select value={b.unit} onChange={(v) => store.updateBidLine(b.id, { unit: v })} options={['EA', 'SF', 'LF', 'LS'].map((u) => ({ value: u, label: u }))} /></td>
                        <td><TextInput value={b.description} onChange={(v) => store.updateBidLine(b.id, { description: v })} />
                          {b.flags?.length ? <div className="fbv1-meta">⚑ {b.flags.join(' ')}</div> : null}
                          {b.drawingSays?.length ? <div className="fbv1-meta">Drawing now says {b.drawingSays.map((d) => `${d.field} ${d.drawing ?? '—'}`).join(', ')}</div> : null}</td>
                        <td style={{ width: 30 }}><button type="button" className="fbv1-btn ghost danger small" onClick={() => store.removeBidLine(b.id)}>×</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ))}
              {!groups.length && <div className="fbv1-empty small">No bid cart lines yet.</div>}
            </div>
            <button type="button" className="fbv1-btn small" onClick={() => store.addBidLine('Other')}>+ Line</button>
          </>
        )}

        {tab === 'brake' && (
          <div className="fbv1-card">
            <p className="fbv1-sub">Brake metal from the details is on each frame it touches (Brake tab of the frame) — girth, brakes and hems are assumed
              until you set them from the detail. The takeoff also measured a run length on the elevations; the two should be close.</p>
            <table className="fbv1-table compact">
              <tbody>
                <tr><td>On the frames</td><td><b>{r1(brakeLF)} LF</b></td><td className="fbv1-meta">{brakeFrames} frame type(s), × quantity</td></tr>
                {measured.map((m) => {
                  const off = m.quantity && brakeLF ? Math.abs(brakeLF - m.quantity) / m.quantity : null;
                  return (
                    <tr key={m.itemId} className={off != null && off > 0.15 ? 'fbv1-flag-row' : ''}>
                      <td>Measured on the elevations</td><td><b>{m.quantity ?? '—'} {m.unit}</b></td>
                      <td className="fbv1-meta">{off != null && off > 0.15 ? `⚑ ${Math.round(off * 100)}% apart — check for brake metal not on a frame (piers, wraps, other systems) or frames without it. ` : ''}
                        placed on {m.placedOn.join(', ') || '—'}</td>
                    </tr>
                  );
                })}
                {!measured.length && <tr><td colSpan={3} className="fbv1-meta">No measured total from the takeoff.</td></tr>}
              </tbody>
            </table>
            {(result?.brakeRows ?? []).length > 0 && (
              <table className="fbv1-table compact">
                <thead><tr><th>Frame</th><th>Piece</th><th>Length</th><th>Qty</th></tr></thead>
                <tbody>{result.brakeRows.map((b, i) => (
                  <tr key={i}><td>{b.frame}</td><td className="fbv1-meta">{b.description}</td><td>{formatFeetInches(b.length)}</td><td>{b.qtyTotal}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
