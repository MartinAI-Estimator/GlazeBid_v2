/**
 * reviewBidPage.test.jsx — THE recap renders the engine's numbers, and only
 * the engine's numbers.
 *
 * The point of these tests is the thing that kept going wrong: a screen quietly
 * doing its own arithmetic. Every assertion here compares what is on the page
 * against `computeBid()` run on the same store state, so any inline math
 * reintroduced into the component shows up as a failure.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ReviewBidPage from '../../components/ReviewBidPage';
import useBidStore from '../../store/useBidStore';
import { bidFromProject } from '../../engine/bidAdapter';
import { computeBid } from '../../engine/bidCostEngine';
import { costCodeCSV, scopeCSV } from '../../utils/bidRecapExport';

const BID_SETTINGS = { laborRate: 40, markupPercent: 38, taxPercent: 2, crewSize: 4 };

const SYSTEMS = [
  {
    id: 'ext', name: 'Ext SF', systemType: 'Ext SF',
    totals: { shopMHs: 63.5, distMHs: 42.85, fieldMHs: 180.237, totalSF: 930.61, caulkLF: 1018.42 },
    materials: [
      { costCode: '02-Metal', desc1: 'Kawneer 451T', cost: 8955 },
      { costCode: '02-Glass', desc1: '1" IGU', cost: 12659 },
      { costCode: '02-Metal', desc1: 'Painted add', cost: 20000, alternate: 'Alternate 5' },
      { costCode: '02-Glass', desc1: 'Glass deduct', cost: -1320.17, alternate: 'Alternate 7' },
    ],
    laborExtras: { equipment: [{ label: "60' boom", months: 1, monthRate: 3071 }] },
  },
  {
    id: 'cw', name: 'Curtain Wall', systemType: 'SSG CW',
    totals: { shopMHs: 241.875, distMHs: 230.85, fieldMHs: 1169.225, totalSF: 4924.12 },
    materials: [{ costCode: '02-Glass', desc1: '1" IGU', cost: 68186 }],
  },
];

const AI_FRAME = {
  frameId: 'f1', elevationTag: 'SF-1', systemType: 'Cap CW', quantity: 2,
  source: 'studio', ai: { confidence: 0.88 },
  inputs: { width: 120, height: 96, bays: 3, rows: 2 },
  bom: {
    totalGlassSqFt: 140, shopHours: 6, distHours: 3, fieldHours: 18, totalLaborHours: 27,
    rfq: {
      metal: [{ role: 'jamb', roleLabel: 'Jamb', qty: 4, totalLF: 64 }],
      glass: [{ glassType: 'GL-1', liteType: 'vision', qty: 12, totalSqFt: 140 }],
      doors: [],
    },
  },
};

/** The same numbers the page should be showing, computed independently. */
const expected = (systems = SYSTEMS, frames = []) =>
  computeBid(bidFromProject({ systems, frames, bidSettings: BID_SETTINGS }));

const money0 = (v) => {
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `($${s})` : `$${s}`;
};

const renderPage = (props = {}) =>
  render(<ReviewBidPage project="Alpine" bidSettings={BID_SETTINGS} onBack={() => {}} {...props} />);

beforeEach(() => {
  useBidStore.setState({ workspaceSystems: SYSTEMS, frames: [] });
  // this suite's setup.js replaces localStorage with vi.fn stubs that store
  // nothing, so persistence is asserted through the setItem spy
  localStorage.setItem.mockClear();
  localStorage.getItem.mockReturnValue(null);
});

describe('ReviewBidPage — the numbers come from the engine', () => {
  it('the hard cost, base bid and GPM match computeBid() exactly', () => {
    const r = expected();
    renderPage();
    expect(screen.getByTestId('hard-cost').textContent).toBe(money0(r.base.cost));
    expect(screen.getByTestId('base-bid').textContent).toBe(money0(r.base.sell));
    expect(screen.getByTestId('gpm').textContent).toBe(`${(r.base.gpm * 100).toFixed(2)}%`);
  });

  it('one row per base scope, alternates kept out of the scope table', () => {
    renderPage();
    expect(screen.getByTestId('scope-row-0')).toBeTruthy();
    expect(screen.getByTestId('scope-row-1')).toBeTruthy();
    expect(screen.queryByTestId('scope-row-2')).toBeNull();     // the two alternates
    expect(screen.getByTestId('scope-breakout-0').textContent).toBe('Exterior Storefront');
    expect(screen.getByTestId('scope-breakout-1').textContent).toBe('Curtain Wall');
  });

  it('each scope row shows the engine’s cost, tax, markup and sell', () => {
    const r = expected();
    const ext = r.scopes.find((s) => s.breakout === 'Exterior Storefront' && !s.alternate);
    renderPage();
    const row = screen.getByTestId('scope-row-0');
    for (const v of [ext.cost, ext.tax, ext.markup, ext.sell]) {
      expect(within(row).getByText(money0(v))).toBeTruthy();
    }
  });

  it('markup is additive, not a margin solve — the page shows cost x 38%', () => {
    const r = expected();
    renderPage();
    expect(r.base.markup).toBeCloseTo(r.base.cost * 0.38, 6);
    expect(screen.getByText(/Markup \(38% of cost\)/)).toBeTruthy();
    // the old margin behaviour would have put the sell at cost/(1-0.38)
    expect(r.base.sell).toBeLessThan(r.base.cost / (1 - 0.38));
  });

  it('GPM is reported below the nominal markup, because tax is in the sell', () => {
    const r = expected();
    expect(r.base.gpm).toBeLessThan(0.38 / 1.38);
    renderPage();
    expect(screen.getByText(/markup ÷ sell/)).toBeTruthy();
  });

  it('every alternate gets a row, deducts shown in parentheses', () => {
    const r = expected();
    renderPage();
    const alt5 = screen.getByTestId('alt-row-Alternate 5');
    expect(within(alt5).getByText(money0(r.alternates.find((a) => a.alternate === 'Alternate 5').sell))).toBeTruthy();
    const alt7 = screen.getByTestId('alt-row-Alternate 7');
    const sell7 = r.alternates.find((a) => a.alternate === 'Alternate 7').sell;
    expect(sell7).toBeLessThan(0);
    expect(within(alt7).getByText(money0(sell7)).textContent).toMatch(/^\(\$/);
  });

  it('"base + all alternates" matches result.all', () => {
    const r = expected();
    renderPage();
    const row = screen.getByTestId('all-alternates');
    expect(within(row).getByText(money0(r.all.sell))).toBeTruthy();
  });

  it('the cost-code panel lists the engine rollup', () => {
    const r = expected();
    renderPage();
    for (const c of r.costCodes) {
      const row = screen.getByTestId(`code-${c.code}`);
      expect(within(row).getByText(money0(c.cost))).toBeTruthy();
    }
    // equipment is MATERIAL now, so it has its own code and is taxed
    expect(r.costCodes.find((c) => c.code === '03-EQUP').tax).toBeGreaterThan(0);
  });

  it('shop drawings are on the waterfall as hours, never taxed', () => {
    const r = expected();
    renderPage();
    expect(screen.getByText(new RegExp(`Shop drawings \\(${r.job.shopDrawingsPct}% of cost`))).toBeTruthy();
    expect(r.shopDrawings.cost).toBeCloseTo(r.shopDrawings.basis * 0.007, 6);
  });
});

describe('ReviewBidPage — adjustments', () => {
  it('changing markup re-prices the bid through the engine', () => {
    const onChange = vi.fn();
    renderPage({ onBidSettingsChange: onChange });
    fireEvent.click(screen.getByText('Adjustments'));
    fireEvent.change(screen.getByTestId('adj-markup'), { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ markupPercent: 45 }));
  });

  it('tax exempt zeroes the tax line', () => {
    useBidStore.setState({ workspaceSystems: SYSTEMS, frames: [] });
    const r = computeBid(bidFromProject({
      systems: SYSTEMS, frames: [], bidSettings: { ...BID_SETTINGS, isTaxExempt: true },
    }));
    expect(r.base.tax).toBe(0);
    renderPage({ bidSettings: { ...BID_SETTINGS, isTaxExempt: true } });
    expect(screen.getByText(/Tax \(exempt\)/)).toBeTruthy();
    expect(screen.getByTestId('base-bid').textContent).toBe(money0(r.base.sell));
  });

  it('a bond adds to the sell without being marked up', () => {
    const withBond = { ...BID_SETTINGS, bondPct: 1.5 };
    const noBond = expected();
    const r = computeBid(bidFromProject({ systems: SYSTEMS, bidSettings: withBond }));
    expect(r.bond.markup).toBe(0);
    expect(r.base.sell).toBeCloseTo(noBond.base.sell + r.bond.cost, 6);
    renderPage({ bidSettings: withBond });
    expect(screen.getByText(/P&P bond \(1.50% of sell\)/)).toBeTruthy();
  });

  it('settings persist to the key the workspace reads', () => {
    renderPage({ bidSettings: undefined });
    fireEvent.click(screen.getByText('Adjustments'));
    fireEvent.change(screen.getByTestId('adj-tax'), { target: { value: '6' } });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:bidSettings:Alpine', expect.any(String),
    );
    const [, payload] = localStorage.setItem.mock.calls.at(-1);
    expect(JSON.parse(payload).taxPercent).toBe(6);
    // and the screen repriced off it
    expect(screen.getByTestId('adj-tax').value).toBe('6');
  });

  it('with no project it still writes, under the default key', () => {
    renderPage({ project: undefined, bidSettings: undefined });
    fireEvent.click(screen.getByText('Adjustments'));
    fireEvent.change(screen.getByTestId('adj-markup'), { target: { value: '30' } });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'glazebid:bidSettings:_default', expect.any(String),
    );
  });
});

describe('ReviewBidPage — Studio frames (the door that was missing)', () => {
  beforeEach(() => useBidStore.setState({ workspaceSystems: SYSTEMS, frames: [AI_FRAME] }));

  it('lists AI frames and hands the frameId back on click', () => {
    const onEditFrame = vi.fn();
    renderPage({ onEditFrame });
    const row = screen.getByTestId('ai-frame-f1');
    expect(within(row).getByText('SF-1')).toBeTruthy();
    expect(within(row).getByText('Cap CW')).toBeTruthy();
    expect(within(row).getByText('3×2')).toBeTruthy();
    fireEvent.click(within(row).getByText(/Open in Frame Builder/));
    expect(onEditFrame).toHaveBeenCalledWith('f1');
  });

  it('a frame on a new breakout becomes its own scope row', () => {
    useBidStore.setState({
      workspaceSystems: SYSTEMS,
      frames: [{ ...AI_FRAME, systemType: 'Int SF' }],      // a third breakout
    });
    renderPage();
    expect(screen.getByTestId('scope-breakout-2').textContent).toBe('Interior Storefront');
  });

  it('Cap CW and SSG CW share one Curtain Wall breakout, so no duplicate row', () => {
    // SYSTEMS[1] is SSG CW; the frame is Cap CW. Both are Curtain Wall on the
    // sheet, so the frame must MERGE into that scope rather than open a second.
    renderPage();                                            // frames: [AI_FRAME] (Cap CW)
    expect(screen.queryByTestId('scope-row-2')).toBeNull();
    expect(screen.getByTestId('scope-breakout-0').textContent).toBe('Exterior Storefront');
    expect(screen.getByTestId('scope-breakout-1').textContent).toBe('Curtain Wall');
    // and the frame's hours landed in that merged scope
    const r = expected(SYSTEMS, [AI_FRAME]);
    const cw = r.scopes.find((s) => s.breakout === 'Curtain Wall' && !s.alternate);
    expect(cw.labor.fieldMH).toBeCloseTo(1169.225 + 18, 3);
    expect(cw.frameIds).toEqual(['f1']);
  });

  it('frames merged onto the Exterior Storefront scope add their hours there', () => {
    useBidStore.setState({
      workspaceSystems: SYSTEMS,
      frames: [{ ...AI_FRAME, systemType: 'Ext SF' }],
    });
    renderPage();
    expect(screen.queryByTestId('scope-row-2')).toBeNull();
    const r = expected(SYSTEMS, [{ ...AI_FRAME, systemType: 'Ext SF' }]);
    const ext = r.scopes.find((s) => s.breakout === 'Exterior Storefront' && !s.alternate);
    expect(ext.labor.fieldMH).toBeCloseTo(180.237 + 18, 3);
  });

  it('unpriced frame lines are flagged on the page, with a chase list', () => {
    renderPage();
    expect(screen.getByText(/waiting on a price/)).toBeTruthy();
    expect(screen.getByText(/RFQ chase list/)).toBeTruthy();
    const r = expected(SYSTEMS, [AI_FRAME]);
    expect(r.flagged.length).toBeGreaterThan(0);
  });
});

describe('ReviewBidPage — empty and edge states', () => {
  it('an empty bid invites you to the Bid Builder instead of showing zeros', () => {
    useBidStore.setState({ workspaceSystems: [], frames: [] });
    renderPage();
    expect(screen.getByText(/Nothing on the bid yet/)).toBeTruthy();
    expect(screen.getByTestId('base-bid').textContent).toBe('—');
  });

  it('no alternates means no alternates section', () => {
    useBidStore.setState({
      workspaceSystems: [{ ...SYSTEMS[1] }], frames: [],
    });
    renderPage();
    expect(screen.queryByText(/Alternates/)).toBeNull();
  });

  it('a clean bid shows no unpriced panel', () => {
    renderPage();
    expect(screen.queryByText(/waiting on a price/)).toBeNull();
  });

  it('breakout filter narrows the table and the footer', () => {
    renderPage();
    fireEvent.click(screen.getByText('Curtain Wall', { selector: 'button' }));
    expect(screen.getByTestId('scope-row-0')).toBeTruthy();
    expect(screen.queryByTestId('scope-row-1')).toBeNull();
  });
});

describe('CSV exports reconcile', () => {
  it('cost-code CSV totals equal the bid', () => {
    const r = expected();
    const csv = costCodeCSV(r, 'Alpine');
    const lines = csv.split('\r\n');
    const total = lines.find((l) => l.includes('TOTAL (base + alternates)'));
    expect(total).toContain(r.all.cost.toFixed(2));
    expect(total).toContain(r.all.sell.toFixed(2));
    const base = lines.find((l) => l.includes('Base bid'));
    expect(base).toContain(r.base.sell.toFixed(2));
  });

  it('scope CSV has a row per scope plus the base-bid line', () => {
    const r = expected();
    const lines = scopeCSV(r, 'Alpine').split('\r\n');
    for (const s of r.scopes) {
      expect(lines.some((l) => l.startsWith(s.breakout) && l.includes(s.sell.toFixed(2)))).toBe(true);
    }
    expect(lines.some((l) => l.startsWith('BASE BID') && l.includes(r.base.sell.toFixed(2)))).toBe(true);
  });

  it('a deduct alternate keeps its minus sign in the CSV', () => {
    const r = expected();
    const csv = scopeCSV(r, 'Alpine');
    expect(csv).toMatch(/Alternate 7.*-\d/);
  });
});
