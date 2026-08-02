/**
 * PartnerPakParser.ts — Phase 3: PartnerPak Studio `.dat` legacy import
 *
 * A `.dat` export is a ZIP archive containing a single SQL Server Compact (SQLCE)
 * database. Rather than fully implementing the SQLCE page engine, this parser
 * scans the binary for the well-defined record shapes PartnerPak uses
 * (reverse-engineered from a real export — see PARTNERPAK_DAT_FORMAT.md):
 *
 *  - 4096-byte pages; type word at offset 6 (0x40 = row pages, 0x50 = LOB pages).
 *  - Frame rows carry an ASCII "packed header":
 *      ProjectName + FrameSetName + FrameName + DesignStyle + Shape + Vendor +
 *      System + BackColor + FaceColor + glass slots + sealants + LaborType
 *  - Variable data is UTF-16LE, tilde-class delimited: separators are chars
 *    U+00FA..U+00FE (nesting levels), terminator U+00FF.
 *  - Known segment shapes: GLAZING lines (spec + glass W/H + DLO W/H),
 *    stick lines (role, description, part code, finish, side, length, …),
 *    STRUCTURAL PARAMETERS, and a frame-dims pair `W~H~` following it.
 *  - Small frames keep segments in-row; large frames spill segments to LOB
 *    pages. v1 associates in-row segments to their frame and pools spilled
 *    segments as project-level orphans (owner linkage is Phase 3.1).
 *
 * VENDOR-NEUTRAL: nothing here is manufacturer-specific. Vendor, system,
 * finishes, and part codes are read as data from the file.
 *
 * Pure TypeScript; only web-standard APIs (DecompressionStream for inflate).
 */

// ─── Output model ─────────────────────────────────────────────────────────────

export interface PPGlazingLine {
  tag: string;          // TE | AN | SP | …
  spec: string;         // e.g. "1 CLEAR INS TE"
  quantity: number;
  glassWidth: number;
  glassHeight: number;
  dloWidth: number | null;
  dloHeight: number | null;
  laborType: string | null;
  raw: string[];
}

export interface PPStickLine {
  role: string;         // HEAD | SILL | INT VERTICAL | STOP | PP HEAD | FACE …
  description: string;
  partCode: string;
  finish: string;
  side: string | null;
  length: number | null;
  raw: string[];
}

export interface PPStructural {
  raw: string[];
}

export interface PPFrame {
  frameSetName: string;
  frameName: string;
  designStyle: string;        // Standard | Combination
  shape: string;              // Rectangle | …
  vendor: string;             // read from file — any manufacturer
  system: string;
  backColor: string;
  faceColor: string;
  glassSlots: string[];       // tempered/annealed/null/spandrel/etc, as stored
  sealants: string[];
  laborType: string;          // STANDARD | COMBINATION
  width: number | null;
  height: number | null;
  structural: PPStructural | null;
  glazing: PPGlazingLine[];   // in-row (owned) segments only
  sticks: PPStickLine[];      // in-row (owned) segments only
}

export interface PPProject {
  projectName: string;
  frameSets: string[];
  frames: PPFrame[];
  /** segments found on spill/LOB pages — not yet linked to a frame (Phase 3.1) */
  orphanGlazing: PPGlazingLine[];
  orphanSticks: PPStickLine[];
  warnings: string[];
}

// ─── ZIP container ────────────────────────────────────────────────────────────

/**
 * Minimal single-entry ZIP reader (PartnerPak .dat wraps exactly one file).
 * Uses DecompressionStream('deflate-raw') — available in Node 18+ and browsers.
 */
export async function unwrapDatContainer(zipBytes: Uint8Array): Promise<{ name: string; data: Uint8Array }> {
  if (!(zipBytes[0] === 0x50 && zipBytes[1] === 0x4b)) {
    // not a ZIP — assume caller already passed the raw database
    return { name: 'raw', data: zipBytes };
  }
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const method = dv.getUint16(8, true);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const name = new TextDecoder('latin1').decode(zipBytes.subarray(30, 30 + nameLen));
  const dataStart = 30 + nameLen + extraLen;
  const compSize = dv.getUint32(18, true);
  const payload = zipBytes.subarray(dataStart, compSize > 0 ? dataStart + compSize : undefined);

  if (method === 0) return { name, data: payload.slice() };
  if (method !== 8) throw new Error(`Unsupported ZIP compression method ${method}`);

  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([payload as BlobPart]).stream().pipeThrough(ds);
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { name, data: out };
}

/** Derive the project name from the .dat entry name: "Alpine Buick GMC-20260723131753.dat" */
export function projectNameFromEntry(entryName: string): string | null {
  const m = entryName.match(/^(.*?)-\d{8,}\.dat$/i) || entryName.match(/^(.*?)\.dat$/i);
  return m ? m[1] : null;
}

// ─── Binary scanning helpers ─────────────────────────────────────────────────

const PAGE = 4096;
const SEP_LO = 0xfa;   // U+00FA..U+00FE = field separators (nesting levels)
const SEP_HI = 0xfe;
const TERM = 0xff;     // U+00FF = segment terminator

function pageType(data: Uint8Array, offset: number): number {
  const p = Math.floor(offset / PAGE) * PAGE;
  if (p + 8 > data.length) return 0;
  return data[p + 6] | (data[p + 7] << 8);
}

/**
 * Decode a UTF-16LE segment starting at `start` (must be aligned to the
 * segment's own byte phase). Reads chars until terminator/unreadable.
 */
function readU16Segment(
  data: Uint8Array,
  start: number,
  maxChars = 4000
): { text: string; end: number } | null {
  let i = start;
  let text = '';
  while (i + 1 < data.length && text.length < maxChars) {
    const lo = data[i];
    const hi = data[i + 1];
    if (hi !== 0) break;
    if (lo === TERM) { i += 2; break; }
    if (lo >= 32 || (lo >= SEP_LO && lo <= SEP_HI)) {
      text += String.fromCharCode(lo);
      i += 2;
    } else break;
  }
  return text.length >= 2 ? { text, end: i } : null;
}

/** Find all UTF-16LE occurrences of an ASCII needle, at both byte phases. */
function findAllU16(data: Uint8Array, needle: string): number[] {
  const hits: number[] = [];
  const n = needle.length;
  outer:
  for (let i = 0; i + n * 2 <= data.length; i++) {
    if (data[i] !== needle.charCodeAt(0) || data[i + 1] !== 0) continue;
    for (let k = 1; k < n; k++) {
      if (data[i + k * 2] !== needle.charCodeAt(k) || data[i + k * 2 + 1] !== 0) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

/** Find all ASCII occurrences of a needle. */
function findAllAscii(data: Uint8Array, needle: string): number[] {
  const hits: number[] = [];
  outer:
  for (let i = 0; i + needle.length <= data.length; i++) {
    for (let k = 0; k < needle.length; k++) {
      if (data[i + k] !== needle.charCodeAt(k)) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

function asciiSlice(data: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < Math.min(start + len, data.length); i++) {
    const b = data[i];
    if (b < 32 || b > 126) break;
    s += String.fromCharCode(b);
  }
  return s;
}

const splitFields = (text: string): string[] => text.split(/[ú-þ]/);
const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const v = parseFloat(s.trim());
  return isFinite(v) ? v : null;
};

// ─── Segment classification ───────────────────────────────────────────────────

function toGlazing(fields: string[]): PPGlazingLine | null {
  // GLAZING ~ tag ~ spec ~ qty ~ glassW ~ glassH ~ ? ~ ? ~ ? ~ ? ~ dloW ~ dloH ~ laborType
  if (fields[0] !== 'GLAZING' || fields.length < 6) return null;
  const glassWidth = num(fields[4]);
  const glassHeight = num(fields[5]);
  if (glassWidth == null || glassHeight == null) return null;
  return {
    tag: fields[1] ?? '',
    spec: fields[2] ?? '',
    quantity: num(fields[3]) ?? 1,
    glassWidth,
    glassHeight,
    dloWidth: num(fields[10]),
    dloHeight: num(fields[11]),
    laborType: fields[12] || null,
    raw: fields,
  };
}

const STICK_ROLE_RE = /^[A-Z][A-Z0-9 /_\\&-]{2,40}$/;

function toStick(fields: string[]): PPStickLine | null {
  // role ~ description ~ partCode ~ finish ~ side ~ length ~ …
  if (fields.length < 6) return null;
  const [role, description, partCode, finish, side, lengthStr] = fields;
  if (!STICK_ROLE_RE.test(role) || role === 'GLAZING' || role === 'EQUAL') return null;
  if (!partCode || !/^[A-Za-z0-9/+.-]{3,}$/.test(partCode.replace(/\s/g, ''))) return null;
  const length = num(lengthStr);
  if (length == null) return null;
  return { role, description: description ?? '', partCode, finish: finish ?? '', side: side || null, length, raw: fields };
}

// ─── Frame dimensions (fixed-length row section) ─────────────────────────────

/**
 * FrameWidth/FrameHeight are consecutive float64s in each frame row's
 * fixed-length section (verified: 18/18 exact vs printed reports on a real
 * export). Rows pack multiple frames per 0x40 page; when a row's variable
 * section (the ASCII header) overflows to a later page, the fixed section —
 * including the dims pair — stays on the original row page. File order of
 * the pairs equals row insertion order, which equals header order.
 *
 * We scan only row pages that contain at least one frame header, keeping
 * f64 pairs that are plausible dimensions (12–5000", clean to 1/32").
 */
function findDimsPairs(data: Uint8Array, anchorOffsets: number[]): { offset: number; w: number; h: number }[] {
  const anchorPages = new Set(anchorOffsets.map((o) => Math.floor(o / PAGE)));
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const clean = (v: number) => v >= 12 && v <= 5000 && Math.abs(v - Math.round(v * 32) / 32) < 1e-9;
  const pairs: { offset: number; w: number; h: number }[] = [];
  for (const p of [...anchorPages].sort((a, b) => a - b)) {
    const base = p * PAGE;
    const end = Math.min(base + PAGE - 16, data.length - 16);
    for (let j = base + 16; j < end; ) {
      const w = dv.getFloat64(j, true);
      const h = dv.getFloat64(j + 8, true);
      if (isFinite(w) && isFinite(h) && clean(w) && clean(h)) {
        pairs.push({ offset: j, w, h });
        j += 16;
      } else {
        j += 1;
      }
    }
  }
  return pairs;
}

// ─── Packed header parsing ────────────────────────────────────────────────────

const DESIGN_STYLES = ['Standard', 'Combination'];
const SHAPES = ['Rectangle', 'Trapezoid', 'Arc', 'Octagon', 'Circle', 'Custom'];

interface HeaderHit {
  offset: number;
  combined: string;     // FrameSetName + FrameName (undelimited)
  designStyle: string;
  shape: string;
  tail: string;         // everything after shape (vendor+system+colors+…)
}

function findFrameHeaders(data: Uint8Array, projectName: string): HeaderHit[] {
  const hits: HeaderHit[] = [];
  const styleAlt = DESIGN_STYLES.join('|');
  const shapeAlt = SHAPES.join('|');
  const re = new RegExp(`^(.{3,80}?)(${styleAlt})(${shapeAlt})(.{0,400})`);
  for (const off of findAllAscii(data, projectName)) {
    const run = asciiSlice(data, off, 560);
    const rest = run.slice(projectName.length);
    const m = rest.match(re);
    if (!m) continue;
    hits.push({ offset: off, combined: m[1], designStyle: m[2], shape: m[3], tail: m[4] });
  }
  return hits;
}

/**
 * Split "FrameSetNameFrameName" (stored undelimited) using shared prefixes
 * across records — frameset names repeat, frame names are unique.
 *
 * Guard: sibling frames like "Frame G" / "Frame G1" produce an over-long
 * shared prefix ("…Frame G"). Since PartnerPak frame names conventionally
 * begin with "Frame " (or are fully custom like "Glass Ceiling"), any
 * candidate prefix that CONTAINS "Frame " is cut back to just before it.
 */
function splitSetAndName(combined: string, all: string[]): { setName: string; frameName: string } {
  let best = '';
  for (const other of all) {
    if (other === combined) continue;
    let p = 0;
    while (p < Math.min(combined.length, other.length) && combined[p] === other[p]) p++;
    if (p > best.length) best = combined.slice(0, p);
  }
  // cut over-long prefixes back to the "Frame " token boundary
  const fIdx = best.indexOf('Frame ');
  if (fIdx > 0) best = best.slice(0, fIdx);
  else if (fIdx === 0) best = '';

  if (best.length >= 2 && best.length < combined.length) {
    return { setName: best, frameName: combined.slice(best.length) };
  }
  // singleton fallback: split before the last "Frame " occurrence
  const solo = combined.lastIndexOf('Frame ');
  if (solo > 0) return { setName: combined.slice(0, solo), frameName: combined.slice(solo) };
  return { setName: '', frameName: combined };
}

/** Parse the header tail: vendor+system+colors+glass slots+sealants+laborType. */
function parseHeaderTail(tail: string): {
  vendor: string; system: string; backColor: string; faceColor: string;
  glassSlots: string[]; sealants: string[]; laborType: string;
} {
  // LaborType terminates the header
  const laborMatch = tail.match(/(STANDARD|COMBINATION)(?![A-Z])/);
  const laborType = laborMatch ? laborMatch[1] : '';
  const body = laborMatch ? tail.slice(0, laborMatch.index) : tail;

  // Vendor = leading run of uppercase/space/&/. (manufacturer names are stored uppercase)
  const vm = body.match(/^([A-Z][A-Z .&'-]{2,}?)(?=[a-z0-9#])/);
  const vendor = vm ? vm[1].trim() : '';
  let rest = vm ? body.slice(vm[1].length) : body;

  // System = up to the first finish/color token (starts with '#') if present
  let system = rest;
  let colorsPart = '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) { system = rest.slice(0, hashIdx); colorsPart = rest.slice(hashIdx); }

  // Colors: "#NN NAME : FINISH" possibly twice (back + face)
  const colorRe = /#\d+[^#]*?(?=#|$)/g;
  const colors = colorsPart.match(colorRe) ?? [];
  const backColor = (colors[0] ?? '').trim();
  const faceColor = (colors[1] ?? backColor).trim();
  const afterColors = colors.length
    ? colorsPart.slice(colorsPart.indexOf(colors[colors.length - 1]) + colors[colors.length - 1].length)
    : colorsPart;

  // Remaining: glass slots then sealants, undelimited — split heuristically on
  // known sealant markers; keep the raw remainder as slots when ambiguous.
  const sealants: string[] = [];
  let slotsPart = afterColors;
  const sealRe = /(\d+\/\d+"\s*(?:SILICONE|BACKER ROD|[A-Z ]+ROD)|SILICONE|BACKER ROD)/g;
  const sm = afterColors.match(sealRe);
  if (sm) {
    const firstSeal = afterColors.search(sealRe);
    slotsPart = afterColors.slice(0, firstSeal);
    sealants.push(...sm.map((s) => s.trim()));
  }
  const glassSlots = slotsPart
    .split(/(?<=INS TE|INS AN|GLAZING|INSUL|MIRROR|SP|TEMP|LAMI)/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { vendor, system: system.trim(), backColor, faceColor, glassSlots, sealants, laborType };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export interface ParseDatOptions {
  /** Override project name (else derived from ZIP entry name). */
  projectName?: string;
}

export async function parsePartnerPakDat(
  zipBytes: Uint8Array,
  opts: ParseDatOptions = {}
): Promise<PPProject> {
  const { name, data } = await unwrapDatContainer(zipBytes);
  const projectName = opts.projectName ?? projectNameFromEntry(name);
  if (!projectName) {
    throw new Error('Could not derive project name from .dat entry — pass opts.projectName.');
  }
  return parsePartnerPakSdf(data, projectName);
}

export function parsePartnerPakSdf(data: Uint8Array, projectName: string): PPProject {
  const warnings: string[] = [];

  // 1 ── frame headers
  const headers = findFrameHeaders(data, projectName);
  if (headers.length === 0) {
    warnings.push(`No frame records found for project "${projectName}" — check the project name.`);
  }
  const combineds = headers.map((h) => h.combined);

  // 2 ── all typed segments (both UTF-16 byte phases via anchor search)
  const glazingAll: { offset: number; line: PPGlazingLine }[] = [];
  for (const off of findAllU16(data, 'GLAZINGú')) {
    const seg = readU16Segment(data, off);
    if (!seg) continue;
    const g = toGlazing(splitFields(seg.text));
    if (g) glazingAll.push({ offset: off, line: g });
  }

  const structuralAll: { offset: number; end: number; fields: string[] }[] = [];
  for (const off of findAllU16(data, 'STRUCTURAL PARAMETERS')) {
    const seg = readU16Segment(data, off);
    if (seg) structuralAll.push({ offset: off, end: seg.end, fields: splitFields(seg.text) });
  }

  // Stick lines: discover via known role tokens appearing as segment starts.
  // Roles are data-driven — collect candidates by scanning separators backward
  // is expensive; instead, scan for segments starting with an uppercase run.
  const stickAll: { offset: number; line: PPStickLine }[] = [];
  {
    // find plausible segment starts: 0x00-preceded uppercase letter after a
    // terminator or non-text byte, at either phase
    for (let phase = 0; phase < 2; phase++) {
      for (let i = phase; i + 12 < data.length; i += 2) {
        const lo = data[i], hi = data[i + 1];
        if (hi !== 0 || lo < 65 || lo > 90) continue;
        const prevLo = i >= 2 ? data[i - 2] : 0;
        const prevHi = i >= 2 ? data[i - 1] : 1;
        const prevIsText = prevHi === 0 && (prevLo >= 32 || (prevLo >= SEP_LO && prevLo <= SEP_HI));
        if (prevIsText) continue; // mid-segment
        const seg = readU16Segment(data, i, 600);
        if (!seg) continue;
        const fields = splitFields(seg.text);
        const s = toStick(fields);
        if (s) stickAll.push({ offset: i, line: s });
        if (seg.end > i) i = seg.end - 2; // skip past segment
      }
    }
  }

  // 3 ── build frames; associate segments.
  //
  // Dims: consecutive-f64 pairs in the fixed row sections, file order ==
  // row order == header order (see findDimsPairs). Structural segments also
  // alternate with headers in file order; the k-th belongs to the k-th frame.
  const sortedHeaders = [...headers].sort((a, b) => a.offset - b.offset);
  const sortedStructs = [...structuralAll].sort((a, b) => a.offset - b.offset);
  const dimsPairs = findDimsPairs(data, sortedHeaders.map((h) => h.offset));
  const dimsAligned = dimsPairs.length === sortedHeaders.length;
  if (!dimsAligned && sortedHeaders.length > 0) {
    warnings.push(
      `Found ${dimsPairs.length} dimension pairs for ${sortedHeaders.length} frames — dims assigned only where counts align.`
    );
  }
  if (sortedStructs.length !== sortedHeaders.length) {
    warnings.push(
      `Structural segments (${sortedStructs.length}) ≠ frames (${sortedHeaders.length}) — pairing may be off.`
    );
  }
  const frames: PPFrame[] = [];
  const ownedGlazing = new Set<number>();
  const ownedSticks = new Set<number>();

  for (let k = 0; k < sortedHeaders.length; k++) {
    const h = sortedHeaders[k];
    const spanEnd = k + 1 < sortedHeaders.length ? sortedHeaders[k + 1].offset : data.length;
    const { setName, frameName } = splitSetAndName(h.combined, combineds);
    const tail = parseHeaderTail(h.tail);

    const struct = k < sortedStructs.length ? sortedStructs[k] : undefined;
    const width = dimsAligned ? dimsPairs[k].w : null;
    const height = dimsAligned ? dimsPairs[k].h : null;

    const glazing = glazingAll
      .filter((g) => g.offset > h.offset && g.offset < spanEnd && pageType(data, g.offset) === 0x40)
      .map((g) => { ownedGlazing.add(g.offset); return g.line; });
    const sticks = stickAll
      .filter((s) => s.offset > h.offset && s.offset < spanEnd && pageType(data, s.offset) === 0x40)
      .map((s) => { ownedSticks.add(s.offset); return s.line; });

    frames.push({
      frameSetName: setName,
      frameName,
      designStyle: h.designStyle,
      shape: h.shape,
      ...tail,
      width,
      height,
      structural: struct ? { raw: struct.fields } : null,
      glazing,
      sticks,
    });
  }

  // 4 ── orphans: segments on LOB/spill pages (owner linkage = Phase 3.1)
  const orphanGlazing = glazingAll.filter((g) => !ownedGlazing.has(g.offset)).map((g) => g.line);
  const orphanSticks = stickAll.filter((s) => !ownedSticks.has(s.offset)).map((s) => s.line);
  if (orphanGlazing.length || orphanSticks.length) {
    warnings.push(
      `${orphanGlazing.length} glazing and ${orphanSticks.length} stick segments found on spill pages — ` +
      'project-level totals include them; per-frame linkage for large frames is Phase 3.1.'
    );
  }

  const frameSets = [...new Set(frames.map((f) => f.frameSetName).filter(Boolean))];
  const missingDims = frames.filter((f) => f.width == null).map((f) => f.frameName);
  if (missingDims.length) {
    warnings.push(`Frames missing dims (in-row scan): ${missingDims.join(', ')}`);
  }

  return { projectName, frameSets, frames, orphanGlazing, orphanSticks, warnings };
}
