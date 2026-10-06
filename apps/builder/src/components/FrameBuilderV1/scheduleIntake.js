/**
 * scheduleIntake.js — window schedule upload in Frame Builder V1 (decision 4, no AI).
 *
 *   readScheduleFile(file, { projectName })  → { fileName, kind, frames: [payload], nonFrames, doorTypes, jobDefaults, report }
 *
 *   spreadsheets (.xlsx .xls .csv)  read in the app by rules (header aliases → columns), the same
 *                                   rules the old Frame Builder used — never the AI fallback
 *   PDFs                            read by the deterministic engine in the sidecar
 *                                   (POST /drawing-intelligence/schedule/read via IPC): schedule
 *                                   tables, pictorial schedules and the type elevations on them
 *
 * Every payload comes back in the same shape Studio sends (source 'schedule'), so the
 * Incoming list builds it, and a mark Studio also sends is merged (combineSources).
 * Anything the schedule doesn't say is a need on the frame, never a silent guess.
 */
import { classifyFile, extractSheetRows, rulesMapRows } from '../../lib/scheduleParser';

const MARK_H = ['mark', 'type', 'tag', 'window type', 'frame', 'frame no', 'frame #', 'opening', 'id', 'window mark', 'unit'];
const W_H = ['width', 'w', 'overall width', 'frame width', 'rough width', 'r.o. width', 'ro width', 'nominal width'];
const QTY_H = ['qty', 'quantity', 'count', 'no', 'no.', 'number', 'each', 'ea'];
const RO_RE = /\b(r\.?\s?o\.?|rough|m\.?\s?o\.?|masonry)\b/i;
const FRAME_SIZE_RE = /\bframe\s+(width|height|size)\b|\boverall\b/i;

function headerRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const lower = rows[i].map((c) => String(c).toLowerCase().trim());
    if (lower.some((c) => MARK_H.includes(c)) && lower.some((c) => W_H.includes(c))) return rows[i];
  }
  return null;
}

function systemTypeOf(txt) {
  const s = String(txt ?? '').toLowerCase();
  if (/\bcw[-\s]?\d*\b|curtain\s*wall|curtainwall|\b1600\b|\b1620\b/.test(s)) return 'curtainwall';
  if (/\bsf[-\s]?\d*\b|storefront|store\s*front|trifab|\b45[01]\b|\b601\b|\b501\b/.test(s)) return 'storefront';
  return null;
}

function makerOf(txt) {
  const s = String(txt ?? '');
  if (/kawneer/i.test(s)) return { maker: 'Kawneer', assumed: false };
  if (/tubelite/i.test(s)) return { maker: 'Tubelite', assumed: false };
  if (/\b(pitco|ykk|efco|oldcastle|vistawall|arcadia|us\s*alum|united\s*states\s*aluminum|manko|tamlyn|crl)\b/i.test(s)) {
    return { maker: s.match(/\b(pitco|ykk|efco|oldcastle|vistawall|arcadia|us\s*alum\w*|united\s*states\s*aluminum|manko|tamlyn|crl)\b/i)[0], assumed: false };
  }
  if (/trifab|\b45[01]\s*-?\s*u?t?\b|\b1600\b|\b1620\b|\b601\s*u?t?\b|\b501\b/i.test(s)) return { maker: 'Kawneer', assumed: true };
  return { maker: null, assumed: false };
}

/** Spreadsheet rows → schedule payloads.  null when no mark / width / height header was found. */
export function sheetPayloads(rows, fileName = 'schedule') {
  const mapped = rulesMapRows(rows);
  if (!mapped) return null;
  const header = (headerRow(rows) ?? []).map((c) => String(c).toLowerCase().trim());
  const hasQty = header.some((c) => QTY_H.includes(c));
  const ro = header.some((c) => RO_RE.test(c));
  const frameSize = header.some((c) => FRAME_SIZE_RE.test(c));
  const frames = mapped.payloads.map((r) => {
    const needs = [];
    const need = (field, reason) => needs.push({ field, reason });
    const txt = `${r.frameSeries ?? ''} ${r.notes ?? ''}`;
    const systemType = systemTypeOf(`${r.frameSeries ?? ''} ${r.mark}`);
    const m = makerOf(txt);
    if (m.assumed) need('system', `Maker not on the schedule — Kawneer assumed for "${r.frameSeries}".`);
    const interior = /\b(int\.?|interior)\b/i.test(txt);
    if (!r.overallWidth) need('size', 'Width not read on the schedule row.');
    if (!r.overallHeight) need('size', 'Height not read on the schedule row.');
    if (!ro && !frameSize && r.overallWidth && r.overallHeight) need('size', 'Schedule doesn\'t say frame size or rough opening — frame size assumed.');
    if (!hasQty) need('quantity', 'The schedule has no count column — 1 assumed. Send the plans from Studio (the plan count wins) or enter it.');
    return {
      mark: r.mark, itemId: r.mark, source: 'schedule', scheduleFile: fileName,
      cls: systemType === 'curtainwall' ? (interior ? 'int_cw' : 'ext_cw') : (interior ? 'int_sf' : 'ext_sf'),
      systemType, manufacturer: m.maker, frameSeries: r.frameSeries || null,
      finish: r.finish || null, primaryGlass: r.primaryGlass || null,
      overallWidth: r.overallWidth, overallHeight: r.overallHeight, sizeMode: ro ? 'ro' : 'frame',
      quantity: r.quantity, quantityGiven: hasQty,
      panelCount: null, rowCount: null, bayWidths: null, rowHeights: null, columns: null,
      sillAFF: r.sillAFF ?? null, hasDoor: !!r.hasDoor, doors: [], doorBays: [],
      notes: r.notes || null, buildable: !!(r.overallWidth && r.overallHeight),
      provenance: {
        size: { source: 'schedule', file: fileName, note: ro ? 'rough opening' : null },
        quantity: { source: hasQty ? 'schedule' : 'assumed', note: hasQty ? null : 'not on the schedule — 1 assumed' },
        system: { source: r.frameSeries ? 'schedule' : 'assumed' },
      },
      needs, citations: [`${fileName} — ${r.mark}`], confidence: r.confidence,
    };
  });
  return { frames, nonFrames: [], doorTypes: [], jobDefaults: null };
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** → { fileName, kind, frames, nonFrames, doorTypes, jobDefaults, report } — throws with a message the UI can show. */
export async function readScheduleFile(file, { projectName = '' } = {}) {
  const kind = classifyFile(file);
  const fileName = file?.name ?? 'schedule';
  if (kind === 'sheet') {
    const rows = await extractSheetRows(file);
    const doc = sheetPayloads(rows, fileName);
    if (!doc) throw new Error('Couldn\'t find a header row with a mark, width and height column in this spreadsheet.');
    return { fileName, kind, ...doc, report: report(doc.frames) };
  }
  if (kind === 'pdf') {
    const read = window.electronAPI?.readSchedule;
    if (!read) throw new Error('Reading a PDF schedule needs the desktop app (the GlazeBid engine runs there).');
    const res = await read({ pdfBase64: toBase64(await file.arrayBuffer()), fileName, projectName });
    if (!res?.ok) throw new Error(res?.error || 'The GlazeBid engine could not read this PDF.');
    const doc = res.data ?? {};
    const frames = (doc.frames ?? []).map((p) => ({ ...p, source: 'schedule', scheduleFile: fileName }));
    if (!frames.length) throw new Error('No frame types found in this PDF — is it the window / frame schedule sheet?');
    return { fileName, kind, frames, nonFrames: doc.nonFrames ?? [], doorTypes: doc.doorTypes ?? [], jobDefaults: doc.jobDefaults ?? null, report: report(frames) };
  }
  throw new Error('Upload a spreadsheet (.xlsx, .xls, .csv) or a PDF of the schedule.');
}

function report(frames) {
  return {
    frames: frames.length,
    buildable: frames.filter((p) => p.buildable !== false).length,
    needInput: frames.filter((p) => (p.needs ?? []).some((n) => n.field !== 'drawing')).length,
  };
}

