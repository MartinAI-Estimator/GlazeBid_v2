import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { calcScopeTotals } from '../utils/calculations'
import { FRAMING_TYPES } from '../data/framing'
import { GLASS_TYPES, SURCHARGE as DEFAULT_SURCHARGE } from '../data/glass'
import { DOOR_TYPES, AG_DOOR_TYPES } from '../data/doors'
import { MISC_GROUPS } from '../data/misc'
import { LABOR_GROUPS } from '../data/labor'
import { supabase } from '../supabaseClient'

export const DEFAULT_SHEET_NAMES = Array.from({ length: 12 }, (_, i) => `Blank ${i + 1}`)

// ── Rate resolution helpers ────────────────────────────────────────────────
// Framing: overrides keyed by qq_fr_{id}_{field}
function resolveFraming(overrides) {
  return FRAMING_TYPES.map(f => ({
    ...f,
    mat:     overrides[`qq_fr_${f.id}_mat`]     ?? f.mat,
    field:   overrides[`qq_fr_${f.id}_field`]   ?? f.field,
    field3:  overrides[`qq_fr_${f.id}_field3`]  ?? f.field3,
    shop:    overrides[`qq_fr_${f.id}_shop`]     ?? f.shop,
    dist:    overrides[`qq_fr_${f.id}_dist`]     ?? f.dist,
    caulk:   overrides[`qq_fr_${f.id}_caulk`]   ?? f.caulk,
    tieback: overrides[`qq_fr_${f.id}_tieback`]  ?? f.tieback,
  }))
}
// Glass: overrides keyed by qq_gl_{index}
function resolveGlass(overrides) {
  return GLASS_TYPES.map((g, i) => ({
    ...g,
    price: overrides[`qq_gl_${i}`] ?? g.price,
  }))
}
// Doors: price qq_dr_{i}_p, laborMultiplier qq_dr_{i}_lm
function resolveDoors(overrides) {
  return DOOR_TYPES.map((d, i) => ({
    ...d,
    price:           overrides[`qq_dr_${i}_p`]  ?? d.price,
    laborMultiplier: overrides[`qq_dr_${i}_lm`] ?? d.laborMultiplier,
  }))
}
// AG Doors: price qq_ag_{i}_p, labor qq_ag_{i}_l
function resolveAgDoors(overrides) {
  return AG_DOOR_TYPES.map((d, i) => ({
    ...d,
    price: overrides[`qq_ag_${i}_p`] ?? d.price,
    labor: overrides[`qq_ag_${i}_l`] ?? d.labor,
  }))
}

const QuoteContext = createContext(null)

const makeBlankScope = () => ({
  framing: {},    // { [framingId]: { sf: 0, caulkLF: 0, joints: 2, tiebacks: 0 } }
  glass: Array(8).fill(null).map(() => ({ typeIdx: '', sf: 0 })),
  doors: Array(6).fill(null).map(() => ({ typeIdx: '', qty: 0 })),
  agDoors: Array(4).fill(null).map(() => ({ typeIdx: '', qty: 0 })),
  misc: {},       // { [grpIdx-itemIdx]: qty }
  labor: {},      // { [grpIdx-itemIdx]: qty }
  crewSize: 4,
  sqft: '',
})

export function QuoteProvider({ children }) {
  const [project, setProject] = useState({
    name: '', client: '', branch: '',
    date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    markup: 35, laborRate: 45, tax: 7,
    revisions: [{ note: '', date: '' }, { note: '', date: '' }, { note: '', date: '' }]
  })

  const [scopes, setScopes] = useState(
    Array(12).fill(null).map(makeBlankScope)
  )

  const [sheetNames, setSheetNames] = useState([...DEFAULT_SHEET_NAMES])

  // ── Live rate overrides from Supabase ──────────────────────────────────────
  const [rateOverrides, setRateOverrides] = useState({})
  useEffect(() => {
    if (!supabase) return
    supabase
      .from('pricing_config')
      .select('key, value')
      .like('key', 'qq_%')
      .then(({ data }) => {
        if (!data?.length) return
        const map = {}
        data.forEach(r => { map[r.key] = Number(r.value) })
        setRateOverrides(map)
      })
  }, [])

  // Resolved rate arrays (memoized off overrides)
  const resolvedFraming  = useMemo(() => resolveFraming(rateOverrides),  [rateOverrides])
  const resolvedGlass    = useMemo(() => resolveGlass(rateOverrides),    [rateOverrides])
  const resolvedDoors    = useMemo(() => resolveDoors(rateOverrides),    [rateOverrides])
  const resolvedAgDoors  = useMemo(() => resolveAgDoors(rateOverrides),  [rateOverrides])
  const resolvedSurcharge = rateOverrides['qq_surcharge'] ?? DEFAULT_SURCHARGE

  const updateSheetName = useCallback((i, name) => {
    setSheetNames(prev => {
      const next = [...prev]
      next[i] = name || DEFAULT_SHEET_NAMES[i]
      return next
    })
  }, [])

  const updateProject = useCallback((field, value) => {
    setProject(p => ({ ...p, [field]: value }))
  }, [])

  const updateScope = useCallback((scopeIndex, updater) => {
    setScopes(prev => {
      const next = [...prev]
      next[scopeIndex] = typeof updater === 'function'
        ? updater(prev[scopeIndex])
        : { ...prev[scopeIndex], ...updater }
      return next
    })
  }, [])

  // Compute totals for each scope
  const rates = { framing: resolvedFraming, glass: resolvedGlass, surcharge: resolvedSurcharge, doors: resolvedDoors, agDoors: resolvedAgDoors }
  const scopeTotals = scopes.map(scope =>
    calcScopeTotals(scope, project.markup, project.laborRate, project.tax, rates)
  )

  const projectTotal = scopeTotals.reduce((acc, t) => ({
    totalMat:  acc.totalMat  + t.totalMat,
    totalLab:  acc.totalLab  + t.totalLab,
    shopDraw:  acc.shopDraw  + t.shopDraw,
    matCont:   acc.matCont   + t.matCont,
    labCont:   acc.labCont   + t.labCont,
    mu:        acc.mu        + t.mu,
    tax:       acc.tax       + t.tax,
    total:     acc.total     + t.total,
  }), { totalMat: 0, totalLab: 0, shopDraw: 0, matCont: 0, labCont: 0, mu: 0, tax: 0, total: 0 })

  return (
    <QuoteContext.Provider value={{
      project, updateProject,
      scopes, updateScope,
      scopeTotals, projectTotal,
      sheetNames, updateSheetName,
      resolvedFraming, resolvedGlass, resolvedSurcharge,
      resolvedDoors, resolvedAgDoors,
      MISC_GROUPS, LABOR_GROUPS,
    }}>
      {children}
    </QuoteContext.Provider>
  )
}

export function useQuote() {
  const ctx = useContext(QuoteContext)
  if (!ctx) throw new Error('useQuote must be used inside QuoteProvider')
  return ctx
}
