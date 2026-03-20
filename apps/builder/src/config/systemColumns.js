/**
 * System-Specific Column Configurations
 * Based on Excel BidSheet tabs: Ext SF 1, Int SF, CW Cap, CW SSG
 * Each system has unique input columns matching Excel structure (B13-M13+)
 */

// Column definitions
export const COLUMN_TYPES = {
  // Input columns (editable)
  INPUT: 'input',
  // Calculated columns (read-only, blue in Excel)
  CALCULATED: 'calculated',
  // Text columns (editable text)
  TEXT: 'text',
  // Number columns (editable numeric)
  NUMBER: 'number',
  // Select/dropdown columns
  SELECT: 'select'
};

// Base columns (common to all systems)
const BASE_COLUMNS = [
  {
    key: 'frame_number',
    label: 'Frame #',
    type: COLUMN_TYPES.TEXT,
    width: '120px',
    required: true
  },
  {
    key: 'width',
    label: 'Width',
    type: COLUMN_TYPES.NUMBER,
    width: '90px',
    required: true,
    unit: 'inches'
  },
  {
    key: 'height',
    label: 'Height',
    type: COLUMN_TYPES.NUMBER,
    width: '90px',
    required: true,
    unit: 'inches'
  },
  {
    key: 'quantity',
    label: 'Qty',
    type: COLUMN_TYPES.NUMBER,
    width: '70px',
    required: true
  }
];

// Output columns (calculated - common to all systems)
const OUTPUT_COLUMNS = [
  {
    key: 'sf',
    label: 'SF',
    type: COLUMN_TYPES.CALCULATED,
    width: '90px',
    decimals: 2
  },
  {
    key: 'bays',
    label: 'Bays',
    type: COLUMN_TYPES.CALCULATED,
    width: '70px',
    decimals: 0
  },
  {
    key: 'dlos',
    label: 'DLOs',
    type: COLUMN_TYPES.CALCULATED,
    width: '70px',
    decimals: 0
  }
];

// System-specific column configurations
export const SYSTEM_COLUMNS = {
  'ext-sf-1': {
    name: 'Ext SF 1',
    inputColumns: [
      ...BASE_COLUMNS,
      {
        key: 'material',
        label: 'Material',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Aluminum', 'Bronze', 'Stainless', 'Steel']
      },
      {
        key: 'frame_type',
        label: 'Type',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Fixed', 'Operable', 'Door', 'Sidelight']
      },
      {
        key: 'finish',
        label: 'Finish',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Clear Anodized', 'Dark Bronze', 'Black', 'Painted']
      },
      {
        key: 'glazing_type',
        label: 'Glazing',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['1" IG', '1-1/4" IG', 'Single', 'Laminated']
      }
    ],
    outputColumns: OUTPUT_COLUMNS,
    laborColumns: [
      {
        key: 'shop_mhs',
        label: 'Shop MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'dist_mhs',
        label: 'Dist MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'field_mhs',
        label: 'Field MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'total_mhs',
        label: 'Total MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '100px',
        decimals: 2
      }
    ],
    costColumns: [
      {
        key: 'total_cost',
        label: 'Cost',
        type: COLUMN_TYPES.CALCULATED,
        width: '110px',
        decimals: 2,
        isCurrency: true
      }
    ]
  },
  
  'ext-sf-2': {
    name: 'Ext SF 2',
    inputColumns: [
      ...BASE_COLUMNS,
      {
        key: 'material',
        label: 'Material',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Aluminum', 'Bronze', 'Stainless', 'Steel']
      },
      {
        key: 'frame_type',
        label: 'Type',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Fixed', 'Operable', 'Door', 'Sidelight']
      },
      {
        key: 'finish',
        label: 'Finish',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Clear Anodized', 'Dark Bronze', 'Black', 'Painted']
      },
      {
        key: 'glazing_type',
        label: 'Glazing',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['1" IG', '1-1/4" IG', 'Single', 'Laminated']
      }
    ],
    outputColumns: OUTPUT_COLUMNS,
    laborColumns: [
      {
        key: 'shop_mhs',
        label: 'Shop MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'dist_mhs',
        label: 'Dist MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'field_mhs',
        label: 'Field MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'total_mhs',
        label: 'Total MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '100px',
        decimals: 2
      }
    ],
    costColumns: [
      {
        key: 'total_cost',
        label: 'Cost',
        type: COLUMN_TYPES.CALCULATED,
        width: '110px',
        decimals: 2,
        isCurrency: true
      }
    ]
  },
  
  'int-sf': {
    name: 'Int SF (Interior Storefront)',
    inputColumns: [
      ...BASE_COLUMNS,
      {
        key: 'material',
        label: 'Material',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Aluminum', 'Bronze', 'Stainless']
      },
      {
        key: 'frame_type',
        label: 'Type',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Fixed', 'Door', 'Borrowed Lite', 'Sidelight']
      },
      {
        key: 'finish',
        label: 'Finish',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Clear Anodized', 'Dark Bronze', 'Black', 'Painted']
      },
      {
        key: 'glazing_type',
        label: 'Glazing',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['1/4" Tempered', '1/2" Laminated', '1" IG']
      }
    ],
    outputColumns: OUTPUT_COLUMNS,
    laborColumns: [
      {
        key: 'shop_mhs',
        label: 'Shop MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'dist_mhs',
        label: 'Dist MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'field_mhs',
        label: 'Field MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'total_mhs',
        label: 'Total MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '100px',
        decimals: 2
      }
    ],
    costColumns: [
      {
        key: 'total_cost',
        label: 'Cost',
        type: COLUMN_TYPES.CALCULATED,
        width: '110px',
        decimals: 2,
        isCurrency: true
      }
    ]
  },
  
  'cap-cw': {
    name: 'CW Cap (Curtain Wall - Cap System)',
    inputColumns: [
      ...BASE_COLUMNS,
      {
        key: 'panel_type',
        label: 'Panel Type',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Vision', 'Spandrel', 'Shadow Box', 'Operable']
      },
      {
        key: 'material',
        label: 'Material',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Aluminum', 'Steel']
      },
      {
        key: 'finish',
        label: 'Finish',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Clear Anodized', 'Dark Bronze', 'Black', 'PVDF']
      },
      {
        key: 'glazing_type',
        label: 'Glazing',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['1" IG', '1-1/4" IG', '1-1/2" IG', 'Insulated Panel']
      },
      {
        key: 'anchor_type',
        label: 'Anchor',
        type: COLUMN_TYPES.SELECT,
        width: '100px',
        options: ['Embed', 'Angle', 'Clip']
      }
    ],
    outputColumns: OUTPUT_COLUMNS,
    laborColumns: [
      {
        key: 'shop_mhs',
        label: 'Shop MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'dist_mhs',
        label: 'Dist MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'field_mhs',
        label: 'Field MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'total_mhs',
        label: 'Total MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '100px',
        decimals: 2
      }
    ],
    costColumns: [
      {
        key: 'total_cost',
        label: 'Cost',
        type: COLUMN_TYPES.CALCULATED,
        width: '110px',
        decimals: 2,
        isCurrency: true
      }
    ]
  },
  
  'ssg-cw': {
    name: 'CW SSG (Curtain Wall - Structural Silicone)',
    inputColumns: [
      ...BASE_COLUMNS,
      {
        key: 'panel_type',
        label: 'Panel Type',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Vision', 'Spandrel', 'Shadow Box', '2-Side SSG', '4-Side SSG']
      },
      {
        key: 'material',
        label: 'Material',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Aluminum', 'Steel']
      },
      {
        key: 'finish',
        label: 'Finish',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['Clear Anodized', 'Dark Bronze', 'Black', 'PVDF']
      },
      {
        key: 'glazing_type',
        label: 'Glazing',
        type: COLUMN_TYPES.SELECT,
        width: '120px',
        options: ['1" IG', '1-1/4" IG', '1-1/2" IG', 'Insulated Panel']
      },
      {
        key: 'ssg_sides',
        label: 'SSG Sides',
        type: COLUMN_TYPES.SELECT,
        width: '100px',
        options: ['2-Side', '4-Side']
      },
      {
        key: 'anchor_type',
        label: 'Anchor',
        type: COLUMN_TYPES.SELECT,
        width: '100px',
        options: ['Embed', 'Angle', 'Clip']
      }
    ],
    outputColumns: OUTPUT_COLUMNS,
    laborColumns: [
      {
        key: 'shop_mhs',
        label: 'Shop MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'dist_mhs',
        label: 'Dist MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'field_mhs',
        label: 'Field MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '90px',
        decimals: 2
      },
      {
        key: 'total_mhs',
        label: 'Total MHs',
        type: COLUMN_TYPES.CALCULATED,
        width: '100px',
        decimals: 2
      }
    ],
    costColumns: [
      {
        key: 'total_cost',
        label: 'Cost',
        type: COLUMN_TYPES.CALCULATED,
        width: '110px',
        decimals: 2,
        isCurrency: true
      }
    ]
  }
};

/**
 * Get all columns for a system in display order
 */
export function getSystemColumns(systemId) {
  const config = SYSTEM_COLUMNS[systemId] || SYSTEM_COLUMNS['ext-sf-1'];
  
  return [
    ...config.inputColumns,
    ...config.outputColumns,
    ...config.laborColumns,
    ...config.costColumns
  ];
}

/**
 * Get editable columns for a system
 */
export function getEditableColumns(systemId) {
  const config = SYSTEM_COLUMNS[systemId] || SYSTEM_COLUMNS['ext-sf-1'];
  
  return config.inputColumns.filter(col => 
    col.type !== COLUMN_TYPES.CALCULATED
  );
}

/**
 * Check if a column is editable
 */
export function isColumnEditable(systemId, columnKey) {
  const editableColumns = getEditableColumns(systemId);
  return editableColumns.some(col => col.key === columnKey);
}
