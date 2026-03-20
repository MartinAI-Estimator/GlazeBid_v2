/**
 * System-specific column configurations
 * Based on Excel BidSheet structure (Row 14, columns B-M)
 */

export const SYSTEM_COLUMNS = {
  'ext-sf-1': [
    { key: 'frame_number', label: 'Frame Name', editable: true, type: 'text', width: '140px', tooltip: 'Frame identifier (e.g., A01-A05)', group: 'identity' },
    { key: 'comments', label: 'Comments', editable: true, type: 'text', width: '180px', tooltip: 'Additional notes or specifications', group: 'identity' },
    { key: 'subsills', label: 'Subsills', editable: true, type: 'number', width: '90px', tooltip: 'Number of subsills to add', group: 'geometry' },
    { key: 'bays', label: '> Bays', editable: true, type: 'number', width: '90px', tooltip: 'Number of vertical mullions (bays)', group: 'geometry' },
    { key: 'dlos', label: '> DLOs', editable: true, type: 'number', width: '90px', tooltip: 'Daylight openings', group: 'geometry' },
    { key: 'pairs', label: 'Pairs', editable: true, type: 'number', width: '90px', tooltip: 'Paired window units', group: 'operations' },
    { key: 'singles', label: 'Singles', editable: true, type: 'number', width: '90px', tooltip: 'Single window units', group: 'operations' },
    { key: 'ssg', label: 'SSG', editable: true, type: 'number', width: '90px', tooltip: 'Structural silicone glazing', group: 'operations' },
    { key: 'steel', label: 'Steel', editable: true, type: 'number', width: '90px', tooltip: 'Steel reinforcement', group: 'operations' },
    { key: 'vents', label: 'Vents', editable: true, type: 'number', width: '90px', tooltip: 'Operable vents', group: 'operations' },
    { key: 'brake', label: 'Brake', editable: true, type: 'number', width: '90px', tooltip: 'Brake metal work', group: 'operations' },
    { key: 'open', label: 'Open', editable: true, type: 'number', width: '90px', tooltip: 'Additional opening operations', group: 'operations' }
  ],
  
  'ext-sf-2': [
    { key: 'frame_number', label: 'Frame Name', editable: true, type: 'text', width: '140px', tooltip: 'Frame identifier (e.g., A01-A05)', group: 'identity' },
    { key: 'comments', label: 'Comments', editable: true, type: 'text', width: '180px', tooltip: 'Additional notes or specifications', group: 'identity' },
    { key: 'subsills', label: 'Subsills', editable: true, type: 'number', width: '90px', tooltip: 'Number of subsills to add', group: 'geometry' },
    { key: 'bays', label: '> Bays', editable: true, type: 'number', width: '90px', tooltip: 'Number of vertical mullions (bays)', group: 'geometry' },
    { key: 'dlos', label: '> DLOs', editable: true, type: 'number', width: '90px', tooltip: 'Daylight openings', group: 'geometry' },
    { key: 'pairs', label: 'Pairs', editable: true, type: 'number', width: '90px', tooltip: 'Paired window units', group: 'operations' },
    { key: 'singles', label: 'Singles', editable: true, type: 'number', width: '90px', tooltip: 'Single window units', group: 'operations' },
    { key: 'ssg', label: 'SSG', editable: true, type: 'number', width: '90px', tooltip: 'Structural silicone glazing', group: 'operations' },
    { key: 'steel', label: 'Steel', editable: true, type: 'number', width: '90px', tooltip: 'Steel reinforcement', group: 'operations' },
    { key: 'vents', label: 'Vents', editable: true, type: 'number', width: '90px', tooltip: 'Operable vents', group: 'operations' },
    { key: 'brake', label: 'Brake', editable: true, type: 'number', width: '90px', tooltip: 'Brake metal work', group: 'operations' },
    { key: 'open', label: 'Open', editable: true, type: 'number', width: '90px', tooltip: 'Additional opening operations', group: 'operations' }
  ],
  
  'int-sf': [
    { key: 'frame_number', label: 'Frame Name', editable: true, type: 'text', width: '140px', tooltip: 'Frame identifier (e.g., A01-A05)', group: 'identity' },
    { key: 'comments', label: 'Comments', editable: true, type: 'text', width: '180px', tooltip: 'Additional notes or specifications', group: 'identity' },
    // Note: Column D is empty in Int SF
    { key: 'bays', label: '> Bays', editable: true, type: 'number', width: '90px', tooltip: 'Number of vertical mullions (bays)', group: 'geometry' },
    { key: 'dlos', label: '> DLOs', editable: true, type: 'number', width: '90px', tooltip: 'Daylight openings', group: 'geometry' },
    { key: 'pairs', label: 'Pairs', editable: true, type: 'number', width: '90px', tooltip: 'Paired window units', group: 'operations' },
    { key: 'singles', label: 'Singles', editable: true, type: 'number', width: '90px', tooltip: 'Single window units', group: 'operations' },
    { key: 'ssg', label: 'SSG', editable: true, type: 'number', width: '90px', tooltip: 'Structural silicone glazing', group: 'operations' },
    { key: 'steel', label: 'Steel', editable: true, type: 'number', width: '90px', tooltip: 'Steel reinforcement', group: 'operations' },
    { key: 'vents', label: 'Vents', editable: true, type: 'number', width: '90px', tooltip: 'Operable vents', group: 'operations' },
    { key: 'brake', label: 'Brake', editable: true, type: 'number', width: '90px', tooltip: 'Brake metal work', group: 'operations' },
    { key: 'open', label: 'Open', editable: true, type: 'number', width: '90px', tooltip: 'Additional opening operations', group: 'operations' }
  ],
  
  'cap-cw': [
    { key: 'frame_number', label: 'Frame Name', editable: true, type: 'text', width: '140px', tooltip: 'Frame identifier (e.g., A01-A05)', group: 'identity' },
    { key: 'comments', label: 'Comments', editable: true, type: 'text', width: '180px', tooltip: 'Additional notes or specifications', group: 'identity' },
    { key: 'stool_trim', label: 'Stool Trim', editable: true, type: 'number', width: '100px', tooltip: 'Stool and trim work', group: 'geometry' },
    { key: 'ft', label: 'F/T', editable: true, type: 'number', width: '90px', tooltip: 'Flash and trim', group: 'geometry' },
    { key: 'dlos', label: '> DLOs', editable: true, type: 'number', width: '90px', tooltip: 'Daylight openings', group: 'geometry' },
    { key: 'pairs', label: 'Pairs', editable: true, type: 'number', width: '90px', tooltip: 'Paired window units', group: 'operations' },
    { key: 'singles', label: 'Singles', editable: true, type: 'number', width: '90px', tooltip: 'Single window units', group: 'operations' },
    { key: 'ssg', label: 'SSG', editable: true, type: 'number', width: '90px', tooltip: 'Structural silicone glazing', group: 'operations' },
    { key: 'steel', label: 'Steel', editable: true, type: 'number', width: '90px', tooltip: 'Steel reinforcement', group: 'operations' },
    { key: 'vents', label: 'Vents', editable: true, type: 'number', width: '90px', tooltip: 'Operable vents', group: 'operations' },
    { key: 'brake', label: 'Brake', editable: true, type: 'number', width: '90px', tooltip: 'Brake metal work', group: 'operations' },
    { key: 'wl_dl', label: 'WL/DL', editable: true, type: 'number', width: '90px', tooltip: 'Window/Door lites', group: 'operations' }
  ],
  
  'ssg-cw': [
    { key: 'frame_number', label: 'Frame Name', editable: true, type: 'text', width: '140px', tooltip: 'Frame identifier (e.g., A01-A05)', group: 'identity' },
    { key: 'comments', label: 'Comments', editable: true, type: 'text', width: '180px', tooltip: 'Additional notes or specifications', group: 'identity' },
    { key: 'stool_trim', label: 'Stool Trim', editable: true, type: 'number', width: '100px', tooltip: 'Stool and trim work', group: 'geometry' },
    { key: 'ft', label: 'F/T', editable: true, type: 'number', width: '90px', tooltip: 'Flash and trim', group: 'geometry' },
    { key: 'dlos', label: '> DLOs', editable: true, type: 'number', width: '90px', tooltip: 'Daylight openings', group: 'geometry' },
    { key: 'pairs', label: 'Pairs', editable: true, type: 'number', width: '90px', tooltip: 'Paired window units', group: 'operations' },
    { key: 'singles', label: 'Singles', editable: true, type: 'number', width: '90px', tooltip: 'Single window units', group: 'operations' },
    { key: 'ssg', label: 'SSG', editable: true, type: 'number', width: '90px', tooltip: 'Structural silicone glazing', group: 'operations' },
    { key: 'steel', label: 'Steel', editable: true, type: 'number', width: '90px', tooltip: 'Steel reinforcement', group: 'operations' },
    { key: 'vents', label: 'Vents', editable: true, type: 'number', width: '90px', tooltip: 'Operable vents', group: 'operations' },
    { key: 'brake', label: 'Brake', editable: true, type: 'number', width: '90px', tooltip: 'Brake metal work', group: 'operations' },
    { key: 'wl_dl', label: 'WL/DL', editable: true, type: 'number', width: '90px', tooltip: 'Window/Door lites', group: 'operations' }
  ]
};

/**
 * Get columns for a specific system
 */
export function getSystemColumns(systemId) {
  // Normalize system ID (remove instance suffix like ":1")
  const baseSystemId = systemId?.split(':')[0] || 'ext-sf-1';
  return SYSTEM_COLUMNS[baseSystemId] || SYSTEM_COLUMNS['ext-sf-1'];
}

/**
 * Get editable field keys for a system
 */
export function getEditableFields(systemId) {
  const columns = getSystemColumns(systemId);
  return columns.filter(col => col.editable).map(col => col.key);
}
