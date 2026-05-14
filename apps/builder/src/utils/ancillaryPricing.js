/**
 * ancillaryPricing.js
 *
 * Ancillary auto-pricing for Bid Builder.
 *
 * Rules:
 * - Subsills (storefront only) include one automatic base action per frame unit
 * - Subsills/Receptors user inputs represent additional 10-ft actions
 * - Receptors start at 0 (no automatic base action)
 * - Waste factor applies to total LF before cost
 */

import { getSystemCategory } from './systemTypeConfig';

const ACTION_COVERAGE_LF = 10;

export const DEFAULT_ANCILLARY_CONFIG = {
  enableSubsills: true,
  enableReceptors: false,
  subsillRatePerLF: 0,
  receptorRatePerLF: 0,
  wastePct: 10,
};

export function normalizeAncillaryConfig(cfg = {}) {
  return {
    enableSubsills: cfg.enableSubsills ?? DEFAULT_ANCILLARY_CONFIG.enableSubsills,
    enableReceptors: cfg.enableReceptors ?? DEFAULT_ANCILLARY_CONFIG.enableReceptors,
    subsillRatePerLF: Number(cfg.subsillRatePerLF ?? DEFAULT_ANCILLARY_CONFIG.subsillRatePerLF) || 0,
    receptorRatePerLF: Number(cfg.receptorRatePerLF ?? DEFAULT_ANCILLARY_CONFIG.receptorRatePerLF) || 0,
    wastePct: Number(cfg.wastePct ?? DEFAULT_ANCILLARY_CONFIG.wastePct) || 0,
  };
}

export function calcFrameAncillary(frame = {}, config = DEFAULT_ANCILLARY_CONFIG, options = {}) {
  const cfg = normalizeAncillaryConfig(config);
  const qty = Math.max(1, Number(frame.quantity) || 1);
  const systemCategory = getSystemCategory(options.systemType || 'Ext SF');
  const isStorefront = systemCategory === 'storefront';

  const subsillExtraActions = Math.max(0, Number(frame.subsills) || 0);
  const receptorActions = Math.max(0, Number(frame.receptors) || 0);

  const baseSubsillActionsPerUnit = isStorefront ? 1 : 0;
  const subsillActions = cfg.enableSubsills ? qty * (baseSubsillActionsPerUnit + subsillExtraActions) : 0;
  const receptorTotalActions = cfg.enableReceptors ? qty * receptorActions : 0;

  const rawSubsillLF = subsillActions * ACTION_COVERAGE_LF;
  const rawReceptorLF = receptorTotalActions * ACTION_COVERAGE_LF;

  const wasteFactor = 1 + (cfg.wastePct / 100);
  const subsillLF = rawSubsillLF * wasteFactor;
  const receptorLF = rawReceptorLF * wasteFactor;

  const subsillCost = subsillLF * cfg.subsillRatePerLF;
  const receptorCost = receptorLF * cfg.receptorRatePerLF;

  return {
    subsillActions: round2(subsillActions),
    receptorActions: round2(receptorTotalActions),
    subsillLF: round2(subsillLF),
    receptorLF: round2(receptorLF),
    subsillCost: round2(subsillCost),
    receptorCost: round2(receptorCost),
    totalCost: round2(subsillCost + receptorCost),
  };
}

export function calcSystemAncillary(frames = [], config = DEFAULT_ANCILLARY_CONFIG, options = {}) {
  return (frames || []).reduce((acc, frame) => {
    const r = calcFrameAncillary(frame, config, options);
    acc.subsillActions += r.subsillActions || 0;
    acc.receptorActions += r.receptorActions || 0;
    acc.subsillLF += r.subsillLF;
    acc.receptorLF += r.receptorLF;
    acc.subsillCost += r.subsillCost;
    acc.receptorCost += r.receptorCost;
    acc.totalCost += r.totalCost;
    return acc;
  }, {
    subsillActions: 0,
    receptorActions: 0,
    subsillLF: 0,
    receptorLF: 0,
    subsillCost: 0,
    receptorCost: 0,
    totalCost: 0,
  });
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
