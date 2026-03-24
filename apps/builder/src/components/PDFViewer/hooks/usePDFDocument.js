import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * usePDFDocument - Manages PDF loading, page navigation, and metadata
 * 
 * Responsibilities:
 * - Load PDF document from backend
 * - Navigate between pages
 * - Extract page labels via OCR
 * - Manage rotation state
 * - Auto-fit viewport on load
 * 
 * @param {Object} params
 * @param {string} params.project - Project identifier
 * @param {string} params.sheetId - Sheet identifier  
 * @param {Object} params.containerRef - Ref to container element for auto-fit
 * @param {Function} params.onPageInfoChange - Callback when page changes
 * @param {Function} params.onRotationChange - Callback when rotation changes
 * @returns {Object} PDF document state and controls
 */
export function usePDFDocument({ 
  project, 
  sheetId, 
  containerRef,
  onPageInfoChange,
  onRotationChange
}) {
  // PDF document state
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [rotation, setRotation] = useState(0);
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  
  // Page labels (extracted via OCR)
  const [pageLabels, setPageLabels] = useState({});
  const [isExtractingLabel, setIsExtractingLabel] = useState(false);
  
  // Refs
  const renderTaskRef = useRef(null);
  
  /**
   * Extract page label via backend OCR
   */
  const extractPageLabel = async (projectId, sheetId, pageNumber) => {
    try {
      setIsExtractingLabel(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/extract-label?project=${projectId}&sheet=${sheetId}&page=${pageNumber}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const label = data.label || `Page ${pageNumber}`;
      
      setPageLabels(prev => ({
        ...prev,
        [pageNumber]: label
      }));
      
      return label;
    } catch (error) {
      console.error('Error extracting page label:', error);
      return `Page ${pageNumber}`;
    } finally {
      setIsExtractingLabel(false);
    }
  };
  
  /**
   * Extract labels for all pages in background
   */
  const extractAllPageLabels = async (projectId, sheetId, totalPages) => {
    for (let i = 1; i <= totalPages; i++) {
      // Skip if already extracted
      if (pageLabels[i]) continue;
      
      // Delay between requests to avoid overwhelming backend
      await new Promise(resolve => setTimeout(resolve, 500));
      await extractPageLabel(projectId, sheetId, i);
    }
  };
  
  /**
   * Load PDF document
   */
  useEffect(() => {
    if (!project || !sheetId) return;
    
    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setLoadProgress(10);
        
        // Construct PDF URL - backend will serve raw PDF
        const pdfUrl = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/pdf/${project}/${sheetId}`;
        
        setLoadProgress(30);
        
        // Load PDF document
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        
        loadingTask.onProgress = (progress) => {
          const percent = Math.min(30 + (progress.loaded / progress.total) * 40, 70);
          setLoadProgress(percent);
        };
        
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setPageNum(1);
        
        // Notify parent of page info
        if (onPageInfoChange) {
          onPageInfoChange({ numPages: pdf.numPages, currentPage: 1 });
        }
        
        setLoadProgress(90);
        
        // Load first page
        const page = await pdf.getPage(1);
        
        // Get embedded rotation from PDF page
        const pageRotation = page.rotate || 0;
        console.log('📄 PAGE INFO:', {
          pageNumber: 1,
          rotation: pageRotation,
          width: page.view[2],
          height: page.view[3]
        });
        
        // Set rotation from PDF metadata
        setRotation(pageRotation);
        if (onRotationChange) {
          onRotationChange(pageRotation);
        }
        setCurrentPage(page);
        
        // Auto-extract page labels for all pages in background
        extractAllPageLabels(project, sheetId, pdf.numPages);
        
        // Auto-fit to window after loading
        setTimeout(() => {
          if (containerRef.current && page) {
            // Get viewport at base render scale with page's embedded rotation
            const viewport = page.getViewport({ scale: 1.0, rotation: pageRotation });
            const container = containerRef.current;
            const scaleX = (container.clientWidth * 0.9) / viewport.width;
            const scaleY = (container.clientHeight * 0.9) / viewport.height;
            const fitScale = Math.min(scaleX, scaleY);
            console.log('📐 AUTO-FIT CALCULATION:', {
              containerWidth: container.clientWidth,
              containerHeight: container.clientHeight,
              pdfWidth: viewport.width,
              pdfHeight: viewport.height,
              pageRotation,
              scaleX,
              scaleY,
              fitScale
            });
            
            // Return fitScale so caller can update their scale state
            if (onPageInfoChange) {
              onPageInfoChange({ 
                numPages: pdf.numPages, 
                currentPage: 1,
                autoFitScale: fitScale 
              });
            }
          }
        }, 100);
        
        setLoadProgress(100);
        setIsLoading(false);
        
      } catch (error) {
        console.error('Error loading PDF:', error);
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          pdfUrl: `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/pdf/${project}/${sheetId}`
        });
        setIsLoading(false);
        
        // More detailed error message
        let errorMsg = 'Failed to load PDF. ';
        if (error.name === 'UnknownErrorException') {
          errorMsg += 'The PDF file may be corrupted or the backend cannot find it. ';
          errorMsg += `Project: ${project}, Sheet: ${sheetId}`;
        } else if (error.message) {
          errorMsg += error.message;
        }
        
        alert(errorMsg + '\n\nCheck browser console for details.');
      }
    };
    
    loadPDF();
    
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [project, sheetId]);
  
  /**
   * Navigate to specific page
   */
  const goToPage = async (newPageNum) => {
    if (!pdfDoc || newPageNum < 1 || newPageNum > numPages) return;
    
    try {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      
      const page = await pdfDoc.getPage(newPageNum);
      const pageRotation = page.rotate || 0;
      
      setPageNum(newPageNum);
      setCurrentPage(page);
      setRotation(pageRotation);
      
      if (onRotationChange) {
        onRotationChange(pageRotation);
      }
      
      if (onPageInfoChange) {
        onPageInfoChange({ numPages, currentPage: newPageNum });
      }
      
      console.log('📄 Loaded page:', newPageNum, 'Rotation:', pageRotation);
    } catch (error) {
      console.error('Error loading page:', error);
    }
  };
  
  /**
   * Rotate page by 90 degrees
   */
  const rotatePage = (degrees) => {
    const newRotation = (rotation + degrees) % 360;
    setRotation(newRotation);
    if (onRotationChange) {
      onRotationChange(newRotation);
    }
  };
  
  return {
    // State
    pdfDoc,
    currentPage,
    pageNum,
    numPages,
    rotation,
    isLoading,
    loadProgress,
    pageLabels,
    isExtractingLabel,
    
    // Actions
    goToPage,
    rotatePage,
    extractPageLabel,
    
    // Refs (for cleanup)
    renderTaskRef,
  };
}
