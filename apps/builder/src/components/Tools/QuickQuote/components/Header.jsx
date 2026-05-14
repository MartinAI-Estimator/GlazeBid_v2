import React from 'react'
import { useQuote } from '../context/QuoteContext'

export default function Header({ extraLeft }) {
  const { project, updateProject } = useQuote()

  return (
    <header className="app-header">
      <div className="header-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="logo">QUICK<span>QUOTE</span></div>
          {extraLeft}
        </div>
        <div className="project-fields">
          <Field label="Project"    id="name"      value={project.name}      wide onChange={v => updateProject('name', v)} />
          <Field label="Client"     id="client"    value={project.client}    onChange={v => updateProject('client', v)} />
          <Field label="Branch"     id="branch"    value={project.branch}    sm onChange={v => updateProject('branch', v)} />
          <Field label="Date"       id="date"      value={project.date}      sm onChange={v => updateProject('date', v)} />
          <div className="header-divider" />
          <NumField label="Markup %"    value={project.markup}    min={0} max={100} onChange={v => updateProject('markup', v)} />
          <NumField label="Labor $/hr"  value={project.laborRate} min={0}           onChange={v => updateProject('laborRate', v)} />
          <NumField label="Tax %"       value={project.tax}       min={0} max={100} onChange={v => updateProject('tax', v)} />
        </div>
      </div>
    </header>
  )
}

function Field({ label, value, onChange, wide, sm }) {
  return (
    <div className="pf-group">
      <label>{label}</label>
      <input
        type="text"
        className={`pf-input ${wide ? 'wide' : sm ? 'sm' : 'med'}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={label}
      />
    </div>
  )
}

function NumField({ label, value, onChange, min, max }) {
  return (
    <div className="pf-group">
      <label>{label}</label>
      <input
        type="number"
        className="pf-input xs"
        value={value}
        min={min} max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}
