import { describe, it, expect } from 'vitest';
import {
  classifySection,
  isGlazingScope,
  familyOf,
  sortSections,
  scopeSectionNumbers,
} from './glazingScope';

describe('familyOf', () => {
  it('takes the 4-digit family prefix regardless of spacing', () => {
    expect(familyOf('08 41 13')).toBe('0841');
    expect(familyOf('084113')).toBe('0841');
    expect(familyOf('08 41 13.13')).toBe('0841');
  });

  it('returns empty for numbers too short to classify', () => {
    expect(familyOf('08')).toBe('');
    expect(familyOf('')).toBe('');
    expect(familyOf(undefined)).toBe('');
  });
});

describe('glazing scope families', () => {
  it('claims the owner-confirmed §5 families', () => {
    for (const n of ['08 41 13', '08 43 13', '08 44 13', '08 51 13',
                     '08 56 80', '08 80 00', '08 81 00', '08 83 00',
                     '08 84 00', '08 88 13']) {
      expect(isGlazingScope(n), `${n} should be glazing scope`).toBe(true);
    }
  });

  it('matches on family, not exact section number', () => {
    // Real books use variants the standard list does not contain. These must
    // still land in scope — exact-number matching is what used to drop them.
    expect(isGlazingScope('08 56 80')).toBe(true); // non-standard variant
    expect(isGlazingScope('08 88 13')).toBe(true);
    expect(isGlazingScope('08 41 13.13')).toBe(true); // extended number
  });

  it('never claims another trade\'s Division 08 work', () => {
    // The expensive error: bidding doors we do not furnish.
    expect(isGlazingScope('08 11 13')).toBe(false); // hollow metal
    expect(isGlazingScope('08 14 16')).toBe(false); // wood doors
    expect(isGlazingScope('08 33 23')).toBe(false); // coiling doors
    expect(isGlazingScope('08 36 13')).toBe(false); // sectional overhead
    expect(isGlazingScope('08 71 00')).toBe(false); // door hardware
  });

  it('explains WHY a Division 08 section was left out', () => {
    const c = classifySection('08 11 13');
    expect(c.bucket).toBe('other');
    expect(c.reason).toMatch(/door sub/i);
  });

  it('flags unrecognized Division 08 families for review, never silently drops', () => {
    const c = classifySection('08 99 99');
    expect(c.bucket).toBe('review');
    expect(c.reason).toMatch(/check it/i);
  });
});

describe('review divisions', () => {
  it('routes scope-gap divisions to review', () => {
    expect(classifySection('07 92 16').bucket).toBe('review'); // sealants
    expect(classifySection('05 12 00').bucket).toBe('review'); // structural steel
    expect(classifySection('01 45 00').bucket).toBe('review'); // testing
    expect(classifySection('00 21 13').bucket).toBe('review'); // instructions to bidders
  });

  it('leaves unrelated trades out entirely', () => {
    expect(classifySection('09 91 23').bucket).toBe('other'); // painting
    expect(classifySection('23 05 00').bucket).toBe('other'); // HVAC
  });
});

describe('Brighton Project Manual acceptance', () => {
  // The documented expectation: these five and ONLY these five auto-move.
  const brightonDiv08 = [
    { sectionNumber: '08 11 13', title: 'Hollow Metal Doors and Frames' },
    { sectionNumber: '08 41 13', title: 'Aluminum-Framed Entrances and Storefronts' },
    { sectionNumber: '08 56 80', title: 'Bullet-Resistant Windows' },
    { sectionNumber: '08 71 00', title: 'Door Hardware' },
    { sectionNumber: '08 80 00', title: 'Glazing' },
    { sectionNumber: '08 83 00', title: 'Mirrors' },
    { sectionNumber: '08 88 13', title: 'Fire-Rated Glazing' },
  ];

  it('auto-moves exactly the documented set', () => {
    expect(scopeSectionNumbers(brightonDiv08)).toEqual([
      '08 41 13', '08 56 80', '08 80 00', '08 83 00', '08 88 13',
    ]);
  });

  it('keeps hollow metal and hardware out of scope', () => {
    const { scope, other } = sortSections(brightonDiv08);
    const scopeNums = scope.map((s) => s.sectionNumber);
    expect(scopeNums).not.toContain('08 11 13');
    expect(scopeNums).not.toContain('08 71 00');
    expect(other.map((s) => s.sectionNumber)).toEqual(['08 11 13', '08 71 00']);
  });
});

describe('sortSections', () => {
  it('preserves engine page order within each bucket', () => {
    const { scope } = sortSections([
      { sectionNumber: '08 80 00', startPage: 250 },
      { sectionNumber: '08 41 13', startPage: 100 },
    ]);
    expect(scope.map((s) => s.startPage)).toEqual([250, 100]);
  });

  it('augments without mutating the original section', () => {
    const original = { sectionNumber: '08 41 13', title: 'Storefronts' };
    const { scope } = sortSections([original]);
    expect(scope[0].scopeBucket).toBe('scope');
    expect(scope[0].title).toBe('Storefronts');
    expect(original.scopeBucket).toBeUndefined();
  });
});
