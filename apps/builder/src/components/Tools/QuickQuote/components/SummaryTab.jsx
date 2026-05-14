import React from 'react'
import { useQuote } from '../context/QuoteContext'
import { fmt } from '../utils/calculations'

export default function SummaryTab() {
  const { projectTotal, scopeTotals, scopes, updateScope, sheetNames } = useQuote()
  const { project, updateProject } = useQuote()

  return (
    <div className="summary-page">
      <div className="summary-grid">

        {/* Project Totals */}
        <div className="card">
          <div className="card-header">Project Totals</div>
          <table className="summary-table">
            <tbody>
              <Row label="Total Material Cost"       val={projectTotal.totalMat} />
              <Row label="Shop Drawings (3%)"        val={projectTotal.shopDraw} />
              <Row label="Material Contingency (2.5%)" val={projectTotal.matCont} />
              <Row label="Total Labor Cost"          val={projectTotal.totalLab} />
              <Row label="Labor Contingency (5%)"    val={projectTotal.labCont} />
              <Row label="Total Mark-Up"             val={projectTotal.mu} />
              <Row label="Total Tax"                 val={projectTotal.tax} />
              <Row label="PROJECT TOTAL" val={projectTotal.total} isTotal />
            </tbody>
          </table>
        </div>

        {/* Scope Breakdown */}
        <div className="card">
          <div className="card-header">Scope Breakdown</div>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th className="text-right">SF / LF / Ea.</th>
                <th className="text-right">Quoted</th>
                <th className="text-right">$ / SF</th>
              </tr>
            </thead>
            <tbody>
              {sheetNames.map((name, i) => {
                const total = scopeTotals[i].total
                const sqft  = parseFloat(scopes[i].sqft) || 0
                return (
                  <tr key={i}>
                    <td className="label">{name}</td>
                    <td>
                      <input
                        type="number"
                        className="summary-input"
                        placeholder="enter"
                        value={scopes[i].sqft}
                        onChange={e => updateScope(i, { sqft: e.target.value })}
                      />
                    </td>
                    <td className={`value ${total > 0 ? 'active' : ''}`}>
                      {total > 0 ? fmt(total) : '—'}
                    </td>
                    <td className="value muted">
                      {sqft > 0 && total > 0 ? fmt(total / sqft) : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td className="label">PROJECT TOTAL</td>
                <td></td>
                <td className="value">{fmt(projectTotal.total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* Revision Log */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">Quick Quote Revisions</div>
        <table className="summary-table" style={{ width: '60%' }}>
          <thead><tr><th>Revision Note</th><th style={{ width: 140 }}>Date Added</th></tr></thead>
          <tbody>
            {project.revisions.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text" className="inline-input" style={{ width: '100%' }}
                    placeholder="Revision note..."
                    value={r.note}
                    onChange={e => {
                      const revs = [...project.revisions]
                      revs[i] = { ...revs[i], note: e.target.value }
                      updateProject('revisions', revs)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text" className="inline-input"
                    placeholder="Date"
                    value={r.date}
                    onChange={e => {
                      const revs = [...project.revisions]
                      revs[i] = { ...revs[i], date: e.target.value }
                      updateProject('revisions', revs)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ label, val, isTotal }) {
  return (
    <tr className={isTotal ? 'total-row' : ''}>
      <td className="label">{label}</td>
      <td className="value">{fmt(val)}</td>
    </tr>
  )
}
