/**
 * System Registry - Multi-System Configuration
 * Extensible system for adding new calculator types
 */

// System Type Definitions
export const SYSTEM_TYPES = {
  EXT_SF_1: 'ext-sf-1',
  EXT_SF_2: 'ext-sf-2',
  INT_SF: 'int-sf',
  CAP_CW: 'cap-cw',
  SSG_CW: 'ssg-cw'
};

// System configurations
export const systemRegistry = {
  [SYSTEM_TYPES.EXT_SF_1]: {
    id: SYSTEM_TYPES.EXT_SF_1,
    name: 'Exterior Storefront',
    shortName: 'Ext SF',
    description: 'Exterior storefront systems',
    sheetName: 'Ext SF',
    columns: 84,
    maxRows: 1018,
    icon: '🏢',
    color: '#3b82f6',
    hrFunctionTasks: [
      'joints', 'dist', 'subsills', 'bays', 'baysBig', 
      'dlos', 'dlosBig', 'pairs', 'singles', 'caulk', 
      'ssg', 'steel', 'vents', 'brakeMetal', 'open'
    ]
  },
  
  [SYSTEM_TYPES.EXT_SF_2]: {
    id: SYSTEM_TYPES.EXT_SF_2,
    name: 'Misc',
    shortName: 'Misc',
    description: 'Miscellaneous systems',
    sheetName: 'Misc',
    columns: 84,
    maxRows: 1018,
    icon: '📋',
    color: '#8b5cf6',
    hrFunctionTasks: [
      'joints', 'dist', 'subsills', 'bays', 'baysBig', 
      'dlos', 'dlosBig', 'pairs', 'singles', 'caulk', 
      'ssg', 'steel', 'vents', 'brakeMetal', 'open'
    ]
  },
  
  [SYSTEM_TYPES.INT_SF]: {
    id: SYSTEM_TYPES.INT_SF,
    name: 'Interior Storefront',
    shortName: 'Int SF',
    description: 'Interior storefront systems',
    sheetName: 'Int SF',
    columns: 85,
    maxRows: 1018,
    icon: '🏛️',
    color: '#10b981',
    hrFunctionTasks: [
      'joints', 'dist', 'subsills', 'bays', 'baysBig', 
      'dlos', 'dlosBig', 'pairs', 'singles', 'caulk', 
      'ssg', 'steel', 'vents', 'brakeMetal', 'open'
    ]
  },
  
  [SYSTEM_TYPES.CAP_CW]: {
    id: SYSTEM_TYPES.CAP_CW,
    name: 'Curtain Wall Cap',
    shortName: 'CW Cap',
    description: 'Curtain wall with cap system',
    sheetName: 'CW Cap',
    columns: 88,
    maxRows: 1018,
    icon: '🏗️',
    color: '#f59e0b',
    hrFunctionTasks: [
      'joints', 'dist', 'subsills', 'bays', 'baysBig', 
      'dlos', 'dlosBig', 'pairs', 'singles', 'caulk', 
      'ssg', 'steel', 'vents', 'brakeMetal', 'open'
    ]
  },
  
  [SYSTEM_TYPES.SSG_CW]: {
    id: SYSTEM_TYPES.SSG_CW,
    name: 'Curtain Wall SSG',
    shortName: 'CW SSG',
    description: 'Curtain wall with structural silicone glazing',
    sheetName: 'CW SSG',
    columns: 88,
    maxRows: 1018,
    icon: '🌐',
    color: '#ef4444',
    hrFunctionTasks: [
      'joints', 'dist', 'subsills', 'bays', 'baysBig', 
      'dlos', 'dlosBig', 'pairs', 'singles', 'caulk', 
      'ssg', 'steel', 'vents', 'brakeMetal', 'open'
    ]
  }
};

/**
 * Get system configuration by ID
 */
export function getSystem(systemId) {
  return systemRegistry[systemId] || null;
}

/**
 * Get all available systems
 */
export function getAllSystems() {
  return Object.values(systemRegistry);
}

/**
 * Register a new system (for extensibility)
 */
export function registerSystem(config) {
  if (!config.id || !config.name) {
    throw new Error('System must have id and name');
  }
  
  systemRegistry[config.id] = {
    columns: 85,
    maxRows: 1018,
    icon: '📐',
    color: '#6b7280',
    hrFunctionTasks: [],
    ...config
  };
  
  return systemRegistry[config.id];
}

/**
 * Get system dropdown options
 */
export function getSystemOptions() {
  return getAllSystems().map(system => ({
    value: system.id,
    label: system.name,
    shortLabel: system.shortName,
    icon: system.icon,
    color: system.color
  }));
}
