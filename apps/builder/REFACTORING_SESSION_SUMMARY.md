# PDFViewer Refactoring - Session Summary

## Completed Work (Phase 1 & Partial Phase 2)

### Phase 1: Utilities ✅ COMPLETE
1. **coordinates.js** (142 lines)
   - `screenToPDF()` - Convert mouse clicks to PDF coordinates
   - `pdfToScreen()` - Convert PDF coords to screen (identity in current architecture)
   - `pdfToViewportCoord()` - Handle rotation transforms
   - `calculateCanvasDisplaySize()` - Dynamic canvas sizing

2. **constants.js** (171 lines)
   - All zoom/pan configuration
   - Snap point configuration
   - Glazing class colors
   - Keyboard shortcuts
   - API endpoints
   - Error/success messages

### Phase 2: Custom Hooks 🔄 60% COMPLETE

✅ **COMPLETED HOOKS:**

1. **usePDFDocument.js** (283 lines)
   - PDF loading from backend
   - Page navigation (goToPage, rotatePage)
   - Page label extraction via OCR
   - Auto-fit calculation
   - Loading progress tracking

2. **useZoomPan.js** (267 lines)
   - RAF-based smooth zoom (60fps)
   - Mouse wheel zoom with zoom-to-mouse
   - Pan gestures (drag)
   - Zoom controls (zoomIn, zoomOut, zoomFit)
   - Keyboard shortcuts (Space, +/-, 0)
   - transformRef for live values
   - React state sync after 300ms debounce

3. **useCanvasRenderer.js** (271 lines)
   - Full-page canvas rendering
   - ROI (Region of Interest) rendering for high zoom
   - Progressive rendering quality
   - Canvas dimensions state management
   - Render task cancellation
   - Automatic mode switching at zoom threshold

⏳ **REMAINING HOOKS** (to be completed):

4. **useSnapPoints.js** (~600 lines estimated)
   - PDF vector extraction from page operations
   - Spatial hash grid for O(1) snap lookup
   - Snap detection with priority system
   - Grid snap mode
   - Snap point visualization
   - Filter logic (3% threshold for structural lines)

5. **useMarkupTools.js** (~500 lines estimated)
   - All markup drawing logic (Area, Polyline, Count, Highlight)
   - Active/selected markup state
   - Drag tool state for rectangles
   - Transform handles (move, resize, rotate)
   - Context menu logic
   - Copy/paste clipboard
   - Custom markup types

---

## Phase 3-5: Next Steps ⏳ PENDING

### Phase 3: Extract Components
- **CanvasLayer.jsx** - Canvas wrapper with dynamic sizing
- **MarkupOverlay.jsx** - SVG overlay with markups

### Phase 4: Main Orchestrator
- **index.jsx** - Wire all hooks together, integrate with ToolPalette

### Phase 5: Testing
- Verify all features work
- Fix any regressions
- Test at all zoom levels (especially >400%)

---

## Architecture Benefits Already Achieved

### 1. Isolated Coordinate Logic
- All transforms in `coordinates.js`
- Easy to debug coordinate issues
- **Should fix the >400% zoom drift bug!**

### 2. Clean Configuration
- All magic numbers in `constants.js`
- Easy to adjust snap thresholds, zoom limits, etc.

### 3. Modular Hooks
- Each hook 200-300 lines (readable!)
- Clear responsibilities
- Can be tested independently

### 4. Future Features Isolated
When adding new features, each goes in its own module:
- Keyboard shortcuts → New hook `useKeyboardShortcuts.js`
- Snap to lines → Enhance `useSnapPoints.js` only
- Navigation bar → New component `NavigationBar.jsx`
- Polygon highlights → Enhance `useMarkupTools.js` only

---

## How to Complete the Refactoring

### Option 1: Continue Extracting (Recommended)
1. Extract `useSnapPoints.js` (~1 hour)
2. Extract `useMarkupTools.js` (~1.5 hours)
3. Create `CanvasLayer.jsx` (~30 min)
4. Create `MarkupOverlay.jsx` (~30 min)
5. Create `index.jsx` to wire everything (~1 hour)
6. Test thoroughly (~1-2 hours)
**Total:** ~5-6 hours remaining

### Option 2: Hybrid Approach (Faster)
1. Keep remaining logic in main component for now
2. Use extracted hooks immediately
3. Extract snap/markup hooks incrementally later
**Benefit:** Get coordinate fixes NOW, continue refactoring later

---

## Migration Path

### Using Extracted Hooks in Current PDFViewer.jsx

The current monolithic `PDFViewer.jsx` can start using the extracted hooks:

```javascript
import { usePDFDocument } from './PDFViewer/hooks/usePDFDocument';
import { useZoomPan } from './PDFViewer/hooks/useZoomPan';
import { useCanvasRenderer } from './PDFViewer/hooks/useCanvasRenderer';
import { screenToPDF, pdfToScreen } from './PDFViewer/utils/coordinates';
import { ZOOM_CONFIG, SNAP_CONFIG } from './PDFViewer/utils/constants';

function PDFViewer({ project, sheetId, ... }) {
  // Replace existing PDF loading logic
  const pdfState = usePDFDocument({
    project,
    sheetId,
    containerRef,
    onPageInfoChange,
    onRotationChange: (r) => {
      // Handle rotation changes
    }
  });

  // Replace existing zoom/pan logic
  const zoomPanState = useZoomPan({
    containerRef,
    canvasWrapperRef,
    overlayWrapperRef,
    currentPage: pdfState.currentPage,
    rotation: pdfState.rotation,
    currentMode
  });

  // Replace existing rendering logic
  const renderState = useCanvasRenderer({
    currentPage: pdfState.currentPage,
    rotation: pdfState.rotation,
    scale: zoomPanState.scale,
    pan: zoomPanState.pan,
    canvasRef,
    roiCanvasRef,
    containerRef,
    transformRef: zoomPanState.transformRef,
    renderTaskRef: pdfState.renderTaskRef
  });

  // Use extracted coordinate functions
  const handleMouseClick = (e) => {
    const pdfCoords = screenToPDF(e.clientX, e.clientY, {
      currentPage: pdfState.currentPage,
      containerRef: containerRef.current,
      rotation: pdfState.rotation,
      transformRef: zoomPanState.transformRef
    });
    // ... rest of click handling
  };

  // ... rest of component (snap, markup logic stays for now)
}
```

This lets you **get the coordinate fixes immediately** without completing the full refactor!

---

## Critical Fix: >400% Zoom Drift

The coordinate logic is now in `coordinates.js`. The issue was likely:

1. **Canvas bitmap vs display size mismatch** - Fixed by `calculateCanvasDisplaySize()`
2. **Margin calculation using different source** - Now both use same displayWidth/Height
3. **React state lag during RAF gestures** - Now uses transformRef.current consistently

**Test this fix:**
1. Use extracted hooks in current PDFViewer
2. Draw markups
3. Zoom to 1000%
4. Markups should stay locked!

---

## Estimated Completion Time

- **Completed:** ~3 hours (Phase 1 + 60% of Phase 2)
- **Remaining:** ~5-6 hours (40% Phase 2 + Phases 3-5)
- **Total:** ~8-9 hours for full refactor

**OR** use hybrid approach and get benefits immediately while continuing refactor incrementally.

---

## Recommendation

### Short Term (NOW):
1. Test extracted hooks with current PDFViewer
2. Verify >400% zoom drift is fixed
3. If fixed, great! Continue with features.

### Long Term (Next Session):
1. Extract remaining hooks when time allows
2. Each feature addition should go in appropriate module
3. Keep refactoring momentum to prevent regression to monolith

The architecture foundation is solid. You can now add keyboard shortcuts, snap enhancements, navigation toolbar, etc. in isolated modules without breaking existing code!
