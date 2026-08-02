/**
 * scheduleParser.test.js — dimension parsing + rules-based schedule mapping
 */
import { describe, it, expect } from 'vitest';
import { parseDimToInches, rulesMapRows, classifyFile, filterSchedulePages } from './scheduleParser';

describe('parseDimToInches', () => {
  it('parses feet-inches', () => {
    expect(parseDimToInches(`7'-10"`)).toBe(94);
    expect(parseDimToInches(`7' 10"`)).toBe(94);
    expect(parseDimToInches(`9'-10"`)).toBe(118);
    expect(parseDimToInches(`6'`)).toBe(72);
  });

  it('parses feet-inches with fractions', () => {
    expect(parseDimToInches(`7'-10 1/2"`)).toBe(94.5);
    expect(parseDimToInches(`3'-0 1/4"`)).toBe(36.25);
  });

  it('parses inches-only', () => {
    expect(parseDimToInches('94"')).toBe(94);
    expect(parseDimToInches('94')).toBe(94);
    expect(parseDimToInches('94.5')).toBe(94.5);
    expect(parseDimToInches('94 1/2"')).toBe(94.5);
  });

  it('parses unicode quotes and dashes', () => {
    expect(parseDimToInches('7’–10”')).toBe(94);
  });

  it('handles numbers and metric', () => {
    expect(parseDimToInches(94)).toBe(94);
    expect(parseDimToInches('2438mm')).toBeCloseTo(95.98, 1);
  });

  it('returns null on garbage', () => {
    expect(parseDimToInches('')).toBeNull();
    expect(parseDimToInches(null)).toBeNull();
    expect(parseDimToInches('SEE ELEV')).toBeNull();
    expect(parseDimToInches(0)).toBeNull();
  });
});

describe('rulesMapRows', () => {
  const rows = [
    ['WINDOW SCHEDULE', '', '', '', '', ''],
    ['MARK', 'WIDTH', 'HEIGHT', 'QTY', 'GLAZING', 'REMARKS'],
    ['AS1', `9'-10"`, `6'-0"`, '2', '1" Solarban 90 IGU', 'Sill at level'],
    ['CW-1', `24'-0"`, `14'-6"`, '1', '1" Clear IG', 'Curtain wall'],
    ['HM13', `3'-4"`, `7'-2"`, '4', '1/4" clear tempered', 'Hollow metal'],
    ['', '', '', '', '', ''],
  ];

  it('finds the header row and maps columns', () => {
    const result = rulesMapRows(rows);
    expect(result).not.toBeNull();
    expect(result.payloads).toHaveLength(3);
  });

  it('converts dimensions to decimal inches', () => {
    const { payloads } = rulesMapRows(rows);
    expect(payloads[0].overallWidth).toBe(118);
    expect(payloads[0].overallHeight).toBe(72);
  });

  it('infers system type from mark and remarks', () => {
    const { payloads } = rulesMapRows(rows);
    expect(payloads[0].systemType).toBe('storefront'); // AS → SF fallback default is storefront
    expect(payloads[1].systemType).toBe('curtainwall'); // CW mark
    expect(payloads[2].systemType).toBe('hollow_metal'); // HM mark
  });

  it('carries qty, glass, and notes', () => {
    const { payloads } = rulesMapRows(rows);
    expect(payloads[0].quantity).toBe(2);
    expect(payloads[0].primaryGlass).toBe('1" Solarban 90 IGU');
    expect(payloads[0].notes).toBe('Sill at level');
  });

  it('returns null when headers are unmappable', () => {
    expect(rulesMapRows([['a', 'b'], ['1', '2']])).toBeNull();
  });
});

describe('filterSchedulePages', () => {
  it('keeps only pages with schedule headings', () => {
    const text = [
      '--- PAGE 1 ---\ntitle block\ncover sheet',
      '--- PAGE 2 ---\nDOOR and FRAME SCHEDULE\nAS1 | 9\'-10" | 6\'-0"',
      '--- PAGE 3 ---\nfloor plan',
      '--- PAGE 4 ---\nWINDOW SCHEDULE\nW1 | 4\'-0" | 5\'-0"',
    ].join('\n');
    const res = filterSchedulePages(text);
    expect(res.filtered).toBe(true);
    expect(res.pageCount).toBe(2);
    expect(res.text).toContain('PAGE 2');
    expect(res.text).toContain('PAGE 4');
    expect(res.text).not.toContain('floor plan');
  });

  it('returns full text when no schedule page found', () => {
    const text = '--- PAGE 1 ---\njust an elevation';
    const res = filterSchedulePages(text);
    expect(res.filtered).toBe(false);
    expect(res.text).toBe(text);
  });
});

describe('classifyFile', () => {
  it('classifies by extension', () => {
    expect(classifyFile({ name: 'schedule.xlsx' })).toBe('sheet');
    expect(classifyFile({ name: 'schedule.csv' })).toBe('sheet');
    expect(classifyFile({ name: 'A6.4.pdf' })).toBe('pdf');
    expect(classifyFile({ name: 'photo.png' })).toBeNull();
  });
});
