import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Trash2, Copy, ClipboardPaste, Edit3, SendHorizontal, Tag } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const SheetSidebar = ({ 
  project, 
  sheetId, 
  numPages, 
  currentPage, 
  onPageChange,
  onRotate,
  onDeletePage,
  onMovePage,
  onExtractLabel,
  isExtractingLabel,
  pageLabels,
  currentPageNum,
  sheets,
  onSelectSheet,
  onRenamePage,
  onStartRegionSelection, // Callback to start region selection in PDF viewer
  onUpdateBookmarks, // Expose bookmark updates to parent
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(260); // Default width
  const [isResizing, setIsResizing] = useState(false);
  const [thumbnails, setThumbnails] = useState({});
  const pdfDocRef = useRef(null);
  
  // Multi-select state
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [lastSelectedPage, setLastSelectedPage] = useState(null);
  
  // Page labeling dialog state
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelRegions, setLabelRegions] = useState({
    pageNumber: null,
    sheetTitle: null,
  });
  const [isProcessingLabels, setIsProcessingLabels] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [pagesWithMarkups, setPagesWithMarkups] = useState(new Set());
  
  // Load existing markups on mount
  useEffect(() => {
    const loadMarkups = async () => {
      if (!project || !sheetId) return;
      
      try {
        const response = await fetch(`http://127.0.0.1:8000/projects/${encodeURIComponent(project)}/markups/${encodeURIComponent(sheetId)}`);
        
        // Handle 404 gracefully (new sheet, no markups yet)
        if (response.status === 404) {
          console.log('🆕 New sheet detected. Starting with empty markups.');
          setPagesWithMarkups(new Set());
          return;
        }
        
        if (response.ok) {
          const data = await response.json();
          const pages = new Set(data.markups.map(m => m.pageNum).filter(Boolean));
          setPagesWithMarkups(pages);
          console.log(`📚 Loaded bookmarks for ${pages.size} pages with markups`);
        }
      } catch (error) {
        console.error('Failed to load markups for bookmarks:', error);
      }
    };
    
    loadMarkups();
  }, [project, sheetId]);
  
  // Expose bookmark update function to parent
  useEffect(() => {
    if (onUpdateBookmarks) {
      onUpdateBookmarks((pageNum) => {
        setPagesWithMarkups(prev => {
          const updated = new Set(prev);
          updated.add(pageNum);
          console.log(`🔖 Page ${pageNum} bookmarked`);
          return updated;
        });
      });
    }
  }, [onUpdateBookmarks]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState(null); // { x, y, pageNumber }
  const [copiedPage, setCopiedPage] = useState(null); // Page number that was copied
  const [isRenaming, setIsRenaming] = useState(null); // Page number being renamed
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);
  
  // Debug: Log sheets when they change
  useEffect(() => {
    console.log('SheetSidebar sheets:', sheets);
    console.log('SheetSidebar sheetId:', sheetId);
  }, [sheets, sheetId]);

  // Initialize PDF.js worker
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }, []);

  // Load PDF and generate thumbnails
  useEffect(() => {
    if (!project || !sheetId || numPages === 0) return;

    const loadPdfAndGenerateThumbnails = async () => {
      try {
        // Handle project as either string or object
        const projectName = typeof project === 'string' ? project : project.name;
        const encodedProjectName = encodeURIComponent(projectName);
        const encodedSheetId = encodeURIComponent(sheetId);
        
        // Fetch PDF from backend
        const response = await fetch(`http://127.0.0.1:8000/pdf/${encodedProjectName}/${encodedSheetId}`);
        if (!response.ok) {
          console.error('Failed to fetch PDF for thumbnails');
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;

        // Generate thumbnails progressively for better performance
        const newThumbnails = {};
        
        // Load thumbnails one at a time with state updates for progressive rendering
        const loadThumbnail = async (pageNum) => {
          try {
            const page = await pdf.getPage(pageNum);
            
            // PERFORMANCE: Calculate scale to cap thumbnail at 200px max dimension
            const baseViewport = page.getViewport({ scale: 1.0 });
            const maxDim = Math.max(baseViewport.width, baseViewport.height);
            const targetMaxDim = 200; // Max 200px for thumbnails
            const thumbScale = Math.min(0.15, targetMaxDim / maxDim);
            
            const viewport = page.getViewport({ scale: thumbScale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
              canvasContext: context,
              viewport: viewport,
            }).promise;

            newThumbnails[pageNum] = canvas.toDataURL();
            // Update state progressively so user sees thumbnails as they load
            setThumbnails({...newThumbnails});
          } catch (err) {
            console.error(`Failed to load thumbnail for page ${pageNum}:`, err);
          }
        };
        
        // Load current page first, then others
        if (currentPage && currentPage <= numPages) {
          await loadThumbnail(currentPage);
        }
        
        // Load remaining pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (pageNum !== currentPage) {
            await loadThumbnail(pageNum);
          }
        }
      } catch (error) {
        console.error('Error generating thumbnails:', error);
      }
    };

    loadPdfAndGenerateThumbnails();
  }, [project, sheetId, numPages]);

  // Resize Logic
  const startResizing = useCallback((e) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth > 150 && newWidth < 600) { // Max/Min constraints
        setWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Focus rename input when renaming
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Multi-select handlers
  const handleThumbnailClick = useCallback((e, pageNumber) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: Toggle individual page
      e.stopPropagation();
      const newSelected = new Set(selectedPages);
      if (newSelected.has(pageNumber)) {
        newSelected.delete(pageNumber);
      } else {
        newSelected.add(pageNumber);
      }
      setSelectedPages(newSelected);
      setLastSelectedPage(pageNumber);
    } else if (e.shiftKey && lastSelectedPage) {
      // Shift+click: Select range
      e.stopPropagation();
      const start = Math.min(lastSelectedPage, pageNumber);
      const end = Math.max(lastSelectedPage, pageNumber);
      const newSelected = new Set(selectedPages);
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
      setSelectedPages(newSelected);
    } else {
      // Regular click: Navigate to page and clear selection
      setSelectedPages(new Set());
      setLastSelectedPage(pageNumber);
      onPageChange(pageNumber);
    }
  }, [selectedPages, lastSelectedPage, onPageChange]);

  // Context menu handlers
  const handleContextMenu = useCallback((e, pageNumber) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If right-clicking on a non-selected page, select only that page
    if (!selectedPages.has(pageNumber)) {
      setSelectedPages(new Set([pageNumber]));
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY, pageNumber });
  }, [selectedPages]);

  const handleRotatePage = useCallback((pageNumber) => {
    setContextMenu(null);
    // Navigate to the page first, then rotate
    onPageChange(pageNumber);
    setTimeout(() => onRotate && onRotate(), 100);
  }, [onPageChange, onRotate]);

  const handleDeletePage = useCallback((pageNumber) => {
    setContextMenu(null);
    if (window.confirm(`Are you sure you want to delete page ${pageNumber}?`)) {
      onPageChange(pageNumber);
      setTimeout(() => onDeletePage && onDeletePage(), 100);
    }
  }, [onPageChange, onDeletePage]);

  const handleCopyPage = useCallback((pageNumber) => {
    setContextMenu(null);
    setCopiedPage(pageNumber);
    console.log(`📋 Copied page ${pageNumber} to clipboard`);
  }, []);

  const handlePastePage = useCallback((afterPageNumber) => {
    setContextMenu(null);
    if (copiedPage) {
      console.log(`📋 Pasting page ${copiedPage} after page ${afterPageNumber}`);
      // Call the move/paste handler - this would duplicate/move the page
      if (onMovePage) {
        onMovePage(copiedPage, afterPageNumber);
      }
    }
  }, [copiedPage, onMovePage]);

  const handleStartRename = useCallback((pageNumber) => {
    setContextMenu(null);
    const currentLabel = pageLabels?.[pageNumber] || `Page ${pageNumber}`;
    setRenameValue(currentLabel);
    setIsRenaming(pageNumber);
  }, [pageLabels]);

  const handleFinishRename = useCallback(() => {
    if (isRenaming && renameValue.trim()) {
      console.log(`✏️ Renaming page ${isRenaming} to "${renameValue}"`);
      if (onRenamePage) {
        onRenamePage(isRenaming, renameValue.trim());
      }
    }
    setIsRenaming(null);
    setRenameValue('');
  }, [isRenaming, renameValue, onRenamePage]);

  const handleRenameKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(null);
      setRenameValue('');
    }
  }, [handleFinishRename]);

  // Send To handler
  const handleSendTo = useCallback(async (targetSheetId) => {
    setContextMenu(null);
    const pagesToMove = selectedPages.size > 0 ? Array.from(selectedPages) : [contextMenu?.pageNumber];
    
    console.log(`📤 Sending pages ${pagesToMove.join(', ')} to sheet ${targetSheetId}`);
    
    const targetSheetName = sheets?.find(s => s.id === targetSheetId)?.name || targetSheetId;
    
    // Show confirmation
    if (!window.confirm(`Move ${pagesToMove.length} page(s) to "${targetSheetName}"?\n\nPages: ${pagesToMove.join(', ')}\n\nThis will remove them from the current sheet.`)) {
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('project_name', project);
      formData.append('source_sheet_id', sheetId);
      formData.append('target_sheet_id', targetSheetId);
      formData.append('page_numbers', JSON.stringify(pagesToMove));
      
      const response = await fetch('http://127.0.0.1:8000/move-pages', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Successfully moved ${result.pages_moved} page(s) to "${targetSheetName}"!\n\nSource: ${result.source_page_count} pages\nTarget: ${result.target_page_count} pages`);
        
        // Clear selection and refresh thumbnails
        setSelectedPages(new Set());
        
        // Reload the page or trigger refresh
        window.location.reload();
      } else {
        alert(`❌ Failed to move pages: ${result.error}`);
      }
    } catch (error) {
      console.error('Move pages error:', error);
      alert(`❌ Error moving pages: ${error.message}`);
    }
  }, [selectedPages, contextMenu, project, sheetId, sheets]);

  // Show/hide "Send To" submenu
  const [showSendToSubmenu, setShowSendToSubmenu] = useState(false);

  // Handle region selection callbacks from dialog
  const handleSelectRegion = useCallback((regionType) => {
    console.log('🎯 SheetSidebar: handleSelectRegion called with:', regionType);
    // Hide dialog while user selects region in PDF viewer
    setShowLabelDialog(false);
    
    // Call the parent callback to start region selection mode in PDF viewer
    if (onStartRegionSelection) {
      console.log('🎯 SheetSidebar: Calling onStartRegionSelection');
      onStartRegionSelection(regionType, (region) => {
        console.log('🎯 SheetSidebar: Region selected:', region);
        // Callback when region is selected
        setLabelRegions(prev => ({
          ...prev,
          [regionType]: region,
        }));
        
        // Show dialog again
        setShowLabelDialog(true);
      });
    } else {
      console.error('❌ SheetSidebar: onStartRegionSelection prop is not available');
    }
  }, [onStartRegionSelection]);

  const handleApplyLabels = useCallback((regions) => {
    console.log('📝 Applying labels with regions:', regions);
    setIsProcessingLabels(true);
    
    // Call backend to extract labels from regions
    const formData = new FormData();
    formData.append('project_name', project);
    formData.append('sheet_id', sheetId);
    formData.append('regions', JSON.stringify(regions));
    
    fetch('http://127.0.0.1:8000/extract-labels-from-regions', {
      method: 'POST',
      body: formData,
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('✅ Labels extracted:', data.labels);
        
        // Save the labels
        const saveFormData = new FormData();
        saveFormData.append('project_name', project);
        saveFormData.append('sheet_id', sheetId);
        saveFormData.append('labels', JSON.stringify(data.labels));
        
        return fetch('http://127.0.0.1:8000/save-page-labels', {
          method: 'POST',
          body: saveFormData,
        }).then(saveResponse => {
          if (!saveResponse.ok) {
            throw new Error('Failed to save labels');
          }
          return data.labels;
        });
      })
      .then(labels => {
        // Convert labels format from {"1": {"pageNumber": "A-101", "sheetTitle": "..."}}
        // to simple {"1": "A-101"} for display
        const simplifiedLabels = {};
        Object.keys(labels).forEach(pageNum => {
          const pageLabel = labels[pageNum];
          // Combine pageNumber and sheetTitle when both are available
          const pageNumber = pageLabel.pageNumber?.trim();
          const sheetTitle = pageLabel.sheetTitle?.trim();
          
          let labelText = `Page ${pageNum}`;
          if (pageNumber && sheetTitle) {
            labelText = `${pageNumber} - ${sheetTitle}`;
          } else if (pageNumber) {
            labelText = pageNumber;
          } else if (sheetTitle) {
            labelText = sheetTitle;
          }
          
          simplifiedLabels[pageNum] = labelText;
          console.log(`📄 Page ${pageNum}: "${labelText}"`);
        });
        
        setIsProcessingLabels(false);
        alert(`Successfully extracted and saved labels for ${Object.keys(labels).length} pages!`);
        setShowLabelDialog(false);
        setLabelRegions({ pageNumber: null, sheetTitle: null });
        
        // Update page labels through the rename callback
        if (onRenamePage) {
          Object.entries(simplifiedLabels).forEach(([pageNum, label]) => {
            onRenamePage(parseInt(pageNum), label);
          });
        }
      })
      .catch(error => {
        console.error('❌ Label extraction failed:', error);
        alert(`Failed to extract labels: ${error.message}`);
      });
  }, [project, sheetId, onRenamePage]);

  return (
    <div style={{
      ...styles.sidebar, 
      width: isCollapsed ? '50px' : `${width}px`
    }}>
      {/* Collapse Toggle */}
      <button onClick={() => setIsCollapsed(!isCollapsed)} style={styles.toggleBtn}>
        {isCollapsed ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
      </button>

      {/* Resizer Handle */}
      {!isCollapsed && (
        <div onMouseDown={startResizing} style={styles.resizer} />
      )}

      {!isCollapsed && (
        <div style={styles.listContainer}>
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button 
              onClick={() => setShowLabelDialog(true)}
              style={{...styles.labelButton, flex: 1}}
            >
              <Tag size={16} />
              <span>Create Page Labels</span>
            </button>
            
            <button 
              onClick={() => setShowBookmarks(!showBookmarks)}
              style={{
                ...styles.labelButton,
                flex: 1,
                backgroundColor: showBookmarks ? '#065f46' : '#1e3a5f',
                borderColor: showBookmarks ? '#10b981' : '#3b82f6',
              }}
              title="Show pages with markups"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Bookmarks</span>
            </button>
          </div>
          
          {selectedPages.size > 0 && (
            <div style={styles.selectionInfo}>
              {selectedPages.size} page(s) selected
            </div>
          )}
          
          {showBookmarks && pagesWithMarkups.size === 0 && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '13px',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px' }}>
                <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>No bookmarked pages yet</p>
              <p style={{ fontSize: '11px', marginTop: '8px' }}>
                Pages with markups will appear here automatically
              </p>
            </div>
          )}
          
          {Array.from({ length: numPages }, (_, i) => i + 1)
            .filter(pageNumber => !showBookmarks || pagesWithMarkups.has(pageNumber))
            .map((pageNumber) => (
            <div 
              key={pageNumber} 
              onClick={(e) => handleThumbnailClick(e, pageNumber)}
              onContextMenu={(e) => handleContextMenu(e, pageNumber)}
              style={{
                ...styles.item,
                backgroundColor: currentPage === pageNumber ? '#2b6cb0' : 
                                selectedPages.has(pageNumber) ? '#1e3a5f' : 'transparent',
                border: copiedPage === pageNumber ? '2px solid #00a3ff' : 
                        selectedPages.has(pageNumber) ? '2px solid #3b82f6' : '1px solid #2d3748',
                position: 'relative',
              }}
            >
              {/* Bookmark indicator */}
              {pagesWithMarkups.has(pageNumber) && (
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  zIndex: 10,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#10b981" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              
              {thumbnails[pageNumber] ? (
                <img 
                  src={thumbnails[pageNumber]} 
                  alt={`Page ${pageNumber}`}
                  style={styles.thumb}
                />
              ) : (
                <div style={styles.thumbPlaceholder}>
                  Loading...
                </div>
              )}
              
              {/* Page label - either renaming or display */}
              {isRenaming === pageNumber ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  style={styles.renameInput}
                />
              ) : (
                <div style={styles.pageNumber}>
                  {pageLabels?.[pageNumber] || `Page ${pageNumber}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div 
          style={{
            ...styles.contextMenu,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={styles.contextMenuHeader}>
            {selectedPages.size > 1 ? `${selectedPages.size} Pages Selected` : `Page ${contextMenu.pageNumber}`}
          </div>
          
          {selectedPages.size === 0 || selectedPages.size === 1 ? (
            <>
              <button 
                style={styles.contextMenuItem}
                onClick={() => handleRotatePage(contextMenu.pageNumber)}
              >
                <RotateCw size={14} />
                <span>Rotate 90° CW</span>
              </button>
              
              <button 
                style={styles.contextMenuItem}
                onClick={() => handleCopyPage(contextMenu.pageNumber)}
              >
                <Copy size={14} />
                <span>Copy Page</span>
              </button>
              
              {copiedPage && (
                <button 
                  style={styles.contextMenuItem}
                  onClick={() => handlePastePage(contextMenu.pageNumber)}
                >
                  <ClipboardPaste size={14} />
                  <span>Paste After This Page</span>
                </button>
              )}
              
              <button 
                style={styles.contextMenuItem}
                onClick={() => handleStartRename(contextMenu.pageNumber)}
              >
                <Edit3 size={14} />
                <span>Rename Page</span>
              </button>
              
              <div style={styles.contextMenuDivider} />
            </>
          ) : null}
          
          {/* Send To submenu */}
          <div 
            style={styles.contextMenuItem}
            onMouseEnter={() => setShowSendToSubmenu(true)}
            onMouseLeave={() => setShowSendToSubmenu(false)}
          >
            <SendHorizontal size={14} />
            <span>Send To</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px' }}>▶</span>
            
            {/* Submenu */}
            {showSendToSubmenu && sheets && (
              <div style={styles.submenu}>
                {sheets.map((sheet) => (
                  <button
                    key={sheet.id}
                    style={{
                      ...styles.contextMenuItem,
                      ...(sheet.id === sheetId ? styles.submenuItemCurrent : {}),
                    }}
                    onClick={() => handleSendTo(sheet.id)}
                  >
                    {sheet.name || sheet.id}
                  </button>
                ))}
                {(!sheets || sheets.length === 0) && (
                  <div style={styles.submenuEmpty}>No other sheets available</div>
                )}
              </div>
            )}
          </div>
          
          {selectedPages.size === 0 || selectedPages.size === 1 ? (
            <>
              <div style={styles.contextMenuDivider} />
              
              <button 
                style={{...styles.contextMenuItem, color: '#ef4444'}}
                onClick={() => handleDeletePage(contextMenu.pageNumber)}
              >
                <Trash2 size={14} />
                <span>Delete Page</span>
              </button>
            </>
          ) : null}
        </div>
      )}
      
      {/* Page Label Dialog */}
      {showLabelDialog && (
        <PageLabelDialog
          onClose={() => {
            if (!isProcessingLabels) {
              setShowLabelDialog(false);
              setLabelRegions({ pageNumber: null, sheetTitle: null });
            }
          }}
          onApply={handleApplyLabels}
          onSelectRegion={handleSelectRegion}
          selectedRegions={labelRegions}
          isProcessing={isProcessingLabels}
        />
      )}
    </div>
  ); 
};

// Page Label Dialog Component - Simplified version
const PageLabelDialog = ({ onClose, onApply, onSelectRegion, selectedRegions, isProcessing }) => {
  const handleSelectRegion = (regionType) => {
    if (isProcessing) return;
    console.log('🔘 PageLabelDialog: Button clicked for region type:', regionType);
    // Call parent callback to start region selection in PDF viewer
    onSelectRegion(regionType);
  };

  const handleApply = () => {
    if (isProcessing) return;
    // Apply the labels with selected regions
    onApply(selectedRegions);
  };

  const hasRegions = selectedRegions.pageNumber || selectedRegions.sheetTitle;

  return (
    <div style={styles.dialogOverlay} onClick={isProcessing ? undefined : onClose}>
      <div style={styles.dialogContentSmall} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeader}>
          <h3 style={styles.dialogTitle}>Create Page Labels</h3>
          <button 
            style={{...styles.dialogCloseBtn, opacity: isProcessing ? 0.3 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer'}} 
            onClick={isProcessing ? undefined : onClose}
            disabled={isProcessing}
          >×</button>
        </div>
        
        <div style={styles.dialogBody}>
          <p style={styles.dialogText}>
            Click a button below, then draw a rectangle on the PDF where the label appears.
          </p>
          
          <div style={styles.regionButtons}>
            <button
              style={{
                ...styles.regionButton,
                ...(selectedRegions.pageNumber ? styles.regionButtonSelected : {}),
              }}
              onClick={() => handleSelectRegion('pageNumber')}
            >
              {selectedRegions.pageNumber ? '✓ ' : ''}
              Select Page Number Region
            </button>
            
            <button
              style={{
                ...styles.regionButton,
                ...(selectedRegions.sheetTitle ? styles.regionButtonSelected : {}),
              }}
              onClick={() => handleSelectRegion('sheetTitle')}
            >
              {selectedRegions.sheetTitle ? '✓ ' : ''}
              Select Sheet Title Region
            </button>
          </div>
        </div>
        
        {/* Loading indicator */}
        {isProcessing && (
          <div style={{
            padding: '16px 24px',
            backgroundColor: '#065f46',
            borderTop: '1px solid #10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '3px solid #6ee7b7',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ color: '#6ee7b7', fontSize: '14px', fontWeight: '500' }}>
              Processing labels for all pages...
            </span>
          </div>
        )}
        
        <div style={styles.dialogFooter}>
          <button 
            style={{
              ...styles.dialogCancelBtn,
              opacity: isProcessing ? 0.5 : 1,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
            onClick={isProcessing ? undefined : onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.dialogApplyBtn,
              ...(!hasRegions || isProcessing ? styles.dialogApplyBtnDisabled : {}),
            }}
            disabled={!hasRegions || isProcessing}
            onClick={handleApply}
          >
            {isProcessing ? 'Processing...' : 'Apply to All Pages'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Add keyframes for spinner animation - wrapped in try-catch for CORS safety
try {
  const styleSheet = document.styleSheets[0];
  if (styleSheet && !Array.from(styleSheet.cssRules).some(rule => rule.name === 'spin')) {
    styleSheet.insertRule(`
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `, styleSheet.cssRules.length);
  }
} catch (error) {
  // Ignore CORS errors - animation will fall back to CSS file definition
  console.debug('Could not inject keyframes (using CSS fallback):', error.message);
}

const styles = {
  sidebar: {
    backgroundColor: '#1a1d23',
    borderRight: '2px solid #333',
    height: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'width 0.1s ease', // Fast transition for dragging
  },
  resizer: {
    width: '5px',
    height: '100%',
    position: 'absolute',
    right: 0,
    cursor: 'col-resize',
    zIndex: 100,
    backgroundColor: 'transparent',
    '&:hover': { backgroundColor: '#4a5568' }
  },
  toggleBtn: {
    position: 'absolute',
    right: '8px',
    top: '12px',
    background: 'transparent',
    color: '#007BFF',
    border: 'none',
    width: '28px',
    height: '28px',
    cursor: 'pointer',
    zIndex: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '15px'
  },
  labelButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  selectionInfo: {
    padding: '8px 12px',
    marginBottom: '12px',
    backgroundColor: '#1e3a5f',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    color: '#93c5fd',
    fontSize: '12px',
    textAlign: 'center',
    fontWeight: '500',
  },
  title: {
    color: '#94a3b8',
    fontSize: '11px',
    textTransform: 'uppercase',
    marginBottom: '8px',
    marginTop: '35px',
  },
  hint: {
    color: '#6b7280',
    fontSize: '10px',
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    marginBottom: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid #2d3748',
    transition: '0.2s',
    userSelect: 'none',
  },
  pageNumber: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '500',
    color: '#e2e8f0',
    marginTop: '8px',
  },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: '1.4',
    backgroundColor: '#2d3748',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#718096',
    fontSize: '12px',
  },
  thumb: {
    width: '100%',
    height: 'auto',
    aspectRatio: '1.4',
    objectFit: 'contain',
    borderRadius: '4px',
    backgroundColor: '#fff',
    marginBottom: '8px',
    pointerEvents: 'none',
  },
  renameInput: {
    width: '100%',
    padding: '6px 8px',
    marginTop: '8px',
    backgroundColor: '#2d3748',
    border: '1px solid #00a3ff',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    textAlign: 'center',
    outline: 'none',
  },
  contextMenu: {
    position: 'fixed',
    backgroundColor: '#1e2530',
    border: '1px solid #3d4654',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 1000,
    minWidth: '180px',
    padding: '4px 0',
    overflow: 'visible',
  },
  contextMenuHeader: {
    padding: '8px 12px',
    color: '#9ca3af',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    borderBottom: '1px solid #3d4654',
    marginBottom: '4px',
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e2e8f0',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s',
    position: 'relative',
  },
  contextMenuDivider: {
    height: '1px',
    backgroundColor: '#3d4654',
    margin: '4px 0',
  },
  submenu: {
    position: 'absolute',
    left: '100%',
    top: 0,
    backgroundColor: '#1e2530',
    border: '1px solid #3d4654',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    minWidth: '160px',
    padding: '4px 0',
    marginLeft: '4px',
  },
  submenuItemCurrent: {
    backgroundColor: '#2d3748',
    color: '#60a5fa',
  },
  submenuEmpty: {
    padding: '10px 14px',
    color: '#6b7280',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  dialogContentSmall: {
    backgroundColor: '#1e2530',
    borderRadius: '12px',
    width: '420px',
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    border: '1px solid #3d4654',
  },
  // Dialog styles
  dialogOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  dialogContent: {
    backgroundColor: '#1e2530',
    borderRadius: '12px',
    width: '900px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    border: '1px solid #3d4654',
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #3d4654',
  },
  dialogTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#e2e8f0',
  },
  dialogCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s',
  },
  dialogBody: {
    padding: '24px',
  },
  dialogSection: {
    marginBottom: '24px',
  },
  dialogText: {
    margin: '0 0 20px 0',
    color: '#cbd5e1',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  regionButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  regionButton: {
    flex: 1,
    padding: '14px 16px',
    backgroundColor: '#2d3748',
    color: '#e2e8f0',
    border: '2px solid transparent',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left',
  },
  regionButtonActive: {
    backgroundColor: '#1e3a5f',
    borderColor: '#3b82f6',
    color: '#93c5fd',
  },
  regionButtonSelected: {
    backgroundColor: '#065f46',
    borderColor: '#10b981',
    color: '#6ee7b7',
  },
  dialogFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '20px 24px',
    borderTop: '1px solid #3d4654',
  },
  dialogCancelBtn: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    border: '1px solid #4b5563',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dialogApplyBtn: {
    padding: '10px 20px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dialogApplyBtnDisabled: {
    backgroundColor: '#4b5563',
    cursor: 'not-allowed',
    opacity: 0.5,
  },
};

export default SheetSidebar;
