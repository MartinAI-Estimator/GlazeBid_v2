/**
 * specSectionExtractor.js — Local Spec Section Extractor
 *
 * Scans specification PDF text for CSI MasterFormat division headings
 * (e.g. "08 41 13 - Aluminum-Framed Storefronts") and returns structured
 * section data.  The primary goal is to identify Division 08 (Glazing)
 * sections so the intake pipeline can flag relevant specs and discard
 * non-glazing divisions.
 *
 * Uses pdf.js (already bundled via react-pdf) — no backend required.
 *
 * Division 08 sub-sections of interest:
 *   08 41 13  Aluminum-Framed Storefronts
 *   08 42 26  All-Glass Storefronts
 *   08 43 13  Aluminum-Framed Storefronts (alt)
 *   08 44 13  Glazed Aluminum Curtain Walls
 *   08 44 33  Sloped Glazing (Skylights)
 *   08 45 00  Translucent Wall / Roof Assemblies
 *   08 50 00  Windows (general)
 *   08 51 13  Aluminum Windows
 *   08 52 00  Wood Windows
 *   08 53 00  Vinyl Windows
 *   08 56 00  Special Function Windows (blast, bullet, fire)
 *   08 80 00  Glazing (general)
 *   08 81 00  Glass Glazing
 *   08 83 00  Mirrors
 *   08 87 00  Glazing Surface Films
 *   08 88 00  Special Function Glazing
 *   08 11 13  Hollow Metal Doors and Frames
 *   08 11 16  Aluminum Doors and Frames
 *   08 12 13  Hollow Metal Frames
 *   08 14 16  Flush Wood Doors
 *   08 31 13  Access Doors and Panels
 *   08 33 23  Overhead Coiling Doors
 *   08 36 13  Sectional Doors
 *   08 71 00  Door Hardware
 */

import { pdfjs } from 'react-pdf';

// Ensure pdf.js worker is configured (idempotent — safe to call multiple times)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

// ── Regex patterns ──────────────────────────────────────────────────────────

/**
 * Matches CSI MasterFormat 6-digit section codes in several common notations:
 *   "08 41 13"   "08 4113"   "084113"   "08-41-13"
 * Followed by optional separator and section name.
 */
const CSI_SECTION_RE = /\b(\d{2})\s*[-.]?\s*(\d{2})\s*[-.]?\s*(\d{2})\b\s*[-–—:.]?\s*(.*)/;

/**
 * Broader pattern that also matches 4-digit shorthand: "08 41" or "0841"
 * These appear in TOCs and running headers.
 */
const CSI_SHORT_RE = /\b(\d{2})\s*[-.]?\s*(\d{2})\b(?:\s*(\d{2}))?\s*[-–—:.]?\s*(.*)/;

/**
 * Division 08 prefix — the one we care about for glazing.
 */
const DIV8_PREFIX = '08';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract CSI section headings from a PDF file.
 *
 * @param {File|ArrayBuffer|Uint8Array} source — PDF file object or raw data
 * @returns {Promise<{ sections_found: number, sections: SpecSection[], division8: SpecSection[] }>}
 *
 * @typedef {Object} SpecSection
 * @property {string} code   — Normalised CSI code, e.g. "08 41 13"
 * @property {string} name   — Section title text
 * @property {number} page   — 1-based page number where found
 * @property {string} division — The 2-digit division, e.g. "08"
 * @property {boolean} isDiv8 — true if this is a Division 08 section
 */
export async function extractSpecSections(source) {
  let data;
  if (source instanceof File) {
    console.log(`📑 Spec Extractor: reading file "${source.name}" (${(source.size / 1024).toFixed(0)} KB)`);
    data = await source.arrayBuffer();
  } else {
    data = source;
  }

  const pdf = await pdfjs.getDocument({ data }).promise;
  const numPages = pdf.numPages;

  const seen = new Set();     // de-dup by "code_page"
  const allSections = [];

  console.log(`📑 Spec Extractor: scanning ${numPages} pages...`);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Concatenate all text items on this page
    const lines = collapseToLines(textContent.items);

    for (const line of lines) {
      const section = parseSectionLine(line, pageNum);
      if (!section) continue;

      const dedup = `${section.code}_${section.page}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      allSections.push(section);
    }
  }

  // Sort by code then page
  allSections.sort((a, b) => a.code.localeCompare(b.code) || a.page - b.page);

  const division8 = allSections.filter(s => s.isDiv8);

  console.log(`✅ Spec Extractor: ${allSections.length} total sections, ${division8.length} Division 08`);

  return {
    sections_found: allSections.length,
    sections: allSections,
    division8,
  };
}

/**
 * Quick check: does a spec PDF contain any Division 08 content?
 * Stops scanning as soon as the first Division 08 heading is found.
 *
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function hasDiv8Content(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const numPages = pdf.numPages;

  // Only scan first 40 pages (TOC + early sections) for speed
  const limit = Math.min(numPages, 40);

  for (let pageNum = 1; pageNum <= limit; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lines = collapseToLines(textContent.items);

    for (const line of lines) {
      const section = parseSectionLine(line, pageNum);
      if (section?.isDiv8) return true;
    }
  }

  return false;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Collapse pdf.js text items into logical lines based on Y-position proximity.
 */
function collapseToLines(items) {
  if (!items?.length) return [];

  const lines = [];
  let currentLine = '';
  let lastY = null;

  for (const item of items) {
    const y = Math.round(item.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 3) {
      // New line
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
    }
    currentLine += (currentLine ? ' ' : '') + item.str;
    lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines;
}

/**
 * Try to parse a CSI MasterFormat section heading from a line of text.
 * Returns null if the line doesn't match.
 */
function parseSectionLine(line, pageNum) {
  // Skip very short or very long lines (likely not section headings)
  if (line.length < 6 || line.length > 200) return null;

  // Try full 6-digit code first
  let match = line.match(CSI_SECTION_RE);
  if (match) {
    const div = match[1];
    const sub1 = match[2];
    const sub2 = match[3];
    const code = `${div} ${sub1} ${sub2}`;
    const rawName = cleanSectionName(match[4]);

    // Validate: division number should be 01-49 (CSI range)
    const divNum = parseInt(div, 10);
    if (divNum < 1 || divNum > 49) return null;

    return {
      code,
      name: rawName || inferSectionName(code),
      page: pageNum,
      division: div,
      isDiv8: div === DIV8_PREFIX,
    };
  }

  // Try shorter 4-digit pattern (from TOC entries)
  match = line.match(CSI_SHORT_RE);
  if (match) {
    const div = match[1];
    const sub1 = match[2];
    const sub2 = match[3] || '00';
    const code = `${div} ${sub1} ${sub2}`;
    const rawName = cleanSectionName(match[4]);

    const divNum = parseInt(div, 10);
    if (divNum < 1 || divNum > 49) return null;

    // Require some name text for short codes to avoid false positives on numbers
    if (!rawName && !match[3]) return null;

    return {
      code,
      name: rawName || inferSectionName(code),
      page: pageNum,
      division: div,
      isDiv8: div === DIV8_PREFIX,
    };
  }

  return null;
}

/**
 * Clean up extracted section name text.
 */
function cleanSectionName(raw) {
  if (!raw) return '';
  return raw
    .replace(/^[-–—:.\s]+/, '')     // leading separators
    .replace(/\s{2,}/g, ' ')        // collapse whitespace
    .replace(/\d+\s*$/, '')         // trailing page numbers
    .trim();
}

/**
 * Known Division 08 section names for when the PDF doesn't include the title.
 */
const DIV8_NAMES = {
  '08 00 00': 'Openings',
  '08 10 00': 'Doors and Frames',
  '08 11 00': 'Metal Doors and Frames',
  '08 11 13': 'Hollow Metal Doors and Frames',
  '08 11 16': 'Aluminum Doors and Frames',
  '08 12 00': 'Metal Frames',
  '08 12 13': 'Hollow Metal Frames',
  '08 14 00': 'Wood Doors',
  '08 14 16': 'Flush Wood Doors',
  '08 31 00': 'Access Doors and Panels',
  '08 31 13': 'Access Doors and Frames',
  '08 33 00': 'Coiling Doors and Grilles',
  '08 33 23': 'Overhead Coiling Doors',
  '08 34 00': 'Special Function Doors',
  '08 36 00': 'Panel Doors',
  '08 36 13': 'Sectional Doors',
  '08 40 00': 'Entrances, Storefronts, and Curtain Walls',
  '08 41 00': 'Entrances and Storefronts',
  '08 41 13': 'Aluminum-Framed Storefronts',
  '08 42 00': 'Entrances',
  '08 42 26': 'All-Glass Entrances',
  '08 43 00': 'Storefronts',
  '08 43 13': 'Aluminum-Framed Storefronts',
  '08 44 00': 'Curtain Wall and Glazed Assemblies',
  '08 44 13': 'Glazed Aluminum Curtain Walls',
  '08 44 33': 'Sloped Glazing Assemblies',
  '08 45 00': 'Translucent Wall and Roof Assemblies',
  '08 50 00': 'Windows',
  '08 51 00': 'Metal Windows',
  '08 51 13': 'Aluminum Windows',
  '08 52 00': 'Wood Windows',
  '08 53 00': 'Vinyl Windows',
  '08 56 00': 'Special Function Windows',
  '08 70 00': 'Hardware',
  '08 71 00': 'Door Hardware',
  '08 80 00': 'Glazing',
  '08 81 00': 'Glass Glazing',
  '08 83 00': 'Mirrors',
  '08 87 00': 'Glazing Surface Films',
  '08 88 00': 'Special Function Glazing',
};

function inferSectionName(code) {
  return DIV8_NAMES[code] || '';
}
