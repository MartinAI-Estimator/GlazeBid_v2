import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Wire the worker once at module load — Vite resolves ?url correctly in
// both dev and production, avoiding any version mismatch.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Electron 29 / Chrome 122 does not implement ReadableStream[Symbol.asyncIterator].
// pdfjs-dist legacy 5.5.x uses it internally; polyfill before the first getDocument call.
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

const TOC_SCAN_LIMIT = 30;  // scan up to 30 pages for TOC
const GLAZING_DIVISIONS = new Set(['01', '03', '05', '07', '08']);

const TOC_HEADING_RE = /\b(table\s+of\s+contents|contents|index\s+of\s+sections|specification\s+index)\b/i;
const SECTION_PREFIX_RE = /^\s*section\s+/i;

// Matches a TOC entry line like:
//   "01 10 00  Summary of Work .............. 1"
//   "SECTION 08 80 00 - Glazing  3"
//   "08800 Glazing 12"
// The page number is the last 1-4 digit token on the line separated by
// whitespace or dot-leaders. Title content between number and page is optional.
const TOC_ENTRY_RE = /^\s*(?:SECTION\s+)?([0-9][0-9\s.\-]{2,12}[0-9])\s*[-:–—]?\s*(.*?)\s*[\.\s]{0,}(\d{1,4})\s*$/i;
const HEADER_SECTION_RE = /^\s*SECTION\s+([0-9][0-9\s.\-]{2,12}[0-9])\b\s*[-:–—]?\s*(.*)$/i;
const HEADER_BARE_RE = /^\s*([0-9][0-9\s.\-]{2,12}[0-9])\s*[-:–—]\s*([A-Z0-9][A-Z0-9\s\-(),/&.]{2,})\s*$/;

/**
 * Main entry point.
 * @param {ArrayBuffer|Uint8Array|Buffer} pdfBuffer
 * @returns {Promise<Array|{success:false,error:string,sections:Array}>}
 */
export async function parseSpecSections(pdfBuffer) {
  try {
    const data = toUint8Array(pdfBuffer);
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Spec sorter received an empty PDF buffer.',
        sections: [],
      };
    }

    const doc = await loadPdfTextDoc(data);
    const totalPages = doc.numPages;

    const tocCandidates = await parseTocCandidates(doc, totalPages);
    const startCandidates = tocCandidates.length > 0
      ? dedupeAndSortStarts(tocCandidates)
      : dedupeAndSortStarts(await scanSectionHeaders(doc, totalPages));

    if (startCandidates.length === 0) {
      return {
        success: false,
        error: 'No table of contents or section headers were detected in this PDF.',
        sections: [],
      };
    }

    const sections = buildSectionRanges(startCandidates, totalPages);
    return sections;
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse specification sections: ${stringifyError(error)}`,
      sections: [],
    };
  }
}

/**
 * Extract selected sections to separate PDF buffers.
 * @param {ArrayBuffer|Uint8Array|Buffer} pdfBuffer
 * @param {Array} selectedSections
 * @returns {Promise<Array<{sectionNumber:string,sectionTitle:string,pdfBuffer:Uint8Array}>>}
 */
export async function extractSections(pdfBuffer, selectedSections) {
  const output = [];
  const sourceData = toUint8Array(pdfBuffer);
  const sourceDoc = await PDFDocument.load(sourceData);
  const totalPages = sourceDoc.getPageCount();

  for (const section of selectedSections || []) {
    try {
      const startPage = Number(section.startPage);
      const endPage = Number(section.endPage);

      if (!Number.isFinite(startPage) || !Number.isFinite(endPage)) {
        throw new Error('Invalid startPage/endPage values.');
      }

      const start = Math.max(1, Math.min(startPage, totalPages));
      const end = Math.max(start, Math.min(endPage, totalPages));
      const indexes = [];
      for (let p = start; p <= end; p += 1) indexes.push(p - 1);

      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(sourceDoc, indexes);
      copied.forEach((page) => outDoc.addPage(page));

      output.push({
        sectionNumber: section.sectionNumber,
        sectionTitle: section.sectionTitle,
        pdfBuffer: await outDoc.save(),
      });
    } catch (error) {
      // Skip this section and keep extracting the rest as requested.
      console.error('[specSorter] Failed to extract section:', section?.sectionNumber, stringifyError(error));
    }
  }

  return output;
}

/**
 * Save extracted section PDFs to a folder.
 * @param {Array<{sectionNumber:string,sectionTitle:string,pdfBuffer:Uint8Array|Buffer|ArrayBuffer}>} extractedSections
 * @param {string} outputFolderPath
 * @returns {Promise<Array<string>>}
 */
export async function saveSectionsToFolder(extractedSections, outputFolderPath) {
  // In the Electron renderer, fs/promises is stubbed out by Vite — delegate
  // all file I/O to the main process via the preload bridge.
  if (typeof window !== 'undefined' && typeof window.electronAPI?.saveSections === 'function') {
    const payload = (extractedSections || []).map((s) => ({
      sectionNumber: s.sectionNumber,
      sectionTitle:  s.sectionTitle || 'Section',
      buffer:        toUint8Array(s.pdfBuffer),
    }));
    const result = await window.electronAPI.saveSections(payload, outputFolderPath);
    if (!result?.ok) throw new Error(result?.error || 'Failed to save sections via IPC.');
    return result.savedPaths;
  }

  // Node.js context (Vitest, CLI scripts) — use real fs.
  const fs   = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(outputFolderPath, { recursive: true });
  const savedPaths = [];
  for (const section of extractedSections || []) {
    const safeName = sanitizeFilename(`${section.sectionNumber} - ${section.sectionTitle || 'Section'}.pdf`);
    const fullPath = path.join(outputFolderPath, safeName);
    await fs.writeFile(fullPath, toUint8Array(section.pdfBuffer));
    savedPaths.push(fullPath);
  }
  return savedPaths;
}

async function loadPdfTextDoc(data) {
  // Copy the buffer before handing it to pdfjs — the worker transfer
  // mechanism can detach the original ArrayBuffer, breaking any subsequent use.
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

async function parseTocCandidates(doc, totalPages) {
  const maxPages = Math.min(TOC_SCAN_LIMIT, totalPages);
  const entries = [];
  let sawTocHeading = false;

  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
    const lines = await readPageLines(doc, pageNum);

    if (lines.some((line) => TOC_HEADING_RE.test(line))) {
      sawTocHeading = true;
    }

    for (const line of lines) {
      const parsed = parseTocLine(line, totalPages);
      if (parsed) entries.push(parsed);
    }
  }

  // Require at least 3 entries even when a heading was found — a single
  // stray match is not a reliable TOC detection.
  const isLikelyToc = entries.length >= 3;
  return isLikelyToc ? entries : [];
}

function parseTocLine(line, totalPages) {
  const match = line.match(TOC_ENTRY_RE);
  if (!match) return null;

  const sectionNumber = normalizeSectionNumber(match[1]);
  if (!sectionNumber) return null;

  const startPage = Number.parseInt(match[3], 10);
  if (!Number.isFinite(startPage) || startPage < 1 || startPage > totalPages) {
    return null;
  }

  const sectionTitle = cleanTitle(match[2]);
  return {
    sectionNumber,
    sectionTitle: sectionTitle || inferTitleFallback(line),
    startPage,
  };
}

async function scanSectionHeaders(doc, totalPages) {
  const entries = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const lines = await readPageLines(doc, pageNum);
    const topLines = lines.slice(0, 8);

    for (const rawLine of topLines) {
      const line = rawLine.trim();
      let match = line.match(HEADER_SECTION_RE);
      if (match) {
        const sectionNumber = normalizeSectionNumber(match[1]);
        if (!sectionNumber) continue;

        entries.push({
          sectionNumber,
          sectionTitle: cleanTitle(match[2]) || inferTitleFallback(line),
          startPage: pageNum,
        });
        break;
      }

      match = line.match(HEADER_BARE_RE);
      if (match && looksLikeAllCaps(line)) {
        const sectionNumber = normalizeSectionNumber(match[1]);
        if (!sectionNumber) continue;

        entries.push({
          sectionNumber,
          sectionTitle: cleanTitle(match[2]) || inferTitleFallback(line),
          startPage: pageNum,
        });
        break;
      }

      if (SECTION_PREFIX_RE.test(line)) {
        const maybe = line.replace(SECTION_PREFIX_RE, '');
        const num = normalizeSectionNumber(maybe);
        if (num) {
          entries.push({
            sectionNumber: num,
            sectionTitle: '',
            startPage: pageNum,
          });
          break;
        }
      }
    }
  }

  return entries;
}

function buildSectionRanges(sortedStarts, totalPages) {
  return sortedStarts.map((current, index) => {
    const next = sortedStarts[index + 1];
    const endPage = next ? Math.max(current.startPage, next.startPage - 1) : totalPages;
    const division = current.sectionNumber.slice(0, 2);

    return {
      sectionNumber: current.sectionNumber,
      sectionTitle: current.sectionTitle || 'Untitled Section',
      startPage: current.startPage,
      endPage,
      pageCount: endPage - current.startPage + 1,
      isGlazingRelevant: GLAZING_DIVISIONS.has(division),
    };
  });
}

async function readPageLines(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const text = await page.getTextContent();
  return collapseToLines(text.items);
}

function collapseToLines(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    // Use raw Y (not rounded) for grouping threshold, round for sort key
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
    const yRounded = Math.round(y);
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      lines.push(joinLine(lineItems));
      lineItems = [];
    }

    lineItems.push(item.str || '');
    lastY = y;
  }

  if (lineItems.length) lines.push(joinLine(lineItems));
  return lines.map((l) => l.trim()).filter(Boolean);
}

function joinLine(parts) {
  return parts
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeSectionNumber(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 6) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  }

  if (digits.length === 5) {
    // Legacy 5-digit style (example: 08800 -> 08 80 00).
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}0`;
  }

  if (digits.length === 4) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} 00`;
  }

  return null;
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\.{2,}.*/, '')
    .replace(/\s+\d{1,4}\s*$/, '')
    .replace(/^[-:–—\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferTitleFallback(line) {
  return cleanTitle(
    line
      .replace(SECTION_PREFIX_RE, '')
      .replace(/[0-9\s\-.]{4,}/, '')
  );
}

function dedupeAndSortStarts(entries) {
  const map = new Map();

  for (const entry of entries) {
    const key = entry.sectionNumber;
    if (!map.has(key)) {
      map.set(key, {
        sectionNumber: entry.sectionNumber,
        sectionTitle: entry.sectionTitle || '',
        startPage: entry.startPage,
      });
      continue;
    }

    const current = map.get(key);
    // Keep the earliest page occurrence as the true section start
    if (entry.startPage < current.startPage) {
      current.startPage = entry.startPage;
    }
    // Prefer a non-empty title
    if (!current.sectionTitle && entry.sectionTitle) {
      current.sectionTitle = entry.sectionTitle;
    }
  }

  return [...map.values()].sort((a, b) => a.startPage - b.startPage || a.sectionNumber.localeCompare(b.sectionNumber));
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

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function stringifyError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
