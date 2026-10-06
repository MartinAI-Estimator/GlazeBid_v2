/**
 * reports.js — Frame Builder reports (PDF via jsPDF, Excel via SheetJS).
 *
 *   glassPdf        glass type at the top, then every size of that type
 *   metalPdf        metal RFQ by die: stock, bars, LF, scrap %, cut list
 *   accessoriesPdf  accessory / sundry RFQ
 *   recapPdf        one line per frame, frame-set subtotals
 *   laborPdf        hours by frame / frame set, lift hours + lift equipment
 *   elevationsPdf   one page per frame type — dimensioned elevation + mini BOM
 *   doorsPdf        one page per door — leaf drawing + schedule data
 *   doorSchedulePdf / hardwarePdf
 *   exportExcel     every table in one workbook
 */

import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatInches, formatFeetInches } from '@glazebid/frame-engine/core';

const PAGE = { w: 792, h: 612, m: 36 };
const C = { ink: [24, 24, 27], mute: [113, 113, 122], line: [212, 212, 216], head: [39, 39, 42], band: [244, 244, 245], accent: [16, 120, 96], red: [190, 40, 40], amber: [180, 120, 0], green: [20, 120, 60] };
const r2 = (x) => (Math.round(x * 100) / 100).toLocaleString();

function newDoc() { return new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }); }

function header(doc, title, meta) {
  doc.setFillColor(...C.head); doc.rect(0, 0, PAGE.w, 46, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(title, PAGE.m, 29);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(meta, PAGE.w - PAGE.m, 29, { align: 'right' });
  doc.setTextColor(...C.ink);
  return 64;
}

function footer(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...C.mute);
    doc.text('GlazeBid Frame Builder — quantities for vendor quotation; verify against approved shop drawings.', PAGE.m, PAGE.h - 18);
    doc.text(`Page ${i} of ${n}`, PAGE.w - PAGE.m, PAGE.h - 18, { align: 'right' });
  }
  doc.setTextColor(...C.ink);
}

/**
 * Minimal table renderer with wrapping + page breaks.
 * cols: [{ label, w, align?, key | get(row) }]
 */
function table(doc, y, cols, rows, { title, meta, fontSize = 8.5, zebra = true, rowStyle } = {}) {
  const x0 = PAGE.m; const lineH = fontSize * 1.25;
  const drawHead = () => {
    doc.setFillColor(...C.band); doc.rect(x0, y - fontSize - 3, PAGE.w - 2 * PAGE.m, lineH + 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fontSize);
    let x = x0 + 4;
    for (const c of cols) { doc.text(c.label, c.align === 'right' ? x + c.w - 8 : x, y, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; }
    doc.setFont('helvetica', 'normal'); y += lineH + 2;
  };
  if (title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, x0, y); if (meta) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.mute); doc.text(meta, PAGE.w - PAGE.m, y, { align: 'right' }); doc.setTextColor(...C.ink); } y += 16; }
  drawHead();
  rows.forEach((row, ri) => {
    const cells = cols.map((c) => {
      const v = c.get ? c.get(row) : row[c.key];
      return doc.splitTextToSize(v == null ? '' : String(v), c.w - 8);
    });
    const h = Math.max(...cells.map((l) => l.length)) * lineH + 3;
    if (y + h > PAGE.h - 40) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; drawHead(); }
    const st = rowStyle?.(row) ?? {};
    if (st.fill) { doc.setFillColor(...st.fill); doc.rect(x0, y - fontSize - 1, PAGE.w - 2 * PAGE.m, h, 'F'); }
    else if (zebra && ri % 2 === 1) { doc.setFillColor(250, 250, 250); doc.rect(x0, y - fontSize - 1, PAGE.w - 2 * PAGE.m, h, 'F'); }
    doc.setFont('helvetica', st.bold ? 'bold' : 'normal'); doc.setFontSize(fontSize);
    let x = x0 + 4;
    cols.forEach((c, ci) => {
      if (c.color && c.color(row)) doc.setTextColor(...c.color(row));
      doc.text(cells[ci], c.align === 'right' ? x + c.w - 8 : x, y, { align: c.align === 'right' ? 'right' : 'left' });
      doc.setTextColor(...C.ink);
      x += c.w;
    });
    doc.setDrawColor(...C.line); doc.line(x0, y + h - fontSize - 1, PAGE.w - PAGE.m, y + h - fontSize - 1);
    y += h;
  });
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

function start(title, project) {
  const doc = newDoc();
  const meta = `${project || 'Project'} · ${new Date().toLocaleDateString('en-US')}`;
  doc.__title = title; doc.__meta = meta;
  return { doc, y: header(doc, title, meta) };
}

function save(doc, name, project) {
  footer(doc);
  doc.save(`${(project || 'GlazeBid').replace(/[^\w-]+/g, '_')}_${name}.pdf`);
}

const scrapRGB = (c) => (c === 'red' ? C.red : c === 'yellow' ? C.amber : C.green);

// ── Glass ────────────────────────────────────────────────────────────────────

export function glassPdf(t, project) {
  const { doc } = start('Glass Takeoff — by Glass Type', project);
  let y = 70;
  for (const g of t.glassRfq) {
    if (y > PAGE.h - 140) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; }
    doc.setFillColor(...C.accent); doc.rect(PAGE.m, y - 13, PAGE.w - 2 * PAGE.m, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`${g.key} — ${g.description}`, PAGE.m + 6, y + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`${g.makeup || ''}${g.heat ? ` · ${g.heat}` : ''} · ${g.lites} lites · ${r2(g.actualSf)} SF actual · ${r2(g.billingSf)} SF billed · ${r2(g.weightLb)} lb`, PAGE.w - PAGE.m - 6, y + 1, { align: 'right' });
    doc.setTextColor(...C.ink);
    y += 26;
    y = table(doc, y, [
      { label: 'Qty', w: 40, align: 'right', key: 'qty' },
      { label: 'Width', w: 70, get: (s) => s.widthDisplay },
      { label: 'Height', w: 70, get: (s) => s.heightDisplay },
      { label: 'Block (in)', w: 70, get: (s) => `${s.blockW} × ${s.blockH}` },
      { label: 'SF ea', w: 50, align: 'right', get: (s) => r2(s.actualSf) },
      { label: 'Billed SF', w: 62, align: 'right', get: (s) => r2(s.totalBillingSf) },
      { label: 'Lb ea', w: 48, align: 'right', get: (s) => Math.round(s.weightLb) },
      { label: 'Shape', w: 90, get: (s) => (s.shape === 'rect' ? 'Rect' : `${s.shapeInfo?.type ?? 'shaped'}${s.shapeInfo?.leftHeight != null ? ` L ${formatInches(s.shapeInfo.leftHeight)} / R ${formatInches(s.shapeInfo.rightHeight)}` : ''}`) },
      { label: 'Locations (frame lite)', w: 220, get: (s) => s.locations.join(', ') },
    ], g.sizes);
  }
  const unsized = t.glassOnly?.unsized ?? [];
  if (unsized.length) {
    if (y > PAGE.h - 140) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; }
    y = table(doc, y + 8, [
      { label: 'Mark', w: 70, key: 'mark' },
      { label: 'Qty', w: 36, align: 'right', key: 'qty' },
      { label: 'Size on drawing', w: 110, get: (g) => (g.width && g.height ? `${formatInches(g.width)} × ${formatInches(g.height)}` : '—') },
      { label: 'Glass', w: 120, get: (g) => g.glassText ?? '' },
      { label: 'Why not ordered', w: 200, get: (g) => (g.needs ?? []).find((n) => n.field === 'size')?.reason ?? 'no lite size' },
      { label: 'Description', w: 184, get: (g) => String(g.description ?? '').slice(0, 70) },
    ], unsized, { title: `Glass only — ${unsized.length} lite row(s) waiting for a lite size (not in the totals above)` });
  }
  y = Math.min(y, PAGE.h - 60);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`Total: ${t.totals.lites} lites · ${r2(t.totals.glassSf)} SF actual · ${r2(t.totals.billingSf)} SF billed`, PAGE.m, y + 6);
  save(doc, 'Glass_by_Type', project);
}

// ── Metal ────────────────────────────────────────────────────────────────────

export function metalPdf(t, project, { withBars = true } = {}) {
  const { doc } = start('Metal Takeoff — RFQ by Die', project);
  let y = 70;
  const sets = [...new Set(t.metalRfq.map((m) => m.frameSet))];
  for (const fs of sets) {
    const rows = t.metalRfq.filter((m) => m.frameSet === fs);
    y = table(doc, y, [
      { label: 'Die / part', w: 92, get: (m) => m.die },
      { label: 'Description', w: 190, get: (m) => m.description ?? m.roleLabel },
      { label: 'Role', w: 118, get: (m) => m.roleLabel },
      { label: 'Finish', w: 80, key: 'finish' },
      { label: 'Stock', w: 38, get: (m) => m.stockLengthDisplay },
      { label: 'Pcs', w: 34, align: 'right', key: 'pieces' },
      { label: 'LF', w: 50, align: 'right', get: (m) => r2(m.totalLF) },
      { label: 'Bars', w: 36, align: 'right', key: 'bars' },
      { label: 'Scrap', w: 52, align: 'right', get: (m) => `${r2(m.scrapPct)}%`, color: (m) => scrapRGB(m.scrapColor) },
      { label: 'Map', w: 30, get: (m) => (m.mapped ? '' : 'role') },
    ], rows, { title: `Frame set: ${fs}`, meta: `${rows.reduce((s, m) => s + m.bars, 0)} bars · ${r2(rows.reduce((s, m) => s + m.totalLF, 0))} LF` });
    // cut lists
    for (const m of rows) {
      if (y > PAGE.h - 90) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; }
      y = table(doc, y, [
        { label: 'Qty', w: 40, align: 'right', key: 'qty' },
        { label: 'Cut length', w: 90, get: (c) => c.lengthDisplay },
        { label: 'Frames', w: 160, get: (c) => c.marks.join(', ') },
        { label: 'Notes', w: 430, get: (c) => c.notes.join(' | ') },
      ], m.cuts, { title: `${m.die} · ${m.roleLabel} · ${fs}`, meta: `${m.bars} × ${m.stockLengthDisplay} bars · scrap ${r2(m.scrapPct)}%`, fontSize: 8 });
      if (withBars && m.barLayout.length <= 30) {
        doc.setFontSize(7.5); doc.setTextColor(...C.mute);
        const lines = m.barLayout.map((b, i) => `Bar ${i + 1}: ${b.cuts.map((c) => formatInches(c.length)).join(' + ')}  (drop ${formatInches(b.drop)})`);
        for (const ln of lines) { if (y > PAGE.h - 40) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; } doc.text(ln, PAGE.m + 8, y); y += 10; }
        doc.setTextColor(...C.ink); y += 6;
      }
    }
  }
  save(doc, 'Metal_RFQ_by_Die', project);
}

// ── Accessories ──────────────────────────────────────────────────────────────

export function accessoriesPdf(t, project) {
  const { doc, y } = start('Accessories & Sundries RFQ', project);
  let yy = table(doc, y + 6, [
    { label: 'Make', w: 80, key: 'manufacturer' },
    { label: 'Part', w: 100, get: (a) => a.part ?? '—' },
    { label: 'Item', w: 230, key: 'label' },
    { label: 'Qty', w: 70, align: 'right', get: (a) => r2(a.qty) },
    { label: 'Unit', w: 40, key: 'unit' },
    { label: 'Frames', w: 200, get: (a) => a.marks.join(', ') },
  ], t.accessoriesRfq);
  if (t.brakeSheets.length) {
    yy = table(doc, yy, [
      { label: 'Gauge', w: 100, key: 'gauge' }, { label: 'Finish', w: 120, key: 'finish' },
      { label: 'Sheets', w: 60, align: 'right', key: 'sheets' }, { label: 'Sheet size', w: 100, get: (b) => `${b.sheet.widthIn}" × ${b.sheet.lengthIn}"` },
      { label: 'Strips', w: 60, align: 'right', key: 'strips' }, { label: 'Splices', w: 60, align: 'right', key: 'splices' },
      { label: 'Yield', w: 60, align: 'right', get: (b) => `${r2(b.yieldPct)}%` },
    ], t.brakeSheets, { title: 'Brake metal — sheets' });
    table(doc, yy, [
      { label: 'Frame', w: 70, key: 'frame' }, { label: 'Description', w: 200, key: 'description' },
      { label: 'Girth', w: 60, get: (b) => formatInches(b.girth) }, { label: 'Length', w: 80, get: (b) => formatFeetInches(b.length) },
      { label: 'Qty', w: 50, align: 'right', key: 'qtyTotal' }, { label: 'Brakes', w: 50, align: 'right', key: 'bends' },
      { label: 'Hems', w: 50, align: 'right', key: 'hems' }, { label: 'Gauge / finish', w: 150, get: (b) => `${b.gauge} ${b.finish}` },
    ], t.brakeRows, { title: 'Brake metal — pieces' });
  }
  save(doc, 'Accessories_RFQ', project);
}

// ── Recap ────────────────────────────────────────────────────────────────────

export function recapPdf(t, project) {
  const { doc, y } = start('Frame Summary / Recap', project);
  let yy = y + 6;
  for (const fs of t.recapByFrameSet) {
    const rows = t.recap.filter((r) => r.frameSet === fs.name);
    yy = table(doc, yy, [
      { label: 'Mark', w: 60, key: 'mark' }, { label: 'Qty', w: 30, align: 'right', key: 'qty' },
      { label: 'System', w: 170, key: 'system' }, { label: 'Size', w: 110, key: 'sizeDisplay' },
      { label: 'SF', w: 50, align: 'right', get: (r) => r2(r.totalSf) }, { label: 'Metal LF', w: 56, align: 'right', get: (r) => r2(r.metalLF) },
      { label: 'Lites', w: 38, align: 'right', key: 'lites' }, { label: 'Glass SF', w: 56, align: 'right', get: (r) => r2(r.glassSf) },
      { label: 'Doors', w: 38, align: 'right', key: 'doors' }, { label: 'Hours', w: 50, align: 'right', get: (r) => r2(r.hours) },
      { label: 'Glass %', w: 46, align: 'right', get: (r) => `${Math.round(r.glassAreaRatio * 100)}%` },
      { label: 'Scrap', w: 46, align: 'right', get: (r) => `${r2(r.scrapPct)}%`, color: (r) => scrapRGB(r.scrapColor) },
    ], [...rows, { mark: 'Subtotal', qty: fs.units, system: '', sizeDisplay: '', totalSf: fs.totalSf, metalLF: fs.metalLF, lites: fs.lites, glassSf: fs.glassSf, doors: fs.doors, hours: fs.hours, glassAreaRatio: 0, scrapPct: 0, _sub: true }],
    { title: fs.name, rowStyle: (r) => (r._sub ? { bold: true, fill: C.band } : null) });
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`Job: ${t.totals.units} units · ${r2(t.totals.totalSf)} SF · ${r2(t.totals.metalLF)} LF metal (${t.totals.bars} bars) · ${t.totals.lites} lites · ${r2(t.totals.glassSf)} SF glass · ${t.totals.doors} doors · ${r2(t.totals.hours)} hrs`, PAGE.m, Math.min(yy + 4, PAGE.h - 50));
  save(doc, 'Frame_Recap', project);
}

// ── Labor ────────────────────────────────────────────────────────────────────

export function laborPdf(t, project) {
  const { doc, y } = start('Labor Summary', project);
  const L = t.laborSummary;
  let yy = table(doc, y + 6, [
    { label: 'Mark', w: 60, key: 'mark' }, { label: 'Set', w: 70, key: 'frameSet' }, { label: 'Qty', w: 30, align: 'right', key: 'qty' },
    { label: 'System', w: 170, key: 'system' }, { label: 'Type', w: 80, key: 'laborType' },
    { label: 'Shop', w: 50, align: 'right', get: (r) => r2(r.shop) }, { label: 'Dist', w: 50, align: 'right', get: (r) => r2(r.dist) },
    { label: 'Field', w: 50, align: 'right', get: (r) => r2(r.field) }, { label: 'Lift', w: 50, align: 'right', get: (r) => r2(r.lift) },
    { label: 'Total', w: 60, align: 'right', get: (r) => r2(r.total) },
  ], L.rows, { title: 'By frame' });
  yy = table(doc, yy, [
    { label: 'Frame set', w: 200, key: 'name' }, { label: 'Shop', w: 70, align: 'right', get: (r) => r2(r.shop) },
    { label: 'Dist', w: 70, align: 'right', get: (r) => r2(r.dist) }, { label: 'Field', w: 70, align: 'right', get: (r) => r2(r.field) },
    { label: 'Lift', w: 70, align: 'right', get: (r) => r2(r.lift) }, { label: 'Total', w: 80, align: 'right', get: (r) => r2(r.total) },
  ], [...L.frameSets, { name: 'JOB TOTAL', ...L.totals, _sub: true }], { title: 'By frame set', rowStyle: (r) => (r._sub ? { bold: true, fill: C.band } : null) });
  if (L.equipment) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`Lift equipment: ${L.equipment.label} · ${L.equipment.days} day(s) at crew ${L.equipment.crew} × ${L.equipment.hoursPerDay} h · rental $${r2(L.equipment.rental)} + delivery $${r2(L.equipment.delivery)} = $${r2(L.equipment.total)}`, PAGE.m, yy + 4);
  }
  if (L.missingRates) { doc.setTextColor(...C.red); doc.text('Production rates were not loaded — hours are zero. Set rates in Settings.', PAGE.m, yy + 20); doc.setTextColor(...C.ink); }
  save(doc, 'Labor_Summary', project);
}

// ── Drawings ─────────────────────────────────────────────────────────────────

function poly(doc, pts, tf, style) {
  if (pts.length < 2) return;
  const P = pts.map(tf);
  const rel = []; for (let i = 1; i < P.length; i++) rel.push([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]);
  doc.lines(rel, P[0][0], P[0][1], [1, 1], style, true);
}

function hexRGB(hex) { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

function drawFrame(doc, fr, box, colors) {
  const s = fr.bom.solved; const W = s.width; const Ht = s.topY;
  const k = Math.min(box.w / (W * 1.15), box.h / (Ht * 1.2));
  const ox = box.x + (box.w - W * k) / 2; const oy = box.y + box.h - (box.h - Ht * k) / 2;
  const tf = ([x, y]) => [ox + x * k, oy - y * k];
  doc.setLineWidth(0.6); doc.setDrawColor(60, 60, 60);
  doc.setFillColor(185, 192, 199); poly(doc, s.outline.poly, tf, 'FD');
  const gmap = Object.fromEntries(fr.bom.glass.map((g) => [g.key, g]));
  doc.setFontSize(Math.max(5, Math.min(9, k * 4)));
  for (const l of s.lites) {
    const g = gmap[l.key];
    doc.setFillColor(...hexRGB(colors[g?.glassTypeId] ?? '#bfe3ee'));
    poly(doc, l.dloPoly, tf, 'FD');
    const c = tf([(l.dloBox.x0 + l.dloBox.x1) / 2, (l.dloBox.y0 + l.dloBox.y1) / 2]);
    doc.setTextColor(...C.ink);
    doc.text(`${l.tag}${g?.tempered ? ' (T)' : ''}`, c[0], c[1] - 3, { align: 'center' });
    doc.text(g ? `${g.glassMark}` : '', c[0], c[1] + 6, { align: 'center' });
  }
  for (const d of fr.bom.doors) {
    const sd = s.doors.find((x) => x.col === d.col); if (!sd) continue;
    doc.setFillColor(255, 255, 255);
    const a = tf([sd.x0, sd.height]); const b = tf([sd.x1, 0]);
    doc.rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'FD');
    doc.setLineDashPattern([2, 2], 0);
    const n = d.leaves; const lw = (sd.x1 - sd.x0) / n;
    for (let i = 0; i < n; i++) {
      const hingeLeft = n === 2 ? i === 0 : String(d.handing ?? 'RH').startsWith('L');
      const x0 = sd.x0 + i * lw; const x1 = x0 + lw;
      const hx = hingeLeft ? x0 : x1; const lx = hingeLeft ? x1 : x0;
      const p1 = tf([hx, sd.height]); const p2 = tf([lx, sd.height / 2]); const p3 = tf([hx, 0]);
      doc.line(p1[0], p1[1], p2[0], p2[1]); doc.line(p2[0], p2[1], p3[0], p3[1]);
    }
    doc.setLineDashPattern([], 0);
    const c = tf([(sd.x0 + sd.x1) / 2, sd.height * 0.62]);
    doc.text(d.mark, c[0], c[1], { align: 'center' });
  }
  // dims: bays (DLO) + overall
  doc.setDrawColor(...C.mute); doc.setTextColor(...C.mute); doc.setFontSize(7);
  const yb = oy + 14; const yb2 = oy + 28;
  for (const c of s.columns) { const a = tf([c.x0, 0]); const b = tf([c.x1, 0]); doc.line(a[0], yb, b[0], yb); doc.line(a[0], yb - 3, a[0], yb + 3); doc.line(b[0], yb - 3, b[0], yb + 3); doc.text(formatFeetInches(c.dlo), (a[0] + b[0]) / 2, yb - 3, { align: 'center' }); }
  const A = tf([0, 0]); const B = tf([W, 0]);
  doc.line(A[0], yb2, B[0], yb2); doc.text(formatFeetInches(W), (A[0] + B[0]) / 2, yb2 - 3, { align: 'center' });
  const T0 = tf([0, 0]); const T1 = tf([0, s.height]);
  const xl = T0[0] - 16; doc.line(xl, T0[1], xl, T1[1]); doc.text(formatFeetInches(s.height), xl - 4, (T0[1] + T1[1]) / 2, { angle: 90, align: 'center' });
  doc.setTextColor(...C.ink); doc.setDrawColor(60, 60, 60);
}

export function elevationsPdf(t, project, colors) {
  const doc = newDoc();
  const meta = `${project || 'Project'} · ${new Date().toLocaleDateString('en-US')}`;
  doc.__title = 'Frame Elevations'; doc.__meta = meta;
  const frames = t.frames.filter((f) => f.bom);
  frames.forEach((fr, i) => {
    if (i > 0) doc.addPage();
    header(doc, `Elevation ${fr.spec.mark} — ${fr.spec.frameSet}`, meta);
    drawFrame(doc, fr, { x: PAGE.m, y: 70, w: 500, h: PAGE.h - 150 }, colors);
    // info panel
    const x = 560; let y = 80; const b = fr.bom;
    const kv = [
      ['Quantity', fr.spec.quantity], ['System', b.system.name], ['Joinery', b.system.joinery.replace(/_/g, ' ')], ['Finish', fr.spec.finish],
      ['Frame size', `${formatFeetInches(b.solved.width)} × ${formatFeetInches(b.solved.height)}`],
      ...(b.solved.roughOpening ? [['Rough opening', `${formatFeetInches(b.solved.roughOpening.width)} × ${formatFeetInches(b.solved.roughOpening.height)}`]] : []),
      ['Sill AFF', formatFeetInches(fr.spec.sillAFF)], ['Shape', b.solved.outline.template],
      ['Frame SF', r2(b.totals.frameSf)], ['Metal / frame', `${r2(b.totals.metalLF)} LF`], ['Lites / frame', b.totals.lites], ['Glass / frame', `${r2(b.totals.glassSf)} SF`],
      ['Hours / frame', r2(fr.labor?.total ?? 0)],
    ];
    doc.setFontSize(9);
    for (const [k2, v] of kv) { const ln = doc.splitTextToSize(String(v ?? ''), 150); doc.setTextColor(...C.mute); doc.text(String(k2), x, y); doc.setTextColor(...C.ink); doc.text(ln, x + 72, y); y += 4 + ln.length * 10.5; }
    y += 6; doc.setFont('helvetica', 'bold'); doc.text('Glass', x, y); doc.setFont('helvetica', 'normal'); y += 12;
    for (const g of b.glass.filter((gg) => gg.ordered)) { if (y > PAGE.h - 50) break; doc.text(`${g.tag}  ${g.glassMark}${g.tempered ? ' T' : ''}  ${formatInches(g.orderW)} × ${formatInches(g.orderH)}`, x, y); y += 11; }
    if (fr.spec.notes) { y += 6; doc.setTextColor(...C.mute); doc.text(doc.splitTextToSize(fr.spec.notes, 190), x, y); doc.setTextColor(...C.ink); }
  });
  footer(doc);
  doc.save(`${(project || 'GlazeBid').replace(/[^\w-]+/g, '_')}_Frame_Elevations.pdf`);
}

function drawDoor(doc, d, box) {
  const g = d.geometry; const n = g.leaves;
  const W = d.openingW; const H = d.openingH;
  const k = Math.min(box.w / (W * 1.3), box.h / (H * 1.2));
  const ox = box.x + (box.w - W * k) / 2; const oy = box.y + box.h - (box.h - H * k) / 2;
  const tf = (x, y) => [ox + x * k, oy - y * k];
  doc.setLineWidth(0.8); doc.setDrawColor(40, 40, 40);
  const o0 = tf(0, H); doc.rect(o0[0], o0[1], W * k, H * k);
  for (let i = 0; i < n; i++) {
    const x0 = 0.125 + i * (g.leafW + 0.125); const y0 = 0.5;
    const L = tf(x0, y0 + g.leafH);
    doc.setFillColor(200, 205, 210); doc.rect(L[0], L[1], g.leafW * k, g.leafH * k, 'FD');
    const G = tf(x0 + g.stile, y0 + g.leafH - g.topRail);
    doc.setFillColor(191, 227, 238); doc.rect(G[0], G[1], (g.leafW - 2 * g.stile) * k, (g.leafH - g.topRail - g.bottomRail) * k, 'FD');
    if (g.midRail > 0) { const M = tf(x0 + g.stile, y0 + g.midRailAt + g.midRail / 2); doc.setFillColor(200, 205, 210); doc.rect(M[0], M[1], (g.leafW - 2 * g.stile) * k, g.midRail * k, 'FD'); }
    const hingeLeft = n === 2 ? i === 0 : String(d.handing ?? 'RH').startsWith('L');
    doc.setLineDashPattern([3, 2], 0);
    const hx = hingeLeft ? x0 : x0 + g.leafW; const lx = hingeLeft ? x0 + g.leafW : x0;
    const p1 = tf(hx, y0 + g.leafH); const p2 = tf(lx, y0 + g.leafH / 2); const p3 = tf(hx, y0);
    doc.line(p1[0], p1[1], p2[0], p2[1]); doc.line(p2[0], p2[1], p3[0], p3[1]);
    doc.setLineDashPattern([], 0);
  }
  doc.setFontSize(8); doc.setTextColor(...C.mute);
  const a = tf(0, 0); const b = tf(W, 0); doc.line(a[0], a[1] + 16, b[0], b[1] + 16); doc.text(`${formatFeetInches(W)} opening`, (a[0] + b[0]) / 2, a[1] + 13, { align: 'center' });
  const c0 = tf(0, 0); const c1 = tf(0, H); doc.line(c0[0] - 16, c0[1], c1[0] - 16, c1[1]); doc.text(`${formatFeetInches(H)}`, c0[0] - 20, (c0[1] + c1[1]) / 2, { angle: 90, align: 'center' });
  doc.setTextColor(...C.ink);
}

export function doorsPdf(t, project) {
  const doc = newDoc();
  const meta = `${project || 'Project'} · ${new Date().toLocaleDateString('en-US')}`;
  doc.__title = 'Door Drawings'; doc.__meta = meta;
  if (!t.doorSchedule.length) { header(doc, 'Door Drawings', meta); doc.text('No doors in this takeoff.', PAGE.m, 90); footer(doc); doc.save(`${(project || 'GlazeBid').replace(/[^\w-]+/g, '_')}_Door_Drawings.pdf`); return; }
  t.doorSchedule.forEach((d, i) => {
    if (i > 0) doc.addPage();
    header(doc, `Door ${d.mark} — frame ${d.frame}`, meta);
    drawDoor(doc, d.door, { x: PAGE.m, y: 70, w: 420, h: PAGE.h - 140 });
    const x = 490; let y = 84; doc.setFontSize(9);
    const kv = [['Type', `${d.type} (${d.leaves} leaf${d.leaves > 1 ? 's' : ''})`], ['Qty', d.qty], ['Opening', d.openingDisplay], ['Leaf (each)', d.leafDisplay],
      ['Stile', d.stile], ['Top / bottom rail', `${d.topRail}" / ${d.bottomRail}"`], ['Mid rail', d.midRail ? `${d.midRail}"` : 'None'], ['Swing / handing', d.handing],
      ['Finish', d.finish], ['System', d.system], ['Glass', d.glass], ['Door glass (approx.)', d.doorGlass], ['Hardware', d.hardwareSet], ['Threshold', d.threshold ? 'Yes' : 'No']];
    for (const [k2, v] of kv) { const ln = doc.splitTextToSize(String(v ?? ''), 170); doc.setTextColor(...C.mute); doc.text(k2, x, y); doc.setTextColor(...C.ink); doc.text(ln, x + 100, y); y += 4.5 + ln.length * 10.5; }
    const hw = t.hardwareSchedule.find((h) => h.mark === d.mark);
    if (hw) {
      y += 8; doc.setFont('helvetica', 'bold'); doc.text('Hardware', x, y); doc.setFont('helvetica', 'normal'); y += 13;
      for (const it of hw.items) { doc.text(`${it.qtyPerOpening} × ${it.item}`, x, y); y += 12; }
    }
    if (d.notes) { y += 8; doc.setTextColor(...C.mute); doc.text(doc.splitTextToSize(d.notes, 260), x, y); doc.setTextColor(...C.ink); }
  });
  footer(doc);
  doc.save(`${(project || 'GlazeBid').replace(/[^\w-]+/g, '_')}_Door_Drawings.pdf`);
}

export function doorSchedulePdf(t, project) {
  const { doc, y } = start('Door Schedule', project);
  table(doc, y + 6, [
    { label: 'Mark', w: 56, key: 'mark' }, { label: 'Frame', w: 50, key: 'frame' }, { label: 'Qty', w: 28, align: 'right', key: 'qty' },
    { label: 'Type', w: 44, key: 'type' }, { label: 'Opening', w: 92, key: 'openingDisplay' }, { label: 'Leaf', w: 92, key: 'leafDisplay' },
    { label: 'Stile', w: 76, key: 'stile' }, { label: 'Rails T/B', w: 50, get: (d) => `${d.topRail}/${d.bottomRail}` },
    { label: 'Handing', w: 100, key: 'handing' }, { label: 'Glass', w: 80, key: 'glass' }, { label: 'Hardware', w: 52, key: 'hardwareSet' },
  ], t.doorSchedule, { fontSize: 7.8 });
  save(doc, 'Door_Schedule', project);
}

export function hardwarePdf(t, project) {
  const { doc } = start('Hardware Schedule', project);
  let y = 70;
  for (const h of t.hardwareSchedule) {
    if (y > PAGE.h - 120) { doc.addPage(); y = header(doc, doc.__title, doc.__meta) + 6; }
    y = table(doc, y, [
      { label: 'Item', w: 360, key: 'item' }, { label: 'Frequency', w: 100, key: 'frequency' },
      { label: 'Per opening', w: 80, align: 'right', key: 'qtyPerOpening' }, { label: `Total (×${h.qty})`, w: 90, align: 'right', key: 'qtyTotal' },
    ], h.items, { title: `${h.mark} — ${h.type} · ${h.handing} · ${h.set}`, meta: `Frame ${h.frame}` });
  }
  if (!t.hardwareSchedule.length) doc.text('No doors in this takeoff.', PAGE.m, 90);
  save(doc, 'Hardware_Schedule', project);
}

// ── Other lines (bid cart) ──────────────────────────────────────────────────

export function otherLinesPdf(t, project) {
  const { doc, y } = start('Other Lines — not frames', project);
  const rows = (t.bidLines ?? []).slice().sort((a, b) => String(a.group).localeCompare(String(b.group)));
  let yy = table(doc, y + 6, [
    { label: 'Group', w: 130, key: 'group' },
    { label: 'Item', w: 90, key: 'itemId' },
    { label: 'Qty', w: 50, align: 'right', get: (b) => (b.quantity == null ? '—' : r2(b.quantity)) },
    { label: 'Unit', w: 36, key: 'unit' },
    { label: 'Description', w: 280, get: (b) => String(b.description ?? '').slice(0, 110) },
    { label: 'Flags', w: 134, get: (b) => (b.flags ?? []).join(' ').slice(0, 60) },
  ], rows, { title: 'Bid cart lines' });
  const go = t.glassOnly?.rows ?? [];
  if (go.length) {
    table(doc, yy, [
      { label: 'Mark', w: 90, key: 'mark' }, { label: 'Qty', w: 40, align: 'right', key: 'qty' },
      { label: 'Width', w: 70, get: (g) => (g.width ? formatInches(g.width) : '—') }, { label: 'Height', w: 70, get: (g) => (g.height ? formatInches(g.height) : '—') },
      { label: 'Size is', w: 80, get: (g) => (g.sizeIs === 'opening' ? 'opening (TBD)' : g.sizeIs === 'lite' ? 'lite' : '—') },
      { label: 'Description', w: 370, get: (g) => String(g.description ?? '').slice(0, 140) },
    ], go, { title: 'Glass only (glass into frames / doors by others)' });
  }
  save(doc, 'Other_Lines', project);
}

// ── Excel ────────────────────────────────────────────────────────────────────

export function exportExcel(t, project) {
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  add('Recap', [['Mark', 'Frame set', 'Qty', 'System', 'Joinery', 'Labor type', 'Finish', 'Width in', 'Height in', 'Shape', 'Bays', 'Frame SF ea', 'Total SF', 'Metal LF', 'Lites', 'Glass SF', 'Doors', 'Hours', 'Hours/SF', 'Glass area ratio', 'Scrap %'],
    ...t.recap.map((r) => [r.mark, r.frameSet, r.qty, r.system, r.joinery, r.laborType, r.finish, r.width, r.height, r.shape, r.bays, r.frameSf, r.totalSf, r.metalLF, r.lites, r.glassSf, r.doors, r.hours, r.hoursPerSf, r.glassAreaRatio, r.scrapPct])]);
  add('Metal RFQ', [['Frame set', 'Die', 'Description', 'Role', 'Finish', 'Stock in', 'Pieces', 'Total LF', 'Bars', 'Scrap %'],
    ...t.metalRfq.map((m) => [m.frameSet, m.die, m.description ?? '', m.roleLabel, m.finish, m.stockLengthIn, m.pieces, m.totalLF, m.bars, m.scrapPct])]);
  add('Cut List', [['Frame set', 'Die', 'Role', 'Qty', 'Length in', 'Length', 'Frames', 'Notes'],
    ...t.metalRfq.flatMap((m) => m.cuts.map((c) => [m.frameSet, m.die, m.roleLabel, c.qty, c.length, c.lengthDisplay, c.marks.join(', '), c.notes.join(' | ')]))]);
  add('Glass', [['Glass type', 'Description', 'Makeup', 'Heat', 'Qty', 'Width in', 'Height in', 'Width', 'Height', 'Block W', 'Block H', 'SF ea', 'Billing SF ea', 'Total billing SF', 'Lb ea', 'Shape', 'Locations'],
    ...t.glassRfq.flatMap((g) => g.sizes.map((s) => [g.key, g.description, g.makeup, g.heat, s.qty, s.orderW, s.orderH, s.widthDisplay, s.heightDisplay, s.blockW, s.blockH, s.actualSf, s.billingSf, s.totalBillingSf, s.weightLb, s.shape, s.locations.join(', ')]))]);
  add('Accessories', [['Make', 'Part', 'Item', 'Qty', 'Unit', 'Frames'], ...t.accessoriesRfq.map((a) => [a.manufacturer, a.part ?? '', a.label, a.qty, a.unit, a.marks.join(', ')])]);
  add('Brake Metal', [['Frame', 'Description', 'Girth', 'Length in', 'Qty', 'Brakes', 'Hems', 'Gauge', 'Finish'], ...t.brakeRows.map((b) => [b.frame, b.description, b.girth, b.length, b.qtyTotal, b.bends, b.hems, b.gauge, b.finish])]);
  add('Glass Only', [['Mark', 'Qty', 'Width in', 'Height in', 'Size is', 'Glass type', 'Glass on drawing', 'Description', 'Needs'],
    ...(t.glassOnly?.rows ?? []).map((g) => [g.mark, g.qty, g.width ?? '', g.height ?? '', g.sizeIs ?? '', g.glassTypeId ?? '', g.glassText ?? '', g.description ?? '', (g.needs ?? []).map((n) => n.reason).join(' | ')])]);
  add('Other Lines', [['Group', 'Item', 'Qty', 'Unit', 'Description', 'Flags'],
    ...(t.bidLines ?? []).map((b) => [b.group, b.itemId, b.quantity ?? '', b.unit, b.description, (b.flags ?? []).join(' | ')])]);
  add('Doors', [['Mark', 'Frame', 'Qty', 'Type', 'Opening W', 'Opening H', 'Leaf W', 'Leaf H', 'Stile', 'Top rail', 'Bottom rail', 'Mid rail', 'Handing', 'Finish', 'Glass', 'Hardware', 'Threshold', 'Notes'],
    ...t.doorSchedule.map((d) => [d.mark, d.frame, d.qty, d.type, d.openingW, d.openingH, d.leafW, d.leafH, d.stile, d.topRail, d.bottomRail, d.midRail, d.handing, d.finish, d.glass, d.hardwareSet, d.threshold ? 'Y' : 'N', d.notes])]);
  add('Hardware', [['Door', 'Frame', 'Set', 'Item', 'Frequency', 'Per opening', 'Total'], ...t.hardwareSchedule.flatMap((h) => h.items.map((it) => [h.mark, h.frame, h.set, it.item, it.frequency, it.qtyPerOpening, it.qtyTotal]))]);
  add('Labor', [['Mark', 'Frame set', 'Qty', 'System', 'Labor type', 'Shop', 'Dist', 'Field', 'Lift', 'Total'],
    ...t.laborSummary.rows.map((r) => [r.mark, r.frameSet, r.qty, r.system, r.laborType, r.shop, r.dist, r.field, r.lift, r.total]),
    [], ['Totals', '', '', '', '', t.laborSummary.totals.shop, t.laborSummary.totals.dist, t.laborSummary.totals.field, t.laborSummary.totals.lift, t.laborSummary.totals.total]]);
  XLSX.writeFile(wb, `${(project || 'GlazeBid').replace(/[^\w-]+/g, '_')}_Frame_Takeoff.xlsx`);
}

export const REPORTS = [
  { key: 'recap', label: 'Frame summary / recap (PDF)', run: (t, p) => recapPdf(t, p) },
  { key: 'glass', label: 'Glass takeoff by type (PDF)', run: (t, p) => glassPdf(t, p) },
  { key: 'metal', label: 'Metal RFQ by die + cut list (PDF)', run: (t, p) => metalPdf(t, p) },
  { key: 'acc', label: 'Accessories & brake metal RFQ (PDF)', run: (t, p) => accessoriesPdf(t, p) },
  { key: 'labor', label: 'Labor summary (PDF)', run: (t, p) => laborPdf(t, p) },
  { key: 'other', label: 'Other lines — bid cart + glass only (PDF)', run: (t, p) => otherLinesPdf(t, p) },
  { key: 'elev', label: 'Frame elevations (PDF)', run: (t, p, c) => elevationsPdf(t, p, c) },
  { key: 'doors', label: 'Door drawings (PDF)', run: (t, p) => doorsPdf(t, p) },
  { key: 'dsched', label: 'Door schedule (PDF)', run: (t, p) => doorSchedulePdf(t, p) },
  { key: 'hw', label: 'Hardware schedule (PDF)', run: (t, p) => hardwarePdf(t, p) },
  { key: 'xlsx', label: 'Everything — Excel workbook', run: (t, p) => exportExcel(t, p) },
];
