# Integration Guide: VendorLibraryManager & PriceBookManager

## Components Created

### 1. VendorLibraryManager.jsx
**Location:** `apps/builder/src/components/FrameBuilder/VendorLibraryManager.jsx`

**Purpose:** Browse all 11 archetypes and 12 vendor systems built into the frame engine. Estimators can see part catalogs, add custom notes per vendor, and mark preferred vendors.

**Features:**
- Left sidebar: Archetype browser grouped by category (Storefronts, Curtain Walls, Window Walls, All-Glass)
- Right panel: Archetype details + vendor cards for selected archetype
- "All Vendors" grid view when no archetype selected (3-column layout)
- Search bar: Filters both archetypes and vendors by name
- Vendor cards include:
  - Vendor name + system ID badge
  - Parts table (part number, role, description, weight)
  - Custom estimator notes textarea (persisted to localStorage)
  - Preferred vendor toggle (yellow star icon)
  - "Set as Default" and "Add to Frame" buttons (stubs)
- Dark theme with #0ea5e9 accent color, #111113 background

**Data Persistence:**
- `localStorage` under `glazebid-vendor-notes-${systemId}` (custom notes)
- `localStorage` under `glazebid-vendor-prefs` (preferred vendor toggles)

**Mockup Data:**
- Includes fallback mock data (4 archetypes, 4 vendors) for demonstration
- Replace `MOCK_ARCHETYPES` and `MOCK_VENDORS` with real imports from `@glazebid/frame-engine` when available

**Integration Steps:**
1. Import into a parent FrameBuilder route or tab:
   ```jsx
   import VendorLibraryManager from './VendorLibraryManager';
   <VendorLibraryManager />
   ```
2. When frame engine package is ready, replace mock imports:
   ```jsx
   import { ARCHETYPE_CATALOG, VENDOR_CATALOG, getVendorsForArchetype, getArchetypesByCategory } from '@glazebid/frame-engine';
   ```
3. Wire "Set as Default" and "Add to Frame" buttons to your frame builder store/context

---

### 2. PriceBookManager.jsx
**Location:** `apps/builder/src/components/FrameBuilder/PriceBookManager.jsx`

**Purpose:** Estimator's running price book for aluminum extrusions, glass, hardware, and labor rates. These prices feed into BOM cost calculations.

**Features:**
- 6 tabbed sections:
  1. **Aluminum** - Head, sill, jamb, mullions, glazing bead (price/LF)
  2. **Glass** - Clear IG, Low-E IG, Bronze IG, spandrel, tempered, laminated (price/SF)
  3. **Labor** - Shop fab, field install, glass handling, door hardware ($/hr)
     - Shows base rate + all-in rate (with labor burden factor applied)
  4. **Hardware** - Anchors, shims, caulk, backer rod, mineral wool, intumescent strip
  5. **Overhead** - Material markup %, labor burden %, bonding/insurance %
     - Includes live example calculations
  6. **AI Extraction** - Placeholder for future Claude API integration
     - Textarea for pasting vendor quote text
     - Disabled "Extract Prices (AI)" button with tooltip

- Header actions:
  - Export as JSON (triggers browser download)
  - Import from JSON file (file picker)
  - Reset to Defaults (with confirmation dialog)

- Price change tracking:
  - Live audit trail at bottom showing last 5 changes
  - Shows field name, old value, new value, timestamp
  - Change log persisted to localStorage

- Dark theme matching existing Builder app style

**Data Persistence:**
- `localStorage` under `glazebid-pricebook` (full pricebook JSON)
- `localStorage` under `glazebid-pricebook-log` (change audit trail)

**Default Prices:**
```javascript
const DEFAULT_PRICEBOOK = {
  aluminum: { head: 9.50, sill: 8.75, jamb: 9.00, ... },
  glass: { 'clear-ig': 28.00, 'lowe-ig': 34.50, ... },
  labor: { shopFabPerHr: 75.00, fieldInstallPerHr: 95.00, ... },
  hardware: { anchorEA: 2.75, shimPackEA: 1.50, ... },
  overhead: { materialMarkup: 1.15, laborBurden: 1.35, ... },
}
```

**Integration Steps:**
1. Import into a parent FrameBuilder route or tab:
   ```jsx
   import PriceBookManager from './PriceBookManager';
   <PriceBookManager />
   ```
2. To consume prices in BOM calculations, retrieve from localStorage:
   ```jsx
   const pricebook = JSON.parse(localStorage.getItem('glazebid-pricebook'));
   // Use pricebook.aluminum.head, pricebook.glass['clear-ig'], etc.
   ```
3. When Claude API is ready, wire AI extraction:
   - Capture `specText` from textarea
   - Send to Claude API with custom instructions
   - Parse response and `updateVendorNotes` + price table
   - Update `handlePriceChange` to log the AI-extracted changes

4. Optional: Add BOM cost calculator hook that reads pricebook:
   ```jsx
   const bomCost = calculateBOMCost(bom, pricebook);
   // Sum: (aluminum LF × prices) + (glass SF × prices) + hardware
   ```

---

## Styling Notes

Both components use dark theme CSS matching existing GlazeBid Builder style:
- Background: `#111113` (deep)
- Panel: `#18181b` (slightly lighter)
- Card: `#1a1a1f` (for content boxes)
- Border: `#27272a` (subtle)
- Accent: `#0ea5e9` (cyan blue)
- Text primary: `#f5f5f5`
- Text secondary: `#71717a`

Icons use `lucide-react` (already in Builder dependencies).

---

## Testing Checklist

- [ ] VendorLibraryManager loads without errors
- [ ] Archetype categories expand/collapse correctly
- [ ] Clicking archetype shows vendor details on right panel
- [ ] Search filters archetypes and vendors
- [ ] Estimator notes save/load from localStorage
- [ ] Preferred vendor toggle persists across page reload
- [ ] "Set as Default" button can be wired to frame builder store
- [ ] PriceBookManager loads with default prices
- [ ] All price inputs update correctly
- [ ] Labor burden calculations show live
- [ ] Overhead examples update with factor changes
- [ ] Export creates downloadable JSON file
- [ ] Import loads JSON file correctly
- [ ] Reset to defaults with confirmation works
- [ ] Change log shows and persists
- [ ] AI Extraction tab displays disabled button + info card
- [ ] Responsive layout works on smaller screens

---

## Future Enhancements

1. **Real Frame Engine Integration**
   - Replace mock ARCHETYPE_CATALOG with actual @glazebid/frame-engine exports
   - Wire "Set as Default" to update frame builder store with vendorSystemId

2. **Claude API Integration**
   - Implement spec text → Claude API call
   - Parse response: vendor names, part numbers, prices
   - Auto-populate price book from vendor quotes
   - Save extracted metadata to project .gbid file

3. **BOM Cost Engine**
   - Create `calculateBOMCost(bom, pricebook)` helper
   - Wire to BidSheet for real-time project cost updates
   - Support labor burden + markup calculations

4. **Vendor Comparison**
   - Side-by-side price comparison for same archetype
   - Lead time tracking per vendor
   - Part availability matrix

5. **Historical Price Tracking**
   - Track price changes over time (by date)
   - Generate price trend reports
   - Alert on significant price changes from vendors

6. **Multi-User Sync**
   - Sync price book across team
   - Centralized price book server endpoint
   - Audit trail for who changed what and when
