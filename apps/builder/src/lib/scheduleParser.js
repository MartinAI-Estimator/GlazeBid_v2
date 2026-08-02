/**
 * scheduleParser.js — Window Schedule Import (Path C)
 *
 * Turns a dropped window schedule file (PDF / XLSX / XLS / CSV) into an array
 * of Frame Payload objects ready for useFrameBuilderStore.hydrateFrames().
 *
 * Strategy (per architecture principle "rules-based before AI"):
 *   1. Excel/CSV → rules-based header mapping first. High confidence on
 *      well-formatted schedules; no API cost.
 *   2. PDF, or spreadsheets whose headers we can't map → Claude via the
 *      Electron ai:chat IPC bridge (window.electronAPI.aiChat). Haiku-class
 *      extraction; the model returns the payload JSON directly.
 *
 * Never imports fs in the renderer — file contents arrive as File/ArrayBuffer
 * from the drop event (IPC bridge pattern preserved).
 */

import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Worker URL bootstrapping:
// - Renderer (Electron/browser): use the ?url value AS-IS. In dev it's a
//   '/@fs/…' path served over http by Vite; in a production build it's a
//   bundled asset path. Rewriting it to file:// breaks the renderer — Electron
//   blocks file:// module fetches ("Failed to fetch dynamically imported module").
// - Node/Vitest only: '/@fs/C:/…' can't be import()ed by Node, so remap to a
//   proper file:// URL there.
function resolveWorkerSrc(url) {
  if (typeof url !== 'string') return url;
  if (typeof window === 'undefined' && url.startsWith('/@fs/')) {
    return 'file://' + url.slice(4);
  }
  return url;
}
pdfjsLib.GlobalWorkerOptions.workerSrc = resolveWorkerSrc(pdfjsWorkerUrl);

// ─── Dimension parsing ────────────────────────────────────────────────────────

/**
 * Parse an architectural dimension string to decimal inches.
 * Handles: 7'-10", 7'-10 1/2", 7' 10", 94", 94, 7’–10”, 7ft 10in, 2438mm.
 * @returns {number|null}
 */
export function parseDimToInches(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw > 0 ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;

  // Normalize unicode quotes/dashes
  s = s
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

  // Metric?
  const mm = s.match(/^([\d.]+)\s*mm$/i);
  if (mm) return Math.round((parseFloat(mm[1]) / 25.4) * 100) / 100;

  // feet-inches: 7'-10 1/2"  |  7' 10"  |  7'
  const ftIn = s.match(/^(\d+)\s*(?:'|ft\.?|feet)\s*-?\s*(?:(\d+)(?:\s+(\d+)\s*\/\s*(\d+))?\s*(?:"|in\.?|inches)?)?$/i);
  if (ftIn) {
    const ft = parseInt(ftIn[1], 10);
    const inch = ftIn[2] ? parseInt(ftIn[2], 10) : 0;
    const frac = ftIn[3] && ftIn[4] ? parseInt(ftIn[3], 10) / parseInt(ftIn[4], 10) : 0;
    return ft * 12 + inch + frac;
  }

  // inches only: 94" | 94 1/2" | 94 | 94.5
  const inOnly = s.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?\s*(?:"|in\.?|inches)?$/i);
  if (inOnly) {
    const base = parseFloat(inOnly[1]);
    const frac = inOnly[2] && inOnly[3] ? parseInt(inOnly[2], 10) / parseInt(inOnly[3], 10) : 0;
    const val = base + frac;
    return val > 0 ? val : null;
  }

  return null;
}

// ─── File extraction ──────────────────────────────────────────────────────────

const SHEET_EXTS = /\.(xlsx|xlsm|xls|csv|tsv)$/i;
const PDF_EXTS = /\.pdf$/i;

/** @returns {'sheet'|'pdf'|null} */
export function classifyFile(file) {
  const name = file?.name || '';
  if (SHEET_EXTS.test(name)) return 'sheet';
  if (PDF_EXTS.test(name)) return 'pdf';
  if (file?.type === 'application/pdf') return 'pdf';
  if ((file?.type || '').includes('sheet') || (file?.type || '').includes('csv')) return 'sheet';
  return null;
}

/** Extract rows (array of arrays) from an Excel/CSV File. */
export async function extractSheetRows(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    for (const r of sheetRows) {
      if (Array.isArray(r) && r.some((c) => String(c).trim() !== '')) rows.push(r.map((c) => String(c).trim()));
    }
  }
  return rows;
}

/** Extract page texts from a PDF File. @returns {Promise<string>} */
export async function extractPdfText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({
    data: buf,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const chunks = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Preserve rough line structure (same y-clustering as specReader)
    const sorted = [...tc.items].sort((a, b) => {
      const ay = Math.round(a.transform?.[5] ?? 0);
      const by = Math.round(b.transform?.[5] ?? 0);
      if (ay !== by) return by - ay;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });
    const lines = [];
    let cur = [];
    let lastY = null;
    for (const item of sorted) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        const ln = cur.join(' | ').trim();
        if (ln) lines.push(ln);
        cur = [];
      }
      if (item.str && item.str.trim()) cur.push(item.str.trim());
      lastY = y;
    }
    if (cur.length) lines.push(cur.join(' | ').trim());
    chunks.push(`--- PAGE ${p} ---\n${lines.join('\n')}`);
  }
  return chunks.join('\n\n');
}

/**
 * Filter a multi-page PDF text dump down to pages that look like schedules.
 * A full bid set runs 130-270K chars (measured on qaqc test_data) but the AI
 * clip is 60K — without this, dropping a whole set truncates past the schedule.
 * If no page matches, the full text is returned (single-sheet drops).
 */
const SCHEDULE_PAGE_RE = /(WINDOW|FRAME|DOOR|GLAZING|OPENING|STOREFRONT|CURTAIN\s*WALL)\s+(AND\s+FRAME\s+)?SCHEDULE|SCHEDULE\s+OF\s+(WINDOWS|OPENINGS)/i;

export function filterSchedulePages(text) {
  const pages = text.split(/(?=--- PAGE \d+ ---)/);
  const hits = pages.filter((p) => SCHEDULE_PAGE_RE.test(p));
  if (hits.length === 0) return { text, filtered: false, pageCount: pages.length };
  return { text: hits.join('\n\n'), filtered: true, pageCount: hits.length };
}

// ─── Rules-based mapping (Excel/CSV) ─────────────────────────────────────────

const HEADER_ALIASES = {
  mark: ['mark', 'type', 'tag', 'window type', 'frame', 'frame no', 'frame #', 'opening', 'id', 'window mark', 'unit'],
  width: ['width', 'w', 'overall width', 'frame width', 'rough width', 'r.o. width', 'ro width', 'nominal width'],
  height: ['height', 'h', 'hgt', 'overall height', 'frame height', 'rough height', 'r.o. height', 'ro height', 'nominal height'],
  quantity: ['qty', 'quantity', 'count', 'no', 'no.', 'number', 'each', 'ea'],
  systemType: ['system', 'system type', 'frame type', 'series', 'frame series', 'material'],
  glass: ['glass', 'glazing', 'glass type', 'glazing type', 'glass spec'],
  finish: ['finish', 'color', 'colour', 'frame finish'],
  sillAFF: ['sill', 'sill aff', 'sill height', 'aff', 'sill hgt'],
  notes: ['remarks', 'notes', 'comments', 'comment', 'description'],
};

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const lower = rows[i].map((c) => c.toLowerCase().trim());
    const hasMark = lower.some((c) => HEADER_ALIASES.mark.includes(c));
    const hasDim = lower.some((c) => HEADER_ALIASES.width.includes(c)) &&
                   lower.some((c) => HEADER_ALIASES.height.includes(c));
    if (hasMark && hasDim) return i;
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const c = cell.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(c)) map[field] = idx;
    }
  });
  return map;
}

function inferSystemType(str) {
  const s = (str || '').toLowerCase();
  // Mark-style tokens: HM13, CW-1, SF1, AS3, HMF1 (letters glued to digits — no \b between)
  if (/\bhmf[-\s]?\d*\b|fire[-\s]?rated|\b\d+\s*min\b/.test(s)) return 'hollow_metal_fire_rated';
  if (/\bhm[-\s]?\d*\b|hollow\s*metal/.test(s)) return 'hollow_metal';
  if (/\bcw[-\s]?\d*\b|curtain\s*wall|curtainwall/.test(s)) return 'curtainwall';
  if (/\bsf[-\s]?\d*\b|\bas[-\s]?\d+\b|storefront|store\s*front/.test(s)) return 'storefront';
  return null;
}

/**
 * Rules-based mapping of spreadsheet rows to frame payloads.
 * @returns {{ payloads: Array, confidence: number } | null} null if headers unmappable
 */
export function rulesMapRows(rows) {
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) return null;
  const colMap = buildColumnMap(rows[hIdx]);
  if (colMap.mark === undefined || colMap.width === undefined || colMap.height === undefined) return null;

  const payloads = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const mark = (r[colMap.mark] || '').trim();
    if (!mark) continue;
    const width = parseDimToInches(r[colMap.width]);
    const height = parseDimToInches(r[colMap.height]);
    if (!width && !height) continue; // header repeats, section dividers, etc.

    const sysSource = `${colMap.systemType !== undefined ? r[colMap.systemType] : ''} ${mark}`;
    const systemType = inferSystemType(sysSource) || 'storefront';
    const flagged = [];
    if (!width) flagged.push('overallWidth');
    if (!height) flagged.push('overallHeight');

    payloads.push({
      mark,
      systemType,
      frameSeries: colMap.systemType !== undefined ? (r[colMap.systemType] || null) : null,
      manufacturer: 'Generic',
      finish: colMap.finish !== undefined ? (r[colMap.finish] || null) : null,
      laborType: systemType === 'curtainwall' ? 'COMBINATION' : 'STANDARD',
      overallWidth: width,
      overallHeight: height,
      sillAFF: colMap.sillAFF !== undefined ? parseDimToInches(r[colMap.sillAFF]) : null,
      panelCount: null, // schedules rarely carry grid info — estimator confirms
      rowCount: null,
      bayWidths: null,
      rowHeights: null,
      quantity: colMap.quantity !== undefined ? parseInt(r[colMap.quantity], 10) || 1 : 1,
      primaryGlass: colMap.glass !== undefined ? (r[colMap.glass] || null) : null,
      safetyFilm: /\bsf\b|safety film/i.test(r.join(' ')),
      specialtyGlass: null,
      brakemetal: /brake/i.test(r.join(' ')),
      squareCornerMullion: false,
      hasDoor: /door/i.test(r.join(' ')),
      doorBays: [],
      notes: colMap.notes !== undefined ? (r[colMap.notes] || null) : null,
      confidence: flagged.length === 0 ? 0.95 : 0.7,
      flaggedFields: flagged,
    });
  }

  if (payloads.length === 0) return null;
  return { payloads, confidence: 0.95 };
}

// ─── Tolerant JSON extraction (AI responses) ─────────────────────────────────

/**
 * Parse a JSON array out of an AI response, repairing the two failure modes
 * seen in practice:
 *  1. Unescaped inch marks inside strings — glazing content is full of `9'-10"`.
 *     A legitimate string-closing quote is followed by , } ] : or end; an inch
 *     mark isn't. Escape the latter.
 *  2. Truncation (max_tokens) — cut back to the last complete element and close.
 * @returns {Array|null}
 */
export function extractJsonArray(raw) {
  if (!raw) return null;
  // Prefer a bracket that actually starts an object array — prose or markdown
  // before the JSON can contain stray '[' characters (e.g. "[Sheet A6.4]").
  const m = raw.match(/\[\s*\{/);
  const s = m ? m.index : raw.indexOf('[');
  if (s == null || s < 0) return null;
  const e = raw.lastIndexOf(']');
  const text = e > s ? raw.slice(s, e + 1) : raw.slice(s);
  // Repairs must see the FULL tail: on truncation, lastIndexOf(']') may be an
  // INNER bracket (e.g. flaggedFields:[]) and would chop a complete object.
  const full = raw.slice(s);

  const tryParse = (t) => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; } catch { return null; } };

  let out = tryParse(text);
  if (out) return out;

  // Repair 1: escape quote chars that are clearly inch marks, e.g. 10" high
  const inchEscape = (t) => t.replace(/(\d\s?)"(?!\s*[,}\]:])/g, '$1\\"');
  out = tryParse(inchEscape(text));
  if (out) return out;

  // Repair 2: truncated response — keep complete top-level elements only
  for (const candidate of [inchEscape(full), full]) {
    let depth = 0, inStr = false, esc = false, lastComplete = -1;
    for (let i = 0; i < candidate.length; i++) {
      const c = candidate[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 1) lastComplete = i; // closed a top-level element
      }
    }
    if (lastComplete > 0) {
      out = tryParse(candidate.slice(0, lastComplete + 1) + ']');
      if (out) return out;
    }
  }
  return null;
}

// ─── AI mapping (PDF or unmappable spreadsheets) ─────────────────────────────

const PAYLOAD_SCHEMA_PROMPT = `You are extracting a commercial glazing WINDOW SCHEDULE into structured frame data for an estimating tool.

Return ONLY a JSON array. Each element is one frame (one schedule row / window type):
{
  "mark": "AS1",                     // frame tag exactly as shown
  "systemType": "storefront",        // storefront | curtainwall | hollow_metal | hollow_metal_fire_rated
  "frameSeries": "2x6 Thermally Broken SF" | null,
  "manufacturer": "Generic",         // named manufacturer if stated, else "Generic"
  "finish": "Dark Bronze Anodized" | null,
  "laborType": "STANDARD",           // STANDARD for storefront/HM, COMBINATION for curtainwall
  "overallWidth": 118.0,             // DECIMAL INCHES (convert ft-in: 9'-10" = 118.0)
  "overallHeight": 72.0,             // DECIMAL INCHES
  "sillAFF": null,                   // sill above finished floor, decimal inches, null if not shown
  "panelCount": 3 | null,            // vertical bays if determinable, else null
  "rowCount": 2 | null,              // horizontal rows if determinable, else null
  "bayWidths": [40, 45, 27] | null,  // decimal inches, only when explicitly dimensioned
  "rowHeights": null,                // decimal inches per row, usually null
  "quantity": 1,
  "primaryGlass": "1\\" Solarban 90 IGU" | null,
  "safetyFilm": false,               // SF flag on the schedule
  "specialtyGlass": ["GL-1"] | null,
  "brakemetal": false,
  "squareCornerMullion": false,
  "hasDoor": false,
  "doorBays": [],                    // 0-based bay indices containing doors
  "notes": null,
  "confidence": 0.9,                 // your extraction confidence 0-1
  "flaggedFields": []                // field names you are unsure about
}

RULES:
- All dimensions in DECIMAL INCHES. 7'-10 1/2" = 94.5.
- Do not invent values. Unknown → null and add the field name to flaggedFields.
- One element per schedule row. Skip legend/title-block/general-note rows.
- Mark systemType from context: SF/storefront marks, CW/curtainwall, HM/hollow metal, fire ratings → hollow_metal_fire_rated.
- Return ONLY the JSON array, no prose.`;

/**
 * Send schedule text (PDF text layer or serialized spreadsheet) to Claude
 * via the Electron ai:chat IPC bridge.
 * @returns {Promise<{ payloads: Array, error?: string }>}
 */
export async function aiMapSchedule(text) {
  if (typeof window === 'undefined' || !window.electronAPI?.aiChat) {
    return { payloads: [], error: 'AI unavailable — Electron aiChat bridge not found (set API key in Admin Settings and run in the desktop app).' };
  }

  const clipped = text.length > 60000 ? text.slice(0, 60000) : text;

  try {
    const result = await window.electronAPI.aiChat({
      systemPrompt: PAYLOAD_SCHEMA_PROMPT,
      messages: [{ role: 'user', content: `WINDOW SCHEDULE CONTENT:\n\n${clipped}\n\nReturn ONLY the JSON array.` }],
    });
    if (!result?.ok) return { payloads: [], error: result?.error || 'AI request failed' };

    const rawText = (result.text || '').trim();
    const parsed = extractJsonArray(rawText);
    if (!parsed) {
      return { payloads: [], error: `AI response not parseable. It began: "${rawText.slice(0, 200)}${rawText.length > 200 ? '…' : ''}"` };
    }

    // Sanitize: coerce numerics, drop rows without a mark
    const payloads = parsed
      .filter((p) => p && typeof p === 'object' && p.mark)
      .map((p) => ({
        ...p,
        overallWidth: typeof p.overallWidth === 'number' ? p.overallWidth : parseDimToInches(p.overallWidth),
        overallHeight: typeof p.overallHeight === 'number' ? p.overallHeight : parseDimToInches(p.overallHeight),
        sillAFF: typeof p.sillAFF === 'number' ? p.sillAFF : parseDimToInches(p.sillAFF),
        quantity: Math.max(1, parseInt(p.quantity, 10) || 1),
        flaggedFields: Array.isArray(p.flaggedFields) ? p.flaggedFields : [],
      }));

    return { payloads };
  } catch (err) {
    return { payloads: [], error: `AI extraction error: ${err.message}` };
  }
}

// ─── Elevation Vision Path (Path A/B) ────────────────────────────────────────

/**
 * Render PDF pages to base64 JPEGs for Claude vision.
 * Renderer-only (needs canvas). Width capped at 1568px (Claude's sweet spot).
 * @returns {Promise<Array<{ page: number, base64: string, mediaType: string }>>}
 */
export async function renderPdfPagesToImages(file, { maxPages = 6, maxWidth = 1568 } = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Page rendering requires the app renderer (canvas unavailable).');
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({
    data: buf,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= count; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width); // upscale small pages a bit, cap width
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    pages.push({ page: p, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    canvas.width = 0; canvas.height = 0; // release
  }
  return { images: pages, totalPages: doc.numPages };
}

const ELEVATION_PROMPT = `You are reading WINDOW/STOREFRONT ELEVATION drawings for a commercial glazing estimator. Each image is an architectural sheet showing frame elevations: rectangles divided into panels (vertical bays) and rows (horizontal bands), with mark tags (AS1, SF-2, CW1, HM3…), dimension strings, and door swings.

HYBRID INPUT — you receive TWO sources per sheet and must combine them:
1. The IMAGE: use it for TOPOLOGY — which frames exist, panel/row counts, door
   locations, which dimension belongs to which frame (spatial association).
2. The TEXT LAYER: the exact strings extracted from the PDF (marks, dimension
   strings like 2' - 3", EQ tokens, notes). Dimension text in the image is too
   small to read reliably — take every dimension VALUE from the text layer and
   use the image only to decide which frame/bay/row it belongs to.
Rules for combining:
- A frame's overallWidth is its full outside dimension string when present;
  otherwise the SUM of its bay dimension strings. Same for overallHeight from
  row/head dimensions. If you had to sum, add the field to flaggedFields.
- "EQ" bay labels mean equal bays → bayWidths null (the estimator's tool
  auto-splits equally).
- Sill height / AFF strings (e.g. 2' - 8" below a sill line) → sillAFF.

For EVERY distinct frame elevation you can see, extract one JSON object (same schema as the window schedule import):
{
  "mark": "AS1",
  "systemType": "storefront" | "curtainwall" | "hollow_metal" | "hollow_metal_fire_rated",
  "frameSeries": string | null,
  "manufacturer": "Generic",
  "finish": string | null,
  "laborType": "STANDARD" | "COMBINATION",
  "overallWidth": number | null,   // DECIMAL INCHES from dimension strings (9'-10" = 118.0)
  "overallHeight": number | null,
  "sillAFF": number | null,
  "panelCount": number,            // COUNT THE VERTICAL BAYS in the drawing
  "rowCount": number,              // COUNT THE HORIZONTAL ROWS in the drawing
  "bayWidths": [numbers] | null,   // only when each bay is explicitly dimensioned; EQ bays → null
  "rowHeights": [numbers] | null,
  "quantity": 1,
  "primaryGlass": string | null,
  "safetyFilm": boolean,           // SF flag/note on the drawing
  "specialtyGlass": ["GL-1"] | null,
  "brakemetal": boolean,
  "squareCornerMullion": false,
  "hasDoor": boolean,              // door leaf/swing arc drawn in the elevation
  "doorBays": [0-based bay indices containing doors],
  "notes": string | null,
  "confidence": 0-1,
  "flaggedFields": [field names you had to infer or could not read]
}

RULES:
- TOPOLOGY FIRST: panelCount, rowCount, hasDoor, doorBays come from the DRAWING GEOMETRY (count the divisions), not from text.
- Dimensions come ONLY from dimension strings. Never scale off the image. Unlabeled → null + flaggedFields.
- All dimensions in DECIMAL INCHES.
- One object per DISTINCT frame type (marks repeated across sheets = one object).
- Skip title blocks, plans, sections, details, schedules — elevations only.
- JSON STRING SAFETY: never put the inch symbol (") inside any string value —
  write dimensions as decimal numbers and write notes like "sill at 32 in".
- Return ONLY a JSON array.`;

/**
 * Vision extraction over rendered elevation pages via the ai:chat bridge
 * (Sonnet — topology reasoning). Hybrid: page images + PDF text layer, so
 * exact dimension strings come from text while geometry comes from the image.
 * @param {Array} images  rendered pages
 * @param {string} [pageText]  text layer with --- PAGE N --- markers
 * @returns {Promise<{payloads: Array, error?: string}>}
 */
export async function aiVisionExtract(images, pageText = '') {
  if (typeof window === 'undefined' || !window.electronAPI?.aiChat) {
    return { payloads: [], error: 'AI unavailable — run in the desktop app with an API key set (Admin Settings).' };
  }
  const clippedText = pageText.length > 40000 ? pageText.slice(0, 40000) : pageText;
  const content = [
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    {
      type: 'text',
      text:
        (clippedText
          ? `TEXT LAYER (exact strings per page — take all dimension VALUES from here):\n${clippedText}\n\n`
          : 'No text layer available — read dimensions from the images only and flag any you cannot read.\n\n') +
        'Extract every frame elevation from these sheets. Return ONLY the JSON array.',
    },
  ];
  try {
    const result = await window.electronAPI.aiChat({
      systemPrompt: ELEVATION_PROMPT,
      messages: [{ role: 'user', content }],
      model: 'sonnet',
      maxTokens: 16384, // thinking budget (4K) + JSON answer headroom
    });
    if (!result?.ok) return { payloads: [], error: result?.error || 'Vision request failed' };
    const rawText = (result.text || '').trim();
    // Always log the raw response for diagnosis (renderer DevTools console)
    console.log('[scheduleParser] vision raw response:', rawText.slice(0, 2000));
    const parsed = extractJsonArray(rawText);
    if (!parsed) {
      return { payloads: [], error: `Vision response not parseable. It began: "${rawText.slice(0, 200)}${rawText.length > 200 ? '…' : ''}"` };
    }
    const payloads = parsed
      .filter((p) => p && typeof p === 'object' && p.mark)
      .map((p) => ({
        ...p,
        overallWidth: typeof p.overallWidth === 'number' ? p.overallWidth : parseDimToInches(p.overallWidth),
        overallHeight: typeof p.overallHeight === 'number' ? p.overallHeight : parseDimToInches(p.overallHeight),
        sillAFF: typeof p.sillAFF === 'number' ? p.sillAFF : parseDimToInches(p.sillAFF),
        quantity: Math.max(1, parseInt(p.quantity, 10) || 1),
        flaggedFields: Array.isArray(p.flaggedFields) ? p.flaggedFields : [],
      }));
    return { payloads };
  } catch (err) {
    return { payloads: [], error: `Vision extraction error: ${err.message}` };
  }
}

// ─── Two-Stage Elevation Extraction ──────────────────────────────────────────
// Whole-sheet extraction smears dimensions across neighboring elevations: at
// API image resolution the dim text is ~5px tall, and a flat text dump has no
// positions. Stage 1 asks the model WHERE each elevation is on the sheet;
// Stage 2 re-crops each elevation at high resolution and pairs it with only
// the text items inside its region (with x/y positions). One frame per crop.

const LOCATE_PROMPT = `You are looking at an architectural WINDOW ELEVATIONS sheet.
Find EVERY window/storefront/curtainwall elevation drawing on it. Each has a mark
callout under it like "AS1 1/4\\" = 1'-0\\"" or "HM13".

Return ONLY a JSON array:
[{ "mark": "AS1", "x0": 5.1, "y0": 8.2, "x1": 14.3, "y1": 30.0 }]

- Coordinates are PERCENT of image width/height, origin TOP-LEFT.
- The box must include the ENTIRE elevation PLUS all its dimension strings
  (dims sit above and beside the drawing) and its mark callout below.
- Boxes may not overlap neighboring elevations' drawings.
- Skip title blocks, notes, legends, plans, details.`;

const STAGE2_PROMPT = `You are reading ONE (or a few) cropped window/storefront ELEVATION drawing(s) for a commercial glazing estimator. Each crop shows a single frame elevation with its dimension strings, plus a list of the exact TEXT ITEMS inside that crop with their positions (x%,y% of the crop, top-left origin).

For EACH crop, return one JSON object:
{
  "mark": "AS1",
  "systemType": "storefront" | "curtainwall" | "hollow_metal" | "hollow_metal_fire_rated",
  "frameSeries": string | null,
  "manufacturer": "Generic",
  "finish": string | null,
  "laborType": "STANDARD" | "COMBINATION",
  "overallWidth": number | null,
  "overallHeight": number | null,
  "sillAFF": number | null,
  "panelCount": number,
  "rowCount": number,
  "bayWidths": [numbers] | null,
  "rowHeights": [numbers] | null,
  "quantity": 1,
  "primaryGlass": string | null,
  "safetyFilm": boolean,
  "specialtyGlass": ["GL-1"] | null,
  "brakemetal": boolean,
  "squareCornerMullion": boolean,
  "hasDoor": boolean,
  "doorBays": [0-based indices],
  "notes": string | null,
  "confidence": 0-1,
  "flaggedFields": [names]
}

HOW TO READ:
- TOPOLOGY from the image: panelCount = count the vertical glass columns
  (mullion lines + 1 between the jambs). rowCount = horizontal bands of glass.
  Doors show leaf/swing lines — mark their bay indices.
- DIMENSION VALUES from the TEXT ITEMS ONLY, matched by position:
  strings across the TOP are bay widths left→right; their SUM (or the single
  full-width string) = overallWidth. Strings down the SIDE are row heights
  top→bottom; sum = overallHeight. A dim below the sill line to "LEVEL" is
  sillAFF. Convert ft-in to DECIMAL INCHES (3'-4" = 40.0).
- bayWidths: ONLY when individual per-bay dims exist. "EQ" labels → null.
  NEVER invent or round bay widths.
- rowHeights: individual row dims top→bottom when present, else null + flag.
- "SF" tags in lites = safetyFilm true. GL-1/GL-2/GL-3 tags = specialtyGlass.
- Never put the inch symbol (") inside JSON strings — write "40 in" style.
Return ONLY a JSON array with one object per crop, in crop order.`;

/**
 * Stage 1: locate elevation regions on a full page image.
 * @returns {Promise<Array<{mark:string,x0:number,y0:number,x1:number,y1:number}>>}
 */
async function locateElevations(pageImage) {
  const result = await window.electronAPI.aiChat({
    systemPrompt: LOCATE_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: pageImage.mediaType, data: pageImage.base64 } },
        { type: 'text', text: 'Locate every elevation. Return ONLY the JSON array.' },
      ],
    }],
    model: 'sonnet',
    maxTokens: 4096,
  });
  if (!result?.ok) throw new Error(result?.error || 'locate call failed');
  const arr = extractJsonArray((result.text || '').trim());
  if (!arr) throw new Error('locate response not parseable');
  return arr.filter((r) => r && r.mark && [r.x0, r.y0, r.x1, r.y1].every((v) => typeof v === 'number'));
}

/** Render one PDF page to a high-res canvas (for cropping). */
async function renderPageCanvas(doc, pageNo, targetWidth = 4200) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, targetWidth / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

/** Text items of a page with percent positions (top-left origin). */
async function extractTextItemsPct(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    const str = (it.str || '').trim();
    if (!str) continue;
    items.push({
      str,
      xPct: (it.transform[4] / vp.width) * 100,
      yPct: (1 - it.transform[5] / vp.height) * 100,
    });
  }
  return items;
}

/** Crop a region (pct bbox) from a hi-res canvas → base64 jpeg ≤ maxDim. */
function cropCanvasRegion(canvas, bbox, pad = 1.5, maxDim = 1500) {
  const x0 = Math.max(0, ((bbox.x0 - pad) / 100) * canvas.width);
  const y0 = Math.max(0, ((bbox.y0 - pad) / 100) * canvas.height);
  const x1 = Math.min(canvas.width, ((bbox.x1 + pad) / 100) * canvas.width);
  const y1 = Math.min(canvas.height, ((bbox.y1 + pad) / 100) * canvas.height);
  const w = Math.max(8, x1 - x0);
  const h = Math.max(8, y1 - y0);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.ceil(w * scale);
  out.height = Math.ceil(h * scale);
  out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL('image/jpeg', 0.85);
  out.width = 0; out.height = 0;
  return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
}

/** Stage 2: extract payloads from a batch of elevation crops (≤3 per call). */
async function extractCropBatch(crops) {
  const content = [];
  crops.forEach((c, i) => {
    const textList = c.items
      .map((t) => `- "${t.str.replace(/"/g, 'in')}" (x${Math.round(t.xPct)},y${Math.round(t.yPct)})`)
      .join('\n');
    content.push({ type: 'text', text: `### CROP ${i + 1} — mark ${c.mark}\nTEXT ITEMS in this crop:\n${textList || '(none — read the image)'}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: c.image.mediaType, data: c.image.base64 } });
  });
  content.push({ type: 'text', text: `Extract ${crops.length} frame object(s), one per crop, in order. Return ONLY the JSON array.` });

  const result = await window.electronAPI.aiChat({
    systemPrompt: STAGE2_PROMPT,
    messages: [{ role: 'user', content }],
    model: 'sonnet',
    maxTokens: 16384,
  });
  if (!result?.ok) throw new Error(result?.error || 'extract call failed');
  console.log('[scheduleParser] stage2 raw:', (result.text || '').slice(0, 1500));
  const arr = extractJsonArray((result.text || '').trim());
  if (!arr) throw new Error('stage-2 response not parseable');
  return arr;
}

/**
 * Full two-stage pipeline for one PDF. Falls back to whole-page extraction
 * per page if stage 1 fails there.
 */
export async function visionExtractElevations(file, { maxPages = 6 } = {}) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: buf, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;

  const merged = new Map();
  const errors = [];
  const pageCount = Math.min(doc.numPages, maxPages);

  for (let p = 1; p <= pageCount; p++) {
    try {
      // stage-1 image (whole page, standard size)
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const vp1 = page.getViewport({ scale: Math.min(2, 1568 / base.width) });
      const c1 = document.createElement('canvas');
      c1.width = Math.ceil(vp1.width); c1.height = Math.ceil(vp1.height);
      await page.render({ canvasContext: c1.getContext('2d'), viewport: vp1 }).promise;
      const pageImage = { base64: c1.toDataURL('image/jpeg', 0.8).split(',')[1], mediaType: 'image/jpeg' };
      c1.width = 0; c1.height = 0;

      const locs = await locateElevations(pageImage);
      console.log(`[scheduleParser] page ${p}: located ${locs.length} elevations:`, locs.map((l) => l.mark).join(', '));
      if (locs.length === 0) throw new Error('no elevations located');

      const hiCanvas = await renderPageCanvas(doc, p);
      const textItems = await extractTextItemsPct(doc, p);

      const crops = locs.map((loc) => ({
        mark: loc.mark,
        image: cropCanvasRegion(hiCanvas, loc),
        items: textItems
          .filter((t) => t.xPct >= loc.x0 - 2 && t.xPct <= loc.x1 + 2 && t.yPct >= loc.y0 - 2 && t.yPct <= loc.y1 + 2)
          .map((t) => ({
            str: t.str,
            xPct: ((t.xPct - loc.x0) / Math.max(1, loc.x1 - loc.x0)) * 100,
            yPct: ((t.yPct - loc.y0) / Math.max(1, loc.y1 - loc.y0)) * 100,
          })),
      }));
      hiCanvas.width = 0; hiCanvas.height = 0;

      for (let i = 0; i < crops.length; i += 3) {
        const batch = crops.slice(i, i + 3);
        try {
          const payloads = await extractCropBatch(batch);
          for (const raw of payloads) {
            if (!raw || !raw.mark) continue;
            const pay = {
              ...raw,
              overallWidth: typeof raw.overallWidth === 'number' ? raw.overallWidth : parseDimToInches(raw.overallWidth),
              overallHeight: typeof raw.overallHeight === 'number' ? raw.overallHeight : parseDimToInches(raw.overallHeight),
              sillAFF: typeof raw.sillAFF === 'number' ? raw.sillAFF : parseDimToInches(raw.sillAFF),
              quantity: Math.max(1, parseInt(raw.quantity, 10) || 1),
              flaggedFields: Array.isArray(raw.flaggedFields) ? raw.flaggedFields : [],
            };
            const key = (pay.mark || '').toUpperCase().replace(/\s+/g, '');
            const prev = merged.get(key);
            if (!prev || (pay.confidence || 0) > (prev.confidence || 0)) merged.set(key, pay);
          }
        } catch (err) {
          errors.push(`p${p} crops ${batch.map((b) => b.mark).join('/')}: ${err.message}`);
        }
      }
    } catch (err) {
      // stage-1 failure on this page → whole-page fallback
      errors.push(`p${p}: two-stage failed (${err.message}) — whole-page fallback`);
      try {
        const { images } = await renderPdfPagesToImages(file, { maxPages: p }); // re-render just up to p
        const img = images[p - 1];
        if (img) {
          const vis = await aiVisionExtract([img], '');
          if (vis.error) errors.push(`p${p} fallback: ${vis.error}`);
          for (const pay of vis.payloads) {
            const key = (pay.mark || '').toUpperCase().replace(/\s+/g, '');
            if (!merged.has(key)) merged.set(key, pay);
          }
        }
      } catch (e2) {
        errors.push(`p${p} fallback failed: ${e2.message}`);
      }
    }
  }

  return {
    payloads: [...merged.values()],
    totalPages: doc.numPages,
    pagesRead: pageCount,
    error: errors.length ? errors.join(' | ') : undefined,
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Parse a dropped file into frame payloads. Routing:
 *   Spreadsheet → rules-based header mapping → AI text fallback
 *   PDF with a schedule table → text-layer AI (Haiku, cheap)
 *   PDF elevations / scanned PDF → VISION (render pages → Sonnet reads the
 *     drawing: topology from geometry, dims from dimension strings)
 *
 * @param {File} file
 * @param {{ forceVision?: boolean }} [opts]
 * @returns {Promise<{ payloads: Array, source: 'rules'|'ai'|'vision', fileName: string, error?: string, note?: string }>}
 */
export async function parseWindowSchedule(file, opts = {}) {
  const kind = classifyFile(file);
  const fileName = file?.name || 'file';

  if (!kind) {
    return { payloads: [], source: 'rules', fileName, error: `Unsupported file type: ${fileName}. Drop a PDF, Excel, or CSV.` };
  }

  try {
    if (kind === 'sheet') {
      const rows = await extractSheetRows(file);
      if (rows.length === 0) {
        return { payloads: [], source: 'rules', fileName, error: 'Spreadsheet is empty.' };
      }
      const rules = rulesMapRows(rows);
      if (rules && rules.payloads.length > 0) {
        return { payloads: rules.payloads, source: 'rules', fileName };
      }
      const serialized = rows.map((r) => r.join(' | ')).join('\n');
      const ai = await aiMapSchedule(serialized);
      return { payloads: ai.payloads, source: 'ai', fileName, error: ai.error };
    }

    // ── PDF ──
    // Elevations use the two-stage pipeline: locate every elevation on the
    // sheet, then re-crop each at high resolution with only ITS text items
    // (positioned). Whole-sheet reads smeared dimensions across neighbors.
    const runVision = async (note) => {
      const res = await visionExtractElevations(file);
      let visNote = note;
      if (res.totalPages > res.pagesRead) {
        visNote = `${note ? note + ' ' : ''}Read first ${res.pagesRead} of ${res.totalPages} pages — drop individual sheets for the rest.`;
      }
      return { payloads: res.payloads, source: 'vision', fileName, error: res.error, note: visNote };
    };

    const text = await extractPdfText(file);
    const hasText = text && text.replace(/---\s*PAGE\s*\d+\s*---/g, '').trim().length >= 40;

    if (opts.forceVision) return await runVision('');

    if (!hasText) {
      // scanned/image-only PDF → vision is the only path (image-only)
      return await runVision('No text layer (scanned PDF) — read visually.');
    }

    const { text: scheduleText, filtered } = filterSchedulePages(text);
    if (filtered) {
      // labeled schedule page(s) found → cheap text path
      const ai = await aiMapSchedule(scheduleText);
      return { payloads: ai.payloads, source: 'ai', fileName, error: ai.error };
    }

    // No schedule table → elevation sheets → two-stage crop extraction.
    return await runVision('No schedule table found — read as elevations.');
  } catch (err) {
    return { payloads: [], source: kind === 'sheet' ? 'rules' : 'vision', fileName, error: `Parse failed: ${err.message}` };
  }
}
