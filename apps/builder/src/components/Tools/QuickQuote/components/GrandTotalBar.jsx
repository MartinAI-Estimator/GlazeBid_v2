import React from 'react'
import { useQuote } from '../context/QuoteContext'
import { fmt } from '../utils/calculations'

const SHORT = ['CW','ExSF','Upfit','HRL','Sun','FR','TW','#8','#9','#10','#11','#12']

export default function GrandTotalBar() {
  const { scopeTotals, projectTotal } = useQuote()

  return (
    <div className="grand-total-bar">
      <span className="gt-label">Project Total</span>
      <div className="gt-items">
        {scopeTotals.map((t, i) => (
          <div key={i} className="gt-item">
            <span className="gt-item-name">{SHORT[i]}</span>
            <span className={`gt-item-value ${t.total > 0 ? 'active' : ''}`}>
              {t.total > 0 ? '$' + Math.round(t.total).toLocaleString() : '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="gt-total">{fmt(projectTotal.total)}</div>
    </div>
  )
}
