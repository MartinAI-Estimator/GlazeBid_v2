# ONNX Integration Guide — GlazeBid v2 Ghost Detector

## Overview

Three new files add ONNX model support to the Studio app's feature extraction pipeline. The Ghost Detector can now use a trained ONNX encoder to replace the canvas-native feature extractor, improving accuracy while remaining backward compatible.

## Files Created

### 1. `apps/studio/src/engine/onnxRuntime.ts` (6.3 KB)

**Responsibility:** ONNX model lifecycle and inference engine.

**Exports:**
- `loadOnnxModel(filePath, modelName?)` — Load a .onnx file from disk
- `unloadOnnxModel()` — Unload the current model
- `isOnnxLoaded()` — Check if a model is active
- `extractFeaturesONNX()` — Run inference on a 32×32 grayscale patch
- `subscribeOnnxStatus(callback)` — React to model state changes
- `getOnnxStatus()` — Synchronous status query

**Key Design:**
- Lazy imports `onnxruntime-web` (CDN-safe, no build-time dependency)
- Singleton session pattern — one model per window
- Observable status broadcast for React UI binding
- Graceful error handling: inference failures return `null` (triggering fallback)
- Electron IPC support for safe file I/O (`window.electron.readFile`)

**Input/Output Contract:**
- Input: Float32 grayscale 32×32 patch (0–1 range)
- Output: Float32Array, length 128 (L2-normalized)
- Model JSON metadata:
  ```json
  {
    "input": { "shape": [1, 1, 32, 32], "dtype": "float32" },
    "output": { "shape": [1, 128], "dtype": "float32" }
  }
  ```

### 2. `apps/studio/src/engine/parametric/featureExtract.ts` (Updated)

**Changes:**
- Added import: `import { isOnnxLoaded, extractFeaturesONNX } from '../onnxRuntime'`
- Added async wrapper: `export async function extractFeatures(...)`

**New Function:**
```typescript
export async function extractFeatures(
  data: Uint8ClampedArray,
  bw: number, bh: number,
  bufX: number, bufY: number, bufW: number, bufH: number,
): Promise<FeatureVector | null>
```

**Behavior:**
1. If `isOnnxLoaded()`, try ONNX inference
2. If ONNX returns a feature vector, return it immediately
3. Otherwise, fall back to `extractFeaturesFromBuffer()` (sync canvas-native)

**Backward Compatibility:**
- Original `extractFeaturesFromBuffer()` is unchanged
- Existing code can keep calling it directly
- New async code can call `extractFeatures()` for ONNX support

### 3. `apps/studio/src/components/AIModelPanel.tsx` (3.5 KB)

**Responsibility:** React UI panel for model management.

**Features:**
- Status badge (Canvas Native / Loading / ONNX Active)
- Load button with Electron file dialog
- Unload button (when model is loaded)
- Error display
- Help text

**Integration:**
Place in any sidebar or settings panel:
```typescript
import AIModelPanel from './components/AIModelPanel';

export function SideNav() {
  return (
    <div>
      <AIModelPanel />
      {/* other controls */}
    </div>
  );
}
```

**Styling:**
- Dark mode color scheme (`#111113` background, `#e4e4e7` text)
- Matches GlazeBid design system
- No external CSS dependencies

---

## Integration Workflow

### For the Ghost Detector Scanner

In `engine/ghostDetector.ts` (or wherever feature extraction is called):

**Before (canvas-native only):**
```typescript
const features = extractFeaturesFromBuffer(imageData, bw, bh, bufX, bufY, bufW, bufH);
```

**After (ONNX-aware):**
```typescript
// In an async scanning loop:
const features = await extractFeatures(imageData, bw, bh, bufX, bufY, bufW, bufH);
```

### For the SessionLearner

No changes needed. Both `extractFeaturesFromBuffer()` and `extractFeaturesONNX()` produce L2-normalized 128D vectors, so `cosineSimilarity()` works identically.

---

## Electron IPC Additions

The AIModelPanel uses `window.electron.openFileDialog()`. If this method doesn't exist on your preload, add it to `apps/studio/src/preload/index.ts`:

```typescript
openFileDialog: (options: { filters?: any[]; title?: string }) =>
  ipcRenderer.invoke('dialog:openFile', options),
```

Then in `electron/main.ts`:
```typescript
ipcMain.handle('dialog:openFile', async (event, options) => {
  return dialog.showOpenDialog(studioWindow!, options);
});
```

---

## Deployment Checklist

- [ ] Run `npm run dev:builder` and load AIModelPanel in sidebar
- [ ] Test "Load .onnx Model" button (no model file yet is OK)
- [ ] Verify fallback to canvas-native when no model is loaded
- [ ] Distribute a sample `.onnx` model file with release
- [ ] Update project docs with model format specification
- [ ] Add `onnxruntime-web` to `package.json` dependencies

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "onnxruntime-web is not installed" | Run `npm install onnxruntime-web` in workspace root |
| Model loads but feature vectors are NaN | Check model output shape is exactly [1, 128] and data is Float32 |
| Feature extraction very slow | ONNX-web uses CPU only; GPU support requires `onnxruntime-web` with `webgpu` provider |
| Model doesn't load from dialog | Ensure Electron preload has `openFileDialog` IPC method |
| TypeScript `tsc --noEmit` fails | Run `npm install` to sync node_modules |

---

## Future Enhancements

1. **Model versioning:** Embed model format version in .onnx metadata
2. **Performance metrics:** Log feature extraction time (ONNX vs canvas-native)
3. **Model training pipeline:** Accept `.npy` training snapshots → ONNX export
4. **Caching:** Memoize inference on repeated patches
5. **GPU acceleration:** Add `webgpu` provider option for faster inference
