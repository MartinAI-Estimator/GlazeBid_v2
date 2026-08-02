/**
 * specSorterV2.test.js
 *
 * Validates Phase 1 boundary-detection (per-page attribution) against synthetic PDFs
 * that mimic real spec-book formats.
 *
 * Fixtures:
 *  A. Spec book with running footers "<TITLE> NN NN NN - n" on every body page
 *     and a TOC page that lists section numbers but contains NO footer attribution.
 *     → TOC page must never own any content section.
 *  B. Extended section numbers (03 15 16.13, 07 42 13.19).
 *  C. Empty-text PDF (raster scan) → must return needsOcr: true.
 *
 * Regression: a section mentioned on the TOC page must resolve to its body
 * location, not the TOC page.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseSpecSectionsV2 } from './specSorterV2';

// ── Helper ─────────────────────────────────────────────────────────────────────

async function buildPdf(pageFn) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await pageFn(doc, font);
  return new Uint8Array(await doc.save());
}

/**
 * Add a page with body lines at the top and an optional footer line at the
 * actual bottom (y ≈ 40pt from page bottom), which is inside the footer band
 * (< 12% of page height = < 95pt for a 792pt page).
 */
function addPageWithFooter(doc, font, bodyLines, footerLine = null) {
  const PAGE_H = 792;
  const page = doc.addPage([612, PAGE_H]);

  // Body text — starts near top (high Y in PDF coords = visually high)
  let y = PAGE_H - 40;
  for (const line of bodyLines) {
    if (!line) { y -= 14; continue; }
    page.drawText(line, { x: 50, y, size: 10, font });
    y -= 16;
  }

  // Footer — placed at y=40 (well inside the footer band: 40 < 792*0.12 = 95)
  if (footerLine) {
    page.drawText(footerLine, { x: 50, y: 40, size: 9, font });
  }
}

/**
 * Build a spec book PDF where:
 *  - Page 1: TOC with section numbers listed but NO running footer
 *  - Pages 2-4: Section 01 10 00. Footer: "SUMMARY  01 10 00 - <n>"
 *  - Pages 5-8: Section 08 11 13. Footer: "HOLLOW METAL DOORS AND FRAMES  08 11 13 - <n>"
 *  - Pages 9-11: Section 08 80 00. Footer: "GLAZING  08 80 00 - <n>"
 */
async function buildSpecBookPdf() {
  return buildPdf(async (doc, font) => {
    // Page 1: TOC — lists section numbers but NO running footer at the bottom
    addPageWithFooter(doc, font, [
      'TABLE OF CONTENTS',
      'SECTION 01 10 00 - SUMMARY ............................  2',
      'SECTION 08 11 13 - HOLLOW METAL DOORS AND FRAMES .....  5',
      'SECTION 08 80 00 - GLAZING ............................  9',
    ]); // intentionally no footer

    // Pages 2-4: Section 01 10 00 body pages
    for (let n = 1; n <= 3; n++) {
      addPageWithFooter(
        doc, font,
        [
          n === 1 ? 'SECTION 01 10 00 - SUMMARY' : '',
          n === 1 ? 'PART 1 - GENERAL' : `01 10 00 continuation page ${n}`,
          '1.01 SCOPE',
          '    A. This section includes general summary information.',
        ],
        `SUMMARY  01 10 00 - ${n}`, // footer in the footer band
      );
    }

    // Pages 5-8: Section 08 11 13
    for (let n = 1; n <= 4; n++) {
      addPageWithFooter(
        doc, font,
        [
          n === 1 ? 'SECTION 08 11 13 - HOLLOW METAL DOORS AND FRAMES' : '',
          n === 1 ? 'PART 1 - GENERAL' : `08 11 13 body page ${n}`,
          '1.01 RELATED DOCUMENTS',
          '    A. Drawings and general provisions apply.',
        ],
        `HOLLOW METAL DOORS AND FRAMES  08 11 13 - ${n}`,
      );
    }

    // Pages 9-11: Section 08 80 00
    for (let n = 1; n <= 3; n++) {
      addPageWithFooter(
        doc, font,
        [
          n === 1 ? 'SECTION 08 80 00 - GLAZING' : '',
          n === 1 ? 'PART 1 - GENERAL' : `08 80 00 body page ${n}`,
          '1.01 SCOPE',
          '    A. Glazing requirements for all openings.',
        ],
        `GLAZING  08 80 00 - ${n}`,
      );
    }
  });
}

/**
 * Build a PDF with an extended section number: 03 15 16.13
 * Body pages carry footer: "CONCRETE FORMING ACCESSORIES  03 15 16.13 - <n>"
 */
async function buildExtendedNumberPdf() {
  return buildPdf(async (doc, font) => {
    // TOC page — no footer
    addPageWithFooter(doc, font, ['TABLE OF CONTENTS', 'SECTION 03 15 16.13 - CONCRETE FORMING ACCESSORIES ... 2']);

    // Body pages with proper footers
    for (let n = 1; n <= 2; n++) {
      addPageWithFooter(
        doc, font,
        [
          n === 1 ? 'SECTION 03 15 16.13 - CONCRETE FORMING ACCESSORIES' : '',
          n === 1 ? 'PART 1 - GENERAL' : 'continuation',
          '1.01 SCOPE',
        ],
        `CONCRETE FORMING ACCESSORIES  03 15 16.13 - ${n}`,
      );
    }
  });
}

/**
 * Build a PDF with no text items (simulates a raster-scanned document).
 * pdf-lib creates pages with no text content → no items returned by pdfjs.
 */
async function buildTextlessPdf() {
  return buildPdf(async (doc) => {
    // Add 3 blank pages — no text drawn
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
  });
}

// ── Fixture: spec book fixture with SECTION header fallback ───────────────────
// Spec books that lack running footers fall back to header scan.
// This fixture puts "SECTION NN NN NN - TITLE" as first line of each section page
// to exercise the header-scan fallback.
async function buildHeaderOnlyPdf() {
  return buildPdf(async (doc, font) => {
    addPageWithFooter(doc, font, ['TABLE OF CONTENTS', '01 10 00 - SUMMARY', '08 80 00 - GLAZING']);
    addPageWithFooter(doc, font, ['SECTION 01 10 00 - SUMMARY', 'PART 1 - GENERAL', '1.01 SCOPE', 'Body text.']);
    addPageWithFooter(doc, font, ['01 10 00 page 2', 'More body text.']);
    addPageWithFooter(doc, font, ['SECTION 08 80 00 - GLAZING', 'PART 1 - GENERAL', '1.01 SCOPE', 'Glazing text.']);
    addPageWithFooter(doc, font, ['08 80 00 page 2', 'More glazing text.']);
  });
}

function find(sections, num) {
  return sections.find((s) => s.sectionNumber === num);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('specSorterV2.parseSpecSectionsV2 — spec book with running footers', () => {
  it('detects all three sections from footer attribution', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
    expect(find(result, '01 10 00')).toBeTruthy();
    expect(find(result, '08 11 13')).toBeTruthy();
    expect(find(result, '08 80 00')).toBeTruthy();
  });

  it('REGRESSION: TOC page must NOT be the startPage of any section', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);

    expect(Array.isArray(result)).toBe(true);

    // Page 1 is the TOC — no section should start there
    for (const s of result) {
      expect(s.startPage).not.toBe(1);
    }

    // Specifically 08 11 13: TOC mentions it, body is pages 5-8
    const hollowMetal = find(result, '08 11 13');
    expect(hollowMetal).toBeTruthy();
    expect(hollowMetal.startPage).toBeGreaterThanOrEqual(5);
    expect(hollowMetal.startPage).toBeLessThanOrEqual(8);
  });

  it('08 11 13 body pages start at 5 (not the TOC page 1)', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);
    const s = find(result, '08 11 13');
    expect(s).toBeTruthy();
    expect(s.startPage).toBe(5);
    expect(s.endPage).toBe(8);
    expect(s.pageCount).toBe(4);
  });

  it('flags Division 08 sections as glazing-relevant', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);
    // GLAZING_DIVISIONS = ['01','03','05','07','08'] — Division 01 is included
    expect(find(result, '08 11 13')?.isGlazingRelevant).toBe(true);
    expect(find(result, '08 80 00')?.isGlazingRelevant).toBe(true);
    // Division 01 is intentionally in GLAZING_DIVISIONS (general conditions matter)
    expect(find(result, '01 10 00')?.isGlazingRelevant).toBe(true);
  });

  it('all sections have valid page ranges (endPage >= startPage)', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);
    for (const s of result) {
      expect(s.endPage).toBeGreaterThanOrEqual(s.startPage);
      expect(s.pageCount).toBe(s.endPage - s.startPage + 1);
    }
  });

  it('sections carry confidence field', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);
    for (const s of result) {
      expect(['high', 'medium', 'low']).toContain(s.confidence);
    }
  });

  it('sections carry detectionMethod field', async () => {
    const pdf = await buildSpecBookPdf();
    const result = await parseSpecSectionsV2(pdf);
    for (const s of result) {
      expect(s.detectionMethod).toBeDefined();
      expect(typeof s.detectionMethod).toBe('string');
    }
  });
});

describe('specSorterV2.parseSpecSectionsV2 — extended section numbers', () => {
  it('parses 03 15 16.13 as a single section', async () => {
    const pdf = await buildExtendedNumberPdf();
    const result = await parseSpecSectionsV2(pdf);

    expect(Array.isArray(result)).toBe(true);
    const s = result.find((r) => r.sectionNumber.startsWith('03 15 16'));
    expect(s).toBeTruthy();
    // Must include the extension (.13)
    expect(s.sectionNumber).toMatch(/03 15 16\.?13/);
  });

  it('body starts at page 2, not the TOC page 1', async () => {
    const pdf = await buildExtendedNumberPdf();
    const result = await parseSpecSectionsV2(pdf);
    const s = result.find((r) => r.sectionNumber.startsWith('03 15 16'));
    expect(s?.startPage).toBeGreaterThanOrEqual(2);
  });
});

describe('specSorterV2.parseSpecSectionsV2 — scanned (textless) PDF', () => {
  it('returns needsOcr: true and success: false', async () => {
    const pdf = await buildTextlessPdf();
    const result = await parseSpecSectionsV2(pdf);

    expect(Array.isArray(result)).toBe(false);
    expect(result.success).toBe(false);
    expect(result.needsOcr).toBe(true);
    expect(typeof result.error).toBe('string');
    expect(result.sections).toEqual([]);
  });

  it('does NOT return an empty array — error object instead', async () => {
    const pdf = await buildTextlessPdf();
    const result = await parseSpecSectionsV2(pdf);
    // Must not silently return [] (the old V1 silent-zero bug)
    expect(Array.isArray(result)).toBe(false);
  });
});

describe('specSorterV2.parseSpecSectionsV2 — header-scan fallback', () => {
  it('detects sections from SECTION header lines when no footers present', async () => {
    const pdf = await buildHeaderOnlyPdf();
    const result = await parseSpecSectionsV2(pdf);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(find(result, '01 10 00') || find(result, '08 80 00')).toBeTruthy();
  });

  it('TOC page still excluded from section ownership even in fallback mode', async () => {
    const pdf = await buildHeaderOnlyPdf();
    const result = await parseSpecSectionsV2(pdf);
    if (Array.isArray(result)) {
      for (const s of result) {
        expect(s.startPage).toBeGreaterThan(1); // page 1 is the TOC
      }
    }
  });
});
