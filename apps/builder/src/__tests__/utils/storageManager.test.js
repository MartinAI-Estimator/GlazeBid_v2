/**
 * GlazeBid AIQ - Storage Manager Tests (Category 15: Data Persistence)
 * =====================================================================
 * Tests for auto-save functionality and local storage fallback mechanisms.
 * Ensures estimators never lose their work during browser sessions.
 * 
 * Test Coverage:
 * - Auto-save to localStorage
 * - Project file export (.aiq format)
 * - Re-hydration from stored data
 * - Error handling for storage quota
 * 
 * Mocking Strategy:
 * - localStorage API is mocked in setup.js
 * - Tests verify setItem/getItem calls with correct payloads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


// =============================================================================
// STORAGE MANAGER IMPLEMENTATION (Under Test)
// =============================================================================

/**
 * Project version for schema compatibility
 */
const PROJECT_VERSION = '1.0.0';

/**
 * Storage key prefix for GlazeBid projects
 */
const STORAGE_PREFIX = 'glazebid_project_';

/**
 * Save project state to localStorage for auto-recovery
 * 
 * @param {Object} projectState - Complete project state
 * @returns {boolean} - Success status
 */
function saveProjectLocally(projectState) {
  if (!projectState || !projectState.project_id) {
    console.error('Invalid project state: missing project_id');
    return false;
  }
  
  const storageKey = `${STORAGE_PREFIX}${projectState.project_id}`;
  
  const storagePayload = {
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project_id: projectState.project_id,
    data: projectState,
  };
  
  try {
    const jsonPayload = JSON.stringify(storagePayload);
    localStorage.setItem(storageKey, jsonPayload);
    return true;
  } catch (error) {
    // Handle quota exceeded or other storage errors
    console.error('Failed to save to localStorage:', error);
    return false;
  }
}

/**
 * Load project state from localStorage
 * 
 * @param {string} projectId - Project identifier
 * @returns {Object|null} - Project state or null if not found
 */
function loadProjectLocally(projectId) {
  if (!projectId) {
    return null;
  }
  
  const storageKey = `${STORAGE_PREFIX}${projectId}`;
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return null;
    }
    
    const parsed = JSON.parse(stored);
    
    // Validate version compatibility
    if (!parsed.version) {
      console.warn('Stored project missing version, may be incompatible');
    }
    
    return parsed.data;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return null;
  }
}

/**
 * Remove project from localStorage (on successful cloud sync)
 * 
 * @param {string} projectId - Project identifier
 */
function clearProjectLocally(projectId) {
  if (!projectId) return;
  
  const storageKey = `${STORAGE_PREFIX}${projectId}`;
  localStorage.removeItem(storageKey);
}

/**
 * Generate exportable project file in .aiq format
 * This is our proprietary format for project backup/restore
 * 
 * @param {Object} projectState - Complete project state
 * @returns {Object} - Structured .aiq file content
 */
function generateProjectFile(projectState) {
  if (!projectState) {
    throw new Error('Invalid project state');
  }
  
  // Build schema-compliant export structure
  const aiqFile = {
    // Required: Schema version for forward compatibility
    version: PROJECT_VERSION,
    
    // Required: Project metadata
    project_meta: {
      id: projectState.project_id || 'unknown',
      name: projectState.project_name || 'Untitled Project',
      created_at: projectState.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client: projectState.client || {},
      location: projectState.location || {},
    },
    
    // Required: Frame/takeoff data
    frames: (projectState.frames || []).map(frame => ({
      id: frame.id,
      tag: frame.tag,
      quantity: frame.quantity || 1,
      width: frame.width || 0,
      height: frame.height || 0,
      sf: frame.sf || 0,
      dlos: frame.dlos || 0,
      shop_mhs: frame.shop_mhs || 0,
      field_mhs: frame.field_mhs || 0,
      dist_mhs: frame.dist_mhs || 0,
      total_mhs: frame.total_mhs || 0,
      total_cost: frame.total_cost || 0,
      system_id: frame.system_id || 'default',
    })),
    
    // Required: Canvas markups (PDF annotations)
    canvas_markups: (projectState.canvas_markups || []).map(markup => ({
      id: markup.id,
      type: markup.type,
      page: markup.page || 1,
      coordinates: markup.coordinates || {},
      label: markup.label || '',
      color: markup.color || '#FF0000',
    })),
    
    // Optional: Production rates
    rates: projectState.rates || {},
    
    // Optional: System configurations
    systems: projectState.systems || [],
  };
  
  return aiqFile;
}

/**
 * Validate .aiq file structure for import
 * 
 * @param {Object} aiqFile - File content to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateAiqFile(aiqFile) {
  const errors = [];
  
  // Check required top-level fields
  const requiredFields = ['version', 'project_meta', 'frames', 'canvas_markups'];
  
  for (const field of requiredFields) {
    if (!(field in aiqFile)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate version
  if (aiqFile.version && typeof aiqFile.version !== 'string') {
    errors.push('Invalid version format: must be string');
  }
  
  // Validate project_meta
  if (aiqFile.project_meta) {
    if (!aiqFile.project_meta.id) {
      errors.push('project_meta missing required field: id');
    }
    if (!aiqFile.project_meta.name) {
      errors.push('project_meta missing required field: name');
    }
  }
  
  // Validate frames array
  if (aiqFile.frames && !Array.isArray(aiqFile.frames)) {
    errors.push('frames must be an array');
  }
  
  // Validate canvas_markups array
  if (aiqFile.canvas_markups && !Array.isArray(aiqFile.canvas_markups)) {
    errors.push('canvas_markups must be an array');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


// =============================================================================
// TEST CASE 1: AUTO-SAVE TO LOCALSTORAGE
// =============================================================================

describe('StorageManager - Auto-Save to LocalStorage', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks();
    localStorage.setItem.mockClear();
    localStorage.getItem.mockClear();
  });
  
  it('should call localStorage.setItem with correct stringified JSON payload', () => {
    const mockProjectState = {
      project_id: 'proj-123',
      project_name: 'Downtown Tower',
      frames: [
        { id: 'frame-1', tag: 'A01', quantity: 2, sf: 28 },
        { id: 'frame-2', tag: 'A02', quantity: 1, sf: 42 },
      ],
      canvas_markups: [],
      rates: { shopRate: 45.00 },
    };
    
    // Call the save function
    const result = saveProjectLocally(mockProjectState);
    
    // Verify localStorage.setItem was called
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    
    // Verify correct key
    const [storageKey, storedValue] = localStorage.setItem.mock.calls[0];
    expect(storageKey).toBe('glazebid_project_proj-123');
    
    // Verify payload structure
    const parsed = JSON.parse(storedValue);
    expect(parsed.version).toBe(PROJECT_VERSION);
    expect(parsed.project_id).toBe('proj-123');
    expect(parsed.data).toEqual(mockProjectState);
    expect(parsed.savedAt).toBeDefined();
    
    // Verify success return
    expect(result).toBe(true);
  });
  
  it('should include savedAt timestamp in storage payload', () => {
    const before = new Date().toISOString();
    
    saveProjectLocally({
      project_id: 'proj-timestamp-test',
      frames: [],
    });
    
    const after = new Date().toISOString();
    
    expect(localStorage.setItem).toHaveBeenCalled();
    
    const [, storedValue] = localStorage.setItem.mock.calls[0];
    const parsed = JSON.parse(storedValue);
    
    // savedAt should be between before and after
    expect(parsed.savedAt).toBeDefined();
    expect(new Date(parsed.savedAt) >= new Date(before)).toBe(true);
    expect(new Date(parsed.savedAt) <= new Date(after)).toBe(true);
  });
  
  it('should return false for invalid project state (missing project_id)', () => {
    const invalidState = {
      project_name: 'No ID Project',
      frames: [],
    };
    
    const result = saveProjectLocally(invalidState);
    
    expect(result).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  
  it('should return false for null project state', () => {
    const result = saveProjectLocally(null);
    
    expect(result).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  
  it('should handle localStorage quota exceeded error gracefully', () => {
    // Mock setItem to throw quota exceeded error
    localStorage.setItem.mockImplementationOnce(() => {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    });
    
    const result = saveProjectLocally({
      project_id: 'proj-quota-test',
      frames: [],
    });
    
    expect(result).toBe(false);
  });
});


// =============================================================================
// TEST - LOAD FROM LOCALSTORAGE
// =============================================================================

describe('StorageManager - Load from LocalStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should retrieve and parse stored project data', () => {
    const storedData = {
      version: PROJECT_VERSION,
      savedAt: '2026-02-19T10:00:00.000Z',
      project_id: 'proj-load-test',
      data: {
        project_id: 'proj-load-test',
        project_name: 'Stored Project',
        frames: [{ id: '1', tag: 'A01', sf: 28 }],
      },
    };
    
    localStorage.getItem.mockReturnValueOnce(JSON.stringify(storedData));
    
    const result = loadProjectLocally('proj-load-test');
    
    expect(localStorage.getItem).toHaveBeenCalledWith('glazebid_project_proj-load-test');
    expect(result).toEqual(storedData.data);
    expect(result.project_name).toBe('Stored Project');
  });
  
  it('should return null for non-existent project', () => {
    localStorage.getItem.mockReturnValueOnce(null);
    
    const result = loadProjectLocally('non-existent-id');
    
    expect(result).toBeNull();
  });
  
  it('should return null for invalid JSON in storage', () => {
    localStorage.getItem.mockReturnValueOnce('invalid json {{{');
    
    const result = loadProjectLocally('proj-invalid');
    
    expect(result).toBeNull();
  });
});


// =============================================================================
// TEST CASE 2: JSON FILE EXPORT FORMATTING (.aiq)
// =============================================================================

describe('StorageManager - JSON File Export Formatting', () => {
  it('should generate file matching strict .aiq schema', () => {
    const projectState = {
      project_id: 'proj-export-test',
      project_name: 'Export Test Project',
      created_at: '2026-01-15T08:00:00.000Z',
      client: { name: 'ACME Corp', contact: 'John Doe' },
      location: { city: 'Miami', state: 'FL' },
      frames: [
        { id: 'frame-1', tag: 'A01', quantity: 2, width: 48, height: 84, sf: 28, dlos: 1, shop_mhs: 3.08, total_cost: 595.14 },
        { id: 'frame-2', tag: 'A02', quantity: 1, width: 60, height: 96, sf: 40, dlos: 2, shop_mhs: 4.40, total_cost: 850.20 },
      ],
      canvas_markups: [
        { id: 'markup-1', type: 'rectangle', page: 1, coordinates: { x: 100, y: 200 }, label: 'SF-01', color: '#FF0000' },
      ],
      rates: { shopRate: 45.00, fieldRate: 55.00 },
      systems: ['ext-sf-1:1'],
    };
    
    // Generate .aiq file
    const aiqFile = generateProjectFile(projectState);
    
    // REQUIRED: version field
    expect(aiqFile.version).toBe(PROJECT_VERSION);
    expect(typeof aiqFile.version).toBe('string');
    
    // REQUIRED: project_meta
    expect(aiqFile.project_meta).toBeDefined();
    expect(aiqFile.project_meta.id).toBe('proj-export-test');
    expect(aiqFile.project_meta.name).toBe('Export Test Project');
    expect(aiqFile.project_meta.created_at).toBe('2026-01-15T08:00:00.000Z');
    expect(aiqFile.project_meta.updated_at).toBeDefined();
    expect(aiqFile.project_meta.client).toEqual({ name: 'ACME Corp', contact: 'John Doe' });
    expect(aiqFile.project_meta.location).toEqual({ city: 'Miami', state: 'FL' });
    
    // REQUIRED: frames array
    expect(aiqFile.frames).toBeDefined();
    expect(Array.isArray(aiqFile.frames)).toBe(true);
    expect(aiqFile.frames).toHaveLength(2);
    
    // Verify frame structure
    expect(aiqFile.frames[0]).toMatchObject({
      id: 'frame-1',
      tag: 'A01',
      quantity: 2,
      width: 48,
      height: 84,
      sf: 28,
      dlos: 1,
      shop_mhs: 3.08,
      total_cost: 595.14,
    });
    
    // REQUIRED: canvas_markups array
    expect(aiqFile.canvas_markups).toBeDefined();
    expect(Array.isArray(aiqFile.canvas_markups)).toBe(true);
    expect(aiqFile.canvas_markups).toHaveLength(1);
    
    // Verify markup structure
    expect(aiqFile.canvas_markups[0]).toMatchObject({
      id: 'markup-1',
      type: 'rectangle',
      page: 1,
      label: 'SF-01',
      color: '#FF0000',
    });
    
    // OPTIONAL: rates
    expect(aiqFile.rates).toEqual({ shopRate: 45.00, fieldRate: 55.00 });
    
    // OPTIONAL: systems
    expect(aiqFile.systems).toEqual(['ext-sf-1:1']);
  });
  
  it('should handle empty frames and markups arrays', () => {
    const minimalState = {
      project_id: 'proj-minimal',
      project_name: 'Minimal Project',
      frames: [],
      canvas_markups: [],
    };
    
    const aiqFile = generateProjectFile(minimalState);
    
    expect(aiqFile.version).toBe(PROJECT_VERSION);
    expect(aiqFile.project_meta.id).toBe('proj-minimal');
    expect(aiqFile.frames).toEqual([]);
    expect(aiqFile.canvas_markups).toEqual([]);
  });
  
  it('should provide defaults for missing optional fields', () => {
    const incompleteState = {
      project_id: 'proj-incomplete',
    };
    
    const aiqFile = generateProjectFile(incompleteState);
    
    // Should not crash, should provide defaults
    expect(aiqFile.project_meta.name).toBe('Untitled Project');
    expect(aiqFile.frames).toEqual([]);
    expect(aiqFile.canvas_markups).toEqual([]);
    expect(aiqFile.rates).toEqual({});
    expect(aiqFile.systems).toEqual([]);
  });
  
  it('should throw error for null project state', () => {
    expect(() => generateProjectFile(null)).toThrow('Invalid project state');
  });
});


// =============================================================================
// TEST - .aiq FILE VALIDATION
// =============================================================================

describe('StorageManager - .aiq File Validation', () => {
  it('should validate complete .aiq file structure', () => {
    const validFile = {
      version: '1.0.0',
      project_meta: {
        id: 'proj-valid',
        name: 'Valid Project',
      },
      frames: [],
      canvas_markups: [],
    };
    
    const result = validateAiqFile(validFile);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  it('should detect missing required fields', () => {
    const invalidFile = {
      version: '1.0.0',
      // Missing: project_meta, frames, canvas_markups
    };
    
    const result = validateAiqFile(invalidFile);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: project_meta');
    expect(result.errors).toContain('Missing required field: frames');
    expect(result.errors).toContain('Missing required field: canvas_markups');
  });
  
  it('should detect missing project_meta required fields', () => {
    const invalidFile = {
      version: '1.0.0',
      project_meta: {
        // Missing: id, name
      },
      frames: [],
      canvas_markups: [],
    };
    
    const result = validateAiqFile(invalidFile);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('project_meta missing required field: id');
    expect(result.errors).toContain('project_meta missing required field: name');
  });
  
  it('should detect invalid array types', () => {
    const invalidFile = {
      version: '1.0.0',
      project_meta: { id: 'test', name: 'Test' },
      frames: 'not an array',
      canvas_markups: { invalid: true },
    };
    
    const result = validateAiqFile(invalidFile);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('frames must be an array');
    expect(result.errors).toContain('canvas_markups must be an array');
  });
});


// =============================================================================
// TEST - CLEAR FROM STORAGE
// =============================================================================

describe('StorageManager - Clear from Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should call localStorage.removeItem with correct key', () => {
    clearProjectLocally('proj-to-clear');
    
    expect(localStorage.removeItem).toHaveBeenCalledTimes(1);
    expect(localStorage.removeItem).toHaveBeenCalledWith('glazebid_project_proj-to-clear');
  });
  
  it('should handle null project_id gracefully', () => {
    clearProjectLocally(null);
    
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });
});
