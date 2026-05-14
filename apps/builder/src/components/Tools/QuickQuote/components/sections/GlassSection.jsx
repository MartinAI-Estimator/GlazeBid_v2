import React, { useState, useMemo } from 'react'
import { Section } from './FramingSection'
import { useQuote } from '../../context/QuoteContext'
import { fmt } from '../../utils/calculations'

export default function GlassSection({ scopeIndex }) {
  const { scopes, updateScope, resolvedGlass, resolvedSurcharge } = useQuote()
  const groupedOpts = useMemo(() => {
    const groups = []
    let cur = null
    resolvedGlass.forEach((g, idx) => {
      if (g.grp) { cur = { label: g.grp, options: [] }; groups.push(cur) }
      if (!cur) { cur = { label: '', options: [] }; groups.push(cur) }
      const eff = g.noSurcharge ? g.price : g.price * resolvedSurcharge
      cur.options.push({ idx, label: `${g.name}  —  $${eff.toFixed(2)}/SF`, price: eff })
    })
    return groups
  }, [resolvedGlass, resolvedSurcharge])
  const [open, setOpen] = useState(true)
  const rows = scopes[scopeIndex].glass

  function update(rowIdx, field, val) {
    updateScope(scopeIndex, s => {
      const glass = [...s.glass]
      glass[rowIdx] = { ...glass[rowIdx], [field]: val }
      return { ...s, glass }
    })
  }

  return (
    <Section title="🪟 Glass Menu" open={open} onToggle={() => setOpen(o => !o)}>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: '55%' }}>Glass Make-Up (Surcharge ×{SURCHARGE.toFixed(4)} applied)</th>
            <th style={{ width: 80 }}>Sq. Ft.</th>
            <th style={{ width: 90 }}>$/SF (eff.)</th>
            <th style={{ width: 110 }}>Total $</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const selOpt = row.typeIdx !== '' ? groupedOpts.flatMap(g => g.options).find(o => o.idx === parseInt(row.typeIdx)) : null
            const price  = selOpt?.price || 0
            const sf     = parseFloat(row.sf) || 0
            const total  = price * sf
            return (
              <tr key={ri}>
                <td>
                  <select
                    className="cell-select"
                    value={row.typeIdx}
                    onChange={e => update(ri, 'typeIdx', e.target.value)}
                  >
                    <option value="">— Select Glass Type —</option>
                    {groupedOpts.map((grp, gi) => (
                      <optgroup key={gi} label={grp.label || ' '}>
                        {grp.options.map(opt => (
                          <option key={opt.idx} value={opt.idx}>{opt.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" className="cell-input" placeholder="0" min={0}
                    value={row.sf || ''} onChange={e => update(ri, 'sf', e.target.value)} />
                </td>
                <td className="rate-cell">{selOpt ? `$${price.toFixed(2)}` : '—'}</td>
                <td className="calc-cell">{total > 0 ? fmt(total) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}
