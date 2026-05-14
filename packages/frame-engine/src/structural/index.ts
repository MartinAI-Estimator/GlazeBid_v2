/**
 * @glazebid/frame-engine/structural
 *
 * ASCE 7-22 structural analysis engine for framing systems.
 * Pure TypeScript, no external dependencies.
 *
 * Ports core math from Studio structuralEngine.ts into a reusable module.
 * Implements:
 *   - Kz interpolation (ASCE 7-22 Table 26.10-1)
 *   - Wind pressure calculation (qz formula)
 *   - Mullion deflection check (L/175, L/240, L/60 limits)
 *   - Steel reinforcement recommendations (HSS catalog)
 *   - Decision ladder (PASS → ADD_STEEL → UPGRADE_PROFILE → ENGINEER_REQUIRED)
 */

// ── Constants ────────────────────────────────────────────────────────────────

const E_ALU = 10_100_000; // psi — Aluminum 6063-T5
const E_STL = 29_000_000; // psi — Steel A500

// ── Types ────────────────────────────────────────────────────────────────────

export type ExposureCategory = 'B' | 'C' | 'D';

export type StructuralInput = {
  windSpeedMph: number;
  exposureCategory: ExposureCategory;
  buildingHeightFt: number;
  mullionSpanIn: number;           // Longest unsupported mullion span (frame height)
  tributaryWidthIn: number;        // Tributary width per mullion (bay width)
  profileDepthIn: number;          // System depth (from archetype)
  systemClass: string;             // 'ext-storefront' | 'cap-curtainwall' | 'ssg-cw' etc.
  profileMomentOfInertiaIn4?: number; // Optional override for aluminum Ix
};

export type HSSRecommendation = {
  size: string;                    // e.g. "1.5\"×1.5\"×11ga"
  I: number;                       // moment of inertia (in⁴)
  weight: number;                  // lbs/ft
};

export type StructuralAnalysisResult = {
  status: 'PASS' | 'ADD_STEEL' | 'UPGRADE_PROFILE' | 'ENGINEER_REQUIRED';
  windPressurePsf: number;         // Design pressure (governs for negative)
  qz: number;                      // Velocity pressure
  Kz: number;                      // Height exposure factor
  mullionDeflectionIn: number;     // Calculated deflection (inches)
  deflectionLimitIn: number;       // Allowable limit (inches)
  deflectionRatio: number;         // Ratio (e.g., 175 for L/175)
  steelRec?: HSSRecommendation;    // Recommended HSS if ADD_STEEL
  upgradeNote?: string;            // Message if UPGRADE_PROFILE
  engineerNote?: string;           // Message if ENGINEER_REQUIRED
  noteForShops?: string;           // Summary for shop notes
};

// ── Kz Table (ASCE 7-22 Table 26.10-1) ──────────────────────────────────────

type KzRow = { height: number; B: number; C: number; D: number };

const KZ_TABLE: KzRow[] = [
  { height: 0, B: 0.57, C: 0.85, D: 1.03 },
  { height: 15, B: 0.57, C: 0.85, D: 1.03 },
  { height: 20, B: 0.62, C: 0.9, D: 1.08 },
  { height: 25, B: 0.66, C: 0.94, D: 1.12 },
  { height: 30, B: 0.7, C: 0.98, D: 1.16 },
  { height: 40, B: 0.76, C: 1.04, D: 1.22 },
  { height: 50, B: 0.81, C: 1.09, D: 1.27 },
  { height: 60, B: 0.85, C: 1.13, D: 1.31 },
  { height: 70, B: 0.89, C: 1.17, D: 1.34 },
  { height: 80, B: 0.93, C: 1.21, D: 1.38 },
  { height: 90, B: 0.96, C: 1.24, D: 1.4 },
  { height: 100, B: 0.99, C: 1.26, D: 1.43 },
  { height: 120, B: 1.04, C: 1.31, D: 1.48 },
  { height: 140, B: 1.09, C: 1.36, D: 1.52 },
  { height: 160, B: 1.13, C: 1.39, D: 1.55 },
  { height: 180, B: 1.17, C: 1.43, D: 1.58 },
  { height: 200, B: 1.2, C: 1.46, D: 1.61 },
];

/**
 * Interpolate Kz from ASCE 7-22 Table 26.10-1 based on height and exposure.
 * Linear interpolation between tabulated values.
 */
export function interpolateKz(heightFt: number, exposure: ExposureCategory): number {
  const clamped = Math.max(0, Math.min(heightFt, 200));
  for (let i = 0; i < KZ_TABLE.length - 1; i++) {
    const lo = KZ_TABLE[i];
    const hi = KZ_TABLE[i + 1];
    if (clamped >= lo.height && clamped <= hi.height) {
      const t = (clamped - lo.height) / (hi.height - lo.height);
      return lo[exposure] + t * (hi[exposure] - lo[exposure]);
    }
  }
  return KZ_TABLE[KZ_TABLE.length - 1][exposure];
}

// ── Deflection Limit Helper ──────────────────────────────────────────────────

/**
 * Get deflection limit ratio based on system class.
 * Returns the denominator: 175 for storefront, 240 for curtainwall, 60 for all-glass.
 */
export function getDeflectionLimit(systemClass: string): number {
  if (systemClass.includes('all-glass')) return 60;
  if (systemClass.includes('curtainwall')) return 240;
  return 175; // storefront default
}

// ── HSS Catalog (AISC) ───────────────────────────────────────────────────────

const HSS_CATALOG: HSSRecommendation[] = [
  { size: '1"×1"×11ga', I: 0.022, weight: 1.37 },
  { size: '1.5"×1.5"×11ga', I: 0.083, weight: 2.19 },
  { size: '1.5"×1.5"×3/16"', I: 0.11, weight: 2.78 },
  { size: '2"×2"×11ga', I: 0.218, weight: 3.02 },
  { size: '2"×2"×3/16"', I: 0.291, weight: 3.87 },
  { size: '2"×3"×11ga', I: 0.525, weight: 3.87 },
  { size: '2"×3"×3/16"', I: 0.706, weight: 4.97 },
  { size: '2"×4"×11ga', I: 1.08, weight: 4.72 },
  { size: '2"×4"×3/16"', I: 1.464, weight: 6.07 },
  { size: '3"×3"×3/16"', I: 1.33, weight: 5.91 },
  { size: '3"×4"×3/16"', I: 2.32, weight: 7.09 },
];

// ── Moment of Inertia Lookup for Aluminum Profiles ──────────────────────────

/**
 * Estimate Ix for aluminum extrusion by profile depth.
 * Real values from Kawneer/Tubelite tables — this is a simplified fallback.
 */
function estimateMomentOfInertia(profileDepthIn: number): number {
  // Rough polynomial fit based on typical extrusions
  // I ≈ (depth^4 / 12) × shape_factor, where shape_factor ≈ 0.35 for hollow sections
  const shapeFactored = Math.pow(profileDepthIn, 4) / 12 * 0.35;
  return Math.max(shapeFactored, 0.05); // floor at 0.05 in⁴
}

// ── Core Structural Analysis ─────────────────────────────────────────────────

/**
 * Run full ASCE 7-22 structural analysis.
 *
 * @param input Structural design parameters
 * @returns Full analysis result with decision ladder status
 */
export function analyzeStructural(input: StructuralInput): StructuralAnalysisResult {
  // 1. Calculate wind pressure
  // qz = 0.00256 × Kz × Kzt × Kd × V²
  // Kzt = 1.0 (flat terrain), Kd = 0.85 (components and cladding)
  const Kz = interpolateKz(input.buildingHeightFt, input.exposureCategory);
  const Kzt = 1.0;
  const Kd = 0.85;
  const V = input.windSpeedMph;

  const qz = 0.00256 * Kz * Kzt * Kd * V * V;

  // External pressure coefficients for components (conservative)
  // GCp_pos = +1.0, GCp_neg = -1.4
  const windPressurePsf = qz * 1.4; // negative (suction) governs

  // 2. Calculate mullion deflection
  // w = pressure (psf) × tributary width (in) / 144 → lbs/in
  const wLbsIn = (windPressurePsf * input.tributaryWidthIn) / 144;
  const spanIn = input.mullionSpanIn;

  // Moment of inertia: use override if provided, else estimate
  const Ix = input.profileMomentOfInertiaIn4 ?? estimateMomentOfInertia(input.profileDepthIn);

  // δ = 5wL⁴ / (384EI)
  const deflectionIn = (5 * wLbsIn * Math.pow(spanIn, 4)) / (384 * E_ALU * Ix);

  // 3. Determine deflection limit
  const limitRatio = getDeflectionLimit(input.systemClass);
  const deflectionLimitIn = spanIn / limitRatio;

  // 4. Decision ladder
  let status: StructuralAnalysisResult['status'] = 'PASS';
  let steelRec: HSSRecommendation | undefined;
  let upgradeNote: string | undefined;
  let engineerNote: string | undefined;

  if (deflectionIn <= deflectionLimitIn) {
    // PASS — aluminum alone is sufficient
    status = 'PASS';
  } else if (deflectionIn <= deflectionLimitIn * 1.5) {
    // ADD_STEEL — try to find HSS that brings deflection within limit
    status = 'ADD_STEEL';

    // Required composite Ix: δ_target = deflectionLimitIn
    // δ_target = 5wL⁴ / (384 * E_alu * I_composite)
    // I_composite = 5wL⁴ / (384 * E_alu * δ_target)
    const IxRequired = (5 * wLbsIn * Math.pow(spanIn, 4)) / (384 * E_ALU * deflectionLimitIn);

    // Steel modulus ratio
    const modRatio = E_STL / E_ALU;
    const IxSteelNeeded = (IxRequired - Ix) / modRatio;

    // Find lightest HSS that fits
    for (const hss of HSS_CATALOG) {
      if (hss.I >= IxSteelNeeded) {
        steelRec = hss;
        break;
      }
    }

    if (!steelRec) {
      // No HSS fits — escalate to UPGRADE_PROFILE
      status = 'UPGRADE_PROFILE';
      upgradeNote = 'No standard HSS section fits in this profile. Consider deeper profile.';
    }
  } else if (deflectionIn <= deflectionLimitIn * 2.5) {
    // UPGRADE_PROFILE — deeper profile recommended
    status = 'UPGRADE_PROFILE';
    upgradeNote = `Deflection ${deflectionIn.toFixed(3)}" exceeds 1.5× limit. Deeper profile recommended.`;
  } else {
    // ENGINEER_REQUIRED — exceeds standard tables
    status = 'ENGINEER_REQUIRED';
    engineerNote = `Deflection ${deflectionIn.toFixed(3)}" exceeds standard limits. PE review required.`;
  }

  // 5. Build result
  const noteForShops = buildShopNote(status, steelRec, input.systemClass);

  return {
    status,
    windPressurePsf,
    qz,
    Kz,
    mullionDeflectionIn: deflectionIn,
    deflectionLimitIn,
    deflectionRatio: limitRatio,
    steelRec,
    upgradeNote,
    engineerNote,
    noteForShops,
  };
}

// ── Shop Note Generator ──────────────────────────────────────────────────────

function buildShopNote(
  status: string,
  steelRec: HSSRecommendation | undefined,
  systemClass: string
): string {
  switch (status) {
    case 'PASS':
      return 'Standard aluminum mullion. No structural steel required.';
    case 'ADD_STEEL':
      return steelRec
        ? `Install HSS ${steelRec.size} reinforcement tube centered in mullion cavity. Weight: ${steelRec.weight.toFixed(2)} lbs/ft.`
        : 'Steel reinforcement required (size TBD).';
    case 'UPGRADE_PROFILE':
      return 'Upgrade to next deeper profile. Steel reinforcement may still be required.';
    case 'ENGINEER_REQUIRED':
      return 'Consult structural engineer. Standard systems inadequate for applied loads.';
    default:
      return '';
  }
}
