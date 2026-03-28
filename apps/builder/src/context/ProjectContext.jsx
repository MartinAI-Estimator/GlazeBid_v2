import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

/**
 * ProjectContext - The Brain
 * Connects PDF Takeoff with Estimate Engine
 * Allows both tabs to share data and settings
 */
const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  // 1. The Drawings (From PDF Tab)
  const [markups, setMarkups] = useState([]);

  // 1.5. Architectural drawing Files loaded from intake — seeds TakeoffWorkspace & FrameBuilder
  const [architecturalFiles, setArchitecturalFiles] = useState([]);
  // Server-side category map from last intake: { filename → 'Architectural'|'Structural'|'Specs'|'Other' }
  const [intakeFileCategories, setIntakeFileCategories] = useState({});

  // 2. The Imported Data (From PartnerPak/Parser)
  const [importedItems, setImportedItems] = useState([]);

  // 3. Global Settings (Markup, Tax, Labor) - Legacy, now using adminSettings
  const [globalSettings, setGlobalSettings] = useState({
    markupPct: 35,
    laborRate: 45,
    taxRate: 7.25,
    caulkBeads: 2
  });

  // 3.5. Labor Crew Composition (The Crew Builder)
  const [laborCrew, setLaborCrew] = useState([
    { id: 1, role: 'Foreman', count: 1, baseRate: 65, burdenPct: 40 },
    { id: 2, role: 'Glazier', count: 2, baseRate: 55, burdenPct: 42 },
    { id: 3, role: 'Apprentice', count: 1, baseRate: 35, burdenPct: 38 }
  ]);

  // 3.6. Equipment Library (General Conditions / Lift Calculator)
  const [equipmentLibrary, setEquipmentLibrary] = useState([
    { id: 1, name: '60\' Boom Lift', category: 'Aerial Lift', dailyRate: 450, weeklyRate: 1800, monthlyRate: 5500, mobilizationCost: 350 },
    { id: 2, name: '40\' Scissor Lift', category: 'Aerial Lift', dailyRate: 250, weeklyRate: 900, monthlyRate: 2800, mobilizationCost: 200 },
    { id: 3, name: 'Telehandler 10K', category: 'Material Handler', dailyRate: 350, weeklyRate: 1400, monthlyRate: 4200, mobilizationCost: 300 },
    { id: 4, name: 'Crane Service (Day)', category: 'Crane', dailyRate: 1200, weeklyRate: 0, monthlyRate: 0, mobilizationCost: 800 }
  ]);

  // 3.6.5. Glass Library (Project-Specific Glass Types)
  const [glassTypes, setGlassTypes] = useState([
    {
      id: 1,
      code: 'GL-1',
      description: '1" Insulated Clear/Clear',
      costPerSF: 12.00,
      vendor: 'TBD',
      quoteRef: '',
      makeup: 'INSULATED',
      thickness: '1 inch',
      color: '#58a6ff'
    },
    {
      id: 2,
      code: 'GL-2',
      description: '1" Insulated Spandrel (Black)',
      costPerSF: 18.50,
      vendor: 'TBD',
      quoteRef: '',
      makeup: 'INSULATED',
      thickness: '1 inch',
      color: '#8b949e'
    }
  ]);

  // 3.7. System Definitions (The System DNA)
  const [systemDefinitions, setSystemDefinitions] = useState([
    {
      id: 1,
      name: 'Ext SF 1 - Standard 2x4.5',
      type: 'STOREFRONT',
      
      // Basic profile info
      profileWidth: 2.0,
      profileDepth: 4.5,
      
      // NEW: Framing DNA (Pricing Logic Layer)
      scopeTag: 'BASE_BID',              // Base Bid, Alt 1, Alt 2, etc.
      profileSize: '2x4.5',              // Drives metal weight calculation
      connectionType: 'SCREW_SPLINE',    // Fast installation
      finish: 'CLEAR_ANOD',              // Clear anodized (Class I)
      
      // Assembly DNA (Original)
      anchorSpacing: 18,
      caulkJoints: 2,
      steelReinforcement: false,
      
      // Layer 23: Labor Triad (Replaces laborMultiplier)
      laborRates: {
        shopHours: 0.11,      // Shop fabrication hrs/sf
        distHours: 0.05,      // Handling/distribution hrs/sf
        fieldHours: 0.26      // Field installation hrs/sf
      },
      
      // Layer 35: Production Rate Tables (The Secret Sauce)
      productionRates: {
        bays: { assemble: 0.5, clips: 0.68, set: 1.0 },
        addBays: { assemble: 0.75, clips: 0.68, set: 1.5 },
        dlos: { prep: 0.25, set: 0.75 },
        addDlos: { prep: 0.25, set: 1.25 },
        doors: { distribution: 0.5, install: 8.0 }
      },
      
      // Layer 35+: Hr Function Rates (Full Excel Logic)
      hrFunctionRates: {
        joints: 0.25,      // Joints hrs/unit
        dist: 0.33,        // Distribution hrs/unit
        subsills: 1.00,    // Subsills hrs/unit
        bays: 2.18,        // Standard bays (= 0.5 + 0.68 + 1.0)
        addBays: 2.93,     // Add-on bays (= 0.75 + 0.68 + 1.5)
        dlos: 1.00,        // Standard DLOs (= 0.25 + 0.75)
        addDlos: 1.50,     // Add-on DLOs (= 0.25 + 1.25)
        pairs: 8.50,       // Door pairs (×2)
        singles: 8.50,     // Single doors
        caulk: 0.67,       // Caulking beads
        ssg: 0.03,         // SSG application
        steel: 0.50,       // Steel reinforcement
        vents: 3.00,       // Vent installation
        brakeMetal: 1.00,  // Brake metal work
        open: 0.00         // Open field (unused)
      },
      
      // Layer 23: Formula Builder (Derivative Calculations)
      formulas: [
        {
          target: 'Caulk',
          baseVar: 'PERIMETER',
          factor: 2.0,
          constant: 0,
          unit: 'LF'
        },
        {
          target: 'Steel',
          baseVar: 'PERIMETER',
          factor: 0.5,
          constant: 0,
          unit: 'LBS',
          enabled: false  // Controlled by steelReinforcement flag
        }
      ],
      
      // Material specs
      glassType: 'insulated_1inch',
      gasketType: 'standard_epdm',
      
      // Features
      shearBlocks: true,
      thermalBreak: false,
      structuralSilicone: false,
      
      // NEW: Door Intelligence
      doorType: 'MEDIUM_STILE',          // 3.5" door stiles
      hardwareSet: 'HINGE_DEADBOLT',     // Butt hinge + deadbolt
      
      // Visual
      color: '#3b82f6'
    },
    {
      id: 2,
      name: 'CW 1 - Curtain Wall 2x6 Shear',
      type: 'CURTAIN_WALL',
      
      // Basic profile info
      profileWidth: 2.0,
      profileDepth: 6.0,
      
      // NEW: Framing DNA (Pricing Logic Layer)
      scopeTag: 'BASE_BID',
      profileSize: '2x6',                // Heavier metal (3.1 lbs/ft)
      connectionType: 'SHEAR_BLOCK',     // Structural connection (+15% labor)
      finish: 'DARK_BRONZE',             // Dark bronze anodized (+8% cost)
      
      // Assembly DNA
      anchorSpacing: 16,
      caulkJoints: 2,
      steelReinforcement: true,
      
      // Layer 23: Labor Triad
      laborRates: {
        shopHours: 0.18,      // Heavier fabrication
        distHours: 0.08,      // More handling
        fieldHours: 0.35      // Complex installation
      },
      
      // Layer 35: Production Rate Tables
      productionRates: {
        bays: { assemble: 0.5, clips: 0.68, set: 1.0 },
        addBays: { assemble: 0.75, clips: 0.68, set: 1.5 },
        dlos: { prep: 0.25, set: 0.75 },
        addDlos: { prep: 0.25, set: 1.25 },
        doors: { distribution: 0.5, install: 8.0 }
      },
      
      // Layer 35+: Hr Function Rates (Full Excel Logic)
      hrFunctionRates: {
        joints: 0.25,
        dist: 0.33,
        subsills: 1.00,
        bays: 2.18,
        addBays: 2.93,
        dlos: 1.00,
        addDlos: 1.50,
        pairs: 8.50,
        singles: 8.50,
        caulk: 0.67,
        ssg: 0.03,
        steel: 0.50,
        vents: 3.00,
        brakeMetal: 1.00,
        open: 0.00
      },
      
      // Layer 23: Formula Builder
      formulas: [
        {
          target: 'Caulk',
          baseVar: 'PERIMETER',
          factor: 2.0,
          constant: 0,
          unit: 'LF'
        },
        {
          target: 'Steel',
          baseVar: 'PERIMETER',
          factor: 3.2,
          constant: 0,
          unit: 'LBS',
          enabled: true  // Curtain wall typically needs steel
        }
      ],
      
      // Material specs
      glassType: 'insulated_1inch',
      gasketType: 'compression_seal',
      
      // Features
      shearBlocks: true,
      thermalBreak: true,
      structuralSilicone: false,
      
      // NEW: Door Intelligence
      doorType: 'WIDE_STILE',            // 5" heavy doors
      hardwareSet: 'PIVOT_PANIC',        // Pivot + panic device
      
      // Visual
      color: '#8b5cf6'
    }
  ]);

  // 4. Admin Settings - Management Backend (The "Golden Rules")
  const ADMIN_DEFAULTS = {
    // ── Phase 5: Company-wide rate defaults (AdminSettingsPanel) ──────────
    suppliesPct:        0.5,
    contingencyPct:     1.25,
    defaultLaborRate:   42,
    defaultCrewSize:    2,
    defaultLaborCont:   2.5,
    defaultMarkupPct:   40,
    defaultTaxPct:      8.2,
    glassSurchargePct:  17,
    glassBreakagePct:   3,
    gpmThresholds: [
      { label: '$0 – $250k',   minGPM: 30 },
      { label: '$250k – $1M',  minGPM: 27 },
      { label: '$1M+',         minGPM: 25 },
    ],
    // Labor Library - Production rates
    laborLibrary: [
      { id: 'frame_assembly', name: 'Frame Assembly', category: 'Fabrication', hoursPerUnit: 0.150, unit: 'SF' },
      { id: 'glass_setting', name: 'Glass Setting', category: 'Installation', hoursPerUnit: 0.120, unit: 'SF' },
      { id: 'caulking', name: 'Perimeter Caulk', category: 'Installation', hoursPerUnit: 0.080, unit: 'SF' },
      { id: 'anchor_install', name: 'Anchor Installation', category: 'Installation', hoursPerUnit: 0.100, unit: 'EA' },
      { id: 'glazing_bead', name: 'Glazing Bead Install', category: 'Installation', hoursPerUnit: 0.050, unit: 'LF' },
      { id: 'hardware_install', name: 'Hardware Installation', category: 'Installation', hoursPerUnit: 0.200, unit: 'EA' },
      { id: 'panel_erection', name: 'Panel Erection', category: 'Installation', hoursPerUnit: 0.180, unit: 'SF' },
      { id: 'cleanup', name: 'Cleanup & Protection', category: 'Closeout', hoursPerUnit: 0.030, unit: 'SF' }
    ],
    // Financial Defaults
    financialDefaults: {
      markupPct: 35,
      laborRate: 45,
      taxRate: 7.25,
      contingencyPct: 10,      // % buffer added to raw labor hours
      caulkBeads: 2,
      glassWastePct: 5,        // Glass waste/breakage allowance
      // Base Pricing (Used by Pricing Logic Engine)
      metalPerLb: 4.50,        // $ per pound of aluminum
      glassPerSF: 12.00,       // $ per SF of glass (basic)
      caulkPerLF: 2.50,        // $ per linear foot of caulk
      anchorPerEA: 8.00,       // $ per anchor
      steelPerLb: 2.75,        // $ per pound of steel reinforcement
      // GPM Tiers — Chief Estimator sets these company-wide
      // Each tier: { upTo: number | null, gpm: number }
      // null upTo = "over" (last tier, no ceiling)
      gpmTiers: [
        { id: 'tier_sm',  label: 'Small Job',  upTo: 250000,   gpm: 30 },
        { id: 'tier_md',  label: 'Mid Job',    upTo: 1000000,  gpm: 27 },
        { id: 'tier_lg',  label: 'Large Job',  upTo: null,     gpm: 25 },
      ],
    },
    // System Templates - Which tasks apply to each system type
    systemTemplates: {
      ext_storefront: {
        label: 'Exterior Storefront',
        tasks: ['frame_assembly', 'glass_setting', 'caulking', 'anchor_install', 'hardware_install', 'cleanup']
      },
      int_storefront: {
        label: 'Interior Storefront',
        tasks: ['frame_assembly', 'glass_setting', 'glazing_bead', 'hardware_install', 'cleanup']
      },
      curtain_wall: {
        label: 'Curtain Wall (SSG)',
        tasks: ['frame_assembly', 'glass_setting', 'caulking', 'anchor_install', 'panel_erection', 'cleanup']
      }
    },
    // Master Data - Layer 26
    costGroups: [
      "02-Metal",
      "02-Glass",
      "02-Finish",
      "02-Labor",
      "02-Sundries",
      "02-Equipment"
    ],
    breakoutCategories: [
      "Exterior Storefront",
      "Curtain Wall",
      "Interior Storefront",
      "All Glass Entrances",
      "Mirrors"
    ],
    // Material Categories - Drives the category dropdown in the bid builder materials section
    materialCategories: [
      { id: 'aluminum',      icon: '🔩', label: 'Aluminum (02-Metal)' },
      { id: 'glass',         icon: '🪟', label: 'Glass' },
      { id: 'doors',         icon: '🚪', label: 'Doors (Leaves)' },
      { id: 'hardware',      icon: '🔑', label: 'Hardware Sets' },
      { id: 'equipment',     icon: '🏗️', label: 'Equipment' },
      { id: 'caulking',      icon: '🪣', label: 'Caulking & Misc' },
      { id: 'subcontractor', icon: '👷', label: 'Subcontractor / Labor' },
    ]
  };
  const [adminSettings, setAdminSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('glazebid_adminSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults so any new fields added in code still appear
        return { ...ADMIN_DEFAULTS, ...parsed };
      }
    } catch (e) {}
    return ADMIN_DEFAULTS;
  });

  // Persist admin settings across page refreshes
  useEffect(() => {
    localStorage.setItem('glazebid_adminSettings', JSON.stringify(adminSettings));
  }, [adminSettings]);

  // 5. Bid Settings - Estimator Inputs (The "Actions")
  const [bidSettings, setBidSettings] = useState({
    // Hardware & Glass
    metalSeries: 'storefront_4500',
    metalFinish: 'clear_anodized',
    glassType: 'insulated_1inch',
    metalQuoteOverride: '',
    glassQuoteOverride: '',
    // Conditions
    conditions: {
      nightWork: false,
      highRise: false,
      difficultAccess: false,
      seismic: false,
      thermal: false,
      blastResistant: false
    },
    // Equipment (Legacy - replaced by selectedEquipment)
    craneType: 'none',
    craneDays: 0,
    liftType: 'none',
    liftDays: 0,
    permits: 0,
    scaffolding: 0,
    freight: 0,
    // General Conditions (New System)
    selectedEquipment: null,
    // Overrides
    markupOverride: '',
    laborRateOverride: '',
    taxOverride: ''
  });

  // 6. The "Merger": Combine Drawings + Imports into one Estimate List
  const combinedEstimate = useMemo(() => {
    // Start with Imported Items
    const allItems = [...importedItems];

    // Add Drawn Items (converted to Estimate Rows)
    markups.forEach(m => {
        // DEBUG: Check your console (F12) to see exactly what the drawing tool sends
        console.log("Raw Markup Data:", m);

        // CALCULATE SF: Try multiple property names just in case
        // Some tools use 'measurement', others 'area', others 'value'
        let calculatedSF = 0;
        if (m.measurement) calculatedSF = m.measurement;
        else if (m.area) calculatedSF = m.area;
        else if (m.width && m.height) calculatedSF = (m.width * m.height);

        // PUSH IT: We add it regardless of type (no more strict filtering)
        allItems.push({
            id: m.id || `draw-${Math.random()}`,
            // If no label, show the type so we know what it is (e.g., "Drawing (RECTANGLE)")
            system: m.label || `Drawing (${m.type || 'Unknown'})`,
            qty: 1,
            width: m.width || 0,
            height: m.height || 0,
            totalSF: calculatedSF,
            source: 'DRAWING' // Tag it
        });
    });

    return allItems;
  }, [markups, importedItems]);

  // Helper function to add imported items (Layer 21 - PartnerPak Import)
  const addImportedItems = useCallback((items) => {
    setImportedItems(prevItems => [...prevItems, ...items]);
  }, []);

  // Helper function to update an item in the combined estimate
  const updateEstimateItem = useCallback((itemId, updates) => {
    // Check if it's an imported item (updates importedItems array)
    setImportedItems(prevItems => {
      const itemIndex = prevItems.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        const newItems = [...prevItems];
        newItems[itemIndex] = { ...newItems[itemIndex], ...updates };
        return newItems;
      }
      return prevItems;
    });

    // Check if it's a markup/drawing item (updates markups array)
    setMarkups(prevMarkups => {
      const markupIndex = prevMarkups.findIndex(m => m.id === itemId);
      if (markupIndex !== -1) {
        const newMarkups = [...prevMarkups];
        newMarkups[markupIndex] = { ...newMarkups[markupIndex], ...updates };
        return newMarkups;
      }
      return prevMarkups;
    });
  }, []);

  // Helper function to update a system definition (Layer 24 - Remote Control)
  const updateSystemDefinition = useCallback((systemId, updates) => {
    setSystemDefinitions(prevSystems => {
      return prevSystems.map(system => 
        system.id === systemId 
          ? { ...system, ...updates } 
          : system
      );
    });
  }, []);

  return (
    <ProjectContext.Provider value={{ 
        markups, 
        setMarkups, 
        importedItems, 
        setImportedItems, 
        addImportedItems,
        globalSettings, 
        setGlobalSettings,
        laborCrew,
        setLaborCrew,
        equipmentLibrary,
        setEquipmentLibrary,
        glassTypes,
        setGlassTypes,
        systemDefinitions,
        setSystemDefinitions,
        updateSystemDefinition,
        adminSettings,
        setAdminSettings,
        bidSettings,
        setBidSettings,
        combinedEstimate,
        updateEstimateItem,
        architecturalFiles,
        setArchitecturalFiles,
        intakeFileCategories,
        setIntakeFileCategories
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

export default ProjectContext;
