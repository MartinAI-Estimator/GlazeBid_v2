/*
 * CLAUDE — INTEGRATION:
 * 1. Place this file beside pdfCoordinates.mjs and useRegionSelection.js.
 * 2. Mount it beside the PDF canvas inside the SAME position:relative wrapper.
 *    Size that wrapper to viewport.width / viewport.height.
 * 3. Pass the exact, memoized PageViewport used by the visible PDF render.
 *    Pan/scroll the shared wrapper; do not separately translate this overlay.
 * 4. Pass page-specific takeoffResults. Remount with key={`${documentId}:${pageNumber}`}.
 * 5. Update defaultSelectDetections below to match takeoff_assembler.py's actual
 *    schema, or provide a stable selectDetections prop.
 * 6. Wire onRegionSelected(pdfBounds) to the request layer. Enable selection
 *    only while the Box & Snap tool is active.
 * 7. Pass reactive DPR from the viewer and rerender the PDF at that same DPR.
 *
 * Normalized detection:
 * {
 *   systemType: "Ext SF" | "Int SF" | "Cap CW" | string,
 *   bbox: [xMin, yMin, xMax, yMax],     // native PDF coordinates
 *   polygon?: [[x, y], ...]            // native PDF coordinates; takes priority
 * }
 *
 * CSS rotation/skew/perspective on the wrapper is unsupported.
 * Use PageViewport for rotation. Positive CSS scale and translation are supported.
 *
 * ── INTEGRATED (Fable, 2026-09-17) ───────────────────────────────────────────
 *  • Mounted in apps/builder/src/components/PDFViewer.jsx inside the "Paper"
 *    wrapper (already positioned + sized to the viewport, pans/scales via CSS).
 *  • Point 5: takeoff_assembler.py emits NO geometry, so the whole-set
 *    /drawing-intelligence/run payload cannot feed this overlay.  The overlay
 *    is fed by the new region endpoint POST /drawing-intelligence/run-region,
 *    whose response is { detections: [{ system_type, bbox, confidence, … }] }
 *    in fitz page space.  defaultSelectDetections is mapped to that shape and
 *    normalizes system_type through systemTypes.js.
 *  • Added the fourth canonical system, "SSG CW".  Colors follow the Bid
 *    Sheet convention used elsewhere in Builder (SYSTEM_COLORS in
 *    useProjectStore / bluebeamParser) rather than pure RGB.
 */

import React, { useLayoutEffect, useMemo, useRef } from "react";
import {
  beginOverlayFrame,
  pdfPolygonToViewport,
  pdfRectToViewport,
} from "./pdfCoordinates.mjs";
import { useRegionSelection } from "./useRegionSelection.js";
import { tryCanonicalSystemType } from "../../../utils/systemTypes";

const SYSTEM_STYLES = new Map([
  ["Ext SF", { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.22)" }],   // blue
  ["Int SF", { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.22)" }],   // amber
  ["Cap CW", { stroke: "#22c55e", fill: "rgba(34, 197, 94, 0.22)" }],    // green
  ["SSG CW", { stroke: "#a855f7", fill: "rgba(168, 85, 247, 0.22)" }],   // violet
]);

const FALLBACK_STYLE = {
  stroke: "#808080",
  fill: "rgba(128, 128, 128, 0.20)",
};

/*
 * Backend adaptation boundary.
 * Maps the /drawing-intelligence/run-region response to the normalized
 * detection shape.  Also accepts a bare array (tests, fixtures) and tolerates
 * the sidecar's geometry-engine shape ({ bounding_box: {x,y,width,height} })
 * so /detect-glazing candidates can be shown through the same overlay.
 */
export function defaultSelectDetections(takeoffResults) {
  if (takeoffResults == null) return [];

  const rows = Array.isArray(takeoffResults)
    ? takeoffResults
    : takeoffResults.detections ?? takeoffResults.candidates;

  if (!Array.isArray(rows)) {
    throw new TypeError(
      "Expected an array, { detections: [...] } or { candidates: [...] }. " +
        "Adapt defaultSelectDetections to the backend response."
    );
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new TypeError(`Invalid detection at index ${index}.`);
    }

    // bbox: [x0,y0,x1,y1] (run-region) or {x,y,width,height} (detect-glazing)
    let bbox = row.bbox;
    if (!bbox && row.bounding_box && typeof row.bounding_box === "object") {
      const b = row.bounding_box;
      bbox = [b.x, b.y, b.x + b.width, b.y + b.height];
    }

    const rawType = row.system_type ?? row.systemType ?? row.system_hint;
    return {
      systemType: tryCanonicalSystemType(rawType) ?? rawType ?? "unknown",
      bbox,
      polygon: row.polygon,
      confidence: row.confidence,
    };
  });
}

function createShape(viewport, detection, index) {
  if (!detection || typeof detection !== "object") {
    throw new TypeError(`Invalid normalized detection at index ${index}.`);
  }

  const path = new Path2D();

  if (detection.polygon != null) {
    // Utility validates all vertices and requires at least three.
    const vertices = pdfPolygonToViewport(viewport, detection.polygon);

    vertices.forEach(([x, y], vertexIndex) => {
      if (vertexIndex === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });

    path.closePath();
  } else {
    // Utility validates and normalizes the PDF rectangle.
    const rect = pdfRectToViewport(viewport, detection.bbox);
    if (rect.width === 0 || rect.height === 0) return null;

    path.rect(rect.left, rect.top, rect.width, rect.height);
  }

  return {
    path,
    style: SYSTEM_STYLES.get(detection.systemType) ?? FALLBACK_STYLE,
  };
}

export default function CanvasOverlay({
  viewport,
  takeoffResults,
  dpr = globalThis.devicePixelRatio ?? 1,
  selectionEnabled = false,
  onRegionSelected,
  selectDetections = defaultSelectDetections,
  minDragPixels = 4,
}) {
  const canvasRef = useRef(null);

  const canSelect =
    selectionEnabled && typeof onRegionSelected === "function";

  const { dragRect, pointerHandlers } = useRegionSelection({
    viewport,
    enabled: canSelect,
    onRegionSelected,
    minDragPixels,
  });

  // Keep results immutable and selectDetections stable in the parent.
  // Geometry projection is not repeated for every drag-preview update.
  const shapes = useMemo(() => {
    if (!viewport) return [];

    const detections = selectDetections(takeoffResults);
    if (!Array.isArray(detections)) {
      throw new TypeError("selectDetections must return an array.");
    }

    return detections
      .map((detection, index) => createShape(viewport, detection, index))
      .filter(Boolean);
  }, [viewport, takeoffResults, selectDetections]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport) return undefined;

    // Coalesce paints with the browser's frame cycle.
    const frameId = window.requestAnimationFrame(() => {
      const context = beginOverlayFrame(canvas, viewport, dpr);

      context.save();
      try {
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.lineWidth = 1.5;
        context.lineJoin = "round";
        context.setLineDash([]);

        for (const { path, style } of shapes) {
          context.fillStyle = style.fill;
          context.strokeStyle = style.stroke;
          context.fill(path);
          context.stroke(path);
        }

        if (dragRect) {
          const { left, top, width, height } = dragRect;

          context.fillStyle = "rgba(14, 165, 233, 0.10)";
          context.fillRect(left, top, width, height);

          // White under-stroke keeps the dashed outline visible over dark ink.
          context.setLineDash([6, 4]);
          context.lineDashOffset = 0;
          context.lineWidth = 3;
          context.strokeStyle = "#ffffff";
          context.strokeRect(left, top, width, height);

          context.lineWidth = 1.5;
          context.strokeStyle = "#0284c7";
          context.strokeRect(left, top, width, height);
        }
      } finally {
        context.restore();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [viewport, dpr, shapes, dragRect]);

  if (!viewport) return null;

  return (
    <canvas
      ref={canvasRef}
      {...pointerHandlers}
      aria-label={
        canSelect
          ? "Box and Snap selection. Drag a region; press Escape to cancel."
          : "Glazing takeoff highlights"
      }
      style={{
        position: "absolute",
        inset: 0,
        width: viewport.width,
        height: viewport.height,
        display: "block",
        boxSizing: "content-box",
        border: 0,
        padding: 0,
        margin: 0,
        zIndex: 2,
        // When the tool is off, let clicks fall through to the markup SVG
        // layer beneath so existing select/edit behaviour is unchanged.
        pointerEvents: canSelect ? "auto" : "none",
        touchAction: canSelect ? "none" : "auto",
        userSelect: "none",
        cursor: canSelect ? "crosshair" : "inherit",
      }}
    />
  );
}
