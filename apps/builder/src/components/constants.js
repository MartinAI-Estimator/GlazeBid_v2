// constants.js - Complete Glazing System Definitions

/**
 * GLAZING SYSTEM CLASSES
 * Color-coded classification matching industry standards
 * Format: { color: 'rgba(r, g, b, a)', label: 'shortcut', unit: 'measurement' }
 */
export const GLAZING_CLASSES = {
  // Primary Systems
  'STOREFRONT': { color: 'rgba(255, 140, 0, 0.7)', label: 'S', unit: 'SF', shortcut: 'S' },
  'CURTAIN WALL': { color: 'rgba(34, 139, 34, 0.7)', label: 'C', unit: 'SF', shortcut: 'C' },
  'WINDOW WALL': { color: 'rgba(0, 0, 255, 0.7)', label: 'W', unit: 'SF', shortcut: 'W' },
  'INTERIOR STOREFRONT': { color: 'rgba(255, 165, 0, 0.7)', label: 'I', unit: 'SF', shortcut: 'I' },
  'INTERIOR CURTAIN WALL': { color: 'rgba(46, 139, 87, 0.7)', label: 'IC', unit: 'SF' },
  
  // Doors & Openings
  'DOOR_ALUMINUM': { color: 'rgba(0, 255, 0, 0.7)', label: 'D', unit: 'EA', shortcut: 'D' },
  'ALL GLASS DOOR': { color: 'rgba(0, 255, 255, 0.7)', label: 'AGD', unit: 'EA' },
  'BI-FOLD DOOR_ALUMINUM SLIDING': { color: 'rgba(255, 69, 0, 0.7)', label: 'BF', unit: 'LF' },
  'AUTOMATIC SLIDING': { color: 'rgba(50, 205, 50, 0.7)', label: 'AS', unit: 'EA' },
  
  // Windows & Glass
  'FIXED WINDOW_OPERABLE WINDOW': { color: 'rgba(100, 149, 237, 0.7)', label: 'FW', unit: 'SF' },
  'ALL GLASS WALL': { color: 'rgba(173, 216, 230, 0.7)', label: 'AGW', unit: 'SF' },
  'TRANSACTION WINDOW': { color: 'rgba(255, 20, 147, 0.7)', label: 'T', unit: 'EA', shortcut: 'T' },
  'BULLET RESISTANT': { color: 'rgba(139, 0, 0, 0.7)', label: 'BR', unit: 'SF' },
  'GLAZING_ONLY': { color: 'rgba(255, 192, 203, 0.7)', label: 'GO', unit: 'SF' },
  
  // Metal & Framing
  'BRAKE METAL': { color: 'rgba(128, 128, 128, 0.7)', label: 'B', unit: 'LF', shortcut: 'B' },
  'BUTT JOINT': { color: 'rgba(211, 211, 211, 0.7)', label: 'BJ', unit: 'LF' },
  'FIRE RATED FRAMING': { color: 'rgba(255, 0, 0, 0.7)', label: 'F', unit: 'LF', shortcut: 'F' },
  'ALUMINUM LOUVER': { color: 'rgba(218, 165, 32, 0.7)', label: 'AL', unit: 'SF' },
  'BACKPAN_SHADOW PAN': { color: 'rgba(105, 105, 105, 0.7)', label: 'BP', unit: 'LF' },
  
  // Specialty Systems
  'SSG': { color: 'rgba(153, 50, 204, 0.7)', label: 'SSG', unit: 'SF' },
  'FILM': { color: 'rgba(255, 255, 0, 0.4)', label: 'FM', unit: 'SF' },
  'TRANSLUCENT PANEL': { color: 'rgba(240, 230, 140, 0.7)', label: 'TP', unit: 'SF' },
  'SUNSHADE': { color: 'rgba(255, 215, 0, 0.7)', label: 'SS', unit: 'SF' },
  'GLASS HANDRAIL': { color: 'rgba(0, 191, 255, 0.7)', label: 'GH', unit: 'LF' },
  'SKYLIGHT': { color: 'rgba(75, 0, 130, 0.7)', label: 'SK', unit: 'SF' },
  
  // Hardware (Count mode)
  'FIRE RATED GLAZING': { color: 'rgba(220, 20, 60, 0.7)', label: 'FRG', unit: 'EA' },
  'WINDLOAD CLIP': { color: 'rgba(70, 130, 180, 0.7)', label: 'WC', unit: 'EA' },
  'DEADLOAD CLIP': { color: 'rgba(95, 158, 160, 0.7)', label: 'DC', unit: 'EA' },
};

/**
 * TOOL MODES
 * Different markup interaction patterns
 */
export const TOOL_MODES = {
  HIGHLIGHT: 'Highlight',      // Semi-transparent overlay (fastest)
  POLYLINE: 'Polyline',        // Linear measurement tool
  AREA: 'Area',                // Closed polygon for precise SF
  COUNT: 'Count',              // Point-based counting (EA)
  SMART_FRAME: 'SmartFrame',   // Container-based frame markup with internal grid
  CALIBRATION: 'Calibration'   // Scale setting tool
};

/**
 * TOOL CATEGORIES
 * Organize tools by typical use case
 */
export const TOOL_CATEGORIES = {
  HIGHLIGHT: [
    'STOREFRONT', 'CURTAIN WALL', 'WINDOW WALL', 'INTERIOR STOREFRONT', 
    'INTERIOR CURTAIN WALL', 'DOOR_ALUMINUM', 'FIXED WINDOW_OPERABLE WINDOW',
    'ALL GLASS WALL', 'ALL GLASS DOOR', 'TRANSACTION WINDOW', 'BULLET RESISTANT',
    'BRAKE METAL', 'BUTT JOINT', 'BI-FOLD DOOR_ALUMINUM SLIDING', 'AUTOMATIC SLIDING',
    'FIRE RATED FRAMING', 'ALUMINUM LOUVER', 'BACKPAN_SHADOW PAN', 'FILM',
    'TRANSLUCENT PANEL', 'SUNSHADE', 'GLASS HANDRAIL', 'SKYLIGHT'
  ],
  POLYLINE: [
    'STOREFRONT', 'CURTAIN WALL', 'WINDOW WALL', 'INTERIOR STOREFRONT',
    'INTERIOR CURTAIN WALL', 'FIXED WINDOW_OPERABLE WINDOW', 'ALL GLASS WALL',
    'TRANSACTION WINDOW', 'BULLET RESISTANT', 'BRAKE METAL', 'BUTT JOINT',
    'BI-FOLD DOOR_ALUMINUM SLIDING', 'AUTOMATIC SLIDING', 'FIRE RATED FRAMING',
    'BACKPAN_SHADOW PAN', 'SSG'
  ],
  AREA: [
    'STOREFRONT', 'CURTAIN WALL', 'WINDOW WALL', 'INTERIOR STOREFRONT',
    'INTERIOR CURTAIN WALL', 'FIXED WINDOW_OPERABLE WINDOW', 'ALL GLASS WALL',
    'TRANSACTION WINDOW', 'BULLET RESISTANT', 'FIRE RATED GLAZING', 'FIRE RATED FRAMING',
    'ALUMINUM LOUVER', 'BACKPAN_SHADOW PAN', 'SSG', 'GLAZING_ONLY', 'FILM',
    'TRANSLUCENT PANEL', 'GLASS HANDRAIL', 'SKYLIGHT'
  ],
  SMARTFRAME: [
    'STOREFRONT', 'CURTAIN WALL', 'WINDOW WALL', 'INTERIOR STOREFRONT',
    'INTERIOR CURTAIN WALL', 'FIRE RATED FRAMING', 'SSG', 'GLAZING_ONLY'
  ],
  COUNT: [
    'DOOR_ALUMINUM', 'ALL GLASS DOOR', 'BULLET RESISTANT', 'BRAKE METAL',
    'BUTT JOINT', 'FIRE RATED GLAZING', 'WINDLOAD CLIP', 'DEADLOAD CLIP',
    'SSG', 'GLAZING_ONLY'
  ]
};

/**
 * KEYBOARD SHORTCUTS
 * Quick access to common tools
 * Format: Key + Modifier = Mode + Class
 */
export const KEYBOARD_SHORTCUTS = {
  // No modifier = Highlight mode
  'S': { mode: 'Highlight', class: 'STOREFRONT' },
  'C': { mode: 'Highlight', class: 'CURTAIN WALL' },
  'W': { mode: 'Highlight', class: 'WINDOW WALL' },
  'I': { mode: 'Highlight', class: 'INTERIOR STOREFRONT' },
  'D': { mode: 'Highlight', class: 'DOOR_ALUMINUM' },
  'B': { mode: 'Highlight', class: 'BRAKE METAL' },
  'F': { mode: 'Highlight', class: 'FIRE RATED FRAMING' },
  'T': { mode: 'Highlight', class: 'TRANSACTION WINDOW' },
  
  // Shift+ = Polyline mode
  'Shift+S': { mode: 'Polyline', class: 'STOREFRONT' },
  'Shift+C': { mode: 'Polyline', class: 'CURTAIN WALL' },
  'Shift+W': { mode: 'Polyline', class: 'WINDOW WALL' },
  'Shift+I': { mode: 'Polyline', class: 'INTERIOR STOREFRONT' },
  'Shift+D': { mode: 'Polyline', class: 'DOOR_ALUMINUM' },
  'Shift+B': { mode: 'Polyline', class: 'BRAKE METAL' },
  'Shift+F': { mode: 'Polyline', class: 'FIRE RATED FRAMING' },
  'Shift+T': { mode: 'Polyline', class: 'TRANSACTION WINDOW' },
  
  // Ctrl+ = Area mode
  'Ctrl+S': { mode: 'Area', class: 'STOREFRONT' },
  'Ctrl+C': { mode: 'Area', class: 'CURTAIN WALL' },
  'Ctrl+W': { mode: 'Area', class: 'WINDOW WALL' },
  'Ctrl+I': { mode: 'Area', class: 'INTERIOR STOREFRONT' },
  
  // Alt+ = Count mode
  'Alt+S': { mode: 'Count', class: 'STOREFRONT' },
  'Alt+C': { mode: 'Count', class: 'CURTAIN WALL' },
  'Alt+D': { mode: 'Count', class: 'DOOR_ALUMINUM' },
};

/**
 * MARKUP SETTINGS
 * Visual and interaction defaults
 */
export const MARKUP_SETTINGS = {
  SNAP_THRESHOLD: 15,           // pixels - snap radius for corner detection
  HANDLE_SIZE: 10,              // pixels - selection handle size
  LINE_WIDTH: 3,                // pixels - stroke width
  SELECTED_LINE_WIDTH: 4,       // pixels - selected stroke width
  HIGHLIGHT_ALPHA: 0.5,         // transparency for highlight mode
  AREA_ALPHA: 0.4,              // transparency for area mode
  COUNT_CIRCLE_RADIUS: 8,       // pixels - count marker size
  ORTHO_SNAP_ANGLE: 45,         // degrees - orthogonal snap increment
};

/**
 * CALCULATION HELPERS
 * Unit conversion and measurement utilities
 */
export const UNITS = {
  SF: 'SF',      // Square Feet
  LF: 'LF',      // Linear Feet
  EA: 'EA',      // Each (count)
  IN: 'IN',      // Inches
  FT: 'FT'       // Feet
};

// Helper function to get class configuration
export function getClassConfig(className) {
  return GLAZING_CLASSES[className] || GLAZING_CLASSES['STOREFRONT'];
}

// Helper function to determine unit based on mode
export function getUnitForMode(mode, className) {
  const classConfig = getClassConfig(className);
  
  if (mode === TOOL_MODES.COUNT) return UNITS.EA;
  if (mode === TOOL_MODES.POLYLINE) return UNITS.LF;
  if (mode === TOOL_MODES.AREA || mode === TOOL_MODES.HIGHLIGHT) return UNITS.SF;
  
  return classConfig.unit || UNITS.SF;
}
