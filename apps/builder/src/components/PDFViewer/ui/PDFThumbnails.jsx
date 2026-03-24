import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page } from 'react-pdf';

const PDFThumbnails = ({ file, numPages, currentPage, onPageClick, project, sheetName }) => {
  const [contextMenu, setContextMenu] = useState(null);
  const [rfqList, setRfqList] = useState([]);
  const [showNameInput, setShowNameInput] = useState(null); // { pageNum } when showing input
  const [rfqName, setRfqName] = useState('');
  const nameInputRef = useRef(null);

  // Load RFQs for context menu
  useEffect(() => {
    if (project) {
      loadRfqs();
    }
  }, [project]);

  // Focus input when it appears
  useEffect(() => {
    if (showNameInput && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showNameInput]);

  const loadRfqs = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/projects/${encodeURIComponent(project)}`
      );
      if (response.ok) {
        const data = await response.json();
        setRfqList(data.rfqs || []);
      }
    } catch (err) {
      console.error('Failed to load RFQs:', err);
    }
  };

  const handleContextMenu = useCallback((e, pageNum) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      pageNum
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setShowNameInput(null);
    setRfqName('');
  }, []);

  const handleCreateRfqClick = (pageNum) => {
    if (!project) {
      alert('No project selected. Please open a project first.');
      closeContextMenu();
      return;
    }
    // Show inline input instead of prompt
    setShowNameInput({ pageNum });
  };

  const submitNewRfq = async () => {
    if (!rfqName.trim()) {
      return;
    }

    const pageNum = showNameInput?.pageNum;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/projects/${encodeURIComponent(project)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rfqName.trim(),
            status: 'draft',
            createdAt: new Date().toISOString(),
            attachments: [{
              sheet: sheetName || 'drawing',
              page: pageNum,
              sheetName: sheetName
            }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRfqList([...rfqList, data.rfq]);
        alert(`RFQ "${rfqName}" created with a reference to page ${pageNum}.\nThe original drawing remains in your drawing set.`);
      } else {
        const errorData = await response.text();
        console.error('Create RFQ failed:', response.status, errorData);
        alert(`Failed to create RFQ: ${response.status}`);
      }
    } catch (err) {
      console.error('Failed to create RFQ:', err);
      alert('Failed to create RFQ: ' + err.message);
    }
    closeContextMenu();
  };

  const handleAddToRfq = async (rfqId, pageNum) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/${rfqId}/attachments?project=${encodeURIComponent(project)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheet: sheetName || 'drawing',
            page: pageNum,
            sheetName: sheetName
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success === false) {
          alert(data.message || 'Already attached');
        } else {
          alert(`Page ${pageNum} linked to RFQ.\nOriginal drawing unchanged.`);
        }
      }
    } catch (err) {
      console.error('Failed to add to RFQ:', err);
      alert('Failed to add page to RFQ');
    }
    closeContextMenu();
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu, closeContextMenu]);

  return (
    <div style={{ width: '200px', background: '#333', borderRight: '1px solid #444', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
      <Document file={file}>
        {Array.from(new Array(numPages), (el, index) => (
          <div 
            key={`thumb_${index + 1}`}
            onClick={() => {
              console.log('Thumbnail clicked:', index + 1);
              onPageClick(index + 1);
            }}
            onContextMenu={(e) => handleContextMenu(e, index + 1)}
            style={{ 
              marginBottom: '15px', 
              cursor: 'pointer',
              border: currentPage === index + 1 ? '2px solid #3b82f6' : '2px solid transparent',
              opacity: currentPage === index + 1 ? 1 : 0.7,
              position: 'relative',
              pointerEvents: 'auto'
            }}
          >
            <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <Page pageNumber={index + 1} width={160} renderTextLayer={false} renderAnnotationLayer={false} />
              <div style={{ textAlign: 'center', color: '#fff', fontSize: '11px', marginTop: '4px' }}>{index + 1}</div>
            </div>
          </div>
        ))}
      </Document>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 10000,
            minWidth: '180px',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '8px 12px',
              color: '#94a3b8',
              fontSize: '11px',
              borderBottom: '1px solid #334155',
              fontWeight: 500
            }}
          >
            Page {contextMenu.pageNum}
          </div>
          
          {/* Name Input Form */}
          {showNameInput ? (
            <div style={{ padding: '12px', borderBottom: '1px solid #334155' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                Enter RFQ name:
              </div>
              <input
                ref={nameInputRef}
                type="text"
                value={rfqName}
                onChange={(e) => setRfqName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNewRfq();
                  } else if (e.key === 'Escape') {
                    closeContextMenu();
                  }
                }}
                placeholder="e.g., Custom Canopy"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  marginBottom: '8px',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={closeContextMenu}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: '#334155',
                    color: '#e2e8f0',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitNewRfq}
                  disabled={!rfqName.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: rfqName.trim() ? '#3b82f6' : '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: rfqName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px'
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            /* Create New RFQ Button */
            <div
              style={{
                padding: '10px 12px',
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: rfqList.length > 0 ? '1px solid #334155' : 'none',
                background: 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={(e) => {
                e.stopPropagation();
                handleCreateRfqClick(contextMenu.pageNum);
              }}
            >
              <span style={{ pointerEvents: 'none' }}>➕</span>
              <span style={{ pointerEvents: 'none' }}>Create New RFQ</span>
            </div>
          )}

          {/* Existing RFQs - only show when not entering name */}
          {!showNameInput && rfqList.length > 0 && (
            <>
              <div
                style={{
                  padding: '6px 12px',
                  color: '#64748b',
                  fontSize: '10px',
                  background: '#0f172a'
                }}
              >
                Link to existing RFQ:
              </div>
              {rfqList.map(rfq => (
                <div
                  key={rfq.id}
                  style={{
                    padding: '10px 12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToRfq(rfq.id, contextMenu.pageNum);
                  }}
                >
                  <span style={{ pointerEvents: 'none' }}>📋</span>
                  <span style={{ pointerEvents: 'none' }}>{rfq.name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PDFThumbnails;
