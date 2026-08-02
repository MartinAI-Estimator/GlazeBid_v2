/**
 * specSorterV2.js — Phase 1 boundary-detection rewrite (see SPEC_SORTER_FIX_PLAN.md)
 *
 * Strategy: PER-PAGE ATTRIBUTION instead of start-page detection.
 * Every page declares its owner section via its running header/footer bands
 * ("HOLLOW METAL DOORS AND FRAMES  08 11 13 - 8"). Section ranges fall out of
 * contiguous runs of same-owner pages. TOC pages are never used for page numbers.
 *
 * Validated 2026-07-15 against real spec PDFs:
 *  - "Project Manual - Bid Specs.pdf" (Brighton, 298 pg): 57 sections, 100% page
 *    coverage, all high-confidence, all titled. Fixed the phantom 08 11 13 @ TOC
 *    page bug and recovered 5 sections the V1 engine missed entirely
 *    (01 25 00.10, 01 25 00.15, 01 21 00-form, 03 15 16.13, 07 42 13.19).
 *  - "Tricity Family - Bid Specs.pdf" (drawing-sheet specs): partial, flagged
 *    medium confidence (full multi-column support = Phase 2).
 *  - "Mclaughlin - Bid Set.pdf" (scan, no text layer): returns needsOcr: true
 *    with a clear error instead of silently finding nothing.
 *
 * Output contract is a superset of specSorter.parseSpecSections:
 *   [{ sectionNumber, sectionTitle, startPage, endPage, pageCount,
 *      isGlazingRelevant, confidence: 'high'|'medium'|'low',
 *      detectionMethod: 'page-attribution'|'header-scan-fallback' }]
 * or  { success: false, error, needsOcr?, sections: [] }
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Same environment shims as specSorter.js ───────────────────────────────────
function resolveWorkerSrc(url) {
  if (typeof url !== 'string') return url;
  if (url.startsWith('/@fs/')) return 'file://' + url.slice(4);
  return url;
}
pdfjsLib.GlobalWorkerOptions.workerSrc = resolveWorkerSrc(pdfjsWorkerUrl);

if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// ── Patterns ─────────────────────────────────────────────────────────────────
// 6-digit MasterFormat number with optional extension: "08 11 13", "03 15 16.13"
const SEC_NUM = '(\\d{2})\\s*[.\\- ]?\\s*(\\d{2})\\s*[.\\- ]?\\s*(\\d{2})((?:\\s*\\.\\s*\\d{1,2})?)';
// Running footer: "<TITLE> <NN NN NN[.NN]> - <page-in-section>"
const BAND_FOOTER_RE = new RegExp(`(.*?)\\b${SEC_NUM}\\s*[-\\u2013\\u2014]\\s*(\\d{1,4})\\b`, 'i');
// Section header: "SECTION NN NN NN[.NN] - TITLE"
const BAND_SECTION_RE = new RegExp(`\\bSECTION\\s+${SEC_NUM}\\b\\s*[-\\u2013\\u2014:]?\\s*(.*)`, 'i');
// Words that indicate a cross-REFERENCE to a section, not a section header
const XREF_BEFORE_RE = /\b(in|per|of|to|see|with|under|by)\s+$/i;
const TOC_HEADING_RE = /\b(table\s+of\s+contents|index\s+of\s+sections|specification\s+index)\b/i;
const TOC_LINE_RE = new RegExp(`^${SEC_NUM}\\s*[-\\u2013\\u2014]`);

// ── Division classification ─────────────────────────────────────────────────
// SCOPE_DIVISIONS  — sections the glazier bids directly (Division 08: Openings)
// REVIEW_DIVISIONS — sections with scope-gap risk (sealants, steel, testing, contract)
const SCOPE_DIVISIONS  = new Set(['08']);
const REVIEW_DIVISIONS = new Set(['00', '01', '02', '05', '07']);
// Backward-compat union (any section worth looking at)
const GLAZING_DIVISIONS = new Set([...SCOPE_DIVISIONS, ...REVIEW_DIVISIONS]);

// Band geometry (fractions of page height; pdfjs Y origin = bottom)
const HEADER_BAND_FRAC = 0.85; // items above 85% height
const FOOTER_BAND_FRAC = 0.12; // items below 12% height
const MIN_BAND_COVERAGE = 0.4; // below this, fall back to legacy header scan

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {ArrayBuffer|Uint8Array|Buffer} pdfBuffer
 * @returns {Promise<Array|{success:false,error:string,needsOcr?:boolean,sections:Array}>}
 */
export async function parseSpecSectionsV2(pdfBuffer) {
  try {
    const data = toUint8Array(pdfBuffer);
    if (!data || data.length === 0) {
      return { success: false, error: 'Spec sorter received an empty PDF buffer.', sections: [] };
    }

    const doc = await loadPdfTextDoc(data);
    const totalPages = doc.numPages;

    const pageRecords = await attributePages(doc, totalPages);

    // Scanned PDF (no text layer) → explicit OCR-needed result
    const textless = pageRecords.filter((r) => !r.hasText).length;
    if (textless === totalPages) {
      return {
        success: false,
        needsOcr: true,
        error: 'This PDF has no text layer (scanned document). OCR is required before sections can be detected.',
        sections: [],
      };
    }

    const owned = pageRecords.filter((r) => r.owner).length;
    const coverage = owned / totalPages;

    if (coverage >= MIN_BAND_COVERAGE) {
      const sections = buildSectionsFromAttribution(pageRecords);
      if (sections.length > 0) {
        return sections.map((s) => ({ ...s, detectionMethod: 'page-attribution' }));
      }
    }

    // Fallback: legacy first-page header scan (never TOC page numbers)
    const headerStarts = dedupeAndSortStarts(await scanSectionHeaders(doc, totalPages));
    if (headerStarts.length === 0) {
      return {
        success: false,
        error: textless > 0
          ? `No section headers detected. ${textless} of ${totalPages} pages have no text layer — this may be a partially scanned document.`
          : 'No section headers or running footers were detected in this PDF.',
        sections: [],
      };
    }
    return buildSectionRanges(headerStarts, totalPages).map((s) => ({
      ...s,
      confidence: 'low',
      detectionMethod: 'header-scan-fallback',
    }));
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse specification sections: ${stringifyError(error)}`,
      sections: [],
    };
  }
}

/**
 * Low-level per-page attribution — exported for Phase 2/4 reuse
 * (drawing-sheet mode, capture-time citations).
 */
export async function attributePages(doc, totalPages) {
  const records = [];
  for (let p = 1; p <= totalPages; p += 1) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const lines = collapseToLines(tc.items);
    const H = vp.height;

    const headerBand = lines.filter((l) => l.y > H * HEADER_BAND_FRAC);
    const footerBand = lines.filter((l) => l.y < H * FOOTER_BAND_FRAC);
    const bands = [...footerBand, ...headerBand]; // footer first — more reliable

    const rec = {
      page: p, owner: null, ownerSource: null, pageInSection: null,
      title: '', isToc: false, hasText: lines.length > 0,
    };

    // TOC/index page detection (explicit heading OR dense section-number lines)
    const tocish = lines.filter((l) => TOC_LINE_RE.test(l.text)).length;
    if (lines.some((l) => TOC_HEADING_RE.test(l.text)) || tocish >= 5) rec.isToc = true;

    // Pass 1: running footer pattern — most reliable signal.
    // Skip for pages already identified as TOC/index.
    if (!rec.isToc) {
      for (const l of bands) {
        const m = l.text.match(BAND_FOOTER_RE);
        if (m) {
          rec.owner = formatSectionNumber(m[2], m[3], m[4], m[5]);
          rec.ownerSource = 'band-footer';
          rec.pageInSection = Number.parseInt(m[6], 10);
          rec.title = extractFooterTitle(m[1]);
          break;
        }
      }
    }

    // Pass 2: "SECTION NN NN NN - TITLE" header — reject cross-references
    // Skip if this is already identified as a TOC/index page.
    if (!rec.owner && !rec.isToc) {
      for (const l of bands) {
        const m = l.text.match(BAND_SECTION_RE);
        if (!m) continue;
        const before = l.text.slice(0, m.index);
        if (XREF_BEFORE_RE.test(before)) continue;        // "... specified in Section 01 21 00"
        const title = cleanTitle(m[5]);
        if (title && !/^[A-Z0-9]/.test(title)) continue;  // body text, not a header
        rec.owner = formatSectionNumber(m[1], m[2], m[3], m[4]);
        rec.ownerSource = 'band-section';
        rec.title = title;
        break;
      }
    }

    records.push(rec);
  }

  // Unowned pages inherit the previous owner (spec sections are contiguous)
  let prev = null;
  for (const rec of records) {
    if (rec.owner) prev = rec.owner;
    else if (prev && !rec.isToc) { rec.owner = prev; rec.ownerSource = 'inherited'; }
  }

  return records;
}

function buildSectionsFromAttribution(pageRecords) {
  const sections = [];
  for (const rec of pageRecords) {
    const last = sections[sections.length - 1];
    if (last && last.sectionNumber === rec.owner) {
      last.endPage = rec.page;
      if (!last.sectionTitle && rec.title) last.sectionTitle = rec.title;
      if (rec.ownerSource !== 'inherited') last.attributedPages += 1;
    } else if (rec.owner) {
      sections.push({
        sectionNumber: rec.owner,
        sectionTitle: rec.title || '',
        startPage: rec.page,
        endPage: rec.page,
        attributedPages: rec.ownerSource === 'inherited' ? 0 : 1,
        startConfirmed: rec.pageInSection === 1,
      });
    }
  }

  return sections.map((s) => {
    const pageCount = s.endPage - s.startPage + 1;
    const attributedRatio = s.attributedPages / pageCount;
    return {
      sectionNumber: s.sectionNumber,
      sectionTitle: s.sectionTitle || 'Untitled Section',
      startPage: s.startPage,
      endPage: s.endPage,
      pageCount,
      isGlazingRelevant:  GLAZING_DIVISIONS.has(s.sectionNumber.slice(0, 2)),
      isScopeRelevant:    SCOPE_DIVISIONS.has(s.sectionNumber.slice(0, 2)),
      isReviewRelevant:   REVIEW_DIVISIONS.has(s.sectionNumber.slice(0, 2)),
      confidence: attributedRatio >= 0.5 ? (s.startConfirmed ? 'high' : 'medium') : 'low',
    };
  });
}

// ── Legacy fallback: first-page header scan (ported from specSorter.js) ──────
const SECTION_PREFIX_RE = /^\s*section\s+/i;
const HEADER_SECTION_RE = /^\s*SECTION\s+([0-9][0-9\s.\-]{2,12}[0-9])\b\s*[-:–—]?\s*(.*)$/i;
const HEADER_BARE_RE = /^\s*([0-9][0-9\s.\-]{2,12}[0-9])\s*[-:–—]\s*([A-Z0-9][A-Z0-9\s\-(),/&.]{2,})\s*$/;

async function scanSectionHeaders(doc, totalPages) {
  const entries = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    const lines = collapseToLines(tc.items).map((l) => l.text);
    const topLines = lines.slice(0, 8);

    for (const rawLine of topLines) {
      const line = rawLine.trim();
      let match = line.match(HEADER_SECTION_RE);
      if (match) {
        const n = normalizeLooseSectionNumber(match[1]);
        if (!n) continue;
        entries.push({ sectionNumber: n, sectionTitle: cleanTitle(match[2]), startPage: pageNum });
        break;
      }
      match = line.match(HEADER_BARE_RE);
      if (match && looksLikeAllCaps(line)) {
        const n = normalizeLooseSectionNumber(match[1]);
        if (!n) continue;
        entries.push({ sectionNumber: n, sectionTitle: cleanTitle(match[2]), startPage: pageNum });
        break;
      }
      if (SECTION_PREFIX_RE.test(line)) {
        const num = normalizeLooseSectionNumber(line.replace(SECTION_PREFIX_RE, ''));
        if (num) { entries.push({ sectionNumber: num, sectionTitle: '', startPage: pageNum }); break; }
      }
    }
  }
  return entries;
}

function dedupeAndSortStarts(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.sectionNumber;
    if (!map.has(key)) {
      map.set(key, { sectionNumber: e.sectionNumber, sectionTitle: e.sectionTitle || '', startPage: e.startPage });
      continue;
    }
    const cur = map.get(key);
    if (e.startPage < cur.startPage) cur.startPage = e.startPage;
    if (!cur.sectionTitle && e.sectionTitle) cur.sectionTitle = e.sectionTitle;
  }
  return [...map.values()].sort((a, b) => a.startPage - b.startPage || a.sectionNumber.localeCompare(b.sectionNumber));
}

function buildSectionRanges(sortedStarts, totalPages) {
  return sortedStarts.map((cur, i) => {
    const next = sortedStarts[i + 1];
    const endPage = next ? Math.max(cur.startPage, next.startPage - 1) : totalPages;
    return {
      sectionNumber: cur.sectionNumber,
      sectionTitle: cur.sectionTitle || 'Untitled Section',
      startPage: cur.startPage,
      endPage,
      pageCount: endPage - cur.startPage + 1,
      isGlazingRelevant:  GLAZING_DIVISIONS.has(cur.sectionNumber.slice(0, 2)),
      isScopeRelevant:    SCOPE_DIVISIONS.has(cur.sectionNumber.slice(0, 2)),
      isReviewRelevant:   REVIEW_DIVISIONS.has(cur.sectionNumber.slice(0, 2)),
    };
  });
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function loadPdfTextDoc(data) {
  const safeCopy = data instanceof Uint8Array
    ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    : new Uint8Array(data);
  return pdfjsLib.getDocument({
    data: safeCopy,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
}

/** Collapse pdfjs text items into visual lines, preserving each line's Y coordinate. */
function collapseToLines(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const sorted = [...items].filter((i) => typeof i.str === 'string').sort((a, b) => {
    const ay = Math.round(a.transform?.[5] ?? 0);
    const by = Math.round(b.transform?.[5] ?? 0);
    if (ay !== by) return by - ay;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });
  const lines = [];
  let cur = [];
  let lastY = null;
  for (const it of sorted) {
    const y = it.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      lines.push({ y: lastY, text: joinLine(cur) });
      cur = [];
    }
    cur.push(it.str || '');
    lastY = y;
  }
  if (cur.length) lines.push({ y: lastY, text: joinLine(cur) });
  return lines.filter((l) => l.text);
}

function joinLine(parts) {
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function formatSectionNumber(a, b, c, ext) {
  const suffix = ext ? ext.replace(/\s/g, '') : '';
  return `${a} ${b} ${c}${suffix}`;
}

/** V1-style loose normalizer for the fallback path (4/5/6 digit forms). */
function normalizeLooseSectionNumber(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 6) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  if (digits.length === 5) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}0`;
  if (digits.length === 4) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} 00`;
  return null;
}

function cleanTitle(t) {
  return (t || '')
    .replace(/\.{2,}.*/, '')
    .replace(/^[\s\-–—:.,]+|[\s\-–—:.,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Footer lines carry project boilerplate before the title:
 * "Ware Malcomb DEN25-0034-00 ... Colorado . HOLLOW METAL DOORS AND FRAMES"
 * Title = trailing ALL-CAPS run immediately before the section number.
 */
function extractFooterTitle(prefix) {
  const m = (prefix || '').match(/([A-Z][A-Z0-9\s\-(),/&.']{4,})$/);
  return cleanTitle(m ? m[1] : '');
}

function looksLikeAllCaps(line) {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  return letters === letters.toUpperCase();
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return new Uint8Array(input);
  return new Uint8Array();
}

function stringifyError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
