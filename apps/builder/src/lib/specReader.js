/**
 * specReader.js
 * Glazing spec extraction engine — rules-based, no ML.
 * Reads saved spec section PDFs and extracts the six categories a glazing
 * estimator needs before bidding: basis of design, finish, performance,
 * substitution rules, submittals, and warranty.
 *
 * Works in both Electron renderer (pdfjs) and Node/Vitest (pdfjs-dist).
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// In Vitest/Node, Vite's ?url transform produces a /@fs/C:/... dev-server path.
// pdfjs fake-worker mode resolves that via import() which Node.js can't handle.
// Detect and re-map to a proper file:// URL so import() works in any environment.
function resolveWorkerSrc(url) {
  if (typeof url !== 'string') return url;
  if (url.startsWith('/@fs/')) return 'file://' + url.slice(4); // /@fs/C:/... → file:///C:/...
  return url;
}
pdfjsLib.GlobalWorkerOptions.workerSrc = resolveWorkerSrc(pdfjsWorkerUrl);

// Electron 29 / Chrome 122 ReadableStream polyfill (same as specSorter.js)
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

// ── Known glazing manufacturer names ─────────────────────────────────────────
const KNOWN_MANUFACTURERS = [
  // Framing systems
  'Kawneer', 'Tubelite', 'YKK AP', 'YKK', 'EFCO', 'Oldcastle',
  'Oldcastle Building Envelope', 'Pittco', 'Wausau', 'Arcadia',
  'Peerless', 'United States Aluminum', 'US Aluminum',
  'Traco', 'Therma\\-Tru', 'Vistawall', 'Thermovation',
  'Graham Architectural', 'Winco', 'Nana Wall', 'NanaWall',
  'Aluprof', 'Alumil', 'Reynaers', 'Schüco', 'Schuco',
  'Metal Sales', 'Quanex', 'PGT', 'CGI', 'WinDoor',
  // Glass suppliers
  'Guardian', 'Viracon', 'Vitro', 'Cardinal', 'PPG', 'AGC',
  'Cristacurva', 'Pilkington', 'Apogee', 'Interpane',
  'Solarban', 'Suncoat', 'Starphire',
  // Hardware / accessory
  'CR Laurence', 'C\\.R\\. Laurence', 'Assa Abloy', 'Dormakaba',
  'Allegion', 'Norton', 'LCN', 'Sargent', 'Yale',
];
const MFR_RE = new RegExp(KNOWN_MANUFACTURERS.join('|'), 'i');

// ── Extraction patterns by category ──────────────────────────────────────────

const PATTERNS = {
  basisOfDesign: [
    /BASIS\s+OF\s+DESIGN/i,
    /ACCEPTABLE\s+MANUFACTURERS?/i,
    /APPROVED\s+(MANUFACTURERS?|EQUAL|PRODUCT)/i,
    /NAMED\s+MANUFACTURER/i,
    /MANUFACTURERS?\s*:/i,
    /OR\s+EQUAL/i,
    /COMPARABLE\s+PRODUCTS?/i,
    MFR_RE,
  ],
  finish: [
    /\bFINISH\b/i,
    /\bANODIZE[D]?\b/i,
    /\bKYNAR\b|\bPVDF\b/i,
    /\bPOWDER[\s\-]?COAT/i,
    /\bPAINTED\b|\bCOATING\b/i,
    /DARK\s+BRONZE|CLEAR\s+ANODIZE/i,
    /CLASS\s+(I{1,2}|1|2)\b/i,
    /\bDURANODIC\b/i,
    /AA-M\d+/i,
    /COLOR\s*:/i,
  ],
  performance: [
    /WIND\s+LOAD/i,
    /DESIGN\s+PRESSURE/i,
    /\bDP[-:]?\s*[+-]?\d/i,
    /U[-\s]?(VALUE|FACTOR)/i,
    /\bSHGC\b/i,
    /SOLAR\s+HEAT\s+GAIN/i,
    /VISIBLE\s+TRANSMITTANCE|\bVT\b/i,
    /AIR\s+(INFILTRATION|LEAKAGE)/i,
    /WATER\s+(INFILTRATION|PENETRATION)/i,
    /STRUCTURAL\s+TEST/i,
    /DEFLECTION\s+LIMIT/i,
  ],
  substitution: [
    /NO\s+SUBSTITUTION/i,
    /SUBSTITUTION/i,
    /\bALTERNATE\b/i,
    /PRIOR\s+(WRITTEN\s+)?APPROVAL/i,
    /SUBSTITUTION\s+REQUEST/i,
    /APPROVED\s+EQUAL/i,
    /OR\s+EQUAL/i,
    /NO\s+EQUAL/i,
    /SOLE\s+SOURCE/i,
    /PROPRIETARY/i,
  ],
  submittals: [
    /\bSUBMITTALS?\b/i,
    /SHOP\s+DRAWINGS?/i,
    /PRODUCT\s+DATA/i,
    /\bSAMPLES?\b/i,
    /\bMOCK[\s\-]?UP\b/i,
    /ENGINEERING\s+(CALCULATIONS?|CALCS?)/i,
    /TEST\s+REPORTS?/i,
    /\bWARRANTIES\b|\bWARRANTY\s+DOCUMENT/i,
  ],
  warranty: [
    /\bWARRANT[YI]\b/i,
    /\bGUARANTE[EY]\b/i,
    /\d+[\s-]+YEAR/i,
  ],
};

// ── Text utilities ────────────────────────────────────────────────────────────

function toSafeCopy(pdfBuffer) {
  if (pdfBuffer instanceof Uint8Array) {
    return new Uint8Array(
      pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    );
  }
  if (pdfBuffer instanceof ArrayBuffer) return new Uint8Array(pdfBuffer.slice(0));
  return new Uint8Array(pdfBuffer);
}

/**
 * Load a PDF buffer and return page texts.
 * @returns {Promise<Array<{pageNumber:number, text:string, lines:string[]}>>}
 */
async function extractPages(pdfBuffer) {
  const data = toSafeCopy(pdfBuffer);
  const doc = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Collapse items into a single string preserving line breaks
    const lines = collapseItemsToLines(tc.items);
    pages.push({ pageNumber: p, text: lines.join('\n'), lines });
  }
  return pages;
}

/**
 * Load a PDF from the filesystem (Node/Electron main context via IPC, or Node test context).
 * In the renderer, file reading must go via IPC — callers should pass buffers directly.
 * This function is used by scanAllSections in a Node environment (tests, scripts).
 */
async function readFileBuffer(filePath) {
  // Node.js path (Vitest / scripts)
  if (typeof window === 'undefined') {
    const fs = await import('fs/promises');
    const buf = await fs.readFile(filePath);
    return new Uint8Array(buf);
  }
  // Electron renderer — use preload bridge
  if (window.electronAPI?.readPdfFile) {
    const result = await window.electronAPI.readPdfFile(filePath);
    if (!result?.ok) throw new Error(`Failed to read PDF: ${result?.error || 'file not found'}`);
    const raw = result.buffer;
    return raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  }
  throw new Error('No file-reading capability available in this environment.');
}

function collapseItemsToLines(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    const ay = Math.round(a.transform?.[5] ?? 0);
    const by = Math.round(b.transform?.[5] ?? 0);
    if (ay !== by) return by - ay;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });
  const lines = [];
  let lineItems = [];
  let lastY = null;
  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      const ln = lineItems.join(' ').replace(/\s+/g, ' ').trim();
      if (ln) lines.push(ln);
      lineItems = [];
    }
    if (item.str) lineItems.push(item.str);
    lastY = y;
  }
  if (lineItems.length) {
    const ln = lineItems.join(' ').replace(/\s+/g, ' ').trim();
    if (ln) lines.push(ln);
  }
  return lines;
}

/** Get N lines before/after a matched line index, clamped to array bounds. */
function getContext(lines, idx, before = 2, after = 2) {
  const start = Math.max(0, idx - before);
  const end = Math.min(lines.length - 1, idx + after);
  return lines.slice(start, end + 1).join(' ').replace(/\s+/g, ' ').trim();
}

// ── Per-category extractors ───────────────────────────────────────────────────

function extractBasisOfDesign(pages) {
  const items = [];
  const seen = new Set();

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchesBodKeyword = /BASIS\s+OF\s+DESIGN|ACCEPTABLE\s+MANUFACTURERS?|APPROVED\s+MANUFACTURERS?/i.test(line);
      const matchesMfr = MFR_RE.test(line);

      if (!matchesBodKeyword && !matchesMfr) continue;

      const excerpt = getContext(lines, i, 2, 2);
      // Try to find a manufacturer name in this excerpt
      let manufacturer = null;
      for (const name of KNOWN_MANUFACTURERS) {
        const re = new RegExp(name.replace('.', '\\.'), 'i');
        if (re.test(excerpt)) {
          manufacturer = name.replace(/\\\./g, '.'); // unescape for display
          break;
        }
      }

      // Try to find a product name — look for patterns like "Kawneer 1600" or "Series 400"
      let product = null;
      const productMatch = excerpt.match(
        /(?:system|series|product|model|type)[\s:]+([A-Z0-9][\w\s\-/]{2,30})/i
      ) || excerpt.match(/([A-Z][a-z]+\s+\d{3,4}[\w\s\-]*(?:Wall|System|Frame|Series|Door|Window)?)/);
      if (productMatch) product = productMatch[1].trim().slice(0, 60);

      const key = `${manufacturer || ''}|${excerpt.slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ manufacturer, product, excerpt: excerpt.slice(0, 280), page: pageNumber });
    }
  }

  return items.length > 0
    ? { status: 'found', items }
    : { status: 'not_found', items: [] };
}

function extractFinish(pages) {
  const items = [];
  const seen = new Set();

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERNS.finish.some(re => re.test(line))) continue;

      const excerpt = getContext(lines, i, 1, 2);

      // Try to pull out a finish value
      let value = null;
      const valueMatch =
        excerpt.match(/CLASS\s+(I{1,2}|1|2)\s+ANODIZED?\s+[\w\s]+/i) ||
        excerpt.match(/KYNAR\s+\d{3}|PVDF[\w\s]+/i) ||
        excerpt.match(/POWDER[\s\-]?COAT[\w\s]+/i) ||
        excerpt.match(/DARK\s+BRONZE|CLEAR\s+ANODIZE|BLACK\s+ANODIZE|BRONZE\s+ANODIZE/i) ||
        excerpt.match(/AA-M\w+/i) ||
        excerpt.match(/COLOR\s*:\s*([\w\s]+)/i);
      if (valueMatch) value = valueMatch[0].trim().slice(0, 80);

      const key = excerpt.slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ value, excerpt: excerpt.slice(0, 280), page: pageNumber });
    }
  }

  return items.length > 0
    ? { status: 'found', items }
    : { status: 'not_found', items: [] };
}

function extractPerformance(pages) {
  const items = [];
  const seen = new Set();

  const PERF_PAIRS = [
    { label: 'Design Pressure', re: /DESIGN\s+PRESSURE/i, valRe: /[+-]?\d[\d.,/\s]*psf/i },
    { label: 'Wind Load',        re: /WIND\s+LOAD/i,        valRe: /[+-]?\d[\d.,/\s]*psf/i },
    { label: 'U-Value',          re: /U[-\s]?(VALUE|FACTOR)/i, valRe: /\d+\.?\d*/              },
    { label: 'SHGC',             re: /\bSHGC\b/i,           valRe: /\d+\.?\d*/              },
    { label: 'VT',               re: /VISIBLE\s+TRANSMITTANCE|\bVT\s*[=:]/i, valRe: /\d+\.?\d*/},
    { label: 'Air Infiltration', re: /AIR\s+(INFILTRATION|LEAKAGE)/i, valRe: /[\d.]+\s*cfm/i },
    { label: 'Water Infiltration',re: /WATER\s+(INFILTRATION|PENETRATION)/i, valRe: /\d+\.?\d*\s*psf/i },
    { label: 'Structural Test',  re: /STRUCTURAL\s+TEST/i,  valRe: /\d+%?[\d.,\s]*psf/i    },
    { label: 'Deflection',       re: /DEFLECTION/i,          valRe: /L\/\d+|\d+[\s"']+max/i },
  ];

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pair of PERF_PAIRS) {
        if (!pair.re.test(line)) continue;
        const excerpt = getContext(lines, i, 1, 1);
        const valMatch = pair.valRe ? excerpt.match(pair.valRe) : null;
        const value = valMatch ? valMatch[0].trim() : null;

        const key = `${pair.label}|${(value || '').slice(0, 20)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({ requirement: pair.label, value, excerpt: excerpt.slice(0, 280), page: pageNumber });
      }
    }
  }

  return items.length > 0
    ? { status: 'found', items }
    : { status: 'not_found', items: [] };
}

function extractSubstitution(pages) {
  const items = [];
  let allowed = 'unknown';
  const seen = new Set();

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERNS.substitution.some(re => re.test(line))) continue;

      const excerpt = getContext(lines, i, 1, 2);

      // Determine allowed status — most restrictive answer wins
      if (/NO\s+SUBSTITUTION|NO\s+EQUAL|SOLE\s+SOURCE|PROPRIETARY/i.test(excerpt)) {
        if (allowed === 'unknown' || allowed === 'yes' || allowed === 'prior_approval') {
          allowed = 'no';
        }
      } else if (/PRIOR\s+(WRITTEN\s+)?APPROVAL|PRIOR\s+(ARCHITECT|ENGINEER)/i.test(excerpt)) {
        if (allowed === 'unknown' || allowed === 'yes') {
          allowed = 'prior_approval';
        }
      } else if (/SUBSTITUTION\s+REQUEST|SUBSTITUTION\s+FORM|SUBSTITUTION\s+PROCEDURE/i.test(excerpt)) {
        if (allowed === 'unknown') allowed = 'prior_approval';
      } else if (/APPROVED\s+EQUAL|OR\s+EQUAL|ALTERNATE/i.test(excerpt)) {
        if (allowed === 'unknown') allowed = 'yes';
      }

      const key = excerpt.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ excerpt: excerpt.slice(0, 280), page: pageNumber });
    }
  }

  return items.length > 0
    ? { status: 'found', allowed, items }
    : { status: 'not_found', allowed: 'unknown', items: [] };
}

function extractSubmittals(pages) {
  const seen = new Set();
  const items = [];

  // Known submittal type patterns and their labels
  const SUBMITTAL_TYPES = [
    { label: 'Shop Drawings',          re: /SHOP\s+DRAWINGS?/i },
    { label: 'Product Data',           re: /PRODUCT\s+DATA/i },
    { label: 'Samples',                re: /\bSAMPLES?\b/i },
    { label: 'Mock-Up',                re: /MOCK[\s\-]?UP/i },
    { label: 'Engineering Calculations',re: /ENGINEERING\s+(CALCULATIONS?|CALCS?)/i },
    { label: 'Test Reports',           re: /TEST\s+REPORTS?/i },
    { label: 'Warranty Documents',     re: /WARRANTY\s+(DOC|CERTIF|LETTER)/i },
    { label: 'Submittals',             re: /\bSUBMITTALS?\b/i },
  ];
  const BEFORE_FAB_RE = /BEFORE\s+FABRICATION|PRIOR\s+TO\s+FABRICATION|PRE[\s\-]?FABRICATION/i;

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const stype of SUBMITTAL_TYPES) {
        if (!stype.re.test(line)) continue;
        const excerpt = getContext(lines, i, 1, 2);
        const beforeFabrication = BEFORE_FAB_RE.test(excerpt);
        const key = `${stype.label}|${pageNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ type: stype.label, beforeFabrication, excerpt: excerpt.slice(0, 280), page: pageNumber });
      }
    }
  }

  return items.length > 0
    ? { status: 'found', items }
    : { status: 'not_found', items: [] };
}

function extractWarranty(pages) {
  const items = [];
  const seen = new Set();
  const DURATION_RE = /(\d+)[\s-]+(year|month|yr)/gi;
  const PROVIDER_RE = /\b(manufacturer|contractor|installer|owner)\b/i;

  for (const { pageNumber, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERNS.warranty.some(re => re.test(line))) continue;

      const excerpt = getContext(lines, i, 2, 2);

      // Extract duration
      let duration = null;
      const dMatch = [...excerpt.matchAll(DURATION_RE)];
      if (dMatch.length > 0) {
        duration = dMatch.map(m => `${m[1]} ${m[2]}`).join(', ');
      }

      // What is covered
      let coverage = null;
      const covMatch = excerpt.match(/warrant[yi]\s+on\s+([\w\s,]+)/i) ||
                       excerpt.match(/cover[s\s]+([\w\s,]{4,40})/i);
      if (covMatch) coverage = covMatch[1].trim().slice(0, 60);

      // Who provides
      let provider = null;
      const provMatch = excerpt.match(PROVIDER_RE);
      if (provMatch) provider = provMatch[1].toLowerCase();

      const key = excerpt.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({ duration, coverage, provider, excerpt: excerpt.slice(0, 280), page: pageNumber });
    }
  }

  return items.length > 0
    ? { status: 'found', items }
    : { status: 'not_found', items: [] };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scan a single section PDF buffer.
 * @param {Uint8Array|ArrayBuffer} sectionPdfBuffer
 * @param {{ sectionNumber: string, sectionTitle: string }} sectionMeta
 * @returns {Promise<Object>} section scan result
 */
export async function scanSection(sectionPdfBuffer, sectionMeta) {
  try {
    const pages = await extractPages(sectionPdfBuffer);

    const categories = {
      basisOfDesign:  extractBasisOfDesign(pages),
      finish:         extractFinish(pages),
      performance:    extractPerformance(pages),
      substitution:   extractSubstitution(pages),
      submittals:     extractSubmittals(pages),
      warranty:       extractWarranty(pages),
    };

    const overallScore = Object.values(categories).filter(c => c.status === 'found').length;

    return {
      sectionNumber: sectionMeta.sectionNumber,
      sectionTitle:  sectionMeta.sectionTitle,
      scanStatus:    'complete',
      categories,
      overallScore,
      scannedAt:     new Date().toISOString(),
    };
  } catch (err) {
    return {
      sectionNumber: sectionMeta?.sectionNumber || 'unknown',
      sectionTitle:  sectionMeta?.sectionTitle  || 'Unknown',
      scanStatus:    'failed',
      error:         err?.message || String(err),
      categories:    {
        basisOfDesign: { status: 'not_found', items: [] },
        finish:        { status: 'not_found', items: [] },
        performance:   { status: 'not_found', items: [] },
        substitution:  { status: 'not_found', allowed: 'unknown', items: [] },
        submittals:    { status: 'not_found', items: [] },
        warranty:      { status: 'not_found', items: [] },
      },
      overallScore:  0,
      scannedAt:     new Date().toISOString(),
    };
  }
}

/**
 * Scan all saved spec section PDFs for a project.
 * Each element in sectionFiles should have { sectionNumber, sectionTitle, filePath }.
 * Failed sections get scanStatus: 'failed' but scanning continues.
 * @param {Array<{sectionNumber:string, sectionTitle:string, filePath:string}>} sectionFiles
 * @param {function(number, number):void} [onProgress] - onProgress(current, total)
 * @returns {Promise<Array>}
 */
export async function scanAllSections(sectionFiles, onProgress) {
  if (!sectionFiles || sectionFiles.length === 0) return [];

  const results = [];
  for (let i = 0; i < sectionFiles.length; i++) {
    const f = sectionFiles[i];
    onProgress?.(i + 1, sectionFiles.length);
    try {
      const buf = await readFileBuffer(f.filePath);
      const result = await scanSection(buf, { sectionNumber: f.sectionNumber, sectionTitle: f.sectionTitle });
      results.push(result);
    } catch (err) {
      results.push({
        sectionNumber: f.sectionNumber,
        sectionTitle:  f.sectionTitle,
        scanStatus:    'failed',
        error:         err?.message || String(err),
        categories:    {
          basisOfDesign: { status: 'not_found', items: [] },
          finish:        { status: 'not_found', items: [] },
          performance:   { status: 'not_found', items: [] },
          substitution:  { status: 'not_found', allowed: 'unknown', items: [] },
          submittals:    { status: 'not_found', items: [] },
          warranty:      { status: 'not_found', items: [] },
        },
        overallScore:  0,
        scannedAt:     new Date().toISOString(),
      });
    }
  }
  return results;
}

/**
 * Load a PDF from a file path and return its text content by page.
 * Primarily for inspection/debugging; scanSection() accepts a buffer directly.
 * @param {string} filePath
 * @returns {Promise<Array<{pageNumber:number, text:string}>>}
 */
export async function extractTextByPage(filePath) {
  const buf = await readFileBuffer(filePath);
  const pages = await extractPages(buf);
  return pages.map(p => ({ pageNumber: p.pageNumber, text: p.text }));
}
