/**
 * parsePartnerPak.js — Client-side PartnerPak XLS/XLSX/CSV Parser
 *
 * Reads a "PartnerPak Studio General Elevation Bid Summary" XLS export
 * and converts it into the system/frame shape expected by GlazeBidWorkspace.
 *
 * PartnerPak layout (report-style, NOT tabular):
 *   Row 0:  Title — "PartnerPak Studio General Elevation Bid Summary"
 *   Row 1:  Project Name
 *   Row 2:  Disclaimer
 *   Row 3:  Frame Set Name (system type - e.g. "Exterior Storefront")
 *   Row 4:  Column headers at fixed column positions:
 *             C=Frame Name, G=Width, I=Height, M=Area, O=Perimeter,
 *             Q=Joints, S=Panels, U=Rows, W=Number Of Openings,
 *             AA=Number Thus (qty), AF=Frame Price
 *   Rows 5+: Data rows (one per frame elevation)
 *   Total row: starts with "Total Frame Set Area"
 *   Footer: "Report Provided Courtesy of PartnerPak Studio"
 *   Page 2+: Project summary stats (total joints, cuts, doors, etc.)
 *
 * Multi-system files repeat the R3-R17 block for each frame set.
 */

import * as XLSX from 'xlsx';

// ── Header label → column index detection ─────────────────────────────────────
// We scan the header row for these labels and record their column index.
const HEADER_LABELS = {
  frameName:    ['frame name'],
  width:        ['width'],
  height:       ['height'],
  area:         ['area'],
  perimeter:    ['perimeter'],
  joints:       ['joints'],
  panels:       ['panels'],
  rows:         ['rows'],
  openings:     ['number of openings'],
  numberThus:   ['number thus'],
};

/**
 * Get cell value as string from a worksheet
 */
function cellStr(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell != null ? String(cell.v).trim() : '';
}

/**
 * Get cell value as number from a worksheet
 */
function cellNum(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) return 0;
  if (typeof cell.v === 'number') return cell.v;
  // Strip units like "245.00 Sqft", "141.25 Ft", commas
  const cleaned = String(cell.v).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Detect column positions by scanning a header row for known labels.
 * Returns a map of canonical key → column index.
 *
 * PartnerPak uses merged-cell-style layouts where multi-word headers
 * (e.g. "Number Of Openings", "Number Thus") occupy one cell but the
 * actual data value is in the NEXT column. After detecting headers we
 * probe the first data row to correct for this offset.
 */
function detectColumns(ws, headerRow, maxCol, firstDataRow) {
  const colMap = {};

  for (let c = 0; c <= maxCol; c++) {
    const val = cellStr(ws, headerRow, c).toLowerCase();
    if (!val) continue;

    for (const [key, labels] of Object.entries(HEADER_LABELS)) {
      if (labels.some(l => val.includes(l))) {
        colMap[key] = c;
        break;
      }
    }
  }

  // Correct for offset: if the header column has no data but col+1 does,
  // shift to col+1. This handles "Number Of Openings" and "Number Thus".
  if (firstDataRow != null) {
    for (const [key, col] of Object.entries(colMap)) {
      const atCol = cellStr(ws, firstDataRow, col);
      const atNext = cellStr(ws, firstDataRow, col + 1);
      // If header col is empty in data but the next col has a value, shift
      if (!atCol && atNext) {
        colMap[key] = col + 1;
      }
    }
  }

  return colMap;
}

/**
 * Scan the sheet for all frame-set blocks. Each block has:
 *   - A "Frame Set Name" row (contains system type in col D)
 *   - A header row (next row with "Frame Name", "Width", etc.)
 *   - Data rows until we hit a "Total" row or footer
 *
 * Returns array of { systemName, headerRow, dataStartRow, dataEndRow }
 */
function findFrameSetBlocks(ws, range) {
  const blocks = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    // Look for "Frame Set Name" pattern in col B (index 1)
    const b = cellStr(ws, r, 1).toLowerCase();
    if (b.includes('frame set name')) {
      // System type is in col D (index 3) or wherever the next non-empty cell is
      let systemName = '';
      for (let c = 2; c <= Math.min(range.e.c, 10); c++) {
        const v = cellStr(ws, r, c);
        if (v && !v.toLowerCase().includes('frame set name')) {
          systemName = v;
          break;
        }
      }
      if (!systemName) systemName = 'Default System';

      // Next row should be the header row
      const headerRow = r + 1;

      // Data starts after header
      const dataStart = headerRow + 1;

      // Scan for end of data (Total row, footer, or next Frame Set Name)
      let dataEnd = dataStart;
      for (let dr = dataStart; dr <= range.e.r; dr++) {
        const firstCell = cellStr(ws, dr, 0).toLowerCase();
        const secondCell = cellStr(ws, dr, 1).toLowerCase();

        // Stop at "Total Frame Set" rows
        if (secondCell.includes('total frame set') || secondCell.includes('total frame set area')) {
          dataEnd = dr - 1;
          break;
        }
        // Stop at footer rows
        if (firstCell.includes('report provided') || firstCell.includes('partnerpak studio')) {
          dataEnd = dr - 1;
          break;
        }
        // Stop at next frame set
        if (secondCell.includes('frame set name')) {
          dataEnd = dr - 1;
          break;
        }

        dataEnd = dr;
      }

      blocks.push({ systemName, headerRow, dataStartRow: dataStart, dataEndRow: dataEnd });
    }
  }

  return blocks;
}

/**
 * Check if a row has actual frame data (not empty/summary)
 */
function isDataRow(ws, r, colMap) {
  // Must have a frame name or width or area
  const name = colMap.frameName != null ? cellStr(ws, r, colMap.frameName) : '';
  const width = colMap.width != null ? cellNum(ws, r, colMap.width) : 0;
  const area = colMap.area != null ? cellNum(ws, r, colMap.area) : 0;
  return (name.length > 0 && name.toLowerCase() !== 'frame name') || width > 0 || area > 0;
}

/**
 * Parse a single frame-set block into a system object.
 */
function parseBlock(ws, block, range, blockIdx) {
  const colMap = detectColumns(ws, block.headerRow, range.e.c, block.dataStartRow);

  console.log(`[PartnerPak] System "${block.systemName}" columns:`, colMap);

  const frames = [];

  for (let r = block.dataStartRow; r <= block.dataEndRow; r++) {
    if (!isDataRow(ws, r, colMap)) continue;

    const frameName = colMap.frameName != null ? cellStr(ws, r, colMap.frameName) : '';
    const width     = colMap.width != null ? cellNum(ws, r, colMap.width) : 0;
    const height    = colMap.height != null ? cellNum(ws, r, colMap.height) : 0;
    const area      = colMap.area != null ? cellNum(ws, r, colMap.area) : 0;
    const perimeter = colMap.perimeter != null ? cellNum(ws, r, colMap.perimeter) : 0;
    const joints    = colMap.joints != null ? cellNum(ws, r, colMap.joints) : 0;
    const panels    = colMap.panels != null ? cellNum(ws, r, colMap.panels) : 0;
    const rows      = colMap.rows != null ? cellNum(ws, r, colMap.rows) : 0;
    const openings  = colMap.openings != null ? cellNum(ws, r, colMap.openings) : 0;
    const quantity  = colMap.numberThus != null ? cellNum(ws, r, colMap.numberThus) : 1;

    // Derive sqFt — area is already in SqFt from PartnerPak
    const sqFt = area > 0 ? area : (width * height) / 144;

    // Compute bays from panels / rows (panels = bays × rows per PartnerPak convention)
    const bays = rows > 0 ? Math.max(1, Math.round(panels / rows)) : panels;

    // NOTE: PartnerPak "Number of Openings" is pre-multiplied by quantity (total for all units).
    // We store dlos = panels (per-frame glass count = bays × rows), which is the correct
    // per-unit DLO count. The engine will multiply by frame.quantity to get the system total.
    frames.push({
      id:          `pp-${Date.now()}-${blockIdx}-${frames.length}`,
      mark:        frameName || `Frame ${frames.length + 1}`,
      description: `${width}" × ${height}" — ${quantity > 1 ? quantity + ' units' : '1 unit'}`,
      width,
      height,
      quantity:    quantity || 1,
      sqFt,
      area:        sqFt,
      bays,
      rows,
      dlos:        panels,   // panels = bays×rows = per-unit DLO count (NOT pre-multiplied openings)
      receptors:   0,
      panels,
      joints,
      perimeter,
      glassType:   '',
      modifiers:   [],
    });
  }

  const totalQty     = frames.reduce((s, f) => s + f.quantity, 0);
  const totalSF      = frames.reduce((s, f) => s + (f.sqFt * f.quantity), 0);
  const totalJoints  = frames.reduce((s, f) => s + f.joints, 0);
  const totalPanels  = frames.reduce((s, f) => s + (f.panels * f.quantity), 0);
  const totalOpenings = frames.reduce((s, f) => s + (f.dlos * f.quantity), 0);

  return {
    id:          `ppk-${Date.now()}-${blockIdx}`,
    type:        'partnerpak-import',
    name:        block.systemName,
    shortName:   block.systemName.length > 14 ? block.systemName.slice(0, 14) : block.systemName,
    description: `PartnerPak import — ${frames.length} elevation(s), ${totalQty} total frames`,
    systemType:  'Ext SF',  // PartnerPak imports are always Exterior Storefront
    frames,
    materials:   [],
    laborTasks:  [],
    status:      'ready',
    totals: {
      totalFrames:    frames.length,
      totalQuantity:  totalQty,
      totalSF:        parseFloat(totalSF.toFixed(2)),
      totalJoints:    totalJoints,
      totalPanels:    totalPanels,
      totalOpenings:  totalOpenings,
      totalCost:      0,
      shopMHs:        0,
      distMHs:        0,
      fieldMHs:       0,
    },
    lastModified: new Date().toISOString(),
  };
}

/**
 * Extract project-level summary stats from the summary page
 * (rows after the last frame-set block / page 2).
 */
function parseProjectSummary(ws, range) {
  const summary = {};
  const patterns = [
    { key: 'totalFrameSets',    pattern: 'total number of frame sets' },
    { key: 'totalFrames',       pattern: 'total number of frames' },
    { key: 'totalMetalJoints',  pattern: 'total metal joints' },
    { key: 'totalMetalCuts',    pattern: 'total metal cuts' },
    { key: 'totalDoorLeafs',    pattern: 'total number of door leafs' },
    { key: 'totalOpenings',     pattern: 'total number of openings' },
    { key: 'totalCutPieces',    pattern: 'total number of cut pieces' },
    { key: 'totalSingleGlazed', pattern: 'total number single glazed' },
    { key: 'totalInsulated',    pattern: 'total number of insulated' },
    { key: 'totalManUnits',     pattern: 'total number of man units' },
    { key: 'totalFramePerimeter', pattern: 'total frame perimeter' },
    { key: 'totalGlazingPerimeter', pattern: 'total glazing perimeter' },
    { key: 'totalArea',         pattern: 'total area' },
  ];

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 20); c++) {
      const val = cellStr(ws, r, c).toLowerCase();
      for (const { key, pattern } of patterns) {
        if (val.includes(pattern) && !summary[key]) {
          // Value is typically a few columns to the right
          for (let vc = c + 1; vc <= Math.min(c + 8, range.e.c); vc++) {
            const n = cellNum(ws, r, vc);
            if (n > 0) {
              summary[key] = n;
              break;
            }
          }
        }
      }
    }
  }

  return summary;
}

/**
 * Detect project name from the file
 */
function parseProjectName(ws, range) {
  for (let r = range.s.r; r <= Math.min(range.e.r, 5); r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 5); c++) {
      const val = cellStr(ws, r, c);
      if (val.toLowerCase().includes('project name')) {
        // "Project Name - Highlands at Briargate" → extract after " - "
        const dashIdx = val.indexOf(' - ');
        if (dashIdx >= 0) return val.slice(dashIdx + 3).trim();
        // Or check next column
        const next = cellStr(ws, r, c + 1);
        if (next) return next;
      }
    }
  }
  return '';
}

/**
 * Main entry point — parse a File object (XLS, XLSX, or CSV) into systems.
 *
 * @param {File} file — the dropped/chosen file
 * @returns {Promise<{ systems: object[], projectName: string, projectSummary: object, colMap: object }>}
 */
export async function parsePartnerPakFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('The file contains no sheets.');
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) throw new Error('The sheet appears to be empty.');

  const range = XLSX.utils.decode_range(ws['!ref']);

  // Extract project name
  const projectName = parseProjectName(ws, range);
  console.log('[PartnerPak] Project:', projectName || '(unknown)');

  // Find all frame-set blocks
  const blocks = findFrameSetBlocks(ws, range);

  if (blocks.length === 0) {
    throw new Error(
      'Could not find any PartnerPak frame set blocks. ' +
      'Expected a "Frame Set Name" row followed by column headers (Frame Name, Width, Height, etc.).'
    );
  }

  // Parse each block into a system
  const systems = blocks.map((block, idx) => parseBlock(ws, block, range, idx));

  // Parse project-level summary
  const projectSummary = parseProjectSummary(ws, range);

  const totalFrames = systems.reduce((s, sys) => s + sys.frames.length, 0);
  const totalQty = systems.reduce((s, sys) => s + sys.totals.totalQuantity, 0);

  console.log(`[PartnerPak] Parsed ${blocks.length} system(s), ${totalFrames} elevation(s), ${totalQty} total frames`);
  console.log('[PartnerPak] Project summary:', projectSummary);

  // Build a debug colMap from the first block
  const colMap = blocks.length > 0 ? detectColumns(ws, blocks[0].headerRow, range.e.c, blocks[0].dataStartRow) : {};

  return { systems, projectName, projectSummary, colMap };
}
