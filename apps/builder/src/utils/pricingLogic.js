/**
 * Pricing Logic Engine
 * The mathematical brain that calculates system-specific costs
 * Based on Highland Glass Excel sheet logic
 * Layer 23: Advanced Labor Triad & Formula Builder
 */

// ============================================================================
// ENUMS & CONSTANTS (Matching Excel Drop-downs)
// ============================================================================

export const SYSTEM_TYPES = {
  STOREFRONT: 'STOREFRONT',
  CURTAIN_WALL: 'CURTAIN_WALL',
  SSG: 'SSG',
  WINDOW_WALL: 'WINDOW_WALL'
};

// Layer 23: Formula Base Variables
export const FORMULA_BASE_VARS = {
  PERIMETER: 'PERIMETER',      // LF of perimeter
  AREA: 'AREA',                // Square feet
  JOINTS: 'JOINTS',            // Number of joints
  MULLION_LF: 'MULLION_LF',    // Linear feet of internal mullions
  PANELS: 'PANELS'             // Number of panels
};

export const PROFILE_SIZES = {
  '1.75x4.5': { label: '1.75" x 4.5"', metalLbsPerFt: 1.8, code: '1.75x4.5' },
  '2x4.5': { label: '2" x 4.5"', metalLbsPerFt: 2.2, code: '2x4.5' },
  '2x6': { label: '2" x 6"', metalLbsPerFt: 3.1, code: '2x6' },
  '2.5x7.5': { label: '2.5" x 7.5"', metalLbsPerFt: 4.5, code: '2.5x7.5' }
};

export const CONNECTION_TYPES = {
  SCREW_SPLINE: { label: 'Screw Spline (Fast)', laborMultiplier: 1.0, code: 'SCREW_SPLINE' },
  SHEAR_BLOCK: { label: 'Shear Block (Structural)', laborMultiplier: 1.15, laborAdderPerFt: 0.15, code: 'SHEAR_BLOCK' }
};

export const FINISH_TYPES = {
  CLEAR_ANOD: { label: 'Clear Anodized (Class I)', costMultiplier: 1.0, code: 'CLEAR_ANOD' },
  DARK_BRONZE: { label: 'Dark Bronze Anodized', costMultiplier: 1.08, code: 'DARK_BRONZE' },
  BLACK_ANOD: { label: 'Black Anodized', costMultiplier: 1.12, code: 'BLACK_ANOD' },
  PAINT_2_COAT: { label: 'Paint (2-Coat)', costMultiplier: 1.15, code: 'PAINT_2_COAT' },
  PAINT_3_COAT: { label: 'Paint (3-Coat Premium)', costMultiplier: 1.25, code: 'PAINT_3_COAT' }
};

export const DOOR_TYPES = {
  NARROW_STILE: { label: 'Narrow Stile (2")', width: 2, code: 'NARROW_STILE' },
  MEDIUM_STILE: { label: 'Medium Stile (3.5")', width: 3.5, code: 'MEDIUM_STILE' },
  WIDE_STILE: { label: 'Wide Stile (5")', width: 5, code: 'WIDE_STILE' }
};

export const HARDWARE_SETS = {
  PIVOT_DEADBOLT: { label: 'Pivot + Deadbolt', cost: 1200, laborHours: 2.5, code: 'PIVOT_DEADBOLT' },
  PIVOT_PANIC: { label: 'Pivot + Panic Device', cost: 1800, laborHours: 3.0, code: 'PIVOT_PANIC' },
  HINGE_DEADBOLT: { label: 'Butt Hinge + Deadbolt', cost: 900, laborHours: 1.5, code: 'HINGE_DEADBOLT' },
  HINGE_PANIC: { label: 'Butt Hinge + Panic', cost: 1500, laborHours: 2.0, code: 'HINGE_PANIC' },
  EL_PANIC: { label: 'EL Panic (Electrical)', cost: 2500, laborHours: 4.0, code: 'EL_PANIC' }
};

export const SCOPE_TAGS = {
  BASE_BID: { label: 'Base Bid', color: '#238636', code: 'BASE_BID' },
  ALT_1: { label: 'Alternate 1', color: '#1f6feb', code: 'ALT_1' },
  ALT_2: { label: 'Alternate 2', code: 'ALT_2', color: '#8b5cf6' },
  ALT_3: { label: 'Alternate 3', color: '#f59e0b', code: 'ALT_3' },
  ALLOWANCE: { label: 'Allowance', color: '#dc2626', code: 'ALLOWANCE' }
};

// ============================================================================
// BASE PRICING (Per LB/SF/EA - Set in Admin)
// ============================================================================

export const DEFAULT_BASE_PRICES = {
  metalPerLb: 4.50,        // $ per pound of aluminum
  glassPerSF: 12.00,       // $ per SF of glass (basic)
  caulkPerLF: 2.50,        // $ per linear foot of caulk
  anchorPerEA: 8.00,       // $ per anchor
  steelPerLb: 2.75,        // $ per pound of steel reinforcement
  laborPerHour: 65.00      // Blended crew rate (from Crew Builder)
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate Metal Weight for an Item
 * @param {object} item - Estimate item with width/height
 * @param {object} system - System definition with profileSize
 * @returns {number} Total pounds of aluminum
 */
export const calculateMetalWeight = (item, system) => {
  if (!item.width || !item.height || !system.profileSize) return 0;
  
  const perimeterFeet = ((item.width + item.height) * 2) / 12;
  const profileData = PROFILE_SIZES[system.profileSize];
  const lbsPerFt = profileData ? profileData.metalLbsPerFt : 2.2; // Default to 2x4.5
  
  return perimeterFeet * lbsPerFt * (item.qty || 1);
};

/**
 * Calculate Metal Material Cost with Finish Premium
 * @param {number} metalWeight - Pounds of aluminum
 * @param {object} system - System with finish type
 * @param {number} basePrice - $ per lb from admin settings
 * @returns {number} Total metal cost with finish premium
 */
export const calculateMetalCost = (metalWeight, system, basePrice = DEFAULT_BASE_PRICES.metalPerLb) => {
  if (!metalWeight) return 0;
  
  const finishData = FINISH_TYPES[system.finish] || FINISH_TYPES.CLEAR_ANOD;
  const finishMultiplier = finishData.costMultiplier;
  
  return metalWeight * basePrice * finishMultiplier;
};

/**
 * Calculate Assembly Labor Hours with Connection Type Adder
 * @param {object} item - Estimate item
 * @param {object} system - System with connectionType
 * @param {number} baseLaborHours - Base hours from item
 * @returns {number} Adjusted labor hours
 */
export const calculateAssemblyLabor = (item, system, baseLaborHours = 0) => {
  if (!item.width || !item.height) return baseLaborHours;
  
  const connectionData = CONNECTION_TYPES[system.connectionType] || CONNECTION_TYPES.SCREW_SPLINE;
  const laborMultiplier = connectionData.laborMultiplier;
  const laborAdderPerFt = connectionData.laborAdderPerFt || 0;
  
  // Base labor × multiplier + perimeter-based adder for shear blocks
  const perimeterFeet = ((item.width + item.height) * 2) / 12;
  const additionalHours = perimeterFeet * laborAdderPerFt * (item.qty || 1);
  
  return (baseLaborHours * laborMultiplier) + additionalHours;
};

/**
 * Calculate Door Hardware Cost
 * @param {object} system - System with hardwareSet
 * @param {number} doorCount - Number of doors in item
 * @returns {object} { materialCost, laborHours }
 */
export const calculateDoorHardware = (system, doorCount = 1) => {
  if (!system.hardwareSet || doorCount === 0) {
    return { materialCost: 0, laborHours: 0 };
  }
  
  const hardwareData = HARDWARE_SETS[system.hardwareSet];
  if (!hardwareData) {
    return { materialCost: 0, laborHours: 0 };
  }
  
  return {
    materialCost: hardwareData.cost * doorCount,
    laborHours: hardwareData.laborHours * doorCount
  };
};

/**
 * Calculate Glass Cost
 * @param {object} item - Estimate item with totalSF
 * @param {object} system - System with glass specs
 * @param {number} basePrice - $ per SF from admin
 * @returns {number} Total glass cost
 */
/**
 * Calculate Glass Cost
 * @param {object} item - Estimate item with totalSF
 * @param {object} glassType - Specific glass type with costPerSF (optional)
 * @param {number} wastePct - Glass waste/breakage percentage (default 5%)
 * @param {number} fallbackPrice - Fallback price if no glass type specified
 * @returns {number} - Total glass cost with waste factor applied
 */
export const calculateGlassCost = (item, glassType = null, wastePct = 5, fallbackPrice = DEFAULT_BASE_PRICES.glassPerSF) => {
  const totalSF = item.totalSF || 0;
  
  // Use specific glass type costPerSF if provided, otherwise use fallback
  const costPerSF = glassType?.costPerSF || fallbackPrice;
  
  // Apply waste factor (5% default = 1.05x multiplier)
  const wasteMultiplier = 1 + (wastePct / 100);
  
  return totalSF * costPerSF * wasteMultiplier;
};

/**
 * Calculate Caulk Cost
 * @param {object} item - Estimate item
 * @param {object} system - System with caulk joint count
 * @param {number} basePrice - $ per LF from admin
 * @returns {number} Total caulk cost
 */
export const calculateCaulkCost = (item, system, basePrice = DEFAULT_BASE_PRICES.caulkPerLF) => {
  if (!item.width || !item.height) return 0;
  
  const perimeterFeet = ((item.width + item.height) * 2) / 12;
  const caulkJoints = system.caulkJoints || 2;
  const totalCaulkLF = perimeterFeet * caulkJoints * (item.qty || 1);
  
  return totalCaulkLF * basePrice;
};

/**
 * Calculate Anchor Cost
 * @param {object} item - Estimate item
 * @param {object} system - System with anchor spacing
 * @param {number} basePrice - $ per anchor from admin
 * @returns {number} Total anchor cost
 */
export const calculateAnchorCost = (item, system, basePrice = DEFAULT_BASE_PRICES.anchorPerEA) => {
  if (!item.width || !item.height) return 0;
  
  const perimeterInches = (item.width + item.height) * 2;
  const anchorSpacing = system.anchorSpacing || 18;
  const anchorCount = Math.ceil(perimeterInches / anchorSpacing);
  
  return anchorCount * basePrice * (item.qty || 1);
};

/**
 * Calculate Steel Reinforcement Cost
 * @param {object} item - Estimate item
 * @param {object} system - System with steel requirement flag
 * @param {number} basePrice - $ per lb from admin
 * @returns {number} Total steel cost
 */
export const calculateSteelCost = (item, system, basePrice = DEFAULT_BASE_PRICES.steelPerLb) => {
  if (!system.steelReinforcement || !item.width || !item.height) return 0;
  
  const perimeterFeet = ((item.width + item.height) * 2) / 12;
  const steelLbsPerFt = 0.5; // Basic estimation
  const totalSteelLbs = perimeterFeet * steelLbsPerFt * (item.qty || 1);
  
  return totalSteelLbs * basePrice;
};

/**
 * Layer 23: Calculate value for a formula base variable
 * @param {string} baseVar - Variable type (PERIMETER, AREA, etc.)
 * @param {object} item - Estimate item with dimensions
 * @returns {number} Calculated value
 */
export const calculateFormulaBaseValue = (baseVar, item) => {
  if (!item) return 0;
  
  const qty = item.qty || 1;
  
  switch (baseVar) {
    case 'PERIMETER':
      if (!item.width || !item.height) return 0;
      return (((item.width + item.height) * 2) / 12) * qty; // Convert inches to feet
    
    case 'AREA':
      return (item.totalSF || 0) * qty;
    
    case 'JOINTS':
      return (item.joints || 0) * qty;
    
    case 'MULLION_LF':
      // Internal mullions based on grid (from Layer 22)
      if (!item.width || !item.height || !item.rows || !item.cols) return 0;
      const verticalLF = (item.cols - 1) * (item.height / 12);
      const horizontalLF = (item.rows - 1) * (item.width / 12);
      return (verticalLF + horizontalLF) * qty;
    
    case 'PANELS':
      const rows = item.rows || 1;
      const cols = item.cols || 1;
      return (rows * cols) * qty;
    
    default:
      return 0;
  }
};

/**
 * Layer 23: Process formulas from system definition
 * @param {object} item - Estimate item
 * @param {object} system - System with formulas array
 * @param {object} basePrices - Base pricing
 * @returns {array} Array of derivative cost line items
 */
export const processFormulas = (item, system, basePrices = DEFAULT_BASE_PRICES) => {
  if (!system.formulas || !Array.isArray(system.formulas)) return [];
  
  const results = [];
  
  system.formulas.forEach(formula => {
    // Skip if formula is disabled or if steel formula and steelReinforcement is false
    if (formula.enabled === false) return;
    if (formula.target === 'Steel' && !system.steelReinforcement) return;
    
    const baseValue = calculateFormulaBaseValue(formula.baseVar, item);
    const calculatedValue = (baseValue * (formula.factor || 1)) + (formula.constant || 0);
    
    // Calculate cost based on target type
    let cost = 0;
    switch (formula.target) {
      case 'Caulk':
        cost = calculatedValue * (basePrices.caulkPerLF || DEFAULT_BASE_PRICES.caulkPerLF);
        break;
      case 'Steel':
        cost = calculatedValue * (basePrices.steelPerLb || DEFAULT_BASE_PRICES.steelPerLb);
        break;
      case 'Subsill':
      case 'Flashing':
      case 'Misc':
        cost = calculatedValue * (basePrices.metalPerLb || DEFAULT_BASE_PRICES.metalPerLb);
        break;
      default:
        cost = calculatedValue;
    }
    
    results.push({
      target: formula.target,
      baseVar: formula.baseVar,
      quantity: calculatedValue,
      unit: formula.unit || 'EA',
      cost: cost
    });
  });
  
  return results;
};

/**
 * Layer 23: Calculate Labor Triad (Shop/Dist/Field)
 * @param {object} item - Estimate item
 * @param {object} system - System with laborRates object
 * @param {object} basePrices - Base pricing with laborPerHour
 * @returns {object} Labor breakdown with 3 phases
 */
export const calculateLaborTriad = (item, system, basePrices = DEFAULT_BASE_PRICES) => {
  const totalSF = item.totalSF || 0;
  const qty = item.qty || 1;
  
  // Use new laborRates structure if available, otherwise fall back to old laborMultiplier
  const laborRates = system.laborRates || {
    shopHours: 0.11,
    distHours: 0.05,
    fieldHours: 0.26
  };
  
  const shopHours = totalSF * laborRates.shopHours;
  const distHours = totalSF * laborRates.distHours;
  const fieldHours = totalSF * laborRates.fieldHours;
  const totalHours = shopHours + distHours + fieldHours;
  
  const laborPerHour = basePrices.laborPerHour || DEFAULT_BASE_PRICES.laborPerHour;
  
  return {
    shopHours,
    distHours,
    fieldHours,
    totalHours,
    shopCost: shopHours * laborPerHour,
    distCost: distHours * laborPerHour,
    fieldCost: fieldHours * laborPerHour,
    totalCost: totalHours * laborPerHour
  };
};

/**
 * Layer 35+: Calculate Frame Geometry (Auto-Calculated Quantities)
 * Replicates Excel logic for calculating joints, bays, DLOs, caulk from frame dimensions
 * @param {number} width - Frame width in inches
 * @param {number} height - Frame height in inches
 * @param {number} quantity - Number of frames
 * @returns {object} Calculated geometry quantities
 */
export const calculateFrameGeometry = (width, height, quantity = 1) => {
  // Perimeter calculations
  const perimeter = 2 * (width + height); // inches
  const perimeterLF = perimeter / 12; // linear feet
  
  // Standard bays = width / 36" (typical bay width)
  const baysPerFrame = Math.ceil(width / 36);
  
  // DLOs (Dead Load Openings) scale with frame size
  // Taller frames (>100") get 3 DLOs per bay, shorter get 2
  const dlosPerFrame = baysPerFrame * (height > 100 ? 3 : 2);
  
  // Joints = perimeter / ~28" per joint
  const jointsPerFrame = Math.ceil(perimeter / 28);
  
  // Distribution points = width divisions + height divisions
  const distPerFrame = Math.ceil(width / 24 + height / 36);
  
  // Subsills = 1 per frame (standard)
  const subsillsPerFrame = 1;
  
  // Caulk = perimeter × 2 (beads of caulk)
  const caulkPerFrame = perimeterLF * 2;
  
  // Multiply by quantity
  return {
    // Per frame values
    perFrame: {
      perimeter,
      perimeterLF,
      bays: baysPerFrame,
      dlos: dlosPerFrame,
      joints: jointsPerFrame,
      dist: distPerFrame,
      subsills: subsillsPerFrame,
      caulk: caulkPerFrame
    },
    // Total values (× quantity)
    total: {
      bays: baysPerFrame * quantity,
      dlos: dlosPerFrame * quantity,
      joints: jointsPerFrame * quantity,
      dist: distPerFrame * quantity,
      subsills: subsillsPerFrame * quantity,
      caulk: caulkPerFrame * quantity,
      perimeterLF: perimeterLF * quantity
    }
  };
};

/**
 * Layer 35: Production-Based Labor Calculation (FULL EXCEL LOGIC)
 * Calculates labor hours based on:
 * 1. Auto-calculated geometry (joints, bays, DLOs, caulk)
 * 2. Production rate tables (assembly tasks)
 * 3. Hr function rates (all other tasks)
 * 4. User overrides (> Bays, > DLOs, Pairs, Singles, etc.)
 * 
 * Replicates Excel Bid Sheet calculation logic exactly
 * @param {object} item - Estimate item with width, height, qty, and Layer 34 fields
 * @param {object} system - System definition with productionRates and hrFunctionRates
 * @param {object} basePrices - Admin-defined prices (laborPerHour)
 * @returns {object} Complete labor breakdown by task type
 */
export const calculateProductionBasedLabor = (item, system, basePrices = DEFAULT_BASE_PRICES) => {
  // ========================================================================
  // STEP 1: Get Rates from System
  // ========================================================================
  
  // Production rates (from Layer 35 production tables)
  const productionRates = system.productionRates || {
    bays: { assemble: 0.5, clips: 0.68, set: 1.0 },
    addBays: { assemble: 0.75, clips: 0.68, set: 1.5 },
    dlos: { prep: 0.25, set: 0.75 },
    addDlos: { prep: 0.25, set: 1.25 },
    doors: { distribution: 0.5, install: 8.0 }
  };
  
  // Hr Function rates (from Excel Row 2)
  const hrRates = system.hrFunctionRates || {
    joints: 0.25,
    dist: 0.33,
    subsills: 1.00,
    bays: 2.18,        // sum of production rates
    addBays: 2.93,     // sum of production rates
    dlos: 1.00,        // sum of production rates
    addDlos: 1.50,     // sum of production rates
    pairs: 8.50,       // sum of production rates (× 2 for pair)
    singles: 8.50,     // sum of production rates
    caulk: 0.67,
    ssg: 0.03,
    steel: 0.50,
    vents: 3.00,
    brakeMetal: 1.00,
    open: 0.00
  };
  
  // ========================================================================
  // STEP 2: Calculate Geometry Quantities (Auto-Calculated)
  // ========================================================================
  
  const width = item.width || 0;
  const height = item.height || 0;
  const quantity = item.qty || 1;
  
  const geometry = calculateFrameGeometry(width, height, quantity);
  
  // ========================================================================
  // STEP 3: Get User Overrides (Manual Input from Layer 34 Grid)
  // ========================================================================
  
  const userOverrides = {
    addBays: item.addBays || 0,      // > Bays column
    addDlos: item.addDlos || item.dlos || 0,  // > DLOs column (renamed)
    pairs: item.pairs || 0,          // Pairs column
    singles: item.singles || 0,      // Singles column
    ssg: item.ssg || false,          // SSG checkbox
    steel: item.steel || false,      // Steel checkbox
    vents: item.vents || 0,          // Vents column
    brakeMetal: item.brakeMetal || 0, // Brake Metal column
    open: item.open || 0,            // Open column
    subsills: item.subsills || 0     // + Subsills column (adds to calculated)
  };
  
  // ========================================================================
  // STEP 4: Calculate Man-Hours per Task Type
  // ========================================================================
  
  const laborPerHour = basePrices.laborPerHour || DEFAULT_BASE_PRICES.laborPerHour;
  
  // Geometry-based tasks (auto-calculated)
  const jointsHours = geometry.total.joints * hrRates.joints;
  const distHours = geometry.total.dist * hrRates.dist;
  const caulkHours = geometry.total.caulk * hrRates.caulk;
  
  // Subsills (calculated + user additions)
  const totalSubsills = geometry.total.subsills + userOverrides.subsills;
  const subsillsHours = totalSubsills * hrRates.subsills;
  
  // Standard bays (calculated from geometry)
  const baysHours = geometry.total.bays * hrRates.bays;
  
  // Add-on bays (user input)
  const addBaysHours = userOverrides.addBays * hrRates.addBays;
  
  // Standard DLOs (calculated from geometry)
  const dlosHours = geometry.total.dlos * hrRates.dlos;
  
  // Add-on DLOs (user input)
  const addDlosHours = userOverrides.addDlos * hrRates.addDlos;
  
  // Doors (user input)
  const totalDoors = (userOverrides.pairs * 2) + userOverrides.singles;
  const doorsHours = totalDoors * hrRates.singles;
  
  // Specialty tasks (user input)
  const ssgHours = (userOverrides.ssg ? 1 : 0) * hrRates.ssg;
  const steelHours = (userOverrides.steel ? 1 : 0) * hrRates.steel;
  const ventsHours = userOverrides.vents * hrRates.vents;
  const brakeMetalHours = userOverrides.brakeMetal * hrRates.brakeMetal;
  const openHours = userOverrides.open * hrRates.open;
  
  // ========================================================================
  // STEP 5: Calculate Totals
  // ========================================================================
  
  const totalHours = 
    jointsHours +
    distHours +
    subsillsHours +
    baysHours +
    addBaysHours +
    dlosHours +
    addDlosHours +
    doorsHours +
    caulkHours +
    ssgHours +
    steelHours +
    ventsHours +
    brakeMetalHours +
    openHours;
  
  const totalCost = totalHours * laborPerHour;
  
  // ========================================================================
  // STEP 6: Return Detailed Breakdown
  // ========================================================================
  
  return {
    // Summary
    totalHours,
    totalCost,
    laborPerHour,
    
    // Geometry (auto-calculated)
    geometry: geometry.total,
    
    // User overrides
    userOverrides,
    
    // Detailed breakdown by task
    breakdown: {
      joints: {
        qty: geometry.total.joints,
        hoursPerUnit: hrRates.joints,
        totalHours: jointsHours,
        cost: jointsHours * laborPerHour,
        source: 'calculated'
      },
      dist: {
        qty: geometry.total.dist,
        hoursPerUnit: hrRates.dist,
        totalHours: distHours,
        cost: distHours * laborPerHour,
        source: 'calculated'
      },
      subsills: {
        qty: totalSubsills,
        hoursPerUnit: hrRates.subsills,
        totalHours: subsillsHours,
        cost: subsillsHours * laborPerHour,
        source: 'calculated+user'
      },
      bays: {
        qty: geometry.total.bays,
        hoursPerUnit: hrRates.bays,
        totalHours: baysHours,
        cost: baysHours * laborPerHour,
        source: 'calculated'
      },
      addBays: {
        qty: userOverrides.addBays,
        hoursPerUnit: hrRates.addBays,
        totalHours: addBaysHours,
        cost: addBaysHours * laborPerHour,
        source: 'user'
      },
      dlos: {
        qty: geometry.total.dlos,
        hoursPerUnit: hrRates.dlos,
        totalHours: dlosHours,
        cost: dlosHours * laborPerHour,
        source: 'calculated'
      },
      addDlos: {
        qty: userOverrides.addDlos,
        hoursPerUnit: hrRates.addDlos,
        totalHours: addDlosHours,
        cost: addDlosHours * laborPerHour,
        source: 'user'
      },
      doors: {
        qty: totalDoors,
        pairs: userOverrides.pairs,
        singles: userOverrides.singles,
        hoursPerUnit: hrRates.singles,
        totalHours: doorsHours,
        cost: doorsHours * laborPerHour,
        source: 'user'
      },
      caulk: {
        qty: geometry.total.caulk,
        hoursPerUnit: hrRates.caulk,
        totalHours: caulkHours,
        cost: caulkHours * laborPerHour,
        source: 'calculated'
      },
      ssg: {
        qty: userOverrides.ssg ? 1 : 0,
        hoursPerUnit: hrRates.ssg,
        totalHours: ssgHours,
        cost: ssgHours * laborPerHour,
        source: 'user'
      },
      steel: {
        qty: userOverrides.steel ? 1 : 0,
        hoursPerUnit: hrRates.steel,
        totalHours: steelHours,
        cost: steelHours * laborPerHour,
        source: 'user'
      },
      vents: {
        qty: userOverrides.vents,
        hoursPerUnit: hrRates.vents,
        totalHours: ventsHours,
        cost: ventsHours * laborPerHour,
        source: 'user'
      },
      brakeMetal: {
        qty: userOverrides.brakeMetal,
        hoursPerUnit: hrRates.brakeMetal,
        totalHours: brakeMetalHours,
        cost: brakeMetalHours * laborPerHour,
        source: 'user'
      },
      open: {
        qty: userOverrides.open,
        hoursPerUnit: hrRates.open,
        totalHours: openHours,
        cost: openHours * laborPerHour,
        source: 'user'
      }
    }
  };
};

/**
 * MASTER FUNCTION - Calculate Complete System Cost for an Item
 * Layer 23: Enhanced with Labor Triad & Formula Builder
 * This is the "Brain" that combines all the logic
 * @param {object} item - Estimate item (width, height, qty, etc.)
 * @param {object} system - Full system definition
 * @param {object} basePrices - Admin-defined base prices
 * @param {object} glassType - Specific glass type with costPerSF (optional)
 * @param {number} wastePct - Glass waste percentage (default 5%)
 * @returns {object} Complete cost breakdown
 */
export const calculateSystemCost = (item, system, basePrices = DEFAULT_BASE_PRICES, glassType = null, wastePct = 5) => {
  if (!item || !system) {
    return {
      metalWeight: 0,
      metalCost: 0,
      glassCost: 0,
      caulkCost: 0,
      anchorCost: 0,
      steelCost: 0,
      hardwareCost: 0,
      
      // Layer 23: Labor Triad
      shopHours: 0,
      distHours: 0,
      fieldHours: 0,
      laborHours: 0,
      shopCost: 0,
      distCost: 0,
      fieldCost: 0,
      laborCost: 0,
      
      // Layer 23: Formula derivatives
      derivativeCosts: [],
      
      totalMaterialCost: 0,
      totalLaborCost: 0,
      grandTotal: 0
    };
  }

  // Calculate individual components
  const metalWeight = calculateMetalWeight(item, system);
  const metalCost = calculateMetalCost(metalWeight, system, basePrices.metalPerLb);
  const glassCost = calculateGlassCost(item, glassType, wastePct, basePrices.glassPerSF);
  const anchorCost = calculateAnchorCost(item, system, basePrices.anchorPerEA);
  
  // Layer 23: Process formulas for derivative costs (caulk, steel, etc.)
  const derivativeCosts = processFormulas(item, system, basePrices);
  const derivativeCostTotal = derivativeCosts.reduce((sum, d) => sum + d.cost, 0);
  
  // Extract specific costs from derivatives for backwards compatibility
  const caulkCost = derivativeCosts.find(d => d.target === 'Caulk')?.cost || 0;
  const steelCost = derivativeCosts.find(d => d.target === 'Steel')?.cost || 0;
  
  // Door hardware (if applicable)
  const doorCount = item.doorCount || 0;
  const doorHardware = calculateDoorHardware(system, doorCount);
  
  // Layer 23: Labor Triad calculation
  const laborTriad = calculateLaborTriad(item, system, basePrices);
  const totalLaborHours = laborTriad.totalHours + doorHardware.laborHours;
  const totalLaborCost = laborTriad.totalCost + (doorHardware.laborHours * basePrices.laborPerHour);
  
  // Totals
  const totalMaterialCost = metalCost + glassCost + anchorCost + derivativeCostTotal + doorHardware.materialCost;
  const grandTotal = totalMaterialCost + totalLaborCost;

  return {
    // Material breakdown
    metalWeight,
    metalCost,
    glassCost,
    caulkCost,          // For backwards compatibility
    anchorCost,
    steelCost,          // For backwards compatibility
    hardwareCost: doorHardware.materialCost,
    
    // Layer 23: Labor Triad
    shopHours: laborTriad.shopHours,
    distHours: laborTriad.distHours,
    fieldHours: laborTriad.fieldHours,
    laborHours: totalLaborHours,
    shopCost: laborTriad.shopCost,
    distCost: laborTriad.distCost,
    fieldCost: laborTriad.fieldCost,
    laborCost: totalLaborCost,
    
    // Layer 23: Formula derivatives
    derivativeCosts: derivativeCosts,
    
    // Totals
    totalMaterialCost,
    totalLaborCost,
    grandTotal,
    
    // Factors (for display)
    factors: {
      metalLbsPerFt: PROFILE_SIZES[system.profileSize]?.metalLbsPerFt || 0,
      laborMultiplier: CONNECTION_TYPES[system.connectionType]?.laborMultiplier || 1.0,
      finishMultiplier: FINISH_TYPES[system.finish]?.costMultiplier || 1.0
    }
  };
};

/**
 * Sum costs by Scope Tag (for Alternates)
 * @param {array} items - All estimate items with assigned systems
 * @param {array} systems - All system definitions
 * @param {object} basePrices - Base pricing
 * @returns {object} { BASE_BID: $150k, ALT_1: $12k, ... }
 */
export const calculateAlternateBreakdown = (items, systems, basePrices = DEFAULT_BASE_PRICES) => {
  const breakdown = {};
  
  items.forEach(item => {
    if (!item.assignedSystemId) return;
    
    const system = systems.find(s => s.id === item.assignedSystemId);
    if (!system) return;
    
    const cost = calculateSystemCost(item, system, basePrices);
    const scopeTag = system.scopeTag || 'BASE_BID';
    
    if (!breakdown[scopeTag]) {
      breakdown[scopeTag] = {
        materialCost: 0,
        laborCost: 0,
        total: 0
      };
    }
    
    breakdown[scopeTag].materialCost += cost.totalMaterialCost;
    breakdown[scopeTag].laborCost += cost.totalLaborCost;
    breakdown[scopeTag].total += cost.grandTotal;
  });
  
  return breakdown;
};

// ============================================================================
// LAYER 29: SYSTEM LOGIC DASHBOARD & BILL OF MATERIALS ENGINE
// ============================================================================

/**
 * Calculate PartnerPak Summary (Read-Only Totals)
 * @param {Array} estimateItems - Filtered estimate items for this system
 * @returns {Object} Summary totals { area, perimeter, joints, dlos, mullionLF }
 */
export const calculatePartnerPakSummary = (estimateItems) => {
  if (!estimateItems || estimateItems.length === 0) {
    return {
      area: 0,
      perimeter: 0,
      joints: 0,
      dlos: 0,
      mullionLF: 0
    };
  }

  const totals = estimateItems.reduce((acc, item) => {
    return {
      area: acc.area + (item.totalSF || 0),
      perimeter: acc.perimeter + (item.perimeter || 0),
      joints: acc.joints + (item.joints || 0),
      dlos: acc.dlos + (item.doorCount || 0), // DLOs = Door Lite Openings
      mullionLF: acc.mullionLF + (item.mullionLF || 0)
    };
  }, { area: 0, perimeter: 0, joints: 0, dlos: 0, mullionLF: 0 });

  return totals;
};

/**
 * Calculate Bill of Materials based on System Inputs
 * @param {Object} system - System definition with user inputs
 * @param {Object} summary - PartnerPak summary (area, perimeter, joints, dlos)
 * @param {Object} unitCosts - Unit costs for materials (from pricing tab or defaults)
 * @returns {Array} Material list with calculated quantities and costs
 */
export const calculateSystemMaterials = (system, summary, unitCosts = {}) => {
  const materials = [];

  // Get user inputs from system (with defaults)
  const inputs = system.inputs || {};
  
  // Layer 30: Excel-specific inputs
  const steelEnabled = inputs.steelReinforcement ?? false;
  const steelWeight = inputs.steelWeight ?? 3.5; // lbs/ft
  
  const caulkLogic = inputs.caulkLogic ?? 'BOTH'; // 'INTERIOR', 'EXTERIOR', 'BOTH'
  const caulkJointSize = inputs.caulkJointSize ?? 0.5; // inches
  const caulkCoveragePerTube = 24; // linear feet per tube (industry standard)
  
  const brakeMetalLF = inputs.brakeMetalLF ?? 0;
  const brakeMetalGirth = inputs.brakeMetalGirth ?? 6.0; // inches
  
  const subsillsEnabled = inputs.subsillsEnabled ?? false;
  const subsillType = inputs.subsillType ?? 'RECEPTOR';
  const subsillEndDams = inputs.subsillEndDams ?? 40;
  
  const shimRows = inputs.shimRows ?? 1;
  const tapeRows = inputs.tapeRows ?? 2;
  
  const mockupsQty = inputs.mockupsQty ?? 0;
  const mockupCost = inputs.mockupCost ?? 5000;
  
  const engineeringLumpSum = inputs.engineeringLumpSum ?? 0;

  // Default unit costs
  const costs = {
    steelPerLb: unitCosts.steelPerLb ?? 1.25,
    caulkPerTube: unitCosts.caulkPerTube ?? 4.50,
    screwsPer1000: unitCosts.screwsPer1000 ?? 25.00,
    settingBlocksPer100: unitCosts.settingBlocksPer100 ?? 18.00,
    brakeMetalPerSF: unitCosts.brakeMetalPerSF ?? 3.50,
    subsillPerLF: unitCosts.subsillPerLF ?? 12.00,
    endDamPerEA: unitCosts.endDamPerEA ?? 15.00,
    shimPerLF: unitCosts.shimPerLF ?? 0.50,
    tapePerLF: unitCosts.tapePerLF ?? 0.75
  };

  // MATERIAL 1: Steel Reinforcement
  if (steelEnabled && summary.mullionLF > 0) {
    const steelLbs = summary.mullionLF * steelWeight;
    const steelCost = steelLbs * costs.steelPerLb;
    
    materials.push({
      id: 'STEEL',
      name: 'Steel Reinforcement',
      formula: `Mullion LF (${summary.mullionLF.toFixed(1)}) × ${steelWeight} lbs/ft`,
      quantity: steelLbs,
      unit: 'lbs',
      unitCost: costs.steelPerLb,
      totalCost: steelCost,
      category: '02-Metal'
    });
  }

  // MATERIAL 2: Caulk & Sealant
  if (summary.perimeter > 0 || summary.joints > 0) {
    let caulkLF = 0;
    
    // Apply caulk logic
    if (caulkLogic === 'BOTH') {
      caulkLF = (summary.perimeter * 2) + summary.joints; // Interior + Exterior + Joints
    } else if (caulkLogic === 'INTERIOR') {
      caulkLF = summary.perimeter + summary.joints;
    } else if (caulkLogic === 'EXTERIOR') {
      caulkLF = summary.perimeter + summary.joints;
    }
    
    // Adjust for joint size (larger joints need more caulk)
    const sizeMultiplier = caulkJointSize / 0.5; // 0.5" is baseline
    caulkLF = caulkLF * sizeMultiplier;
    
    const tubesNeeded = Math.ceil(caulkLF / caulkCoveragePerTube);
    const caulkCost = tubesNeeded * costs.caulkPerTube;
    
    materials.push({
      id: 'CAULK',
      name: 'Caulk & Sealant',
      formula: `(Perim: ${summary.perimeter.toFixed(0)} + Joints: ${summary.joints}) / ${caulkCoveragePerTube} ft/tube`,
      quantity: tubesNeeded,
      unit: 'tubes',
      unitCost: costs.caulkPerTube,
      totalCost: caulkCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 3: Screws & Fasteners
  if (summary.joints > 0) {
    const screwsPerJoint = 2;
    const screwsNeeded = summary.joints * screwsPerJoint;
    const screwBoxes = Math.ceil(screwsNeeded / 1000);
    const screwsCost = screwBoxes * costs.screwsPer1000;
    
    materials.push({
      id: 'SCREWS',
      name: 'Screws & Fasteners',
      formula: `Joints (${summary.joints}) × ${screwsPerJoint} screws/joint`,
      quantity: screwsNeeded,
      unit: 'EA',
      unitCost: costs.screwsPer1000 / 1000,
      totalCost: screwsCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 4: Setting Blocks
  if (summary.dlos > 0) {
    const blocksPerDLO = 2;
    const blocksNeeded = summary.dlos * blocksPerDLO;
    const blockBoxes = Math.ceil(blocksNeeded / 100);
    const blocksCost = blockBoxes * costs.settingBlocksPer100;
    
    materials.push({
      id: 'SETTING_BLOCKS',
      name: 'Setting Blocks',
      formula: `DLOs (${summary.dlos}) × ${blocksPerDLO} blocks/DLO`,
      quantity: blocksNeeded,
      unit: 'EA',
      unitCost: costs.settingBlocksPer100 / 100,
      totalCost: blocksCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 5: Brake Metal / Trim
  if (brakeMetalLF > 0) {
    const brakeMetalSF = (brakeMetalLF * brakeMetalGirth) / 12; // Convert girth inches to SF
    const brakeMetalCost = brakeMetalSF * costs.brakeMetalPerSF;
    
    materials.push({
      id: 'BRAKE_METAL',
      name: 'Brake Metal / Trim',
      formula: `${brakeMetalLF} LF × ${brakeMetalGirth}" girth = ${brakeMetalSF.toFixed(1)} SF`,
      quantity: brakeMetalSF,
      unit: 'SF',
      unitCost: costs.brakeMetalPerSF,
      totalCost: brakeMetalCost,
      category: '02-Metal'
    });
  }

  // MATERIAL 6: Subsills
  if (subsillsEnabled && summary.perimeter > 0) {
    const subsillLF = summary.perimeter; // Typically runs full perimeter
    const subsillCost = subsillLF * costs.subsillPerLF;
    
    materials.push({
      id: 'SUBSILLS',
      name: `Subsills (${subsillType})`,
      formula: `Perimeter (${summary.perimeter.toFixed(0)} LF)`,
      quantity: subsillLF,
      unit: 'LF',
      unitCost: costs.subsillPerLF,
      totalCost: subsillCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 7: Mockups
  if (mockupsQty > 0) {
    materials.push({
      id: 'MOCKUPS',
      name: 'Mockups',
      formula: `${mockupsQty} × $${mockupCost.toLocaleString()}`,
      quantity: mockupsQty,
      unit: 'EA',
      unitCost: mockupCost,
      totalCost: mockupsQty * mockupCost,
      category: '02-Labor'
    });
  }

  // MATERIAL 8: Subsill End Dams (Layer 30)
  if (subsillsEnabled && subsillEndDams > 0) {
    materials.push({
      id: 'END_DAMS',
      name: 'Subsill End Dams',
      formula: `${subsillEndDams} qty`,
      quantity: subsillEndDams,
      unit: 'EA',
      unitCost: costs.endDamPerEA,
      totalCost: subsillEndDams * costs.endDamPerEA,
      category: '02-Sundries'
    });
  }

  // MATERIAL 9: Shim Tape (Layer 30)
  if (shimRows > 0 && summary.perimeter > 0) {
    const shimLF = summary.perimeter * shimRows;
    const shimCost = shimLF * costs.shimPerLF;
    
    materials.push({
      id: 'SHIM_TAPE',
      name: 'Shim Tape',
      formula: `Perimeter (${summary.perimeter.toFixed(0)}) × ${shimRows} rows`,
      quantity: shimLF,
      unit: 'LF',
      unitCost: costs.shimPerLF,
      totalCost: shimCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 10: Glazing Tape (Layer 30)
  if (tapeRows > 0 && summary.perimeter > 0) {
    const tapeLF = summary.perimeter * tapeRows;
    const tapeCost = tapeLF * costs.tapePerLF;
    
    materials.push({
      id: 'GLAZING_TAPE',
      name: 'Glazing Tape',
      formula: `Perimeter (${summary.perimeter.toFixed(0)}) × ${tapeRows} rows`,
      quantity: tapeLF,
      unit: 'LF',
      unitCost: costs.tapePerLF,
      totalCost: tapeCost,
      category: '02-Sundries'
    });
  }

  // MATERIAL 11: Engineering (Layer 30)
  if (engineeringLumpSum > 0) {
    materials.push({
      id: 'ENGINEERING',
      name: 'Engineering',
      formula: `Lump Sum`,
      quantity: 1,
      unit: 'LS',
      unitCost: engineeringLumpSum,
      totalCost: engineeringLumpSum,
      category: '02-Labor'
    });
  }

  return materials;
};

/**
 * Get default system inputs (used when creating new systems)
 * @returns {Object} Default input values
 */
export const getDefaultSystemInputs = () => {
  return {
    // Steel Reinforcement
    steelReinforcement: false,
    steelWeight: 3.5, // lbs/ft
    
    // Caulk Logic
    caulkLogic: 'BOTH', // 'INTERIOR', 'EXTERIOR', 'BOTH'
    caulkJointSize: 0.5, // inches
    
    // Brake Metal / Trim
    brakeMetalLF: 0,
    brakeMetalGirth: 6.0, // inches
    
    // Subsills
    subsillsEnabled: false,
    subsillType: 'STANDARD', // 'STANDARD', 'HEAVY_DUTY', 'THERMALLY_BROKEN'
    
    // Mockups
    mockupsQty: 0,
    mockupCost: 5000
  };
};

/**
 * Calculate grand total for all materials
 * @param {Array} materials - Material list from calculateSystemMaterials
 * @returns {Number} Grand total cost
 */
export const calculateMaterialsGrandTotal = (materials) => {
  return materials.reduce((sum, item) => sum + item.totalCost, 0);
};

/**
 * Layer 34: Calculate Item-Level Costs (Unified Scope Grid)
 * Calculate costs for individual rows based on user inputs
 * @param {object} item - Estimate item with input fields (pairs, singles, steel, vents, brakeMetal)
 * @param {object} system - System definition
 * @param {object} unitCosts - Unit cost overrides
 * @returns {object} Calculated costs for this item
 */
export const calculateItemCosts = (item, system, unitCosts = {}) => {
  const costs = {
    doorHardwarePerSet: unitCosts.doorHardwarePerSet ?? 1200,  // Per door
    ventPerEA: unitCosts.ventPerEA ?? 450,                     // Per vent
    steelPerLb: unitCosts.steelPerLb ?? 1.25,                  // Per pound
    brakeMetalPerLF: unitCosts.brakeMetalPerLF ?? 3.50,        // Per linear foot
    subsillPerLF: unitCosts.subsillPerLF ?? 12.00              // Per linear foot
  };

  let doorCost = 0;
  let ventCost = 0;
  let steelCost = 0;
  let brakeMetalCost = 0;
  let subsillCost = 0;

  // 1. Door Hardware Cost
  // Pairs = 2 doors, Singles = 1 door
  const totalDoors = (item.pairs || 0) * 2 + (item.singles || 0);
  if (totalDoors > 0) {
    doorCost = totalDoors * costs.doorHardwarePerSet;
  }

  // 2. Vent Cost
  if (item.vents && item.vents > 0) {
    ventCost = item.vents * costs.ventPerEA;
  }

  // 3. Steel Reinforcement Cost
  // If steel checkbox is enabled, calculate based on perimeter
  if (item.steel && item.perimeter) {
    const steelWeight = 3.5; // lbs/ft default
    const steelLbs = item.perimeter * steelWeight;
    steelCost = steelLbs * costs.steelPerLb;
  }

  // 4. Brake Metal Cost
  if (item.brakeMetal && item.brakeMetal > 0) {
    brakeMetalCost = item.brakeMetal * costs.brakeMetalPerLF;
  }

  // 5. Subsills Cost
  if (item.subsills && item.subsills > 0 && item.width) {
    const subsillLF = (item.width / 12) * item.subsills; // Width in inches → feet
    subsillCost = subsillLF * costs.subsillPerLF;
  }

  return {
    doorCost,
    ventCost,
    steelCost,
    brakeMetalCost,
    subsillCost,
    totalAddOnCost: doorCost + ventCost + steelCost + brakeMetalCost + subsillCost,
    details: {
      totalDoors,
      vents: item.vents || 0,
      steelEnabled: item.steel || false,
      brakeMetalLF: item.brakeMetal || 0,
      subsills: item.subsills || 0
    }
  };
};

export default {
  // Enums
  SYSTEM_TYPES,
  FORMULA_BASE_VARS,      // Layer 23
  PROFILE_SIZES,
  CONNECTION_TYPES,
  FINISH_TYPES,
  DOOR_TYPES,
  HARDWARE_SETS,
  SCOPE_TAGS,
  
  // Calculation functions
  calculateMetalWeight,
  calculateMetalCost,
  calculateAssemblyLabor,
  calculateDoorHardware,
  calculateGlassCost,
  calculateCaulkCost,
  calculateAnchorCost,
  calculateSteelCost,
  
  // Layer 23: New functions
  calculateFormulaBaseValue,
  processFormulas,
  calculateLaborTriad,
  
  // Layer 35: Production Rate Tables & Full Excel Logic
  calculateFrameGeometry,
  calculateProductionBasedLabor,
  
  calculateSystemCost,
  calculateAlternateBreakdown,
  
  // Layer 29: System Logic Dashboard functions
  calculatePartnerPakSummary,
  calculateSystemMaterials,
  getDefaultSystemInputs,
  calculateMaterialsGrandTotal,
  
  // Layer 34: Unified Scope Grid
  calculateItemCosts,
  
  // Base prices
  DEFAULT_BASE_PRICES
};
