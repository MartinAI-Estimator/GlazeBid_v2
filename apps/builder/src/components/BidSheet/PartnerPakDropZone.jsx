import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

const PartnerPakDropZone = ({ onImportComplete, projectName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFile, setLoadingFile] = useState('');
  const [error, setError] = useState(null);

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    // If dropzone rejected all files (MIME mismatch), still try the first one
    const file = acceptedFiles[0] || fileRejections?.[0]?.file;
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xls', 'xlsx'].includes(ext)) {
      setError(`Unsupported file type ".${ext}". Please upload a PartnerPak CSV, XLS, or XLSX export.`);
      return;
    }

    setIsLoading(true);
    setLoadingFile(file.name);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const safeName = encodeURIComponent(projectName || 'unknown');
    fetch(`/api/bidsheet/projects/${safeName}/smart-import`, {
      method: 'POST',
      body: formData
    })
    .then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })))
    .then(({ ok, status, data }) => {
      if (ok && data.success) {
        // Debug: confirm bays/dlos are arriving from backend
        console.log('[PartnerPak] col_map detected:', data._debug_col_map);
        const sample = data.systems?.[0]?.frames?.[0];
        console.log('[PartnerPak] first frame sample:', sample);
        onImportComplete(data.systems);
      } else {
        const msg = data.detail || data.error || `Import failed (HTTP ${status}). Check your file format.`;
        setError(msg);
        setIsLoading(false);
      }
    })
    .catch(err => {
      console.error('Upload error:', err);
      setError('Network error — could not reach the server. Make sure the backend is running.');
      setIsLoading(false);
    });
  }, [onImportComplete, projectName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept all common Excel/CSV MIME types — some browsers/OS send non-standard ones
    accept: {
      'text/csv':                   ['.csv'],
      'application/vnd.ms-excel':   ['.xls'],
      'application/excel':          ['.xls'],
      'application/x-excel':        ['.xls'],
      'application/x-msexcel':      ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/octet-stream':   ['.xls', '.xlsx'],
    },
    maxFiles: 1,
    disabled: isLoading,
    // Validate by extension as fallback so MIME-type mismatches don't silently block the drop
    validator: (file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['csv', 'xls', 'xlsx'].includes(ext)) {
        return { code: 'bad-extension', message: `File must be CSV, XLS, or XLSX` };
      }
      return null;
    },
  });

  // --- LOADING STATE ---
  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)', padding: '4rem' }}>
        <div style={{ textAlign: 'center' }}>
          {/* Spinner */}
          <div style={{ width: 56, height: 56, border: '4px solid var(--border-subtle)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.5rem' }} />
          <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>
            Building Your Visual Layouts...
          </p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{loadingFile}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Parsing data, auto-detecting systems, and calculating all frames.
          </p>
          {/* Progress tags */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Parsing CSV', 'Detecting Systems', 'Calculating Frames', 'Building Canvas'].map((step, i) => (
              <span key={i} style={{ padding: '4px 12px', background: 'rgba(0,123,255,0.15)', color: '#60a5fa', fontSize: '0.75rem', fontWeight: 600, borderRadius: '999px', border: '1px solid rgba(0,123,255,0.3)', animationDelay: `${i * 0.2}s` }} className="animate-pulse">
                {step}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- ERROR STATE ---
  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)', padding: '4rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>Import Failed</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
          <button
            onClick={() => setError(null)}
            style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- DEFAULT / DRAG-ACTIVE STATE ---
  return (
    <div
      {...getRootProps()}
      style={{
        width: '100%',
        height: '100%',
        padding: '1.1rem',
        border: isDragActive ? '2px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
        borderRadius: '16px',
        background: isDragActive ? 'rgba(0,123,255,0.06)' : 'var(--bg-card)',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        transform: isDragActive ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isDragActive ? '0 4px 24px rgba(0,123,255,0.15)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <input {...getInputProps()} />
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
      {isDragActive ? (
        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-blue)', margin: 0 }}>
          Drop to build systems...
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.3rem' }}>
            PartnerPak Import
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.9rem' }}>
            CSV or Excel files accepted — auto-generates your visual layouts.
          </p>
          <button style={{
            padding: '7px 18px',
            background: 'var(--accent-blue)',
            color: '#fff',
            fontWeight: 600,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}>
            Browse or Drop File
          </button>
        </>
      )}
    </div>
  );
};

export default PartnerPakDropZone;
