/**
 * pdfSnapParser.ts
 *
 * Extracts vector-path snap candidates from a PDF page's operator list.
 * Results are cached by pageId â€” parsing happens once per session.
 *
 * â”€â”€ PDF.js 4 operator-list architecture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PDF.js 4 batches all consecutive path-construction operators into a single
 * `constructPath` op (OPS = 91).  Individual moveTo/lineTo never appear as
 * top-level operators.
 *
 *   argsArray[i] = [subOps: number[], coords: number[], minMax: number[]]
 *
 * Sub-op coord consumption:
 *   moveTo    â†’ 2  (x, y)
 *   lineTo    â†’ 2  (x, y)
 *   curveTo   â†’ 6  (x1,y1, x2,y2, x,y)
 *   curveTo2  â†’ 4  (x1,y1, x,y)
 *   curveTo3  â†’ 4  (x1,y1, x,y)
 *   rectangle â†’ 4  (x, y, w, h)
 *   closePath â†’ 0
 *
 * â”€â”€ CTM (Current Transformation Matrix) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Path coordinates inside constructPath are in the LOCAL coordinate space
 * established by all preceding `transform` (OPS=12), `save` (10) and
 * `restore` (11) operators.  Without tracking the CTM, every snap point
 * lands in the wrong position on-screen.
 *
 * We maintain a full CTM stack and multiply through it before applying the
 * viewport transform (y-axis flip) to get page-pixel coordinates.
 *
 * â”€â”€ Coordinate chain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   local (path coords)
 *     â†’ Ã— CTM stack â†’ PDF user-space (72 DPI, y-up)
 *     â†’ Ã— vp.transform [1,0,0,-1,0,h] â†’ page-pixel space (y-down, matches Camera)
 *
 * â”€â”€ Performance guardrails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * MAX_POINTS:  hard cap to prevent degradation on complex drawings.
 * MIN_SEG_SQ:  skip degenerate zero-length segments.
 * Dedup:       1 px integer grid so near-duplicate points merge.
 * Fire-and-forget â€” never blocks the tile render or scheduleRedraw.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PagePoint } from './coordinateSystem';

// â”€â”€ Module-level cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const _cache = new Map<string, PagePoint[]>();

const MAX_POINTS = 25_000;
const MIN_SEG_SQ = 0.01; // skip zero-length degenerate moves only

// â”€â”€ CTM helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type M6 = [number, number, number, number, number, number];

/** Multiply two 2-D affine matrices: result = a Ã— b */
function mulM(a: M6, b: M6): M6 {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getCachedPdfSnapPoints(pageId: string): PagePoint[] {
  return _cache.get(pageId) ?? [];
}

export function clearPdfSnapCache(): void {
  _cache.clear();
}

export async function parsePdfSnapPoints(
  pageId: string,
  proxy:  PDFPageProxy,
): Promise<void> {
  if (_cache.has(pageId)) return;

  // viewport transform at scale=1: maps PDF user-space â†’ page-pixel space.
  // For a standard portrait page this is [1, 0, 0, -1, 0, pageHeight].
  const vp  = proxy.getViewport({ scale: 1 });
  const vpT = vp.transform as M6;

  /** Apply viewport transform: PDF user-space â†’ page-pixel space */
  function vpApply(ux: number, uy: number): PagePoint {
    return {
      x: vpT[0] * ux + vpT[2] * uy + vpT[4],
      y: vpT[1] * ux + vpT[3] * uy + vpT[5],
    };
  }

  let opList: { fnArray: number[]; argsArray: unknown[] };
  try {
    opList = await proxy.getOperatorList() as { fnArray: number[]; argsArray: unknown[] };
  } catch (err) {
    console.warn('[pdfSnapParser] getOperatorList failed for', pageId, err);
    _cache.set(pageId, []);
    return;
  }

  const { fnArray, argsArray } = opList;

  // â”€â”€ OPS constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const OP_SAVE       = pdfjsLib.OPS.save                   as number; // 10
  const OP_RESTORE    = pdfjsLib.OPS.restore                 as number; // 11
  const OP_TRANSFORM  = pdfjsLib.OPS.transform               as number; // 12
  const OP_MOVETO     = pdfjsLib.OPS.moveTo                  as number; // 13
  const OP_LINETO     = pdfjsLib.OPS.lineTo                  as number; // 14
  const OP_CURVETO    = pdfjsLib.OPS.curveTo                 as number; // 15
  const OP_CURVETO2   = pdfjsLib.OPS.curveTo2                as number; // 16
  const OP_CURVETO3   = pdfjsLib.OPS.curveTo3                as number; // 17
  const OP_CLOSE      = pdfjsLib.OPS.closePath               as number; // 18
  const OP_RECT       = pdfjsLib.OPS.rectangle               as number; // 19
  const OP_FORM_BEGIN = pdfjsLib.OPS.paintFormXObjectBegin   as number; // 74
  const OP_FORM_END   = pdfjsLib.OPS.paintFormXObjectEnd     as number; // 75
  const OP_CONSTRUCT  = pdfjsLib.OPS.constructPath           as number; // 91

  // â”€â”€ CTM stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let ctm: M6 = [1, 0, 0, 1, 0, 0];
  const ctmStack: M6[] = [];

  const raw: PagePoint[] = [];

  /**
   * Transform local path coords through CTM â†’ user-space â†’ page-pixel,
   * then append to raw if within page bounds.
   */
  function addPt(lx: number, ly: number): void {
    if (raw.length >= MAX_POINTS) return;
    // local â†’ PDF user-space via CTM
    const ux = ctm[0] * lx + ctm[2] * ly + ctm[4];
    const uy = ctm[1] * lx + ctm[3] * ly + ctm[5];
    // user-space â†’ page-pixel via viewport transform
    const pt = vpApply(ux, uy);
    // cull anything outside the page (1 px float margin)
    if (pt.x < -1 || pt.y < -1 || pt.x > vp.width + 1 || pt.y > vp.height + 1) return;
    raw.push(pt);
  }

  // â”€â”€ Main operator loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (let i = 0; i < fnArray.length && raw.length < MAX_POINTS; i++) {
    const fn = fnArray[i];

    // â”€â”€ CTM tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (fn === OP_SAVE) {
      ctmStack.push([ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]]);
      continue;
    }
    if (fn === OP_RESTORE) {
      if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      continue;
    }
    if (fn === OP_TRANSFORM) {
      // argsArray[i] for transform is a flat 6-element array [a,b,c,d,e,f]
      const ta = argsArray[i] as number[];
      if (ta && ta.length >= 6) {
        ctm = mulM(ctm, [ta[0], ta[1], ta[2], ta[3], ta[4], ta[5]]);
      }
      continue;
    }
    // Form XObjects: PDF.js places the form Matrix ONLY in paintFormXObjectBegin
    // args[0] -- no separate save/transform/restore is emitted. CAD drawings
    // use XObjects for model->paper mapping; missing this means all paths inside
    // an XObject snap to the wrong position.
    if (fn === OP_FORM_BEGIN) {
      ctmStack.push([ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]]);
      const fa = argsArray[i] as unknown[];
      if (Array.isArray(fa) && Array.isArray(fa[0])) {
        const m = fa[0] as number[];
        if (m.length >= 6) {
          ctm = mulM(ctm, [m[0], m[1], m[2], m[3], m[4], m[5]]);
        }
      }
      continue;
    }
    if (fn === OP_FORM_END) {
      if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      continue;
    }

    // â”€â”€ constructPath batch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (fn !== OP_CONSTRUCT) continue;

    // argsArray[i] = [subOps: number[], coords: number[], minMax: number[]]
    const entry = argsArray[i] as unknown;
    if (!Array.isArray(entry)) continue;
    const subOps = entry[0] as number[];
    const coords = entry[1]; // may be Array or Float32Array
    if (!Array.isArray(subOps) || !coords) continue;

    let j  = 0;          // index into coords flat array
    let cx = 0, cy = 0;  // current path position in local space
    let sx = 0, sy = 0;  // subpath start (for closePath)

    for (let k = 0; k < subOps.length && raw.length < MAX_POINTS; k++) {
      const op = subOps[k];

      if (op === OP_MOVETO) {
        cx = +coords[j++]; cy = +coords[j++];
        sx = cx; sy = cy;
        addPt(cx, cy);

      } else if (op === OP_LINETO) {
        const nx = +coords[j++], ny = +coords[j++];
        if ((nx - cx) ** 2 + (ny - cy) ** 2 >= MIN_SEG_SQ) {
          addPt(cx, cy);
          addPt(nx, ny);
        }
        cx = nx; cy = ny;

      } else if (op === OP_CURVETO) {
        // 6 coords: cp1x,cp1y, cp2x,cp2y, ex,ey â€” only endpoint is snap-worthy
        j += 4;
        const nx = +coords[j++], ny = +coords[j++];
        addPt(nx, ny);
        cx = nx; cy = ny;

      } else if (op === OP_CURVETO2 || op === OP_CURVETO3) {
        // 4 coords: cp1x,cp1y, ex,ey
        j += 2;
        const nx = +coords[j++], ny = +coords[j++];
        addPt(nx, ny);
        cx = nx; cy = ny;

      } else if (op === OP_RECT) {
        const rx = +coords[j++], ry = +coords[j++];
        const rw = +coords[j++], rh = +coords[j++];
        // Four corners + four edge midpoints
        addPt(rx,          ry);           addPt(rx + rw,     ry);
        addPt(rx + rw,     ry + rh);      addPt(rx,          ry + rh);
        addPt(rx + rw / 2, ry);           addPt(rx + rw / 2, ry + rh);
        addPt(rx,          ry + rh / 2);  addPt(rx + rw,     ry + rh / 2);
        cx = rx; cy = ry; sx = rx; sy = ry;

      } else if (op === OP_CLOSE) {
        if ((sx - cx) ** 2 + (sy - cy) ** 2 >= MIN_SEG_SQ) {
          addPt(sx, sy);
        }
        cx = sx; cy = sy;
      }
    }
  }

  const result = _dedup(raw);
  const cappedMsg = raw.length >= MAX_POINTS ? ` (hit ${MAX_POINTS} cap — drawing may be larger)` : '';
  console.log(`[pdfSnapParser] page ${pageId}: ${fnArray.length} ops → ${raw.length} raw → ${result.length} deduped snap pts${cappedMsg}`);
  _cache.set(pageId, result);
}

// â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _dedup(pts: PagePoint[]): PagePoint[] {
  const seen = new Set<string>();
  return pts.filter(p => {
    const k = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
