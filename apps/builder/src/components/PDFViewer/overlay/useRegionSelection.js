/*
 * CLAUDE — INTEGRATION:
 * 1. Place this file beside pdfCoordinates.mjs.
 * 2. Spread pointerHandlers onto the overlay canvas.
 * 3. Draw dragRect AFTER permanent highlights; it uses viewport/CSS coordinates.
 * 4. onRegionSelected receives [xMin, yMin, xMax, yMax] in native PDF space.
 *    The callback should own endpoint submission, loading state and errors.
 * 5. Memoize viewport in the parent. A viewport change cancels an active drag.
 *    Remount the overlay when document/page identity changes.
 * 6. Use touch-action:none while selection is enabled. Do not let an ancestor's
 *    capture-phase pan handler start panning while the Box & Snap tool is active.
 *
 * Handles reverse drags, page clipping, pointer capture, Escape, window blur,
 * lost capture, pointer cancellation, disabled tools and component unmount.
 * DPR is deliberately absent: pointer coordinates are CSS pixels.
 *
 * INTEGRATED (Fable, 2026-09-17): "native PDF space" here is fitz page space
 * (top-left origin, unrotated, 72 pt/in) as defined in pdfCoordinates.mjs —
 * the convention the sidecar consumes.  pageBounds below uses viewport.viewBox,
 * which equals [0,0,W,H] for the overwhelming majority of construction sets;
 * a nonzero crop origin would offset the clamp by that origin.  Accepted.
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clientPointToPdf,
  normalizeRect,
  pdfRectToViewport,
} from "./pdfCoordinates.mjs";

function releaseCapture(session) {
  if (!session) return;

  try {
    if (session.element.hasPointerCapture(session.pointerId)) {
      session.element.releasePointerCapture(session.pointerId);
    }
  } catch {
    // The browser may already have released capture or detached the element.
  }
}

function readBounds(element) {
  const bounds = element.getBoundingClientRect();

  if (
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }

  return bounds;
}

function clampPdfPoint(point, pageBounds) {
  const [xMin, yMin, xMax, yMax] = pageBounds;

  return [
    Math.max(xMin, Math.min(xMax, point[0])),
    Math.max(yMin, Math.min(yMax, point[1])),
  ];
}

function eventToPdf(event, session, bounds) {
  // Uses fresh DOM bounds, accounting for scroll/pan and positive CSS scaling.
  const point = clientPointToPdf(
    session.viewport,
    [event.clientX, event.clientY],
    bounds
  );

  return clampPdfPoint(point, session.pageBounds);
}

export function useRegionSelection({
  viewport,
  enabled = true,
  onRegionSelected,
  minDragPixels = 4,
}) {
  if (!Number.isFinite(minDragPixels) || minDragPixels < 0) {
    throw new RangeError("minDragPixels must be finite and nonnegative.");
  }

  const activeRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const clearSelection = useCallback((updatePreview = true) => {
    const session = activeRef.current;

    // Clear before releasing capture: lostpointercapture may follow immediately.
    activeRef.current = null;
    releaseCapture(session);

    if (updatePreview) setPreview(null);
  }, []);

  const cancelSelection = useCallback(() => {
    clearSelection(true);
  }, [clearSelection]);

  useLayoutEffect(() => {
    // Cancel when the viewport or active tool changes.
    clearSelection(true);

    if (!enabled || !viewport) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape" || !activeRef.current) return;

      event.preventDefault();
      clearSelection(true);
    }

    function handleBlur() {
      clearSelection(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);

      // Do not enqueue state updates while unmounting.
      clearSelection(false);
    };
  }, [enabled, viewport, clearSelection]);

  const onPointerDown = useCallback(
    (event) => {
      if (
        !enabled ||
        !viewport ||
        typeof onRegionSelected !== "function" ||
        !event.isPrimary ||
        event.button !== 0 ||
        activeRef.current
      ) {
        return;
      }

      const element = event.currentTarget;
      const bounds = readBounds(element);
      if (!bounds) return;

      // PageViewport.viewBox is the actual PDF page box, including crop origin.
      const pageBounds = normalizeRect(viewport.viewBox);

      const session = {
        element,
        pointerId: event.pointerId,
        viewport,
        pageBounds,
        startPdf: null,
      };

      session.startPdf = eventToPdf(event, session, bounds);

      try {
        // Future move/up events stay on this canvas outside its visible bounds.
        element.setPointerCapture(event.pointerId);
      } catch {
        // Do not start a drag that cannot be reliably completed or cancelled.
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      activeRef.current = session;
      setPreview({
        viewport,
        pdfRect: [...session.startPdf, ...session.startPdf],
      });
    },
    [enabled, viewport, onRegionSelected]
  );

  const onPointerMove = useCallback(
    (event) => {
      const session = activeRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      // Recover if a mouse release was missed outside the application window.
      if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
        clearSelection(true);
        return;
      }

      const bounds = readBounds(session.element);
      if (!bounds) {
        clearSelection(true);
        return;
      }

      const endPdf = eventToPdf(event, session, bounds);

      setPreview({
        viewport: session.viewport,
        pdfRect: normalizeRect([...session.startPdf, ...endPdf]),
      });
    },
    [clearSelection]
  );

  const onPointerUp = useCallback(
    (event) => {
      const session = activeRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      const bounds = readBounds(session.element);
      if (!bounds) {
        clearSelection(true);
        return;
      }

      // Reconvert pointerup itself; never trust the last pointermove position.
      // This calls clientPointToPdf and produces native PDF coordinates.
      const endPdf = eventToPdf(event, session, bounds);
      const pdfRect = normalizeRect([...session.startPdf, ...endPdf]);

      const projected = pdfRectToViewport(session.viewport, pdfRect);

      // Measure minimum drag size in actual displayed CSS pixels.
      const displayedWidth =
        projected.width * bounds.width / session.viewport.width;
      const displayedHeight =
        projected.height * bounds.height / session.viewport.height;

      const valid =
        pdfRect[2] > pdfRect[0] &&
        pdfRect[3] > pdfRect[1] &&
        displayedWidth >= minDragPixels &&
        displayedHeight >= minDragPixels;

      // Cleanup before invoking application code, even if that callback throws.
      clearSelection(true);

      if (
        valid &&
        enabled &&
        session.viewport === viewport &&
        typeof onRegionSelected === "function"
      ) {
        onRegionSelected(pdfRect);
      }
    },
    [
      enabled,
      viewport,
      onRegionSelected,
      minDragPixels,
      clearSelection,
    ]
  );

  const onPointerCancel = useCallback(
    (event) => {
      if (activeRef.current?.pointerId !== event.pointerId) return;

      event.stopPropagation();
      clearSelection(true);
    },
    [clearSelection]
  );

  const onLostPointerCapture = useCallback(
    (event) => {
      if (activeRef.current?.pointerId === event.pointerId) {
        clearSelection(true);
      }
    },
    [clearSelection]
  );

  const dragRect = useMemo(() => {
    if (!enabled || !preview || preview.viewport !== viewport) return null;
    return pdfRectToViewport(viewport, preview.pdfRect);
  }, [enabled, preview, viewport]);

  return {
    dragRect,
    isSelecting: dragRect !== null,
    cancelSelection,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
    },
  };
}
