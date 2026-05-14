import React, { useState } from 'react'
import { useQuote } from '../../context/QuoteContext'
import { fmt } from '../../utils/calculations'

export default function FramingSection({ scopeIndex }) {
  const { scopes, updateScope, resolvedFraming } = useQuote()
  const [open, setOpen] = useState(true)
  const scope = scopes[scopeIndex]

  function update(id, field, val) {
    updateScope(scopeIndex, s => ({
      ...s,
      framing: {
        ...s.framing,
        [id]: { ...(s.framing[id] || {}), [field]: val }
      }
    }))
  }

  // Display calc — framing rates are $/SF (not × labor rate)
  function calcRow(f) {
    const s        = scope.framing[f.id] || {}
    const sf       = parseFloat(s.sf)       || 0
    const caulkLF  = parseFloat(s.caulkLF)  || 0
    const joints   = parseFloat(s.joints)   || f.joints
    const tiebacks = f.tieback ? (parseFloat(s.tiebacks) || 0) : 0
    const fieldRate = (f.field3 && joints >= 3) ? f.field3 : f.field

    return {
      matCost:  sf * f.mat + caulkLF * f.caulk * joints + tiebacks * (f.tieback || 0),
      shopCost: sf * f.shop,   // $/SF — already dollars
      distCost: sf * f.dist,   // $/SF — already dollars
      fieldCost: sf * fieldRate, // $/SF — already dollars
      tbCost:   tiebacks * (f.tieback || 0),
    }
  }

  let lastGrp = ''
  const rows = []

  for (const f of resolvedFraming) {
    if (f.grp && f.grp !== lastGrp) {
      rows.push(
        <tr key={`grp-${f.grp}`} className="group-header">
          <td colSpan={7}>{f.grp}</td>
        </tr>
      )
      lastGrp = f.grp
    }

    const s = scope.framing[f.id] || {}
    const c = calcRow(f)
    const active = (parseFloat(s.sf) || 0) > 0 || (parseFloat(s.caulkLF) || 0) > 0

    rows.push(
      <React.Fragment key={f.id}>
        {/* Material row */}
        <tr>
          <td className="item-label">{f.name}</td>
          <td>
            <input
              type="number" className="cell-input" placeholder="0" min={0}
              value={s.sf || ''}
              onChange={e => update(f.id, 'sf', e.target.value)}
            />
          </td>
          <td className="rate-cell">${f.mat}/SF</td>
          <td className="calc-cell">{active ? fmt(c.matCost) : '—'}</td>
          <td>
            <input
              type="number" className="cell-input sm" placeholder="0" min={0}
              value={s.caulkLF || ''}
              onChange={e => update(f.id, 'caulkLF', e.target.value)}
            />
          </td>
          <td className="rate-cell">${f.caulk}/LF ×</td>
          <td>
            <input
              type="number" className="cell-input xs" min={1} max={4}
              value={s.joints ?? f.joints}
              onChange={e => update(f.id, 'joints', e.target.value)}
            />
          </td>
        </tr>

        {/* Labor row */}
        <tr className="labor-sub-row">
          <td className="item-label sub">
            ↳ Shop ${f.shop} / Dist ${f.dist} / Field ${f.field}{f.field3 ? `(${f.field3} @ 3jts)` : ''} per SF
          </td>
          <td className="calc-cell">{active ? fmt(c.shopCost) : '—'}</td>
          <td className="calc-cell">{active ? fmt(c.distCost) : '—'}</td>
          <td className="calc-cell">{active ? fmt(c.fieldCost) : '—'}</td>

          {f.tieback ? (
            <>
              <td className="item-label sub">Tiebacks (Ea.)</td>
              <td>
                <input
                  type="number" className="cell-input xs" placeholder="0" min={0}
                  value={s.tiebacks || ''}
                  onChange={e => update(f.id, 'tiebacks', e.target.value)}
                />
              </td>
              <td className="calc-cell">
                {(parseFloat(s.tiebacks) || 0) > 0 ? fmt(c.tbCost) : '—'}
              </td>
            </>
          ) : (
            <td colSpan={3} />
          )}
        </tr>
      </React.Fragment>
    )
  }

  return (
    <Section title="🏗 Framing System" open={open} onToggle={() => setOpen(o => !o)}>
      <table className="sheet-table">
        <thead>
          <tr>
            <th style={{ width: '34%' }}>Frame System</th>
            <th style={{ width: 80 }}>Sq. Ft.</th>
            <th style={{ width: 80 }}>Mat $/SF</th>
            <th style={{ width: 100 }}>Mat Total</th>
            <th style={{ width: 80 }}>Caulk LF</th>
            <th style={{ width: 80 }}>$/LF × Jts</th>
            <th style={{ width: 55 }}>Joints</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </Section>
  )
}

// ── Shared Section wrapper ─────────────────
export function Section({ title, open, onToggle, children }) {
  return (
    <div className="section">
      <div
        className={`section-header ${open ? '' : 'collapsed'}`}
        onClick={onToggle}
      >
        <span className="section-title">{title}</span>
        <span className="section-toggle">▼</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}
