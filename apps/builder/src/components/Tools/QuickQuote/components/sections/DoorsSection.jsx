import React, { useState } from 'react'
import { Section } from './FramingSection'
import { useQuote } from '../../context/QuoteContext'
import { fmt } from '../../utils/calculations'

export default function DoorsSection({ scopeIndex }) {
  const { scopes, updateScope, project, resolvedDoors, resolvedAgDoors } = useQuote()
  const DOOR_TYPES = resolvedDoors
  const AG_DOOR_TYPES = resolvedAgDoors
  const [open, setOpen] = useState(true)
  const scope = scopes[scopeIndex]

  function updateDoor(rowIdx, field, val) {
    updateScope(scopeIndex, s => {
      const doors = [...s.doors]; doors[rowIdx] = { ...doors[rowIdx], [field]: val }
      return { ...s, doors }
    })
  }

  function updateAG(rowIdx, field, val) {
    updateScope(scopeIndex, s => {
      const agDoors = [...s.agDoors]; agDoors[rowIdx] = { ...agDoors[rowIdx], [field]: val }
      return { ...s, agDoors }
    })
  }

  // Build optgroup options for S&R doors
  const srGroups = []
  let cur = null
  DOOR_TYPES.forEach((d, idx) => {
    if (d.grp) { cur = { label: d.grp, opts: [] }; srGroups.push(cur) }
    if (!cur) { cur = { label: '', opts: [] }; srGroups.push(cur) }
    cur.opts.push({ idx, label: `${d.name}${d.price > 0 ? '  —  $' + d.price.toLocaleString() : ''}`, price: d.price })
  })

  return (
    <Section title="🚪 Entrances & Doors" open={open} onToggle={() => setOpen(o => !o)}>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: '55%' }}>Door Type</th>
            <th style={{ width: 60 }}>Qty.</th>
            <th style={{ width: 100 }}>$ Each</th>
            <th style={{ width: 110 }}>Total $</th>
          </tr>
        </thead>
        <tbody>
          <tr className="group-header"><td colSpan={4}>Stile & Rail Doors w/ Frame</td></tr>
          {scope.doors.map((row, ri) => {
            const d     = row.typeIdx !== '' ? DOOR_TYPES[parseInt(row.typeIdx)] : null
            const qty   = parseFloat(row.qty) || 0
            const total = d ? d.price * qty : 0
            return (
              <tr key={ri}>
                <td>
                  <select className="cell-select" value={row.typeIdx} onChange={e => updateDoor(ri, 'typeIdx', e.target.value)}>
                    <option value="">— Select Door Type —</option>
                    {srGroups.map((g, gi) => (
                      <optgroup key={gi} label={g.label || ' '}>
                        {g.opts.map(o => <option key={o.idx} value={o.idx}>{o.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td><input type="number" className="cell-input xs" placeholder="0" min={0} value={row.qty || ''} onChange={e => updateDoor(ri, 'qty', e.target.value)} /></td>
                <td className="rate-cell">{d ? '$' + d.price.toLocaleString() : '—'}</td>
                <td className="calc-cell">{total > 0 ? fmt(total) : '—'}</td>
              </tr>
            )
          })}
          <tr className="group-header"><td colSpan={4}>All Glass Doors</td></tr>
          {scope.agDoors.map((row, ri) => {
            const d     = row.typeIdx !== '' ? AG_DOOR_TYPES[parseInt(row.typeIdx)] : null
            const qty   = parseFloat(row.qty) || 0
            const total = d ? d.price * qty : 0
            return (
              <tr key={ri}>
                <td>
                  <select className="cell-select" value={row.typeIdx} onChange={e => updateAG(ri, 'typeIdx', e.target.value)}>
                    <option value="">— Select AG Door Type —</option>
                    {AG_DOOR_TYPES.map((d, idx) => <option key={idx} value={idx}>{d.name}  —  ${d.price.toLocaleString()}</option>)}
                  </select>
                </td>
                <td><input type="number" className="cell-input xs" placeholder="0" min={0} value={row.qty || ''} onChange={e => updateAG(ri, 'qty', e.target.value)} /></td>
                <td className="rate-cell">{d ? '$' + d.price.toLocaleString() : '—'}</td>
                <td className="calc-cell">{total > 0 ? fmt(total) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}
