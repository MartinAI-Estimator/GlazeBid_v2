/**
 * Small form primitives for the Frame Builder (dark Builder theme).
 */
import React, { useEffect, useState } from 'react';
import { parseDimension, formatFeetInches, formatInches } from '@glazebid/frame-engine/core';

export function Field({ label, hint, children, wide }) {
  return (
    <label className={`fbv1-field ${wide ? 'wide' : ''}`}>
      <span className="fbv1-flabel">{label}{hint && <em>{hint}</em>}</span>
      {children}
    </label>
  );
}

export function Section({ title, children, right }) {
  return (
    <section className="fbv1-section">
      <header><h4>{title}</h4>{right}</header>
      {children}
    </section>
  );
}

/**
 * Dimension input: accepts 117.5, 117 1/2, 9'-9 1/2", 9' 9.5 …
 * `allowEq` → blank means EQ (null).
 */
export function DimInput({ value, onChange, allowEq = false, placeholder, feet = true, className = '', title }) {
  const fmt = (v) => (v === null || v === undefined || v === '' ? '' : feet ? formatFeetInches(Number(v)) : formatInches(Number(v)));
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(fmt(value)); setBad(false); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const t = text.trim();
    if (!t || /^eq$/i.test(t)) {
      if (allowEq) { onChange(null); setBad(false); return; }
      setText(fmt(value)); return;
    }
    const v = parseDimension(t);
    if (v === null || v < 0) { setBad(true); return; }
    setBad(false);
    onChange(Math.round(v * 10000) / 10000);
  };
  return (
    <input className={`fbv1-input dim ${bad ? 'bad' : ''} ${className}`} value={text} title={title}
      placeholder={placeholder ?? (allowEq ? 'EQ' : '')}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { setText(fmt(value)); e.currentTarget.blur(); } }} />
  );
}

export function NumInput({ value, onChange, step = 1, min, max, className = '' }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => { setText(value ?? ''); }, [value]);
  const commit = () => {
    const n = Number(text);
    if (text === '' || !Number.isFinite(n)) { setText(value ?? ''); return; }
    let v = n; if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <input className={`fbv1-input num ${className}`} type="number" step={step} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

export function TextInput({ value, onChange, placeholder, className = '' }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => { setText(value ?? ''); }, [value]);
  return (
    <input className={`fbv1-input ${className}`} value={text} placeholder={placeholder}
      onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onChange(text); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={`fbv1-input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (o.group
        ? <optgroup key={o.group} label={o.group}>{o.options.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="fbv1-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>{o.label}</button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, label }) {
  return (
    <label className="fbv1-check"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
  );
}
