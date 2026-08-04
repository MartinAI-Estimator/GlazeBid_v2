/**
 * PlaybookTab.jsx — authoring surface for the company playbook.
 *
 * The estimator writes plain language. They never see a regex — that is the
 * whole point of the two-layer design. AI compiles each instruction into search
 * rules once, at save time; scanning stays local forever after.
 *
 * A watch item that fails to compile is shown DISABLED with a visible reason
 * rather than silently ignored: an estimator has to be able to tell that a rule
 * of theirs is not running.
 */

import React, { useState, useEffect } from 'react';
import {
  loadPlaybook, savePlaybook, emptyPlaybook, compileWatchItem, playbookCategories,
} from '../../lib/companyPlaybook';

const SEVERITIES = [
  { key: 'risk', label: 'Could cost money', color: '#ef4444' },
  { key: 'warn', label: 'Verify before bid',  color: '#f59e0b' },
  { key: 'info', label: 'Good to know',       color: '#58a6ff' },
];

const c = {
  panel:   { padding: 20, maxWidth: 900, margin: '0 auto', color: '#e6edf3' },
  section: { background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: 16, marginBottom: 16 },
  h2:      { fontSize: 15, fontWeight: 700, margin: '0 0 4px' },
  sub:     { fontSize: 12, color: '#8b949e', margin: '0 0 14px', lineHeight: 1.5 },
  label:   { display: 'block', fontSize: 11, fontWeight: 700, color: '#8b949e', letterSpacing: '0.03em', marginBottom: 5 },
  input:   { width: '100%', padding: '8px 10px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3', fontSize: 13, boxSizing: 'border-box' },
  textarea:{ width: '100%', padding: '8px 10px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3', fontSize: 13, minHeight: 60, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  btn:     { padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' },
  primary: { background: '#238636', color: '#fff' },
  ghost:   { background: 'transparent', color: '#8b949e', border: '1px solid #30363d' },
  row:     { border: '1px solid #30363d', borderRadius: 8, padding: 12, marginBottom: 10, background: '#0d1117' },
  chip:    (col) => ({ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: col, background: col + '18', border: `1px solid ${col}44` }),
};

export default function PlaybookTab() {
  const [playbook, setPlaybook] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null);

  // New watch item draft
  const [draft, setDraft] = useState({ instruction: '', severity: 'warn', meaning: '' });
  const [compiling, setCompiling] = useState(false);

  // "Try it" preview
  const [tryText, setTryText] = useState('');

  useEffect(() => {
    loadPlaybook()
      .then((pb) => setPlaybook(pb || emptyPlaybook()))
      .finally(() => setLoading(false));
  }, []);

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  async function persist(next) {
    setPlaybook(next);
    setSaving(true);
    const res = await savePlaybook(next);
    setSaving(false);
    flash(res.ok ? 'Playbook saved' : `Save failed: ${res.error}`, res.ok);
  }

  async function addWatchItem() {
    if (!draft.instruction.trim()) return;
    setCompiling(true);
    const item = await compileWatchItem({
      id: `wi-${Date.now()}`,
      instruction: draft.instruction.trim(),
      severity: draft.severity,
      meaning: draft.meaning.trim(),
      enabled: true,
    });
    setCompiling(false);
    await persist({ ...playbook, watchItems: [...(playbook.watchItems || []), item] });
    setDraft({ instruction: '', severity: 'warn', meaning: '' });
  }

  async function removeWatchItem(id) {
    await persist({ ...playbook, watchItems: playbook.watchItems.filter((w) => w.id !== id) });
  }

  async function toggleWatchItem(id) {
    await persist({
      ...playbook,
      watchItems: playbook.watchItems.map((w) =>
        w.id === id ? { ...w, enabled: w.enabled === false ? true : false } : w),
    });
  }

  async function recompile(id) {
    setCompiling(true);
    const items = await Promise.all(
      playbook.watchItems.map((w) => (w.id === id ? compileWatchItem(w) : w)),
    );
    setCompiling(false);
    await persist({ ...playbook, watchItems: items });
  }

  if (loading) return <div style={c.panel}>Loading playbook…</div>;

  // Live "try it": run the compiled rules against whatever the user pastes.
  const tryHits = tryText.trim()
    ? playbookCategories(playbook).filter((cat) => {
        const pats = [...(cat.patterns || []), ...(cat.lowPrecision || [])];
        return pats.some((re) => { try { return re.test(tryText); } catch { return false; } });
      })
    : [];

  return (
    <div style={c.panel}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>📕 Company Playbook</h1>
      <p style={{ ...c.sub, marginBottom: 20 }}>
        Your company&rsquo;s own spec rules, on top of the built-in glazing checks. Write what you
        want caught in plain English — no patterns or regex. Saved once per company and shared by
        copying <code style={{ color: '#8b949e' }}>company-playbook.json</code>.
      </p>

      {msg && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 13,
          background: msg.ok ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
          color: msg.ok ? '#3fb950' : '#f85149',
          border: `1px solid ${msg.ok ? '#3fb95033' : '#f8514933'}`,
        }}>{msg.text}</div>
      )}

      {/* ── Company ── */}
      <div style={c.section}>
        <h2 style={c.h2}>Company</h2>
        <p style={c.sub}>Shown on the playbook file so estimators know whose rules these are.</p>
        <input
          style={c.input}
          value={playbook.company || ''}
          placeholder="e.g. ABC Glazing Co"
          onChange={(e) => setPlaybook({ ...playbook, company: e.target.value })}
          onBlur={() => persist(playbook)}
        />
      </div>

      {/* ── Watch items ── */}
      <div style={c.section}>
        <h2 style={c.h2}>Watch items</h2>
        <p style={c.sub}>
          Things you want flagged on every job. Example: &ldquo;Flag any spec that makes the glazing
          contractor pay for field water testing.&rdquo;
        </p>

        {(playbook.watchItems || []).map((w) => {
          const sev = SEVERITIES.find((s) => s.key === (w.severity || 'warn')) || SEVERITIES[1];
          const broken = !w.compiled;
          return (
            <div key={w.id} style={{ ...c.row, opacity: w.enabled === false ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={c.chip(sev.color)}>{sev.label}</span>
                {broken && <span style={c.chip('#f85149')}>NOT RUNNING</span>}
                {!broken && w.compiledBy === 'keywords' && <span style={c.chip('#8b949e')}>BASIC MATCHING</span>}
                {!broken && w.compiledBy === 'ai' && <span style={c.chip('#3fb950')}>COMPILED</span>}
                {w.enabled === false && <span style={c.chip('#8b949e')}>OFF</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button style={{ ...c.btn, ...c.ghost, padding: '3px 9px', fontSize: 11 }} onClick={() => recompile(w.id)}>Recompile</button>
                  <button style={{ ...c.btn, ...c.ghost, padding: '3px 9px', fontSize: 11 }} onClick={() => toggleWatchItem(w.id)}>
                    {w.enabled === false ? 'Enable' : 'Disable'}
                  </button>
                  <button style={{ ...c.btn, ...c.ghost, padding: '3px 9px', fontSize: 11, color: '#f85149' }} onClick={() => removeWatchItem(w.id)}>Remove</button>
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#e6edf3' }}>{w.instruction}</div>
              {w.meaning && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>{w.meaning}</div>}
              {broken && (
                <div style={{ fontSize: 11, color: '#f85149', marginTop: 5 }}>
                  {w.compileError || 'No rule could be built from this wording'} — try naming the exact
                  words you would search for.
                </div>
              )}
            </div>
          );
        })}

        {/* New item */}
        <div style={{ ...c.row, borderStyle: 'dashed' }}>
          <label style={c.label}>WHAT SHOULD WE LOOK FOR?</label>
          <textarea
            style={c.textarea}
            value={draft.instruction}
            placeholder="Flag any spec that makes the glazing contractor pay for field water testing"
            onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={c.label}>HOW SERIOUS?</label>
              <select
                style={c.input}
                value={draft.severity}
                onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
              >
                {SEVERITIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ flex: '2 1 260px' }}>
              <label style={c.label}>WHAT IT MEANS FOR THE BID (OPTIONAL)</label>
              <input
                style={c.input}
                value={draft.meaning}
                placeholder="Testing is on our dime — add a test day plus crew."
                onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
              />
            </div>
          </div>
          <button
            style={{ ...c.btn, ...c.primary, marginTop: 12, opacity: (!draft.instruction.trim() || compiling) ? 0.5 : 1 }}
            disabled={!draft.instruction.trim() || compiling}
            onClick={addWatchItem}
          >
            {compiling ? 'Compiling…' : '+ Add watch item'}
          </button>
        </div>
      </div>

      {/* ── Try it ── */}
      <div style={c.section}>
        <h2 style={c.h2}>Try it</h2>
        <p style={c.sub}>Paste a sentence that should be caught, and see which of your rules fire.</p>
        <textarea
          style={c.textarea}
          value={tryText}
          placeholder="The glazing contractor shall pay for all field water testing per ASTM E1105."
          onChange={(e) => setTryText(e.target.value)}
        />
        {tryText.trim() && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            {tryHits.length === 0
              ? <span style={{ color: '#f59e0b' }}>No rule fired on this text.</span>
              : <span style={{ color: '#3fb950' }}>
                  {tryHits.length} rule{tryHits.length !== 1 ? 's' : ''} fired: {tryHits.map((h) => h.label).join(', ')}
                </span>}
          </div>
        )}
      </div>

      {/* ── Never bid ── */}
      <div style={c.section}>
        <h2 style={c.h2}>We don&rsquo;t bid this</h2>
        <p style={c.sub}>
          Scope your company will not price. One per line. A match puts a stop banner at the top of
          the risk report before anything else.
        </p>
        <textarea
          style={c.textarea}
          value={(playbook.scope?.neverBid || []).join('\n')}
          placeholder={'blast-resistant glazing\ndetention glazing'}
          onChange={(e) => setPlaybook({
            ...playbook,
            scope: { ...playbook.scope, neverBid: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) },
          })}
          onBlur={() => persist(playbook)}
        />
      </div>

      {/* ── Preferred manufacturers ── */}
      <div style={c.section}>
        <h2 style={c.h2}>Preferred manufacturers</h2>
        <p style={c.sub}>One per line. Used when reading basis-of-design and approved-equal language.</p>
        <textarea
          style={c.textarea}
          value={(playbook.preferredManufacturers || []).join('\n')}
          placeholder={'Kawneer\nOldcastle\nYKK AP'}
          onChange={(e) => setPlaybook({
            ...playbook,
            preferredManufacturers: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
          })}
          onBlur={() => persist(playbook)}
        />
      </div>

      <div style={{ fontSize: 12, color: '#8b949e' }}>
        {saving ? 'Saving…' : 'Changes save when you leave a field.'}
      </div>
    </div>
  );
}
