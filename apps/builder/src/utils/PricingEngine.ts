export type PricingMode = 'legacy-markup' | 'margin';

export interface PricingInput {
  materialCost: number;
  laborCost: number;
  taxPercent: number;
  isTaxExempt?: boolean;
  pricingMode: PricingMode;
  pricingPercent: number;
}

export interface PricingResult {
  materialCost: number;
  laborCost: number;
  preTaxCost: number;
  taxAmount: number;
  totalCost: number;
  pricingAmount: number;
  finalBid: number;
  gpmPct: number;
}

/**
 * Core pricing engine used by Builder summary views.
 *
 * Warren-style margin mode:
 *   totalCost = material + labor + tax(material)
 *   finalBid  = totalCost / (1 - margin)
 *
 * Legacy mode (backward compatibility):
 *   subtotal  = material + labor
 *   tax       = tax(material)
 *   markup    = subtotal * markup
 *   finalBid  = subtotal + tax + markup
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const materialCost = Number(input.materialCost) || 0;
  const laborCost = Number(input.laborCost) || 0;
  const taxPercent = Number(input.taxPercent) || 0;
  const pricingPercent = Number(input.pricingPercent) || 0;
  const isTaxExempt = !!input.isTaxExempt;

  const preTaxCost = materialCost + laborCost;
  const taxAmount = isTaxExempt ? 0 : materialCost * (taxPercent / 100);
  const totalCost = preTaxCost + taxAmount;

  let pricingAmount = 0;
  let finalBid = totalCost;

  if (input.pricingMode === 'margin') {
    const margin = clamp(pricingPercent / 100, 0, 0.99);
    finalBid = margin >= 0.99 ? totalCost : (totalCost / (1 - margin));
    pricingAmount = finalBid - totalCost;
  } else {
    // legacy-markup: preserve prior Builder behavior
    pricingAmount = preTaxCost * (pricingPercent / 100);
    finalBid = preTaxCost + taxAmount + pricingAmount;
  }

  const gpmPct = finalBid > 0 ? (pricingAmount / finalBid) * 100 : 0;

  return {
    materialCost: round2(materialCost),
    laborCost: round2(laborCost),
    preTaxCost: round2(preTaxCost),
    taxAmount: round2(taxAmount),
    totalCost: round2(totalCost),
    pricingAmount: round2(pricingAmount),
    finalBid: round2(finalBid),
    gpmPct: round2(gpmPct),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
