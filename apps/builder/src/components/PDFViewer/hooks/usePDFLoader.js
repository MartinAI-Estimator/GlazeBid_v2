/**
 * usePDFLoader Hook
 * Handles PDF document loading, page navigation, and auto-fitting
 */

import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export function usePDFLoader({ 
  project, 
  sheetId, 
  onPageInfoChange,
  containerRef,
  extractSnapPoints,
  extractAllPageLabels 
}) {
  // PDF State
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [rotation, setRotation] = useState(0);
  
  const renderTaskRef = useRef(null);

  // Load PDF document
  useEffect(() => {
    if (!project || !sheetId) return;
    
    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setLoadProgress(10);
        
        // Construct PDF URL - backend will serve raw PDF
        const pdfUrl = `http://127.0.0.1:8000/pdf/${project}/${sheetId}`;
        
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
        setCurrentPage(page);
        
        // Extract vector data for snap points
        if (extractSnapPoints) {
          await extractSnapPoints(page);
        }
        
        // Auto-extract page labels for all pages in background
        if (extractAllPageLabels) {
          extractAllPageLabels(project, sheetId, pdf.numPages);
        }
        
        // Auto-fit to window after loading
        setTimeout(() => {
          if (containerRef?.current) {
            // Get viewport at base render scale with page's embedded rotation
            const pageRotation = page.rotate || 0;
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
            
            // Return fitScale for parent to apply
            return fitScale;
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
          pdfUrl: `http://127.0.0.1:8000/pdf/${project}/${sheetId}`
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

  // Load page when pageNum changes
  useEffect(() => {
    if (!pdfDoc || pageNum < 1 || pageNum > numPages) return;
    
    const loadPage = async () => {
      try {
        console.log('📄 Loading page:', pageNum);
        const page = await pdfDoc.getPage(pageNum);
        
        // Get embedded rotation from PDF page
        const pageRotation = page.rotate || 0;
        console.log('   Page rotation:', pageRotation);
        
        // Set rotation from PDF metadata
        setRotation(pageRotation);
        setCurrentPage(page);
        
        // Extract vector data for snap points
        if (extractSnapPoints) {
          await extractSnapPoints(page);
        }
        
      } catch (error) {
        console.error('Error loading page:', error);
      }
    };
    
    loadPage();
  }, [pdfDoc, pageNum, numPages, extractSnapPoints]);

  // Notify parent when page number changes
  useEffect(() => {
    if (onPageInfoChange && numPages > 0) {
      onPageInfoChange({ numPages, currentPage: pageNum });
    }
  }, [pageNum, numPages, onPageInfoChange]);

  // Navigation functions
  const goToPage = (newPageNum) => {
    if (newPageNum >= 1 && newPageNum <= numPages) {
      setPageNum(newPageNum);
    }
  };

  const nextPage = () => goToPage(pageNum + 1);
  const prevPage = () => goToPage(pageNum - 1);
  
  const rotatePage = () => {
    setRotation((rotation + 90) % 360);
  };

  return {
    // State
    pdfDoc,
    currentPage,
    pageNum,
    numPages,
    isLoading,
    loadProgress,
    rotation,
    
    // Actions
    goToPage,
    nextPage,
    prevPage,
    rotatePage,
    setRotation,
    
    // Refs
    renderTaskRef
  };
}
