/**
 * useProductionRatesStore — Hourly Function & Item Rates (Zustand)
 *
 * Mirrors the Bid Sheet Excel's rate structure for ALL system types:
 *
 * Storefront (Ext SF, Int SF):
 *   Hourly Functions: Bays/>Bays (Assemble/Clips/Set), DLOs/>DLOs (Prep/Set), Doors (Dist/Install)
 *   Item Rates: Joints, Dist, Subsills, Caulk, SSG, Steel, Vents, Brake, Open
 *
 * Curtain Wall (Cap CW, SSG CW):
 *   Hourly Functions: Verticals/Horizontals (Assemble/Install), DLOs/>DLOs (Prep/Set), Doors (Dist/Install)
 *   Item Rates: Joints, Dist, Stool Trim, F/T, Caulk, SSG, Steel, Vents, Brake, WL/DL
 *
 * ALL rates default to 0.  Persisted to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  EMPTY_HF_SF, EMPTY_IR_SF,
  EMPTY_HF_CW, EMPTY_IR_CW,
  getSystemTypeConfig,
  getSystemCategory,
} from '../utils/systemTypeConfig.js';

// Keep backward-compat exports — these are the SF defaults
const EMPTY_HOURLY_FUNCTIONS = EMPTY_HF_SF;
const EMPTY_ITEM_RATES = EMPTY_IR_SF;

const useProductionRatesStore = create(
  persist(
    (set, get) => ({
      // ── Global Settings ──
      laborRate:    0,   // $/hr — set by user in Settings
      beadsOfCaulk: 2,   // caulk perimeter multiplier — matches Excel default (C2=2)

      // ── Hourly Function Rates (per system type) ──
      // Key = system type label (e.g. 'Ext SF 1', 'Int SF', 'Cap CW')
      // Value = hourly function rate table
      hourlyFunctionsByType: {},

      // ── Item Rates (per system type) ──
      itemRatesByType: {},

      // ── Actions ──

      setLaborRate: (rate) => set({ laborRate: Number(rate) || 0 }),
      setBeadsOfCaulk: (val) => set({ beadsOfCaulk: Number(val) || 0 }),

      /** Get hourly functions for a system type.
       * Priority: per-type explicit → company HF defaults (Settings) → Excel defaults
       */
      getHourlyFunctions: (systemType) => {
        const key = systemType || 'default';
        // 1. Explicitly saved for this type (Settings Save / setAllRatesForType)
        const existing = get().hourlyFunctionsByType[key];
        if (existing) return existing;
        // 2. Company HF sub-rate defaults (from the Settings breakdown table)
        const cat = getSystemCategory(key);
        const companyHF = cat === 'curtainwall' ? get().defaultHFRatesCW : get().defaultHFRatesSF;
        if (companyHF && Object.keys(companyHF).length > 0) return companyHF;
        // 3. Excel Bid Sheet defaults (sourced from Warren Bid Sheet.xlsm)
        return getSystemTypeConfig(key).excelDefaultHF;
      },

      /** Get item rates for a system type.
       * Priority: per-type explicit → company IR defaults (Settings) → Excel defaults
       */
      getItemRates: (systemType) => {
        const key = systemType || 'default';
        // 1. Explicitly saved for this type
        const existing = get().itemRatesByType[key];
        if (existing) return existing;
        // 2. Company IR defaults — coerce blank strings to 0
        const cat = getSystemCategory(key);
        const companyIR = cat === 'curtainwall' ? get().defaultRatesCW : get().defaultRatesSF;
        if (companyIR && Object.keys(companyIR).length > 0) {
          return Object.fromEntries(
            Object.entries(companyIR).map(([k, v]) => [k, typeof v === 'number' ? v : 0])
          );
        }
        // 3. Excel Bid Sheet defaults (sourced from Warren Bid Sheet.xlsm)
        return getSystemTypeConfig(key).excelDefaultIR;
      },

      /** Update a single hourly function rate */
      setHourlyFunctionRate: (systemType, fnName, field, value) => {
        const key = systemType || 'default';
        set((state) => {
          const existing = state.hourlyFunctionsByType[key] || { ...EMPTY_HOURLY_FUNCTIONS };
          const fn = existing[fnName] || {};
          return {
            hourlyFunctionsByType: {
              ...state.hourlyFunctionsByType,
              [key]: {
                ...existing,
                [fnName]: { ...fn, [field]: Number(value) || 0 },
              },
            },
          };
        });
      },

      /** Update a single item rate */
      setItemRate: (systemType, item, value) => {
        const key = systemType || 'default';
        set((state) => {
          const existing = state.itemRatesByType[key] || { ...EMPTY_ITEM_RATES };
          return {
            itemRatesByType: {
              ...state.itemRatesByType,
              [key]: { ...existing, [item]: Number(value) || 0 },
            },
          };
        });
      },

      /** Bulk-set all rates for a system type (for import or reset) */
      setAllRatesForType: (systemType, { hourlyFunctions, itemRates }) => {
        const key = systemType || 'default';
        const cfg = getSystemTypeConfig(key);
        set((state) => ({
          hourlyFunctionsByType: {
            ...state.hourlyFunctionsByType,
            [key]: hourlyFunctions || { ...cfg.emptyHF },
          },
          itemRatesByType: {
            ...state.itemRatesByType,
            [key]: itemRates || { ...cfg.emptyIR },
          },
        }));
      },

      /** Reset all rates for a system type to zeros */
      resetRatesForType: (systemType) => {
        const key = systemType || 'default';
        const cfg = getSystemTypeConfig(key);
        set((state) => ({
          hourlyFunctionsByType: {
            ...state.hourlyFunctionsByType,
            [key]: { ...cfg.emptyHF },
          },
          itemRatesByType: {
            ...state.itemRatesByType,
            [key]: { ...cfg.emptyIR },
          },
        }));
      },

      /** Get list of all configured system types */
      getConfiguredTypes: () => {
        const hf = Object.keys(get().hourlyFunctionsByType);
        const ir = Object.keys(get().itemRatesByType);
        return [...new Set([...hf, ...ir])];
      },

      // ── Company-wide default Hr Function rates ────────────────────────────
      // Stored as flat {colKey: value} maps keyed by system category.
      // Blank by default — the estimator fills these in once in Settings.
      // Keys match CALC_COLS_SF / CALC_COLS_CW keys so the BidSheet
      // can seed new system types from these on first open.
      defaultRatesSF: {}, // e.g. { joints: 0.25, dist: 0.33, subsills: 1.00, ... }
      defaultRatesCW: {}, // e.g. { joints: 0.50, dist: 0.25, stoolTrim: 1.00, ... }

      setDefaultRatesSF: (rates) => set({ defaultRatesSF: { ...rates } }),
      setDefaultRatesCW: (rates) => set({ defaultRatesCW: { ...rates } }),

      // Granular HF sub-rate defaults (from the HF breakdown table in Settings)
      defaultHFRatesSF: {},
      defaultHFRatesCW: {},
      setDefaultHFRatesSF: (hf) => set({ defaultHFRatesSF: JSON.parse(JSON.stringify(hf)) }),
      setDefaultHFRatesCW: (hf) => set({ defaultHFRatesCW: JSON.parse(JSON.stringify(hf)) }),

      // ── User-defined extra Hr Function columns added in Settings ────────
      // Each entry: { key: 'c_1234', label: 'My Rate' }
      // Persisted so system cards always see the same set of custom cols.
      customColsSF: [],
      customColsCW: [],
      setCustomColsSF: (cols) => set({ customColsSF: [...cols] }),
      setCustomColsCW: (cols) => set({ customColsCW: [...cols] }),

      /** Hard-reset all per-type rate tables to empty.
       * Call this when stale persisted data produces wrong Calc Table numbers.
       */
      clearAllTypeRates: () => set({ hourlyFunctionsByType: {}, itemRatesByType: {} }),
    }),
    {
      name: 'glazebid-production-rates',
      version: 2,
      migrate: (persisted, fromVersion) => {
        // v0 → v1: clear per-type rate tables that may contain stale test data.
        if (fromVersion < 1) {
          return {
            ...persisted,
            hourlyFunctionsByType: {},
            itemRatesByType: {},
          };
        }
        // v1 → v2: clear flat defaultRates* that may contain corrupted count values.
        // Rates are re-entered by the estimator in Settings → Labor Defaults.
        // Also seed beadsOfCaulk=2 (Excel standard) if it was the default 0.
        if (fromVersion < 2) {
          return {
            ...persisted,
            hourlyFunctionsByType: {},
            itemRatesByType: {},
            defaultRatesSF: {},
            defaultRatesCW: {},
            defaultHFRatesSF: {},
            defaultHFRatesCW: {},
            beadsOfCaulk: (persisted.beadsOfCaulk > 0) ? persisted.beadsOfCaulk : 2,
          };
        }
        return persisted;
      },
      partialize: (state) => ({
        laborRate:              state.laborRate,
        beadsOfCaulk:           state.beadsOfCaulk,
        hourlyFunctionsByType:  state.hourlyFunctionsByType,
        itemRatesByType:        state.itemRatesByType,
        defaultRatesSF:         state.defaultRatesSF,
        defaultRatesCW:         state.defaultRatesCW,
        defaultHFRatesSF:       state.defaultHFRatesSF,
        defaultHFRatesCW:       state.defaultHFRatesCW,
        customColsSF:           state.customColsSF,
        customColsCW:           state.customColsCW,
      }),
    }
  )
);

export default useProductionRatesStore;
export { EMPTY_HOURLY_FUNCTIONS, EMPTY_ITEM_RATES };
