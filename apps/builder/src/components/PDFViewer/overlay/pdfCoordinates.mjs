/*
 * pdfCoordinates.mjs — the ONE place PDF ↔ viewport ↔ client math lives.
 *
 * Consumed by CanvasOverlay.jsx and useRegionSelection.js (Astra).
 * Those files were written against this module's contract; this file did not
 * exist in the repo, so it is written here to that contract.
 *
 * ── COORDINATE CONVENTION — READ THIS BEFORE TOUCHING ANYTHING ─────────────
 *
 * "PDF space" in this module means **PyMuPDF / fitz page space**:
 *     72 pt/inch · UNROTATED page · origin TOP-LEFT · y grows DOWN.
 *
 * That is what the sidecar emits and consumes (fitz.Rect, rules_engine
 * bounding_box, /detect-glazing, and the new /drawing-intelligence/run-region).
 * It is also what PDFViewer.jsx already stores markups in (see
 * getMarkupPdfBBox: "Do NOT use viewport.convertToPdfPoint here: that helper
 * flips the Y-axis … sends the backend to the wrong half of the page").
 *
 * PDF.js's PageViewport.convertToPdfPoint / convertToViewportPoint speak the
 * PDF *spec* convention (origin bottom-left, y grows UP, offset by viewBox).
 * We use those helpers ONLY for rotation + scale, and flip Y on the way in and
 * out so callers never see spec-space.  Rotation therefore works — a portrait
 * sheet auto-rotated 90° by the viewer still produces correct fitz boxes,
 * which the legacy markup path does not guarantee.
 *
 * Rects are [xMin, yMin, xMax, yMax].  Points are [x, y].
 */

// ── Validation ────────────────────────────────────────────────────────────────

function assertFinite(n, what) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new TypeError(`${what} must be a finite number, got ${n}`);
  }
  return n;
}

function assertViewport(viewport) {
  if (
    !viewport ||
    !Array.isArray(viewport.viewBox) ||
    viewport.viewBox.length !== 4 ||
    typeof viewport.convertToViewportPoint !== "function" ||
    typeof viewport.convertToPdfPoint !== "function"
  ) {
    throw new TypeError("Expected a PDF.js PageViewport.");
  }
  return viewport;
}

/** Sort a rect so min <= max on both axes. Accepts [x0,y0,x1,y1] in any order. */
export function normalizeRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4) {
    throw new TypeError("Rect must be [xMin, yMin, xMax, yMax].");
  }
  const [a, b, c, d] = rect.map((v, i) => assertFinite(v, `rect[${i}]`));
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

// ── fitz-space ↔ PDF-spec-space (the Y flip) ──────────────────────────────────

/** fitz (top-left, y down) → PDF spec (bottom-left, y up), in viewBox units. */
function fitzToSpec(viewport, [x, y]) {
  const [vx0, , , vy1] = viewport.viewBox;
  return [vx0 + x, vy1 - y]; // vy1 is the TOP edge in spec space (y up)
}

/** PDF spec (bottom-left, y up) → fitz (top-left, y down). */
function specToFitz(viewport, [x, y]) {
  const [vx0, , , vy1] = viewport.viewBox;
  return [x - vx0, vy1 - y];
}

// ── PDF → viewport (CSS px, top-left origin, includes rotation + scale) ───────

/** One fitz-space point → viewport CSS pixel point. */
export function pdfPointToViewport(viewport, point) {
  assertViewport(viewport);
  if (!Array.isArray(point) || point.length !== 2) {
    throw new TypeError("Point must be [x, y].");
  }
  const [sx, sy] = fitzToSpec(viewport, [
    assertFinite(point[0], "point.x"),
    assertFinite(point[1], "point.y"),
  ]);
  const [vx, vy] = viewport.convertToViewportPoint(sx, sy);
  return [vx, vy];
}

/**
 * fitz-space rect → viewport box {left, top, width, height} in CSS px.
 * Rotation can swap/flip axes, so all four corners are projected and the
 * axis-aligned bounds of the result are returned.
 */
export function pdfRectToViewport(viewport, rect) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const corners = [
    pdfPointToViewport(viewport, [x0, y0]),
    pdfPointToViewport(viewport, [x1, y0]),
    pdfPointToViewport(viewport, [x1, y1]),
    pdfPointToViewport(viewport, [x0, y1]),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/** fitz-space polygon → array of viewport [x, y] vertices. Requires ≥ 3. */
export function pdfPolygonToViewport(viewport, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new TypeError("Polygon must have at least three vertices.");
  }
  return polygon.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) {
      throw new TypeError(`Polygon vertex ${i} must be [x, y].`);
    }
    return pdfPointToViewport(viewport, p);
  });
}

// ── Client (mouse) → PDF ──────────────────────────────────────────────────────

/**
 * Client pixel → fitz-space point.
 *
 * `bounds` is the overlay canvas's getBoundingClientRect() — measured fresh,
 * so pan (translate) and positive CSS scale on the wrapper are accounted for:
 * the canvas's CSS size is viewport.width × viewport.height, but its displayed
 * size is bounds.width × bounds.height.  The ratio recovers viewport px.
 */
export function clientPointToPdf(viewport, clientPoint, bounds) {
  assertViewport(viewport);
  if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
    throw new RangeError("bounds must have positive width and height.");
  }
  const cx = assertFinite(clientPoint[0], "clientX");
  const cy = assertFinite(clientPoint[1], "clientY");

  const vx = ((cx - bounds.left) / bounds.width) * viewport.width;
  const vy = ((cy - bounds.top) / bounds.height) * viewport.height;

  const [sx, sy] = viewport.convertToPdfPoint(vx, vy); // spec space
  return specToFitz(viewport, [sx, sy]);
}

// ── Overlay canvas frame setup ────────────────────────────────────────────────

/**
 * Size the overlay canvas backing store to viewport × dpr, keep its CSS size
 * at viewport px, clear it, and return a 2D context whose transform maps
 * viewport CSS px → device px.  Call once per paint, before drawing.
 */
export function beginOverlayFrame(canvas, viewport, dpr = 1) {
  assertViewport(viewport);
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const w = Math.max(1, Math.round(viewport.width * ratio));
  const h = Math.max(1, Math.round(viewport.height * ratio));

  // Only touch the backing store when it actually changes — resizing a canvas
  // clears it and is the expensive part.
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  return context;
}
