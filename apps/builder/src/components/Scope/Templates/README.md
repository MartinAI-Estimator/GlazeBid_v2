# Scope Templates

Excel-based worksheet templates for system scope calculations.

## ExtSFWorksheet.jsx - Layer 33

The 4 Critical Tables from the Excel "Ext SF 1" sheet:

### Table 1: Labor Triad (Top Left)
- **Location**: Excel B4:F7
- **Purpose**: Labor cost calculator
- **Rows**: Shop/Fab, Field/Install, Distribution
- **Columns**: Phase, Base Rate ($), Hrs/SF, Burden %, Total ($)
- **Editable**: Base rates, hours/SF, burden %
- **Calculated**: Total costs per phase

### Table 2: Fixed Costs (Bottom Left)
- **Location**: Excel B9:C11
- **Purpose**: Engineering & Admin fixed costs
- **Rows**: Engineering, Mockups/Testing, Freight/Delivery
- **Columns**: Item, Cost ($)
- **Editable**: All cost values
- **Calculated**: Fixed costs total

### Table 3: Material Base Rates (Top Right)
- **Location**: Excel J2:Q6
- **Purpose**: Price deck for materials
- **Rows**: Aluminum, Glass (Avg), Steel, Misc/Sundry
- **Columns**: Material, Base Price, Scrap %, Finish Premium, Final Cost
- **Editable**: Base prices, scrap %, finish premiums
- **Calculated**: Final costs after scrap/finish adjustments

### Table 4: Quantities Engine (Bottom Wide)
- **Location**: Excel U2:AI6
- **Purpose**: Calculate quantities from PartnerPak takeoff
- **Columns**: Metal Lbs, Glass SF, Gasket LF, Caulk Tubes, Screws, Setting Blocks, Anchors
- **Read-Only**: All values calculated from takeoff summary
- **Formulas**:
  - Metal Lbs = Mullion LF × System Weight × (1 + Scrap %)
  - Glass SF = Area × (1 + Waste %)
  - Gasket LF = Mullion LF × Rows × 1.05
  - Caulk Tubes = (Perimeter × Joint Size) / 30
  - Screws = Joints × 8
  - Setting Blocks = DLOs × 2
  - Anchors = Perimeter / 4

## Usage

### As a standalone component:

```jsx
import ExtSFWorksheet from './components/Scope/Templates/ExtSFWorksheet';

<ExtSFWorksheet
  system={currentSystem}
  estimateItems={filteredEstimateItems}
  onUpdateSystemInputs={(systemId, updatedInputs) => {
    updateSystemDefinition(systemId, { inputs: updatedInputs });
  }}
/>
```

### As a tab in SystemScopeDetail:

```jsx
// Add to tab state
const [activeTab, setActiveTab] = useState('worksheet'); // 'worksheet' | 'takeoff' | 'excel'

// Add tab button
<button onClick={() => setActiveTab('excel')}>
  📊 Excel Tables
</button>

// Add tab content
{activeTab === 'excel' && (
  <ExtSFWorksheet
    system={system}
    estimateItems={estimateItems}
    onUpdateSystemInputs={onUpdateSystemInputs}
  />
)}
```

## Input State Schema

The component expects these inputs in `system.inputs`:

```javascript
{
  // Labor Configuration (Table 1)
  shopBaseRate: 45.00,
  shopHoursPerSF: 0.11,
  shopBurdenPercent: 35,
  
  fieldBaseRate: 55.00,
  fieldHoursPerSF: 0.26,
  fieldBurdenPercent: 40,
  
  distBaseRate: 35.00,
  distHoursPerSF: 0.05,
  distBurdenPercent: 30,
  
  // Fixed Costs (Table 2)
  engineeringCost: 2500,
  mockupsCost: 5000,
  freightCost: 1500,
  
  // Material Base Rates (Table 3)
  aluminumBasePrice: 1.85,
  aluminumScrapPercent: 15,
  aluminumFinishPremium: 0.35,
  
  glassBasePrice: 12.50,
  glassWastePercent: 5,
  
  steelBasePrice: 1.25,
  steelScrapPercent: 10,
  
  miscSundryPercent: 8,
  
  // Quantities Engine Factors (Table 4)
  systemWeightPerLF: 3.5,
  gasketRowsPerMullion: 2,
  caulkJointSize: 0.5,
  settingBlocksPerDLO: 2
}
```

## Features

✅ **Excel-like styling** - White cells with borders, monospace numbers
✅ **Live calculations** - All totals update instantly
✅ **Dashboard layout** - 4 tables in grid matching Excel positions
✅ **Color-coded headers** - Blue (Labor), Purple (Materials), Green (Fixed Costs), Pink (Quantities)
✅ **Grand total badge** - Large green banner at bottom with breakdown
✅ **Formula display** - Shows calculation formulas in Quantities Engine
✅ **Read-only indicators** - Calculated cells have blue background
✅ **Total cells** - Green background for sum cells

## Development Notes

- Component is fully self-contained
- Uses `calculatePartnerPakSummary` from pricingLogic.js
- All calculations happen in useMemo hooks for performance
- State updates via `onUpdateSystemInputs` callback
- No external dependencies beyond React and pricingLogic utils
