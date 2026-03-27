/**
 * shopDrawingGenerator.js
 *
 * Generates a submittal-ready PDF shop drawing set from BidFrame data.
 * Consumes FabricationBOM directly for per-pane glass positions and cut marks.
 *
 * Output: A multi-page PDF blob with:
 *   - Cover sheet (project info, scope summary, labor hours)
 *   - One elevation sheet per frame (parametric frame geometry)
 *   - Glass schedule sheet (all lites with sizes and positions)
 *   - Cut list sheet (all extrusions with lengths and marks)
 *
 * Dependencies: jsPDF (add to builder package.json if not present)
 */

import { jsPDF } from 'jspdf';
import { computeFabricationBOM } from '../../engine/computeBOM';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_W = 279.4;  // 11" in mm
const PAGE_H = 215.9;  // 8.5" in mm (landscape)
const MARGIN = 12.7;   // 0.5" margin
const TITLE_BLOCK_H = 25;
const DRAW_AREA_W = PAGE_W - MARGIN * 2;
const DRAW_AREA_H = PAGE_H - MARGIN * 2 - TITLE_BLOCK_H;

// ─── Color palette ───────────────────────────────────────────────────────────
const COLOR = {
  black:      [0,   0,   0],
  darkGray:   [64,  64,  64],
  midGray:    [128, 128, 128],
  lightGray:  [220, 220, 220],
  glassBlue:  [173, 216, 230],
  frameGray:  [96,  96,  96],
  white:      [255, 255, 255],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setColor(doc, rgb, type = 'draw') {
  if (type === 'fill') doc.setFillColor(...rgb);
  else doc.setDrawColor(...rgb);
}

function drawTitleBlock(doc, projectMeta, sheetInfo) {
  const y = PAGE_H - TITLE_BLOCK_H - MARGIN;
  const x = MARGIN;
  const w = DRAW_AREA_W;
  const h = TITLE_BLOCK_H;

  // Outer border
  setColor(doc, COLOR.black);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h);

  // Vertical dividers
  const col1 = x + w * 0.45;
  const col2 = x + w * 0.65;
  const col3 = x + w * 0.82;
  doc.line(col1, y, col1, y + h);
  doc.line(col2, y, col2, y + h);
  doc.line(col3, y, col3, y + h);

  // Horizontal divider in col1
  const midY = y + h / 2;
  doc.line(x, midY, col1, midY);

  // Project name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setColor(doc, COLOR.black, 'draw');
  doc.text(projectMeta.projectName || 'PROJECT NAME', x + 3, y + 7);

  // Client
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(projectMeta.client || '', x + 3, y + 13);
  doc.text(projectMeta.address || '', x + 3, y + 18);

  // Labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('GLAZING CONTRACTOR', col1 + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(projectMeta.contractor || '', col1 + 2, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('DATE', col2 + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(sheetInfo.date || new Date().toLocaleDateString(), col2 + 2, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('SHEET', col3 + 2, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(sheetInfo.sheetNumber || 'S-1', col3 + 2, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('SHEET TITLE', col2 + 2, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(sheetInfo.title || '', col2 + 2, y + 19);

  // FOR COORDINATION ONLY stamp
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(128, 0, 0);
  doc.text('FOR COORDINATION ONLY — NOT FOR FABRICATION', x + 3, y + h - 3);
  doc.setTextColor(0, 0, 0);
}

function drawBorder(doc) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, MARGIN, DRAW_AREA_W, PAGE_H - MARGIN * 2);
}

// ─── Cover Sheet ─────────────────────────────────────────────────────────────

function generateCoverSheet(doc, frames, projectMeta) {
  const startX = MARGIN + 5;
  let y = MARGIN + 15;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('GLAZING SHOP DRAWING SUBMITTAL', startX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Project: ${projectMeta.projectName || ''}`, startX, y);
  y += 5;
  doc.text(`Prepared by: ${projectMeta.contractor || ''}`, startX, y);
  y += 5;
  doc.text(`Date: ${new Date().toLocaleDateString()}`, startX, y);
  y += 5;
  doc.text('Status: FOR COORDINATION ONLY', startX, y);
  y += 12;

  // Scope summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('GLAZING SCOPE SUMMARY', startX, y);
  y += 6;

  // Table header
  const colW = [30, 50, 30, 30, 35, 35];
  const cols = ['Elev Tag', 'System', 'Width', 'Height', 'Glass SF', 'Alum LF'];
  const rowH = 7;

  setColor(doc, COLOR.darkGray, 'fill');
  doc.setFillColor(...COLOR.darkGray);
  doc.rect(startX, y - 5, DRAW_AREA_W - 10, rowH, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  let cx = startX + 2;
  cols.forEach((col, i) => {
    doc.text(col, cx, y);
    cx += colW[i];
  });
  doc.setTextColor(0, 0, 0);
  y += rowH;

  // Table rows
  let totalGlassSF = 0;
  let totalAlumLF = 0;
  let totalLaborShop = 0;
  let totalLaborField = 0;

  frames.forEach((frame, idx) => {
    const bg = idx % 2 === 0 ? COLOR.white : [245, 245, 245];
    doc.setFillColor(...bg);
    doc.rect(startX, y - 5, DRAW_AREA_W - 10, rowH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    cx = startX + 2;

    const w = frame.inputs?.width || 0;
    const h = frame.inputs?.height || 0;
    const glassSF = frame.bom?.totalGlassSqFt || 0;
    const alumLF = frame.bom?.totalAluminumLF || 0;

    const rowData = [
      frame.elevationTag || `F-${idx + 1}`,
      frame.systemType || '',
      `${(w / 12).toFixed(2)}'`,
      `${(h / 12).toFixed(2)}'`,
      `${glassSF.toFixed(1)} SF`,
      `${alumLF.toFixed(1)} LF`,
    ];

    rowData.forEach((val, i) => {
      doc.text(String(val), cx, y);
      cx += colW[i];
    });

    // Grid line
    setColor(doc, COLOR.lightGray);
    doc.setLineWidth(0.1);
    doc.line(startX, y + 2, startX + DRAW_AREA_W - 10, y + 2);

    totalGlassSF += glassSF;
    totalAlumLF += alumLF;
    totalLaborShop += frame.bom?.shopLaborMhs || 0;
    totalLaborField += frame.bom?.fieldLaborMhs || 0;

    y += rowH;
  });

  // Totals row
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setColor(doc, COLOR.lightGray, 'fill');
  doc.setFillColor(...COLOR.lightGray);
  doc.rect(startX, y - 5, DRAW_AREA_W - 10, rowH, 'F');
  doc.text('TOTALS', startX + 2, y);
  cx = startX + colW[0] + colW[1] + colW[2] + colW[3] + 2;
  doc.text(`${totalGlassSF.toFixed(1)} SF`, cx, y);
  cx += colW[4];
  doc.text(`${totalAlumLF.toFixed(1)} LF`, cx, y);
  y += 12;

  // Labor summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('LABOR SUMMARY', startX, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Shop Labor: ${totalLaborShop.toFixed(1)} MH`, startX, y);
  y += 5;
  doc.text(`Field Labor: ${totalLaborField.toFixed(1)} MH`, startX, y);
  y += 5;
  doc.text(`Total Labor: ${(totalLaborShop + totalLaborField).toFixed(1)} MH`, startX, y);
}

// ─── Elevation Sheet ─────────────────────────────────────────────────────────

function generateElevationSheet(doc, frame, bom, frameIndex) {
  const drawX = MARGIN + 5;
  const drawY = MARGIN + 5;
  const maxW = DRAW_AREA_W - 80; // leave room for notes column
  const maxH = DRAW_AREA_H - 10;

  const widthIn = frame.inputs?.width || 60;
  const heightIn = frame.inputs?.height || 84;
  const bays = frame.inputs?.bays || 1;
  const rows = frame.inputs?.rows || 1;
  const glassBite = frame.inputs?.glassBite || 0.375;

  // Scale to fit
  const scaleX = maxW / widthIn;
  const scaleY = maxH / heightIn;
  const scale = Math.min(scaleX, scaleY, 3.5); // max 3.5x scale

  const fW = widthIn * scale;
  const fH = heightIn * scale;

  // Center the frame in draw area
  const originX = drawX + (maxW - fW) / 2;
  const originY = drawY + (maxH - fH) / 2;

  // Frame profile thickness in mm (approximate at scale)
  const profileThick = 2 * scale;

  // ── Draw frame perimeter ──
  setColor(doc, COLOR.frameGray, 'fill');
  doc.setFillColor(...COLOR.frameGray);
  setColor(doc, COLOR.black);
  doc.setLineWidth(0.3);

  // Outer rect
  doc.setFillColor(...COLOR.frameGray);
  doc.rect(originX, originY, fW, fH, 'FD');

  // Glass opening (inner)
  doc.setFillColor(...COLOR.glassBlue);
  const innerX = originX + profileThick;
  const innerY = originY + profileThick;
  const innerW = fW - profileThick * 2;
  const innerH = fH - profileThick * 2;
  doc.rect(innerX, innerY, innerW, innerH, 'FD');

  // ── Draw mullion grid ──
  setColor(doc, COLOR.frameGray, 'fill');
  doc.setFillColor(...COLOR.frameGray);
  doc.setLineWidth(0.2);

  const bayW = innerW / bays;
  const rowH_frame = innerH / rows;

  // Vertical mullions
  for (let b = 1; b < bays; b++) {
    const mx = innerX + bayW * b;
    doc.setFillColor(...COLOR.frameGray);
    doc.rect(mx - profileThick / 2, innerY, profileThick, innerH, 'F');
  }

  // Horizontal transoms
  for (let r = 1; r < rows; r++) {
    const ry = innerY + rowH_frame * r;
    doc.setFillColor(...COLOR.frameGray);
    doc.rect(innerX, ry - profileThick / 2, innerW, profileThick, 'F');
  }

  // ── Glass lite labels ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(0, 0, 80);

  if (bom?.glassList?.length > 0) {
    bom.glassList.forEach((lite) => {
      const col = lite.col ?? 0;
      const row = lite.row ?? 0;
      const lx = innerX + col * bayW + bayW / 2;
      const ly = innerY + row * rowH_frame + rowH_frame / 2;
      const label = `${(lite.knifeW || 0).toFixed(3)}" × ${(lite.knifeH || 0).toFixed(3)}"`;
      doc.text(label, lx, ly, { align: 'center' });
    });
  }

  doc.setTextColor(0, 0, 0);

  // ── Width dimension ──
  const dimY = originY + fH + 8;
  doc.setLineWidth(0.2);
  setColor(doc, COLOR.black);
  doc.line(originX, dimY, originX + fW, dimY);
  doc.line(originX, dimY - 2, originX, dimY + 2);
  doc.line(originX + fW, dimY - 2, originX + fW, dimY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const wLabel = widthIn % 12 === 0
    ? `${widthIn / 12}'-0"`
    : `${Math.floor(widthIn / 12)}'-${(widthIn % 12).toFixed(3)}"`;
  doc.text(wLabel, originX + fW / 2, dimY + 4, { align: 'center' });

  // ── Height dimension ──
  const dimX = originX - 10;
  doc.line(dimX, originY, dimX, originY + fH);
  doc.line(dimX - 2, originY, dimX + 2, originY);
  doc.line(dimX - 2, originY + fH, dimX + 2, originY + fH);
  const hLabel = heightIn % 12 === 0
    ? `${heightIn / 12}'-0"`
    : `${Math.floor(heightIn / 12)}'-${(heightIn % 12).toFixed(3)}"`;
  doc.setFontSize(6);
  doc.text(hLabel, dimX - 3, originY + fH / 2, { align: 'center', angle: 90 });

  // ── Notes column ──
  const notesX = originX + fW + 15;
  let ny = drawY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('FRAME NOTES', notesX, ny);
  ny += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(`Elevation: ${frame.elevationTag || `F-${frameIndex + 1}`}`, notesX, ny); ny += 5;
  doc.text(`System: ${frame.systemType || ''}`, notesX, ny); ny += 5;
  doc.text(`W × H: ${wLabel} × ${hLabel}`, notesX, ny); ny += 5;
  doc.text(`Bays: ${bays}  Rows: ${rows}`, notesX, ny); ny += 5;
  doc.text(`Glass Bite: ${glassBite}"`, notesX, ny); ny += 5;
  doc.text(`Glass Lites: ${bom?.glassList?.length || 0}`, notesX, ny); ny += 5;
  doc.text(`Glass SF: ${(frame.bom?.totalGlassSqFt || 0).toFixed(1)}`, notesX, ny); ny += 5;
  doc.text(`Alum LF: ${(frame.bom?.totalAluminumLF || 0).toFixed(1)}`, notesX, ny); ny += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('EXTRUSION SUMMARY', notesX, ny); ny += 5;

  if (bom?.cutList?.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    const grouped = {};
    bom.cutList.forEach(piece => {
      const key = piece.mark || piece.partName || 'UNK';
      if (!grouped[key]) grouped[key] = { mark: key, qty: 0, length: piece.lengthInches };
      grouped[key].qty += piece.qty || 1;
    });
    Object.values(grouped).slice(0, 10).forEach(g => {
      doc.text(`${g.mark}: ${g.qty} × ${g.length?.toFixed(3)}"`, notesX, ny);
      ny += 4;
    });
  }
}

// ─── Glass Schedule Sheet ─────────────────────────────────────────────────────

function generateGlassSchedule(doc, frames, allBOMs) {
  let y = MARGIN + 15;
  const startX = MARGIN + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GLASS SCHEDULE', startX, y);
  y += 8;

  const colW = [20, 30, 15, 30, 30, 25, 20, 30];
  const headers = ['Mark', 'Elev Tag', 'Lite', 'Width (knife)', 'Height (knife)', 'Area SF', 'Shape', 'Spec'];
  const rowH = 6.5;

  // Header row
  doc.setFillColor(...COLOR.darkGray);
  doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);

  let cx = startX + 2;
  headers.forEach((h, i) => { doc.text(h, cx, y); cx += colW[i]; });
  doc.setTextColor(0, 0, 0);
  y += rowH;

  let glassMarkCounter = 1;

  frames.forEach((frame, fi) => {
    const bom = allBOMs[fi];
    const glassList = bom?.glassList || [];

    glassList.forEach((lite, li) => {
      if (y > PAGE_H - MARGIN - TITLE_BLOCK_H - 10) {
        doc.addPage();
        y = MARGIN + 15;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('GLASS SCHEDULE (continued)', startX, y);
        y += 8;
      }

      const bg = glassMarkCounter % 2 === 0 ? [245, 245, 245] : COLOR.white;
      doc.setFillColor(...bg);
      doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      cx = startX + 2;

      const wIn = lite.knifeW || 0;
      const hIn = lite.knifeH || 0;
      const areaSF = (wIn * hIn) / 144;

      const rowData = [
        `G-${glassMarkCounter}`,
        frame.elevationTag || `F-${fi + 1}`,
        `${li + 1}`,
        `${wIn.toFixed(3)}"`,
        `${hIn.toFixed(3)}"`,
        `${areaSF.toFixed(2)} SF`,
        lite.shape || 'RECT',
        frame.inputs?.glassSpec || '1" IGU',
      ];

      rowData.forEach((val, i) => { doc.text(String(val), cx, y); cx += colW[i]; });

      setColor(doc, COLOR.lightGray);
      doc.setLineWidth(0.1);
      doc.line(startX, y + 2, startX + DRAW_AREA_W - 10, y + 2);

      y += rowH;
      glassMarkCounter++;
    });
  });
}

// ─── Cut List Sheet ───────────────────────────────────────────────────────────

function generateCutList(doc, frames, allBOMs) {
  let y = MARGIN + 15;
  const startX = MARGIN + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ALUMINUM CUT LIST', startX, y);
  y += 8;

  const colW = [20, 30, 45, 30, 15, 25];
  const headers = ['Mark', 'Elev Tag', 'Part Name', 'Length', 'Qty', 'Total LF'];
  const rowH = 6.5;

  doc.setFillColor(...COLOR.darkGray);
  doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);

  let cx = startX + 2;
  headers.forEach((h, i) => { doc.text(h, cx, y); cx += colW[i]; });
  doc.setTextColor(0, 0, 0);
  y += rowH;

  let totalAlumIn = 0;

  frames.forEach((frame, fi) => {
    const bom = allBOMs[fi];
    const cutList = bom?.cutList || [];

    // Section header per frame
    if (y > PAGE_H - MARGIN - TITLE_BLOCK_H - 15) {
      doc.addPage();
      y = MARGIN + 15;
    }

    doc.setFillColor(230, 230, 230);
    doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(
      `${frame.elevationTag || `F-${fi + 1}`} — ${frame.systemType || ''} — ${(frame.inputs?.width / 12 || 0).toFixed(2)}' × ${(frame.inputs?.height / 12 || 0).toFixed(2)}'`,
      startX + 2, y
    );
    y += rowH;

    cutList.forEach((piece, pi) => {
      if (y > PAGE_H - MARGIN - TITLE_BLOCK_H - 10) {
        doc.addPage();
        y = MARGIN + 15;
      }

      const bg = pi % 2 === 0 ? COLOR.white : [245, 245, 245];
      doc.setFillColor(...bg);
      doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      cx = startX + 2;

      const qty = piece.qty || 1;
      const lenIn = piece.lengthInches || 0;
      const totalIn = qty * lenIn;
      totalAlumIn += totalIn;

      const lenFt = Math.floor(lenIn / 12);
      const lenInRem = (lenIn % 12).toFixed(3);
      const lenLabel = `${lenFt}'-${lenInRem}"`;

      const rowData = [
        piece.mark || `P-${pi + 1}`,
        frame.elevationTag || `F-${fi + 1}`,
        piece.partName || piece.extrusionId || '',
        lenLabel,
        String(qty),
        `${(totalIn / 12).toFixed(2)} LF`,
      ];

      rowData.forEach((val, i) => { doc.text(String(val), cx, y); cx += colW[i]; });

      setColor(doc, COLOR.lightGray);
      doc.setLineWidth(0.1);
      doc.line(startX, y + 2, startX + DRAW_AREA_W - 10, y + 2);

      y += rowH;
    });

    y += 3;
  });

  // Total row
  y += 2;
  doc.setFillColor(...COLOR.lightGray);
  doc.rect(startX, y - 4, DRAW_AREA_W - 10, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TOTAL ALUMINUM', startX + 2, y);
  doc.text(`${(totalAlumIn / 12).toFixed(2)} LF`, startX + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] + 2, y);
}

// ─── Main Export Function ─────────────────────────────────────────────────────

/**
 * generateShopDrawings(frames, projectMeta, computeFabricationBOM)
 *
 * @param {Array}    frames               - Array of BidFrame objects from useBidStore
 * @param {Object}   projectMeta          - { projectName, client, address, contractor }
 * @param {Function} computeFabricationBOM - Function from systemEngine to compute full BOM
 * @returns {Blob}   PDF blob ready for download or display
 */
export function generateShopDrawings(frames, projectMeta) {
  if (!frames || frames.length === 0) {
    throw new Error('No frames provided to generateShopDrawings');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PAGE_W, PAGE_H],
  });

  // Compute full BOMs for all frames upfront
  const allBOMs = frames.map(frame => {
    try {
      return computeFabricationBOM(frame.inputs, frame.systemType);
    } catch (e) {
      console.warn(`BOM computation failed for frame ${frame.elevationTag}:`, e);
      return { glassList: [], cutList: [], hardware: {} };
    }
  });

  const dateStr = new Date().toLocaleDateString();
  const totalSheets = frames.length + 3; // cover + elevations + glass sched + cut list

  // ── Sheet 1: Cover ──
  drawBorder(doc);
  generateCoverSheet(doc, frames, projectMeta);
  drawTitleBlock(doc, projectMeta, {
    title: 'COVER SHEET — SCOPE SUMMARY',
    sheetNumber: 'G-001',
    date: dateStr,
  });

  // ── Sheets 2..N: Elevations ──
  frames.forEach((frame, i) => {
    doc.addPage();
    drawBorder(doc);
    generateElevationSheet(doc, frame, allBOMs[i], i);
    drawTitleBlock(doc, projectMeta, {
      title: `ELEVATION — ${frame.elevationTag || `F-${i + 1}`}`,
      sheetNumber: `A-${String(i + 1).padStart(3, '0')}`,
      date: dateStr,
    });
  });

  // ── Glass Schedule ──
  doc.addPage();
  drawBorder(doc);
  generateGlassSchedule(doc, frames, allBOMs);
  drawTitleBlock(doc, projectMeta, {
    title: 'GLASS SCHEDULE',
    sheetNumber: `GS-001`,
    date: dateStr,
  });

  // ── Cut List ──
  doc.addPage();
  drawBorder(doc);
  generateCutList(doc, frames, allBOMs);
  drawTitleBlock(doc, projectMeta, {
    title: 'ALUMINUM CUT LIST',
    sheetNumber: `CL-001`,
    date: dateStr,
  });

  return doc.output('blob');
}
