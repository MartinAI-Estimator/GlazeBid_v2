import React, { useState, useEffect, useRef, useCallback } from 'react';
import PDFViewer from '../PDFViewer';
import PDFToolbar from './ui/PDFToolbar';
import PDFThumbnails from './ui/PDFThumbnails';
import PDFStatusBar from './ui/PDFStatusBar';
import StructuralCalculator from '../StructuralCalculator';
import ProjectManager from '../Project/ProjectManager';
import { useProject } from '../../context/ProjectContext';
import useProjectPersistence from '../../hooks/useProjectPersistence';
import { useBidSheet } from '../../context/BidSheetContext';

const PDFWorkspace = ({ file, projectId }) => {
  const { markups, setMarkups } = useProject(); // Access and update markups from context
  const { currentProjectName, isConfigured } = useProjectPersistence(); // Project persistence
  
  // Try to access BidSheet context (may not be available in all views)
  let exportToExcel = null;
  try {
    const bidSheetContext = useBidSheet();
    exportToExcel = bidSheetContext?.exportToExcel;
  } catch (e) {
    // BidSheet context not available - Export button will be hidden
  }
  
  const [projectManagerMode, setProjectManagerMode] = useState(null); // 'save' | 'open' | null
  const [activeNavTab, setActiveNavTab] = useState('structural'); // Navigation tab state
  const [structuralMarkup, setStructuralMarkup] = useState(null);
  
  // STATE: Shared across the UI
  const [activeTool, setActiveTool] = useState({ type: 'pan', mode: 'Pan' });
  const [currentPage, setCurrentPage] = useState(1);
  const [snaps, setSnaps] = useState({ grid: false, content: true });
  const [rotation, setRotation] = useState(0);
  const [calibration, setCalibration] = useState(null);
  
  // STATE: Reported FROM Viewer (Read-only for UI)
  const [docInfo, setDocInfo] = useState({ numPages: 0, width: 0, height: 0 });
  const [scale, setScale] = useState(1.0);

  // Cursor position is intentionally NOT stored in React state.
  // Writing to state here would re-render the entire PDFWorkspace tree dozens
  // of times per second during mouse movement, causing severe CPU lag.
  // Instead, the stable callback below writes the X/Y values directly to the
  // DOM spans rendered by PDFStatusBar (#pdf-cursor-x / #pdf-cursor-y),
  // completely bypassing the React render cycle.
  const handleCursorMove = useCallback(({ x, y }) => {
    const xEl = document.getElementById('pdf-cursor-x');
    const yEl = document.getElementById('pdf-cursor-y');
    if (xEl) xEl.textContent = x.toFixed(2);
    if (yEl) yEl.textContent = y.toFixed(2);
  }, []);

  // Debug page changes
  useEffect(() => {
    console.log('📄 Current page changed to:', currentPage);
  }, [currentPage]);

  // Global Escape Key Handler (The "Panic Button")
  useEffect(() => {
    const handleGlobalEscape = (e) => {
      if (e.key === 'Escape') {
        // Priority 1: Cancel drawing (handled by drawing hook automatically via propagation)
        // Priority 2: Switch to Pan mode if any tool is active
        if (activeTool?.mode && activeTool.mode !== 'Pan') {
          setActiveTool({ type: 'pan', mode: 'Pan' });
        }
        // Priority 4: Deselection is handled by useMarkupEdit hook
      }
    };

    window.addEventListener('keydown', handleGlobalEscape);
    return () => window.removeEventListener('keydown', handleGlobalEscape);
  }, [activeTool]);

  // Save Project Keyboard Shortcut (Ctrl+S)
  useEffect(() => {
    const handleSaveShortcut = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        setProjectManagerMode('save');
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, []);

  // Inject Smart Scan annotations from ProjectIntake (if any were queued)
  useEffect(() => {
    const pendingAnnotations = sessionStorage.getItem('pendingAnnotations');
    if (pendingAnnotations) {
      try {
        const annotations = JSON.parse(pendingAnnotations);
        console.log('📥 Injecting', annotations.length, 'Smart Scan annotations');
        
        // Add annotations to existing markups
        setMarkups(prev => [...prev, ...annotations]);
        
        // Clear from sessionStorage
        sessionStorage.removeItem('pendingAnnotations');
        
        // Notify user
        alert(`✅ Imported ${annotations.length} annotation(s) from PDF scan.\n\nCheck the BidSheet to see them.`);
      } catch (error) {
        console.error('❌ Failed to inject Smart Scan annotations:', error);
      }
    }
  }, [setMarkups]);

  // Render Takeoff View (Original PDF Workspace)
  const renderTakeoffView = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      
      {/* 1. TOP COMMAND BAR */}
      <PDFToolbar 
        activeTool={activeTool} 
        onSelectTool={setActiveTool} 
        onRotate={() => setRotation(r => r + 90)}
        onExport={exportToExcel}
        onCalibrate={() => setActiveTool({ type: 'calibration', mode: 'Calibration' })}
      />

      {/* 2. MAIN WORKSPACE */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left: Thumbnails */}
        <PDFThumbnails 
          file={file} 
          numPages={docInfo.numPages}
          currentPage={currentPage} 
          onPageClick={setCurrentPage}
          project={projectId}
          sheetName={`Page_${currentPage}`}
        />

        {/* Center: The Engine */}
        <div style={{ flex: 1, position: 'relative' }}>
          <PDFViewer 
            file={file} 
            pageNumber={currentPage}
            projectId={projectId}
            sheetId={`Sheet_${currentPage}`}
            // Inputs
            activeTool={activeTool}
            snaps={snaps}
            showGrid={snaps.grid}
            calibration={calibration}
            
            // Outputs
            onPageLoad={(info) => setDocInfo(prev => ({ ...prev, ...info }))}
            onScaleChange={setScale}
            onCursorMove={handleCursorMove}
            onCalibrationChange={setCalibration}
            onSendToStructural={(markup) => {
              setStructuralMarkup(markup);
              setActiveNavTab('structural');
            }}
          />
        </div>

        {/* Right: Properties (Only visible if Select tool active) */}
        {activeTool?.mode === 'Select' && (
            <div style={{ width: '250px', background: '#252525', borderLeft: '1px solid #444', color: '#fff', padding: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', textTransform: 'uppercase', color: '#888' }}>Properties</h4>
                <div style={{ fontSize: '14px' }}>No Selection</div>
            </div>
        )}

      </div>

      {/* 3. PRECISION STATUS BAR */}
      <PDFStatusBar 
        scale={scale} 
        pageInfo={`${docInfo.width}" x ${docInfo.height}"`}
        snaps={snaps}
        onToggleSnap={(type) => setSnaps(prev => ({ ...prev, [type]: !prev[type] }))}
        calibration={calibration}
        onSetScale={() => setActiveTool({ type: 'calibration', mode: 'Calibration' })}
        isCalibrating={activeTool?.mode === 'Calibration'}
      />

    </div>
  );

  const renderStructuralTab = () => {
    if (!structuralMarkup) {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8b949e',
          gap: '10px'
        }}>
          <div style={{ fontSize: '22px' }}>🏗️</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c9d1d9' }}>No Frame Sent Yet</div>
          <div style={{ fontSize: '13px' }}>Right-click any Area or Smart Frame markup and choose “Send to Structural Calculator”.</div>
        </div>
      );
    }

    return (
      <StructuralCalculator
        embedded={true}
        isOpen={true}
        onClose={() => {}}
        markup={structuralMarkup}
        calibration={calibration}
        project={projectId}
        sheet={`Sheet_${currentPage}`}
      />
    );
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      width: '100%',
      backgroundColor: '#0d1117' 
    }}>
      
      {/* TAB NAVIGATION BAR */}
      <div style={{
        height: '56px',
        minHeight: '56px',
        flexShrink: 0,
        backgroundColor: '#161b22',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '20px',
        paddingRight: '20px',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }}>
        
        {/* Takeoff Title */}
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: '#58a6ff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          📐 Drawing Takeoff
        </div>
        
        {/* Navigation Buttons */}
        <button
          onClick={() => setActiveNavTab('structural')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            border: activeNavTab === 'structural' ? '1px solid #007BFF' : '1px solid #30363d',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: activeNavTab === 'structural' ? '#242b33' : '#21262d',
            color: activeNavTab === 'structural' ? '#ffffff' : '#8b949e',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: activeNavTab === 'structural' ? '0 4px 12px rgba(0, 123, 255, 0.2)' : 'none'
          }}
        >
          🏗️ Structural Analysis
        </button>
        
        <button
          onClick={() => setActiveNavTab('doors')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            border: activeNavTab === 'doors' ? '1px solid #007BFF' : '1px solid #30363d',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: activeNavTab === 'doors' ? '#242b33' : '#21262d',
            color: activeNavTab === 'doors' ? '#ffffff' : '#8b949e',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: activeNavTab === 'doors' ? '0 4px 12px rgba(0, 123, 255, 0.2)' : 'none'
          }}
        >
          🚪 Door Schedule
        </button>
        
        <button
          onClick={() => setActiveNavTab('addendum')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            border: activeNavTab === 'addendum' ? '1px solid #007BFF' : '1px solid #30363d',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: activeNavTab === 'addendum' ? '#242b33' : '#21262d',
            color: activeNavTab === 'addendum' ? '#ffffff' : '#8b949e',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: activeNavTab === 'addendum' ? '0 4px 12px rgba(0, 123, 255, 0.2)' : 'none'
          }}
        >
          📋 Addendum Loader
        </button>
        
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        

      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ 
        flex: 1, 
        minHeight: 0,
        position: 'relative', 
        overflow: 'hidden',
        display: 'flex'
      }}>

        {activeNavTab === 'structural' && structuralMarkup ? renderStructuralTab() : renderTakeoffView()}

      </div>
      
      {/* Project Manager Modal */}
      {projectManagerMode && (
        <ProjectManager 
          mode={projectManagerMode} 
          onClose={() => setProjectManagerMode(null)} 
        />
      )}
    </div>
  );
};

export default PDFWorkspace;
