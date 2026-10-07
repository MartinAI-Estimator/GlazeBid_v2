/**
 * useBidRecap.js — the one hook that turns the project into priced numbers.
 *
 * Everything money-related on a recap screen comes from here, so there is a
 * single answer to "what is this bid?" instead of the four different waterfalls
 * the Builder used to carry (GlazeBidWorkspace's right rail, BidCart's
 * fallbacks, BidSummaryDashboard's aggregation, ReviewBidPage's per-scope
 * calculatePricing).
 *
 *   stores -> bidAdapter -> bidCostEngine -> this hook's return value
 *
 * The hook's only job is store wiring and man-hours. All arithmetic lives in
 * `bidCostEngine.js`; all shape translation lives in `bidAdapter.js`. Both are
 * pure and tested, which is the point of keeping this file thin.
 */

import { useMemo } from 'react';
import useBidStore from '../store/useBidStore';
import useProductionRatesStore from '../store/useProductionRatesStore';
import { calcSystemMH } from '../utils/laborCalcEngine';
import { bidFromProject } from '../engine/bidAdapter';
import { computeBid } from '../engine/bidCostEngine';

/**
 * Man-hours for one workspace system, the same way GlazeBidWorkspace does it:
 * frames go through the labor engine live; a system with no frame cards (a
 * Studio type-library scope, or one already persisted) uses its stored totals.
 *
 * Exported so a test can assert the fall-through without mounting React.
 */
export function makeMhFor(rateStore) {
  const { getHourlyFunctions, getItemRates, beadsOfCaulk } = rateStore;
  return (sys) => {
    const stored = sys.totals || {};
    if (!sys.frames?.length) {
      return {
        shopMH: Number(stored.shopMHs) || 0,
        distMH: Number(stored.distMHs) || 0,
        fieldMH: Number(stored.fieldMHs) || 0,
        caulkLF: Number(stored.caulkLF) || 0,
      };
    }
    const sysType = sys.systemType || sys.name;
    const hf = sys.rateOverrides?.hourlyFunctions || getHourlyFunctions(sysType);
    const ir = sys.rateOverrides?.itemRates || getItemRates(sysType);
    const mh = calcSystemMH(sys.frames, hf, ir, beadsOfCaulk ?? 2, sysType);
    return {
      shopMH: mh.shopMH || 0,
      distMH: mh.distributionMH || 0,
      fieldMH: mh.fieldMH || 0,
      caulkLF: (mh.frameResults || []).reduce((s, r) => s + (r.counts?.caulkLF || 0), 0),
    };
  };
}

/**
 * Price the whole project.
 *
 * @param {{ bidSettings?: object, company?: object }} opts
 * @returns {{ result: object, bid: object, systems: object[], frames: object[] }}
 *   `result` is the full `computeBid()` output: per-scope detail, base and
 *   alternate rollups, cost codes, the shop-drawing allocation, the bond and
 *   every flagged line.
 */
export default function useBidRecap({ bidSettings, company } = {}) {
  const systems = useBidStore((s) => s.workspaceSystems);
  const frames = useBidStore((s) => s.frames);

  // subscribe to the rate tables themselves, not just the getters, so an admin
  // rate change re-prices the recap
  const getHourlyFunctions = useProductionRatesStore((s) => s.getHourlyFunctions);
  const getItemRates = useProductionRatesStore((s) => s.getItemRates);
  const beadsOfCaulk = useProductionRatesStore((s) => s.beadsOfCaulk ?? 2);
  const hfByType = useProductionRatesStore((s) => s.hourlyFunctionsByType);
  const irByType = useProductionRatesStore((s) => s.itemRatesByType);

  const mhFor = useMemo(
    () => makeMhFor({ getHourlyFunctions, getItemRates, beadsOfCaulk }),
    // hfByType / irByType are in the deps on purpose: they are what actually
    // changes when an admin edits a rate, while the getters are stable Zustand
    // references that would never re-trigger on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getHourlyFunctions, getItemRates, beadsOfCaulk, hfByType, irByType],
  );

  const bid = useMemo(
    () => bidFromProject({ systems, frames, bidSettings, company, mhFor, beadsOfCaulk }),
    [systems, frames, bidSettings, company, mhFor, beadsOfCaulk],
  );

  const result = useMemo(() => computeBid(bid), [bid]);

  return { result, bid, systems, frames };
}
