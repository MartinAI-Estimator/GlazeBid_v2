import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseSpecSections } from './specSorter';

async function createPdfWithTocAndSections() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const addPage = (lines) => {
    const page = doc.addPage([612, 792]);
    let y = 760;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font });
      y -= 20;
    }
  };

  // Page 1: Table of Contents
  addPage([
    'TABLE OF CONTENTS',
    'SECTION 01 10 00 - SUMMARY ........................................ 2',
    'SECTION 05 50 00 - METAL FABRICATIONS ............................. 4',
    'SECTION 08 80 00 - GLAZING ........................................ 6',
  ]);

  // Pages 2-3: Section 01
  addPage(['SECTION 01 10 00', 'SUMMARY']);
  addPage(['01 10 00 CONTINUATION']);

  // Pages 4-5: Section 05
  addPage(['SECTION 05 50 00', 'METAL FABRICATIONS']);
  addPage(['05 50 00 CONTINUATION']);

  // Pages 6-7: Section 08
  addPage(['SECTION 08 80 00', 'GLAZING']);
  addPage(['08 80 00 CONTINUATION']);

  return new Uint8Array(await doc.save());
}

function findSection(sections, sectionNumber) {
  return sections.find((s) => s.sectionNumber === sectionNumber);
}

describe('specSorter.parseSpecSections', () => {
  it('detects TOC entries and returns sections', async () => {
    const pdf = await createPdfWithTocAndSections();
    const result = await parseSpecSections(pdf);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(findSection(result, '08 80 00')).toBeTruthy();
  });

  it('computes valid page ranges where endPage >= startPage', async () => {
    const pdf = await createPdfWithTocAndSections();
    const result = await parseSpecSections(pdf);

    for (const section of result) {
      expect(section.endPage).toBeGreaterThanOrEqual(section.startPage);
      expect(section.pageCount).toBe(section.endPage - section.startPage + 1);
    }
  });

  it('sets the last section endPage to total page count', async () => {
    const pdf = await createPdfWithTocAndSections();
    const result = await parseSpecSections(pdf);

    const last = result[result.length - 1];
    expect(last.endPage).toBe(7);
  });

  it('fails if more than 30% of sections are single-page (regression guard)', async () => {
    const pdf = await createPdfWithTocAndSections();
    const result = await parseSpecSections(pdf);

    const singlePage = result.filter((s) => s.pageCount === 1);
    const ratio = result.length ? singlePage.length / result.length : 0;

    if (ratio > 0.3) {
      const offenders = singlePage.map((s) => `${s.sectionNumber} (${s.sectionTitle})`).join(', ');
      throw new Error(`Single-page ratio too high (${Math.round(ratio * 100)}%): ${offenders}`);
    }

    expect(ratio).toBeLessThanOrEqual(0.3);
  });

  it('flags Division 08 sections as glazing-relevant', async () => {
    const pdf = await createPdfWithTocAndSections();
    const result = await parseSpecSections(pdf);

    const glazing = findSection(result, '08 80 00');
    expect(glazing).toBeTruthy();
    expect(glazing.isGlazingRelevant).toBe(true);
  });
});
