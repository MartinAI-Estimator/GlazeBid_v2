import React, { useState } from 'react'
import { Section } from './FramingSection'
import { useQuote } from '../../context/QuoteContext'

import { fmt } from '../../utils/calculations'

export default function MiscSection({ scopeIndex }) {
  const { scopes, updateScope, project, MISC_GROUPS } = useQuote()
  const [open, setOpen] = useState(false)
  const scope = scopes[scopeIndex]
  const lr = project.laborRate

  function update(key, val) {
    updateScope(scopeIndex, s => ({ ...s, misc: { ...s.misc, [key]: val } }))
  }

  const rows = []
  MISC_GROUPS.forEach((grp, gi) => {
    rows.push(
      <tr key={`grp-${gi}`} className="group-header">
        <td colSpan={4}>{grp.grp}</td>
      </tr>
    )
    grp.items.forEach((item, ii) => {
      const key = `${gi}-${ii}`
      const qty = parseFloat(scope.misc[key]) || 0
      const rate = item.laborMult ? item.laborMult * lr : (item.price || 0)
      const total = rate * qty
      const rateLabel = item.laborMult
        ? `×${item.laborMult} labor ($${(item.laborMult * lr).toFixed(2)})/${item.unit}`
        : `$${item.price}/${item.unit}`

      rows.push(
        <tr key={key}>
          <td className="item-label">{item.name}</td>
          <td>
            <input type="number" className="cell-input" placeholder="0" min={0}
              value={scope.misc[key] || ''}
              onChange={e => update(key, e.target.value)} />
          </td>
          <td className="rate-cell">{rateLabel}</td>
          <td className="calc-cell">{total > 0 ? fmt(total) : '—'}</td>
        </tr>
      )
    })
  })

  return (
    <Section title="📦 Misc. Products & Services" open={open} onToggle={() => setOpen(o => !o)}>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: '50%' }}>Item</th>
            <th style={{ width: 90 }}>Qty / SF / LF</th>
            <th style={{ width: 160 }}>Unit Rate</th>
            <th style={{ width: 110 }}>Total $</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </Section>
  )
}
