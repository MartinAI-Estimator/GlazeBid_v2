import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, Download, Maximize2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Document Viewer
 * 
 * Simple Adobe-style PDF reader for specifications and text documents.
 * No markup tools - just reading, navigation, zoom, and search.
 */
const DocumentViewer = ({ 
  project, 
  documentPath,
  documentName,
  onClose 
}) => {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Load PDF document
  useEffect(() => {
    if (!documentPath) return;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build URL — only http/https URLs are supported in offline/Electron mode.
        let pdfUrl;
        if (documentPath.startsWith('http')) {
          pdfUrl = documentPath;
        } else {
          setError('Document not available in offline mode. Re-import the file to view it.');
          setLoading(false);
          return;
        }

        console.log('Loading document:', pdfUrl);
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
        
        console.log(`Document loaded: ${pdf.numPages} pages`);
      } catch (err) {
        console.error('Failed to load document:', err);
        setError(`Failed to load document: ${err.message}`);
        setLoading(false);
      }
    };

    loadPdf();
  }, [documentPath, project]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        // Display at logical (CSS) pixel size so physical pixels match the screen
        canvas.style.width  = `${viewport.width  / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
      } catch (err) {
        console.error('Failed to render page:', err);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, scale]);

  const goToNextPage = useCallback(() => {
    if (currentPage < numPages) {
      setCurrentPage(currentPage + 1);
    }
  }, [currentPage, numPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      } else if (e.key === 'Home') {
        setCurrentPage(1);
      } else if (e.key === 'End') {
        setCurrentPage(numPages);
      } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, goToNextPage, goToPrevPage]);

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.25, 0.5));
  };

  const handleFitWidth = () => {
    if (containerRef.current && pdfDoc) {
      // Calculate scale to fit width
      const containerWidth = containerRef.current.clientWidth - 40; // padding
      pdfDoc.getPage(currentPage).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const newScale = containerWidth / viewport.width;
        setScale(Math.min(newScale, 2.0));
      });
    }
  };

  const handlePageInput = (e) => {
    const pageNum = parseInt(e.target.value);
    if (pageNum >= 1 && pageNum <= numPages) {
      setCurrentPage(pageNum);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p>Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>❌ {error}</p>
          <button onClick={onClose} style={styles.closeButton}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {/* Back to Project Home button */}
          <button onClick={onClose} style={styles.backButton}>
            <ChevronLeft size={16} />
            <span>Project Home</span>
          </button>
          <div style={styles.divider} />
          <span style={styles.docName}>{documentName || 'Document'}</span>
        </div>
        
        <div style={styles.toolbarCenter}>
          {/* Page Navigation */}
          <button 
            onClick={goToPrevPage} 
            disabled={currentPage <= 1}
            style={styles.navButton}
          >
            <ChevronLeft size={20} />
          </button>
          
          <div style={styles.pageInfo}>
            <input
              type="number"
              value={currentPage}
              onChange={handlePageInput}
              style={styles.pageInput}
              min={1}
              max={numPages}
            />
            <span style={styles.pageCount}>/ {numPages}</span>
          </div>
          
          <button 
            onClick={goToNextPage} 
            disabled={currentPage >= numPages}
            style={styles.navButton}
          >
            <ChevronRight size={20} />
          </button>
          
          <div style={styles.divider} />
          
          {/* Zoom Controls */}
          <button onClick={handleZoomOut} style={styles.toolButton} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <span style={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
          <button onClick={handleZoomIn} style={styles.toolButton} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleFitWidth} style={styles.toolButton} title="Fit Width">
            <Maximize2 size={18} />
          </button>
          
          <div style={styles.divider} />
          
          {/* Search */}
          <button 
            onClick={() => setShowSearch(!showSearch)} 
            style={{...styles.toolButton, backgroundColor: showSearch ? '#007BFF' : 'transparent'}}
            title="Search (Ctrl+F)"
          >
            <Search size={18} />
          </button>
        </div>
        
        <div style={styles.toolbarRight}>
          {/* Space for future actions like Download */}
        </div>
      </div>
      
      {/* Search Bar */}
      {showSearch && (
        <div style={styles.searchBar}>
          <input
            type="text"
            placeholder="Search in document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
            autoFocus
          />
          <span style={styles.searchHint}>Press Escape to close</span>
        </div>
      )}
      
      {/* Document Canvas */}
      <div ref={containerRef} style={styles.canvasContainer}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
    </div>
  );
};

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1f26',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: '#0b0e11',
    borderBottom: '1px solid #2d333b',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    justifyContent: 'flex-end',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    color: '#9ca3af',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  docName: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '300px',
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#9ca3af',
  },
  pageInput: {
    width: '50px',
    padding: '4px 8px',
    backgroundColor: '#1a1f26',
    border: '1px solid #2d333b',
    borderRadius: '4px',
    color: '#fff',
    textAlign: 'center',
    fontSize: '14px',
  },
  pageCount: {
    fontSize: '14px',
  },
  toolButton: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  zoomLevel: {
    color: '#9ca3af',
    fontSize: '12px',
    minWidth: '45px',
    textAlign: 'center',
  },
  divider: {
    width: '1px',
    height: '20px',
    backgroundColor: '#2d333b',
    margin: '0 8px',
  },
  closeButton: {
    background: 'transparent',
    border: '1px solid #2d333b',
    color: '#9ca3af',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: '#161b22',
    borderBottom: '1px solid #2d333b',
  },
  searchInput: {
    flex: 1,
    maxWidth: '400px',
    padding: '8px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
  },
  searchHint: {
    color: '#6b7280',
    fontSize: '12px',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
    backgroundColor: '#2d333b',
  },
  canvas: {
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  loading: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #2d333b',
    borderTop: '3px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  error: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef4444',
    gap: '16px',
  },
};

export default DocumentViewer;
