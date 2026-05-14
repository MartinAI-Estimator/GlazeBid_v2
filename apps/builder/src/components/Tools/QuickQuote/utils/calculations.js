import { FRAMING_TYPES } from '../data/framing'
import { GLASS_TYPES, SURCHARGE } from '../data/glass'
import { DOOR_TYPES, AG_DOOR_TYPES } from '../data/doors'
import { MISC_GROUPS } from '../data/misc'
import { LABOR_GROUPS } from '../data/labor'

export function calcScopeTotals(scope, markupPct, laborRate, taxPct, rates = {}) {
  const markup = (markupPct || 35) / 100
  const tax    = (taxPct   ||  7) / 100
  const lr     = laborRate || 45
  let totalMat = 0
  let totalLab = 0

  const framingList  = rates.framing   || FRAMING_TYPES
  const glassList    = rates.glass     || GLASS_TYPES
  const surcharge    = rates.surcharge ?? SURCHARGE
  const doorList     = rates.doors     || DOOR_TYPES
  const agDoorList   = rates.agDoors   || AG_DOOR_TYPES

  // ── FRAMING ──
  for (const f of framingList) {
    const s = scope.framing[f.id] || {}
    const sf      = parseFloat(s.sf)      || 0
    const caulkLF = parseFloat(s.caulkLF) || 0
    const joints  = parseFloat(s.joints)  || f.joints
    const tiebacks = f.tieback ? (parseFloat(s.tiebacks) || 0) : 0

    const fieldRate = (f.field3 && joints >= 3) ? f.field3 : f.field

    totalMat += sf * f.mat
    totalMat += caulkLF * f.caulk * joints
    totalMat += tiebacks * (f.tieback || 0)
    totalLab += sf * (f.shop + f.dist + fieldRate)
  }

  // ── GLASS ──
  for (const row of scope.glass) {
    if (!row.typeIdx && row.typeIdx !== 0) continue
    const g  = glassList[row.typeIdx]
    if (!g) continue
    const sf = parseFloat(row.sf) || 0
    const effectivePrice = g.noSurcharge ? g.price : g.price * surcharge
    totalMat += effectivePrice * sf
  }

  // ── S&R DOORS ──
  for (const row of scope.doors) {
    if (!row.typeIdx && row.typeIdx !== 0) continue
    const d   = doorList[parseInt(row.typeIdx)]
    if (!d) continue
    const qty = parseFloat(row.qty) || 0
    totalMat += d.price * qty
    const lMult = d.laborMultiplier || 6.5
    totalLab += lMult * lr * qty
  }

  // ── ALL GLASS DOORS ──
  for (const row of scope.agDoors) {
    if (!row.typeIdx && row.typeIdx !== 0) continue
    const d   = agDoorList[parseInt(row.typeIdx)]
    if (!d) continue
    const qty = parseFloat(row.qty) || 0
    totalMat += d.price * qty
    if (d.laborFlat) totalLab += d.labor * qty
    else totalLab += d.labor * lr * qty
  }

  // ── MISC ──
  MISC_GROUPS.forEach((grp, gi) => {
    grp.items.forEach((item, ii) => {
      const qty = parseFloat(scope.misc[`${gi}-${ii}`]) || 0
      if (!qty) return
      const rate = item.laborMult ? item.laborMult * lr : (item.price || 0)
      const line = rate * qty
      if (item.isLabor || item.laborMult) totalLab += line
      else totalMat += line
    })
  })

  // ── LABOR & EQUIPMENT ──
  LABOR_GROUPS.forEach((grp, gi) => {
    grp.items.forEach((item, ii) => {
      const qty = parseFloat(scope.labor[`${gi}-${ii}`]) || 0
      if (!qty) return
      const line = item.rate
        ? item.rate * lr * qty
        : (item.flatPrice || 0) * qty
      if (grp.grp === 'Equipment') totalMat += line
      else totalLab += line
    })
  })

  // ── TOTALS ──
  const shopDraw = totalMat * 0.03
  const matCont  = totalMat * 0.025
  const labCont  = totalLab * 0.05
  const mu       = (totalMat + shopDraw + matCont + totalLab + labCont) * markup
  const taxAmt   = (totalMat + shopDraw + matCont) * tax
  const total    = totalMat + shopDraw + matCont + totalLab + labCont + mu + taxAmt

  // Labor info
  const fieldHrs = lr > 0 ? totalLab / lr : 0

  return { totalMat, totalLab, shopDraw, matCont, labCont, mu, tax: taxAmt, total, fieldHrs }
}

export function fmt(v) {
  if (!v && v !== 0) return '—'
  return '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Like fmt but returns '' for falsy (used in table cells to keep them blank) */
export function fmtNoBlank(v) {
  if (!v) return ''
  return '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
