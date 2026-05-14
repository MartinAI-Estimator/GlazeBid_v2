import React from 'react'
import { useQuote } from '../context/QuoteContext'
import { fmt } from '../utils/calculations'

export default function ScopeSidebar({ scopeIndex, scopeName }) {
  const { scopeTotals, scopes, updateScope, project } = useQuote()
  const t = scopeTotals[scopeIndex]
  const crew = scopes[scopeIndex].crewSize || 4
  const fieldHrs = t.fieldHrs || 0
  const hrsMan   = crew > 0 ? fieldHrs / crew : 0
  const days     = hrsMan  / 8
  const weeks    = days    / 5
  const months   = weeks   / 4.33

  return (
    <aside className="scope-sidebar">
      <div className="sidebar-card">
        <div className="card-header">{scopeName} — Totals</div>
        <SideRow label="Material"                val={fmt(t.totalMat)} />
        <SideRow label="Shop Drawings (3%)"      val={fmt(t.shopDraw)} />
        <SideRow label="Mat. Contingency (2.5%)" val={fmt(t.matCont)} />
        <SideRow label="Labor"                   val={fmt(t.totalLab)} />
        <SideRow label="Labor Contingency (5%)"  val={fmt(t.labCont)} />
        <SideRow label="Mark-Up"                 val={fmt(t.mu)} />
        <SideRow label="Tax"                     val={fmt(t.tax)} />
        <SideRow label="SHEET TOTAL"             val={fmt(t.total)} isTotal />
      </div>

      <div className="labor-info-card">
        <div className="li-title">Labor Info (Frames)</div>
        <LiRow label="Crew Size">
          <input
            type="number" min={1} max={20} style={{ width: 50, textAlign: 'center' }}
            value={scopes[scopeIndex].crewSize}
            onChange={e => updateScope(scopeIndex, { crewSize: parseFloat(e.target.value) || 4 })}
          />
        </LiRow>
        <LiRow label="Field Hrs"  val={fieldHrs.toFixed(1)} />
        <LiRow label="Hrs / Man"  val={hrsMan.toFixed(1)} />
        <LiRow label="Days"       val={days.toFixed(1)} />
        <LiRow label="Weeks"      val={weeks.toFixed(1)} />
        <LiRow label="Months"     val={months.toFixed(2)} />
      </div>
    </aside>
  )
}

function SideRow({ label, val, isTotal }) {
  return (
    <div className={`sidebar-row ${isTotal ? 'total' : ''}`}>
      <span className="sidebar-label">{label}</span>
      <span className="sidebar-value">{val}</span>
    </div>
  )
}

function LiRow({ label, val, children }) {
  return (
    <div className="li-row">
      <span>{label}</span>
      {children || <span className="text-mono">{val}</span>}
    </div>
  )
}
