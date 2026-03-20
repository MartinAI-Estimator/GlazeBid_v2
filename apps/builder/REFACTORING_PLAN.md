# PDFViewer Refactoring Plan

## Current Status: IN PROGRESS

### Problem Statement
- **4035-line monolithic component** - unmaintainable
- **Coordinate bugs impossible to isolate** - markups drift after 400% zoom
- **Can't add features without breaking existing code**
- **Upcoming features will make it worse:**
  - Keyboard shortcuts (Ctrl to snap anywhere)
  - Snap to lines between points
  - Smaller, more accurate snap boxes
  - Polygon drawing for highlights
  - Navigation toolbar
  - Page zoom flashing fix
  - ...and many more

### Solution: Modular Architecture
Break into **isolated, testable modules** where each feature lives in its own file.

---

## New Structure

```
frontend/src/components/PDFViewer/
├── index.jsx                        # Main orchestrator (~300 lines)
├── hooks/
│   ├── usePDFDocument.js            # PDF loading & page management
│   ├── useZoomPan.js                # Zoom/pan gestures with RAF
│   ├── useCanvasRenderer.js         # Canvas rendering logic
│   ├── useMarkupTools.js            # Markup drawing & editing
│   └── useSnapPoints.js             # Snap extraction & detection
├── utils/
│   ├── coordinates.js               # ✅ DONE - Transform functions
│   └── constants.js                 # ✅ DONE - Colors, config
└── components/
    ├── CanvasLayer.jsx              # Canvas wrapper
    └── MarkupOverlay.jsx            # SVG markup layer
```

---

## Progress Checklist

### Phase 1: Extract Utilities ✅ COMPLETE
- [x] Create directory structure
- [x] Extract `coordinates.js` - All coordinate transforms
- [x] Extract `constants.js` - All configuration constants

### Phase 2: Extract Custom Hooks 🔄 IN PROGRESS
- [ ] Create `usePDFDocument.js`
  - PDF loading logic
  - Page navigation
  - Rotation management
  - Page labels extraction
  
- [ ] Create `useZoomPan.js`
  - RAF-based smooth zoom
  - Pan gestures
  - transformRef management
  - Scale/pan state synchronization
  
- [ ] Create `useCanvasRenderer.js`
  - Full-page canvas rendering
  - ROI canvas rendering
  - renderScale management
  - Canvas dimensions state
  
- [ ] Create `useMarkupTools.js`
  - All markup drawing logic
  - Active/selected markup state
  - Drag tool state
  - Transform handles
  
- [ ] Create `useSnapPoints.js`
  - PDF vector extraction
  - Spatial hash grid
  - Snap detection
  - Grid snap logic

### Phase 3: Extract Components ⏳ PENDING
- [ ] Create `CanvasLayer.jsx`
  - Canvas wrapper with proper positioning
  - Base canvas element
  - ROI canvas element
  - Canvas styling with dynamic sizing
  
- [ ] Create `MarkupOverlay.jsx`
  - SVG overlay wrapper
  - Markup rendering
  - Snap point visualization
  - Calibration UI

### Phase 4: Create Main Orchestrator ⏳ PENDING
- [ ] Create `index.jsx`
  - Import all hooks
  - Import child components
  - Wire up props and callbacks
  - Handle tool palette integration

### Phase 5: Testing & Validation ⏳ PENDING
- [ ] Verify PDF loading works
- [ ] Test zoom/pan (should fix >400% drift!)
- [ ] Test markup drawing
- [ ] Test snap points
- [ ] Test all existing features
- [ ] Fix any regressions

### Phase 6: Add New Features (POST-REFACTOR) ⏳ PENDING
- [ ] Keyboard shortcuts module
- [ ] Snap to lines (not just points)
- [ ] Adjust snap box styling
- [ ] Polygon highlight mode
- [ ] Navigation toolbar
- [ ] Fix page zoom flashing
- [ ] ...more features isolated in their own modules

---

## Benefits of New Architecture

### 1. **Isolated Concerns**
- Each file 200-400 lines (readable)
- Changes in one module don't break others
- Coordinate bugs isolated to `coordinates.js`

### 2. **Testability**
- Pure functions easy to unit test
- Hooks can be tested independently
- Mock dependencies easily

### 3. **Debuggability**
- Know exactly where each feature lives
- Stack traces point to specific modules
- Console logs clearly labeled

### 4. **Feature Addition**
- Add keyboard shortcuts → `useKeyboardShortcuts.js`
- Add navigation bar → `NavigationBar.jsx`
- Add snap enhancements → modify `useSnapPoints.js` only

### 5. **Onboarding**
- New developers understand structure quickly
- Clear separation of concerns
- Self-documenting architecture

---

## Migration Strategy

1. **Keep old `PDFViewer.jsx` as backup** - Don't delete until refactor complete
2. **Extract one module at a time** - Test after each extraction
3. **Use feature flags** - Switch between old/new implementation
4. **Parallel development** - Old version stays functional during refactor
5. **Gradual cutover** - Move features incrementally

---

## Timeline Estimate

- **Phase 1 (Utils):** ✅ 30 minutes - COMPLETE
- **Phase 2 (Hooks):** 🔄 2-3 hours - IN PROGRESS
- **Phase 3 (Components):** ⏳ 1 hour
- **Phase 4 (Orchestrator):** ⏳ 1 hour
- **Phase 5 (Testing):** ⏳ 1-2 hours
- **Total:** ~6-8 hours for complete refactor

---

## Next Immediate Steps

1. Extract `usePDFDocument` hook (PDF loading logic)
2. Extract `useZoomPan` hook (RAF transform system)
3. Extract `useCanvasRenderer` hook (rendering logic)
4. Create `CanvasLayer` component
5. Create `MarkupOverlay` component
6. Wire everything together in `index.jsx`

---

## Notes

- Old `PDFViewer.jsx` remains at `components/PDFViewer.jsx` during migration
- New structure at `components/PDFViewer/` (directory)
- Once stable, old file becomes `PDFViewer.old.jsx` backup
- Import path stays same: `import PDFViewer from './components/PDFViewer'`
  (Node resolves to `PDFViewer/index.jsx` automatically)
