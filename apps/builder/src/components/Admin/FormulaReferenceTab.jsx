/**
 * FormulaReferenceTab — Read-only reference for every formula used in GlazeBid.
 *
 * Organized into collapsible sections matching the calculation pipeline:
 *   1. Glass Knife Sizes  (BOM Geometry)
 *   2. Cut List Lengths   (Aluminum LF)
 *   3. Labor MH per Frame (Shop & Field)
 *   4. Project Totals     (useBidStore aggregates)
 *   5. Bid Math           (useBidMath — labor + materials + GPM)
 *   6. Finish Multipliers (pricingLogic.js)
 *   7. Glass Deducts      (computeBOM.js)
 *   8. Hardware Sets      (pricingLogic.js door hardware)
 */

import React, { useState } from 'react';

// ─── Tiny primitives ──────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '1.25rem', background: '#13181f', border: '1px solid #21262d', borderRadius: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
          color: '#e6edf3', fontSize: '0.88rem', fontWeight: 700, textAlign: 'left',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '0.75rem', color: '#8b949e', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && <div style={{ padding: '0 1rem 1rem' }}>{children}</div>}
    </div>
  );
}

function FormulaRow({ label, formula, note, highlight }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '220px 1fr',
      gap: '0.5rem', padding: '0.45rem 0',
      borderBottom: '1px solid rgba(33,38,45,0.7)',
      alignItems: 'start',
    }}>
      <span style={{ fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.4, paddingTop: 2 }}>{label}</span>
      <div>
        <code style={{
          display: 'block', fontSize: '0.8rem', fontFamily: 'Consolas, "Geist Mono", monospace',
          background: highlight ? 'rgba(14,165,233,0.08)' : '#0d1117',
          border: `1px solid ${highlight ? 'rgba(14,165,233,0.25)' : '#21262d'}`,
          borderRadius: 4, padding: '4px 8px', color: highlight ? '#7dd3fc' : '#a5d6ff',
          whiteSpace: 'pre-wrap', lineHeight: 1.55,
        }}>
          {formula}
        </code>
        {note && <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#6e7681', lineHeight: 1.4 }}>{note}</p>}
      </div>
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c} style={{ padding: '6px 10px', background: '#0d1117', color: '#8b949e', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #21262d', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '5px 10px', color: j === 0 ? '#e6edf3' : '#8b949e', borderBottom: '1px solid rgba(33,38,45,0.4)', fontFamily: j > 0 ? 'Consolas, monospace' : 'inherit' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0.75rem 0 0.4rem' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#21262d' }} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FormulaReferenceTab() {
  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 900 }}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.5 }}>
        Read-only reference for every calculation in GlazeBid. All formulas are applied in the order shown below.
        Source files are noted per section for developer verification.
      </p>

      {/* ── 1. BOM — Glass Knife Sizes ──────────────────────────────────────── */}
      <Section title="1 · BOM Geometry — Glass Knife Sizes" defaultOpen={true}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>engine/computeBOM.js · computeFabricationBOM()</code>
        </p>
        <FormulaRow
          label="Bay Width"
          formula="bayW = frameWidth ÷ bays"
          note="One structural bay — the column of glass between vertical members"
        />
        <FormulaRow
          label="Row Height"
          formula="rowH = frameHeight ÷ rows"
          note="One horizontal band — the row of glass between horizontal members"
        />
        <FormulaRow
          label="Glass Knife Width"
          formula="knifeW = bayW − (glassDeduct.w × 2) − (sightline × glassBite × 2)"
          note="Finished glass cut width — sightline deduction removes the frame face width from each edge"
          highlight
        />
        <FormulaRow
          label="Glass Knife Height"
          formula="knifeH = rowH − (glassDeduct.h × 2) − (sightline × glassBite × 2)"
          note="Finished glass cut height"
          highlight
        />
        <FormulaRow
          label="Glass SF (per lite)"
          formula="liteSF = (knifeW × knifeH) ÷ 144"
          note="Square feet; div 144 converts in² → ft²"
        />
        <FormulaRow
          label="Total Lites"
          formula="liteCount = rows × bays"
        />
        <FormulaRow
          label="Total Glass SF (frame)"
          formula="totalGlassSF = liteSF × liteCount"
        />

        <Divider label="Glass Deducts by System Type (inches, each side)" />
        <DataTable
          columns={['System Type', 'Width Deduct', 'Height Deduct']}
          rows={[
            ['Ext SF 1 (ext-sf-1)',  '0.75"', '0.75"'],
            ['Ext SF 2 (ext-sf-2)',  '0.875"', '0.875"'],
            ['Int SF (int-sf)',      '0.75"', '0.75"'],
            ['Cap CW (cap-cw)',      '1.0"', '1.0"'],
            ['SSG CW (ssg-cw)',      '0.5"', '0.5"'],
            ['Door Only (door-only)','0.75"', '0.75"'],
          ]}
        />
      </Section>

      {/* ── 2. BOM — Cut List Lengths ──────────────────────────────────────── */}
      <Section title="2 · BOM Geometry — Cut List Lengths" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>engine/computeBOM.js · computeFabricationBOM()</code>
        </p>
        <FormulaRow
          label="Head Receptor"
          formula="length = frameWidth,  qty = 1"
          note="Full-width top member"
        />
        <FormulaRow
          label="Sill Receptor"
          formula="length = frameWidth,  qty = 1"
          note="Full-width bottom member"
        />
        <FormulaRow
          label="Jamb"
          formula="length = frameHeight,  qty = 2"
          note="Two full-height side members (left + right)"
        />
        <FormulaRow
          label="Vertical Mullion"
          formula="length = frameHeight,  qty = (bays − 1)"
          note="Interior vertical members; only present when bays > 1"
        />
        <FormulaRow
          label="Horizontal Transom"
          formula="length = frameWidth,  qty = (rows − 1)"
          note="Interior horizontal members; only present when rows > 1"
        />
        <FormulaRow
          label="Total Aluminum LF (frame)"
          formula={`totalAlumLF = (\n  (frameWidth  × 2)              // Head + Sill\n+ (frameHeight × 2)              // Two Jambs\n+ (frameHeight × (bays − 1))    // Vertical Mullions\n+ (frameWidth  × (rows − 1))    // Horizontal Transoms\n) ÷ 12`}
          note="Converts sum of all cut lengths from inches to linear feet"
          highlight
        />
      </Section>

      {/* ── 3. Labor MH per Frame ──────────────────────────────────────────── */}
      <Section title="3 · Labor MH — Shop & Field Hours per Frame" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>engine/computeBOM.js</code> · rates set in Admin → Labor MH Rates
        </p>
        <FormulaRow
          label="Shop MH (frame)"
          formula="shopMH = liteCount × shopRate(systemType)"
          note="Shop fabrication man-hours for this frame"
          highlight
        />
        <FormulaRow
          label="Field MH (frame)"
          formula="fieldMH = liteCount × fieldRate(systemType)"
          note="Field installation man-hours for this frame"
          highlight
        />

        <Divider label="BOM Labor Rates (MH per lite) — hardcoded BOM fallback" />
        <DataTable
          columns={['System Type', 'Shop MH/lite', 'Field MH/lite']}
          rows={[
            ['Ext SF 1 (ext-sf-1)',  '0.15', '0.25'],
            ['Ext SF 2 (ext-sf-2)',  '0.18', '0.30'],
            ['Int SF (int-sf)',      '0.12', '0.20'],
            ['Cap CW (cap-cw)',      '0.25', '0.40'],
            ['SSG CW (ssg-cw)',      '0.20', '0.35'],
            ['Door Only (door-only)','0.30', '0.50'],
          ]}
        />
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#6e7681' }}>
          ⚠ These BOM-level rates are only the geometric baseline. Your Admin → Labor MH Rates table provides
          the production-based hourly function rates (bays, DLOs, joints, etc.) that override these per system card.
        </p>
      </Section>

      {/* ── 4. Project Totals ─────────────────────────────────────────────── */}
      <Section title="4 · Project Totals — useBidStore Aggregates" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>store/useBidStore.js · calcTotals()</code>
        </p>
        <FormulaRow
          label="Total Aluminum LF"
          formula="totalAluminumLF = Σ(frame.bom.totalAluminumLF)"
          note="Sum of all frames' aluminum linear footage"
        />
        <FormulaRow
          label="Total Glass SF"
          formula="totalGlassSqFt = Σ(frame.bom.totalGlassSqFt)"
          note="Sum of all frames' glass area"
        />
        <FormulaRow
          label="Total Lites"
          formula="totalLites = Σ(frame.bom.glassLitesCount)"
        />
        <FormulaRow
          label="Shop Fab Hours"
          formula="shopFabHours = totalAluminumLF ÷ shopFabVelocity"
          note="shopFabVelocity = LF of aluminum fabricated per hour (set in Admin)"
          highlight
        />
        <FormulaRow
          label="Field Install Hours"
          formula="fieldInstHours = totalGlassSqFt ÷ fieldInstVelocity"
          note="fieldInstVelocity = SF of glass installed per hour (set in Admin)"
          highlight
        />
        <FormulaRow
          label="Total Labor Hours"
          formula="totalLaborHours = shopFabHours + fieldInstHours"
        />
        <FormulaRow
          label="Estimated Labor Cost"
          formula="estimatedLaborCost = totalLaborHours × burdenedRatePerHour"
          note="burdenedRatePerHour = Admin → Financial Defaults → Burdened Labor Rate ($/hr)"
        />
      </Section>

      {/* ── 5. Bid Math ───────────────────────────────────────────────────── */}
      <Section title="5 · Bid Math — Labor, Materials, Tax & Grand Total" defaultOpen={true}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>hooks/useBidMath.js · summary memo</code> — drives the Bid Cart executive dashboard
        </p>

        <Divider label="Labor" />
        <FormulaRow
          label="Raw Labor Hours"
          formula="rawLaborHours = Σ(group.shopHours + group.fieldHours) for each systemType group"
          note="Aggregated from frame BOM hours — read-only, comes from the parametric engine"
        />
        <FormulaRow
          label="Total Labor Hours"
          formula="totalLaborHours = rawLaborHours × (1 + contingency% ÷ 100)"
          note="Contingency buffer added on top of raw hours — set in Admin → Financial Defaults"
          highlight
        />
        <FormulaRow
          label="Total Labor Cost"
          formula="totalLaborCost = totalLaborHours × laborRate"
          note="laborRate = Burdened Labor Rate ($/hr)"
          highlight
        />

        <Divider label="Materials" />
        <FormulaRow
          label="Total Material Cost"
          formula="totalMaterialCost = Σ(vendorQuote.amount)"
          note="Sum of all vendor quote lump-sum rows entered in Bid Cart"
        />
        <FormulaRow
          label="Taxable Amount"
          formula="taxableAmount = Σ(vendorQuote.amount where isTaxable = true)"
        />
        <FormulaRow
          label="Tax Amount"
          formula="taxAmount = taxableAmount × (taxRate% ÷ 100)"
          note="Only taxable vendor lines are taxed — subcontractors can be marked non-taxable"
        />

        <Divider label="Hard Cost & Gross Margin" />
        <FormulaRow
          label="Hard Cost (Cost Base)"
          formula="hardCost = totalLaborCost + totalMaterialCost + taxAmount"
          highlight
        />
        <FormulaRow
          label="Auto GPM (tiered)"
          formula={`GPM% = tier.gpm where hardCost ≤ tier.upTo\n\nDefault tiers:\n  $0 – $250k      → 30%\n  $250k – $1M    → 27%\n  > $1M            → 25%`}
          note="Tiers are fully configurable in Admin → Financial Defaults → GPM Tiers"
        />
        <FormulaRow
          label="Grand Total"
          formula="grandTotal = hardCost ÷ (1 − GPM% ÷ 100)"
          note="Gross-profit margin formula: GPM% represents profit as a % of the selling price, not cost"
          highlight
        />
        <FormulaRow
          label="Gross Profit"
          formula="grossProfit = grandTotal − hardCost"
        />

        <Divider label="Example" />
        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#8b949e', lineHeight: 1.7 }}>
          Hard Cost = $200,000 → Auto GPM = 30%<br />
          Grand Total = $200,000 ÷ (1 − 0.30) = $200,000 ÷ 0.70 = <strong style={{ color: '#7dd3fc' }}>$285,714</strong><br />
          Gross Profit = $285,714 − $200,000 = <strong style={{ color: '#3fb950' }}>$85,714</strong> (exactly 30% of $285,714)
        </div>
      </Section>

      {/* ── 6. Production-Based Labor (HR Function / Item Rates) ──────────── */}
      <Section title="6 · Production Labor — Hr Function & Item Rates" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>store/useProductionRatesStore.js</code> · lookup in <code style={{ color: '#8b949e' }}>components/BidSheet/GlazeBidWorkspace.jsx</code>
        </p>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#8b949e', lineHeight: 1.5 }}>
          Each system card computes MH using production-based hourly functions (bays, DLOs, doors) and
          item rates (joints, dist, caulk, etc.). Rates are set per system type in Admin → Labor MH Rates.
        </p>

        <Divider label="Storefront Hourly Functions (Ext SF / Int SF)" />
        <DataTable
          columns={['Function', 'Quantity Source', 'MH Formula']}
          rows={[
            ['Bays — Assemble', 'bayCount from BOM', 'qty × assembleRate'],
            ['Bays — Clips', 'bayCount from BOM', 'qty × clipsRate'],
            ['>Bays — Set', 'bayCount from BOM', 'qty × setRate'],
            ['DLOs — Prep', 'dloCount from BOM (rows × bays)', 'qty × prepRate'],
            ['DLOs — Set', 'dloCount from BOM', 'qty × setRate'],
            ['>DLOs — Set', 'dloCount from BOM', 'qty × setRate'],
            ['Doors — Dist', 'door count from BOM', 'qty × distRate'],
            ['Doors — Install', 'door count from BOM', 'qty × installRate'],
          ]}
        />

        <Divider label="Curtain Wall Hourly Functions (Cap CW / SSG CW)" />
        <DataTable
          columns={['Function', 'Quantity Source', 'MH Formula']}
          rows={[
            ['Verticals — Assemble', 'verticalCount from BOM', 'qty × assembleRate'],
            ['Verticals — Install', 'verticalCount from BOM', 'qty × installRate'],
            ['Horizontals — Assemble', 'horizontalCount from BOM', 'qty × assembleRate'],
            ['Horizontals — Install', 'horizontalCount from BOM', 'qty × installRate'],
            ['DLOs — Prep', 'dloCount from BOM', 'qty × prepRate'],
            ['DLOs — Set', 'dloCount from BOM', 'qty × setRate'],
            ['Doors — Dist', 'door count from BOM', 'qty × distRate'],
            ['Doors — Install', 'door count from BOM', 'qty × installRate'],
          ]}
        />

        <Divider label="Item Rates (all system types)" />
        <DataTable
          columns={['Item', 'Quantity Source', 'MH Formula', 'SF only', 'CW only']}
          rows={[
            ['Joints',      'perimeterInches ÷ 28',       'qty × rate', '✓', '✓'],
            ['Dist (glass distribution)', 'dloCount',    'qty × rate', '✓', '✓'],
            ['Subsills',    'bayCount',                   'qty × rate', '✓', '—'],
            ['Caulk',       'perimeterLF ÷ 20 (SF) or ÷ 12 (CW)', 'qty × rate', '✓', '✓'],
            ['SSG',         'user-entered',               'qty × rate', '✓', '✓'],
            ['Steel',       'user-entered',               'qty × rate', '✓', '✓'],
            ['Vents',       'user-entered',               'qty × rate', '✓', '✓'],
            ['Brake Metal', 'user-entered LF',            'qty × rate', '✓', '✓'],
            ['Open',        'user-entered openings',      'qty × rate', '✓', '—'],
            ['Stool Trim',  'user-entered',               'qty × rate', '—', '✓'],
            ['F/T (field trim)', 'user-entered',          'qty × rate', '—', '✓'],
            ['WL/DL (wet/dry lab)', 'DLO count ÷ 2',     'qty × rate', '—', '✓'],
          ]}
        />

        <Divider label="Total Frame MH Formula" />
        <FormulaRow
          label="Total Frame MH"
          formula={`frameMH = Σ(hrFunctionMH) + Σ(itemRateMH)\n\nwhere hrFunctionMH = qty × rateFromAdmin\n  and itemRateMH  = qty × rateFromAdmin`}
          highlight
        />
        <FormulaRow
          label="Frame Labor Cost"
          formula="frameLaborCost = frameMH × laborRate ($/hr)"
          note="laborRate is the burdened rate from Admin → Financial Defaults"
        />
      </Section>

      {/* ── 7. Finish Multipliers ─────────────────────────────────────────── */}
      <Section title="7 · Aluminum Finish — Cost Multipliers" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>utils/pricingLogic.js · FINISH_TYPES · calculateMetalCost()</code>
        </p>
        <FormulaRow
          label="Metal Cost with Finish"
          formula="metalCost = metalWeight (lbs) × basePrice ($/lb) × finishMultiplier"
          highlight
        />
        <DataTable
          columns={['Finish Type', 'Code', 'Cost Multiplier']}
          rows={[
            ['Clear Anodized (Class I)', 'CLEAR_ANOD',   '1.00× (base)'],
            ['Dark Bronze Anodized',      'DARK_BRONZE',  '1.08×'],
            ['Black Anodized',            'BLACK_ANOD',   '1.12×'],
            ['Paint — 2 Coat',            'PAINT_2_COAT', '1.15×'],
            ['Paint — 3 Coat Premium',    'PAINT_3_COAT', '1.25×'],
          ]}
        />
      </Section>

      {/* ── 8. Profile Weight by Size ─────────────────────────────────────── */}
      <Section title="8 · Aluminum Profile — Weight by Size" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>utils/pricingLogic.js · PROFILE_SIZES · calculateMetalWeight()</code>
        </p>
        <FormulaRow
          label="Metal Weight"
          formula="metalWeight (lbs) = perimeterFt × lbsPerFt × qty"
          note="perimeterFt = (width + height) × 2 ÷ 12"
          highlight
        />
        <DataTable
          columns={['Profile Size', 'lbs per Linear Foot']}
          rows={[
            ['1.75" × 4.5"', '1.8 lbs/LF'],
            ['2" × 4.5"',    '2.2 lbs/LF'],
            ['2" × 6"',      '3.1 lbs/LF'],
            ['2.5" × 7.5"',  '4.5 lbs/LF'],
          ]}
        />
      </Section>

      {/* ── 9. Door Hardware Sets ─────────────────────────────────────────── */}
      <Section title="9 · Door Hardware Sets" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>utils/pricingLogic.js · HARDWARE_SETS · calculateDoorHardware()</code>
        </p>
        <FormulaRow
          label="Door Hardware Cost"
          formula="hardwareCost = hardwareSet.cost × doorCount"
        />
        <FormulaRow
          label="Door Hardware Labor"
          formula="doorLaborHrs = hardwareSet.laborHours × doorCount"
        />
        <DataTable
          columns={['Hardware Set', 'Material Cost/Door', 'Labor Hours/Door']}
          rows={[
            ['Pivot + Deadbolt',        '$1,200', '2.5 hrs'],
            ['Pivot + Panic Device',    '$1,800', '3.0 hrs'],
            ['Butt Hinge + Deadbolt',   '$900',   '1.5 hrs'],
            ['Butt Hinge + Panic',      '$1,500', '2.0 hrs'],
            ['EL Panic (Electrical)',   '$2,500', '4.0 hrs'],
          ]}
        />
      </Section>

      {/* ── 10. Connection Type Labor Multipliers ─────────────────────────── */}
      <Section title="10 · Assembly Connection — Labor Multipliers" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>utils/pricingLogic.js · CONNECTION_TYPES · calculateAssemblyLabor()</code>
        </p>
        <FormulaRow
          label="Assembly Labor"
          formula="assemblyHrs = baseHrs × laborMultiplier + (LF × laborAdderPerFt if shear block)"
        />
        <DataTable
          columns={['Connection Type', 'Labor Multiplier', 'Extra Adder']}
          rows={[
            ['Screw Spline (Fast)',          '1.00×', 'none'],
            ['Shear Block (Structural)',     '1.15×', '+0.15 hrs/LF'],
          ]}
        />
      </Section>

      {/* ── 11. Glass Cost ────────────────────────────────────────────────── */}
      <Section title="11 · Glass Cost" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>utils/pricingLogic.js · calculateGlassCost()</code>
        </p>
        <FormulaRow
          label="Glass Cost"
          formula="glassCost = totalSF × $/SF × (1 + wastePercent ÷ 100)"
          note="Waste percent covers breakage during cutting and installation — typically 5%"
          highlight
        />
        <FormulaRow
          label="Caulk Cost"
          formula="caulkCost = perimeterFt × joints × qty × $/LF"
          note="joints = number of caulk beads (default 2); $/LF set in Admin base prices"
        />
        <FormulaRow
          label="Anchor Cost"
          formula="anchorCost = ceil(perimeterInches ÷ anchorSpacing) × $/ea × qty"
        />
      </Section>

      {/* ── 12. Scope Worksheet Calculations ──────────────────────────────── */}
      <Section title="12 · Scope Worksheet — Ext SF Quantities" defaultOpen={false}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.75rem', color: '#6e7681' }}>
          Source: <code style={{ color: '#8b949e' }}>components/Scope/Templates/ExtSFWorksheet.jsx</code>
        </p>
        <FormulaRow
          label="Aluminum Final Cost/lb"
          formula="aluminumFinalCost = basePrice × (1 + scrap%) + finishPremium"
          note="Scrap allowance + finish premium layered on top of base price"
        />
        <FormulaRow
          label="Glass Final Cost/SF"
          formula="glassFinalCost = basePrice × (1 + wastePercent%)"
        />
        <FormulaRow
          label="Steel Final Cost/lb"
          formula="steelFinalCost = basePrice × (1 + scrapPercent%)"
        />
        <FormulaRow
          label="Aluminum Pounds"
          formula="metalLbs = mullionLF × weightPerLF × (1 + scrap%)"
          highlight
        />
        <FormulaRow
          label="Glass SF with Waste"
          formula="glassSF = frameArea × (1 + wastePercent%)"
          highlight
        />
        <FormulaRow
          label="Fixed Costs"
          formula="fixedCostsTotal = engineeringCost + mockupsCost + freightCost"
        />
      </Section>

      <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)', borderRadius: 6, fontSize: '0.75rem', color: '#7dd3fc', lineHeight: 1.6 }}>
        <strong>Source Files for Developer Review:</strong>
        <ul style={{ margin: '0.4rem 0 0 1rem', padding: 0, color: '#8b949e' }}>
          <li><code>apps/builder/src/engine/computeBOM.js</code> — Frame BOM geometry engine</li>
          <li><code>apps/builder/src/store/useBidStore.js · calcTotals()</code> — Project aggregate totals</li>
          <li><code>apps/builder/src/hooks/useBidMath.js</code> — Bid Cart financial summary</li>
          <li><code>apps/builder/src/utils/pricingLogic.js</code> — Material costs, labor triad, hardware</li>
          <li><code>apps/builder/src/store/useProductionRatesStore.js</code> — Production-based hourly rates</li>
          <li><code>apps/builder/src/components/Scope/Templates/ExtSFWorksheet.jsx</code> — Scope worksheet</li>
          <li><code>apps/studio/src/engine/parametric/systemEngine.ts</code> — Studio BOM engine (TypeScript)</li>
        </ul>
      </div>
    </div>
  );
}
