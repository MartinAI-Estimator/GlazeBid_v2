/**
 * onnxRuntime.ts — ONNX model wrapper for the Ghost Detector feature encoder.
 *
 * Loads a .onnx model file from disk (via Electron file dialog or file path)
 * and runs inference to produce 128D feature vectors from canvas ImageData patches.
 *
 * The model is expected to:
 *   Input:  "input"  — Float32, shape [1, 1, 32, 32]  (grayscale 32×32 patch)
 *   Output: "output" — Float32, shape [1, 128]         (L2-normalised embedding)
 *
 * Falls back transparently to canvas-native extraction if no model is loaded.
 */

import type { FeatureVector } from './parametric/featureExtract';

// ── State ─────────────────────────────────────────────────────────────────────

/** Singleton InferenceSession — null until a model is loaded. */
let _session: OnnxSession | null = null;
let _modelPath: string | null = null;
let _modelName: string | null = null;
let _isLoading = false;

/** Minimal type for onnxruntime-web InferenceSession (lazy import). */
type OnnxSession = {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
};
type OnnxTensor = {
  data: Float32Array;
};

// ── Status observable ─────────────────────────────────────────────────────────

type OnnxStatus = {
  loaded: boolean;
  modelName: string | null;
  modelPath: string | null;
  isLoading: boolean;
  error: string | null;
};

let _status: OnnxStatus = { loaded: false, modelName: null, modelPath: null, isLoading: false, error: null };
const _listeners = new Set<(s: OnnxStatus) => void>();

function notifyListeners(): void {
  _listeners.forEach(fn => fn({ ..._status }));
}

export function subscribeOnnxStatus(fn: (s: OnnxStatus) => void): () => void {
  _listeners.add(fn);
  fn({ ..._status });
  return () => _listeners.delete(fn);
}

export function getOnnxStatus(): OnnxStatus {
  return { ..._status };
}

// ── Model lifecycle ───────────────────────────────────────────────────────────

/**
 * Load an ONNX model from a file path.
 * Uses dynamic import of onnxruntime-web (CDN-safe, tree-shakeable).
 */
export async function loadOnnxModel(filePath: string, modelName?: string): Promise<void> {
  if (_isLoading) return;
  _isLoading = true;
  _status = { ..._status, isLoading: true, error: null };
  notifyListeners();

  try {
    // Dynamic import — onnxruntime-web may not be installed; handle gracefully
    // Use a variable to prevent Vite's static import analysis from failing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ortPkg = 'onnxruntime-web';
    const ort = await import(/* @vite-ignore */ ortPkg as any).catch(() => null);
    if (!ort) {
      throw new Error('onnxruntime-web is not installed. Run: npm install onnxruntime-web');
    }

    // Read model bytes via Electron IPC (file is on local disk)
    let modelBuffer: ArrayBufferLike;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).electron?.readFile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bytes: Uint8Array = await (window as any).electron.readFile(filePath);
      modelBuffer = bytes.buffer;
    } else {
      // Fallback: fetch from file:// URL (won't work in all contexts)
      const res = await fetch(`file://${filePath}`);
      modelBuffer = await res.arrayBuffer();
    }

    _session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }) as OnnxSession;

    _modelPath = filePath;
    _modelName = modelName ?? filePath.split(/[\\/]/).pop() ?? 'model.onnx';
    _status = { loaded: true, modelName: _modelName, modelPath: _modelPath, isLoading: false, error: null };
  } catch (err) {
    _session = null;
    _status = { loaded: false, modelName: null, modelPath: null, isLoading: false, error: String(err) };
  } finally {
    _isLoading = false;
    notifyListeners();
  }
}

export function unloadOnnxModel(): void {
  _session = null;
  _modelPath = null;
  _modelName = null;
  _status = { loaded: false, modelName: null, modelPath: null, isLoading: false, error: null };
  notifyListeners();
}

export function isOnnxLoaded(): boolean {
  return _session !== null;
}

// ── Inference ─────────────────────────────────────────────────────────────────

/**
 * Extract a 128D feature vector using the loaded ONNX model.
 *
 * Extracts a 32×32 grayscale patch from the canvas buffer region,
 * runs it through the ONNX session, and returns the 128D output.
 *
 * Returns null if no model is loaded (caller falls back to canvas-native).
 */
export async function extractFeaturesONNX(
  data: Uint8ClampedArray,
  bw: number,
  bh: number,
  bufX: number,
  bufY: number,
  bufW: number,
  bufH: number,
): Promise<FeatureVector | null> {
  if (!_session) return null;

  try {
    // Build 32×32 grayscale patch
    const patch = new Float32Array(32 * 32);
    const xScale = bufW / 32;
    const yScale = bufH / 32;

    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 32; col++) {
        const px = Math.round(bufX + (col + 0.5) * xScale);
        const py = Math.round(bufY + (row + 0.5) * yScale);
        const cx = Math.max(0, Math.min(bw - 1, px));
        const cy = Math.max(0, Math.min(bh - 1, py));
        const i = (cy * bw + cx) * 4;
        // BT.601 luminance, normalised 0–1
        patch[row * 32 + col] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      }
    }

    // Run ONNX inference — session.run expects named tensor feeds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ortPkg2 = 'onnxruntime-web';
    const ort = await import(/* @vite-ignore */ ortPkg2 as any);
    const inputTensor = new ort.Tensor('float32', patch, [1, 1, 32, 32]);
    const results = await _session.run({ input: inputTensor });
    const output = results['output']?.data as Float32Array | undefined;
    if (!output || output.length !== 128) return null;

    return output as FeatureVector;
  } catch {
    return null;
  }
}
