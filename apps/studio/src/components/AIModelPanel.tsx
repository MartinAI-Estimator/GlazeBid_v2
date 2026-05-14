/**
 * AIModelPanel.tsx — ONNX model management UI for Ghost Detector.
 *
 * Shows current model status and provides load/unload controls.
 * Typically rendered as a collapsible panel in the Studio sidebar.
 */

import React, { useState, useEffect } from 'react';
import { loadOnnxModel, unloadOnnxModel, subscribeOnnxStatus, getOnnxStatus } from '../engine/onnxRuntime';

type OnnxStatus = ReturnType<typeof getOnnxStatus>;

const AIModelPanel: React.FC = () => {
  const [status, setStatus] = useState<OnnxStatus>(getOnnxStatus());

  useEffect(() => {
    return subscribeOnnxStatus(setStatus);
  }, []);

  const handleLoadModel = async () => {
    // Use Electron file dialog via IPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).electron?.openFileDialog) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (window as any).electron.openFileDialog({
        filters: [{ name: 'ONNX Models', extensions: ['onnx'] }],
        title: 'Select ONNX Feature Encoder Model',
      });
      if (result && !result.canceled && result.filePaths[0]) {
        await loadOnnxModel(result.filePaths[0]);
      }
    } else {
      // Fallback: prompt for path
      const path = window.prompt('Enter path to .onnx model file:');
      if (path) await loadOnnxModel(path);
    }
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 12, color: '#e4e4e7' }}>AI Model</span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            background: status.loaded ? '#052e16' : '#27272a',
            color: status.loaded ? '#10b981' : '#71717a',
          }}
        >
          {status.isLoading ? 'Loading…' : status.loaded ? 'ONNX Active' : 'Canvas Native'}
        </span>
      </div>

      {status.loaded && (
        <div style={{ fontSize: 11, color: '#10b981', marginBottom: 8 }}>
          ✓ {status.modelName}
        </div>
      )}

      {status.error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>
          Error: {status.error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleLoadModel}
          disabled={status.isLoading}
          style={btnStyle('#0ea5e9')}
        >
          {status.isLoading ? 'Loading…' : 'Load .onnx Model'}
        </button>
        {status.loaded && (
          <button onClick={unloadOnnxModel} style={btnStyle('#ef4444')}>
            Unload
          </button>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#52525b', lineHeight: 1.5 }}>
        {status.loaded
          ? 'Ghost Detector is using the ONNX encoder. Unload to revert to canvas-native.'
          : 'Load a trained .onnx encoder to improve Ghost Detector accuracy.'}
      </div>
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: '#111113',
  border: '1px solid #27272a',
  borderRadius: 6,
  marginBottom: 8,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const btnStyle = (color: string): React.CSSProperties => ({
  fontSize: 11,
  padding: '4px 10px',
  borderRadius: 4,
  border: 'none',
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 500,
});

export default AIModelPanel;
