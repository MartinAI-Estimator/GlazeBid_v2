import React, { useState, useEffect, useRef, useCallback } from 'react';
import topLogo from './assets/TOP_LOGO.svg';
import './App.css';
import CustomTitleBar from './components/CustomTitleBar';
import MenuBar from './components/MenuBar';
import Header from './components/Header';
import ProjectIntake from './components/ProjectIntake';
import ProjectList from './components/ProjectList';
import DocumentSelector from './components/DocumentSelector';
import SheetSidebar from './components/SheetSidebar';
import PDFWorkspace from './components/PDFViewer/PDFWorkspace';
import SheetViewer from './components/SheetViewer';
import DebugCanvas from './components/DebugCanvas';
import SystemLegend from './components/SystemLegend';
import NFRCCalculator from './components/NFRCCalculator';
import AiTrainingPanel from './components/AiTrainingPanel';
import AddendumViewer from './components/AddendumViewer';
import ProjectHome from './components/ProjectHome';
import SpecViewer from './components/SpecViewer';
import DoorSchedule from './components/DoorSchedule';
import BidSheet from './components/BidSheet/BidSheet';
import BidCart from './components/BidCart/BidCart';
import AdminDashboard from './components/Admin/AdminDashboard';
import ProposalGenerator from './components/ProposalGenerator/ProposalGenerator';
import RFQManager from './components/RFQManager';
import StudioInbox from './components/StudioInbox';
import SidebarNav from './components/SidebarNav';
import ProjectSideNav from './components/ProjectSideNav';
import { ProjectProvider } from './context/ProjectContext'; // Import the brain
import { loadProjectFromCloud } from './utils/syncProject';
import useBidStore from './store/useBidStore';
import { useEstimatorSync } from './hooks/useEstimatorSync';
import { useInboxSync } from './hooks/useInboxSync';

// Stable default — defined outside component to prevent re-creation on every render
const DEFAULT_BID_SETTINGS = { laborRate: 42, crewSize: 2, laborContingency: 2.5, markupPercent: 20, taxPercent: 8.5 };

function App() {
  // BroadcastChannel receiver — listens for frames pushed from GlazeBid Studio
  useEstimatorSync();
  // IPC/localStorage receiver — RawTakeoff[] from new Studio engine
  useInboxSync();

  const [isElectron, setIsElectron] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectData, setProjectData] = useState(null); // Full project.aiq data
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectType, setProjectType] = useState('pdf'); // 'pdf' or 'tiles'
  const [currentView, setCurrentView] = useState('home'); // Navigation state
  const [activeSidebarSection, setActiveSidebarSection] = useState(null);
  const [showProjectList, setShowProjectList] = useState(false); // Toggle between intake and project list
  const [pageInfo, setPageInfo] = useState({ numPages: 0, currentPage: 1 }); // Track current document's pages
  const [requestedPage, setRequestedPage] = useState(null); // For sidebar to request page changes
  const pdfViewerRef = useRef(null); // Ref to PDFViewer for calling its functions
  const [pageLabels, setPageLabels] = useState({});
  const [isExtractingLabel, setIsExtractingLabel] = useState(false);
  const [activeCategory, setActiveCategory] = useState('architectural'); // For category-based navigation
  const [documentViewerPath, setDocumentViewerPath] = useState(null); // Path to spec document

  // Bid-wide financial settings — lifted here so ProjectHome and BidSheet share the same values
  const [bidSettings, setBidSettings] = useState(DEFAULT_BID_SETTINGS);

  // Region selection state for page labeling
  const [regionSelectionMode, setRegionSelectionMode] = useState(null); // { type: 'pageNumber'|'sheetTitle', callback }
  
  // Bookmark tracking
  const bookmarkCallbackRef = useRef(null);
  const handleMarkupChange = useCallback((pageNum) => {
    if (bookmarkCallbackRef.current) {
      bookmarkCallbackRef.current(pageNum);
    }
  }, []);
  
  // Stable callback for page info changes
  const handlePageInfoChange = useCallback((info) => {
    setPageInfo(info);
  }, []);
  
  // Load saved page labels when sheet changes
  useEffect(() => {
    // Page labels are persisted locally (no backend)
    if (currentProject && selectedSheet) {
      try {
        const key = `glazebid:pageLabels:${currentProject}:${selectedSheet}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          setPageLabels(JSON.parse(saved));
        } else {
          setPageLabels({});
        }
      } catch {
        setPageLabels({});
      }
    }
  }, [currentProject, selectedSheet]);
  
  // PDF manipulation handlers
  const handleRotatePage = () => {
    if (pdfViewerRef.current?.rotatePage) {
      pdfViewerRef.current.rotatePage();
    }
  };
  
  const handleDeletePage = () => {
    if (confirm(`Delete page ${pageInfo.currentPage}? This cannot be undone.`)) {
      alert('Delete page functionality coming soon - will remove page from PDF');
    }
  };
  
  const handleMovePage = (fromPage, afterPage) => {
    // If called with arguments, it's from copy/paste
    if (fromPage && afterPage !== undefined) {
      console.log(`📋 Moving/duplicating page ${fromPage} after page ${afterPage}`);
      alert(`Move/duplicate page ${fromPage} after page ${afterPage} - functionality coming soon`);
    } else {
      // Legacy: prompt-based move
      const newPage = prompt(`Move page ${pageInfo.currentPage} to position:`, pageInfo.currentPage);
      if (newPage && parseInt(newPage) !== pageInfo.currentPage) {
        alert(`Move page functionality coming soon - will move page ${pageInfo.currentPage} to ${newPage}`);
      }
    }
  };
  
  const handleRenamePage = (pageNum, newLabel) => {
    console.log(`✏️ Renaming page ${pageNum} to "${newLabel}"`);
    setPageLabels(prev => {
      const updated = { ...prev, [pageNum]: newLabel };
      // Persist immediately so the label survives sheet changes and refresh
      if (currentProject && selectedSheet) {
        try {
          localStorage.setItem(`glazebid:pageLabels:${currentProject}:${selectedSheet}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  };

  // Start region selection for page labeling
  const handleStartRegionSelection = useCallback((regionType, callback) => {
    console.log(`🎯 Starting region selection for: ${regionType}`);
    setRegionSelectionMode({
      type: regionType,
      callback: callback,
    });
    
    // Tell PDF viewer to enter region selection mode
    if (pdfViewerRef.current?.startRegionSelection) {
      pdfViewerRef.current.startRegionSelection(regionType, (region) => {
        console.log(`✅ Region selected:`, region);
        // Call the callback from SheetSidebar with the selected region
        callback(region);
        // Clear region selection mode
        setRegionSelectionMode(null);
      });
    }
  }, []);
  
  // Handle sheet selection and load page labels if available
  const handleSelectSheet = (sheetId) => {
    setSelectedSheet(sheetId);
    // Persist so navigating back to the viewer restores the correct sheet
    if (currentProject) {
      try {
        localStorage.setItem(`glazebid:selectedSheet:${currentProject}`, sheetId);
      } catch {}
    }

    // Try to load saved page labels from localStorage
    if (currentProject) {
      try {
        const key = `glazebid:pageLabels:${currentProject}:${sheetId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          setPageLabels(JSON.parse(saved));
        } else {
          // Fallback to sheet.pageLabels embedded in sheet data
          const sheet = sheets.find(s => s.id === sheetId);
          if (sheet?.pageLabels && Object.keys(sheet.pageLabels).length > 0) {
            const numericLabels = {};
            Object.entries(sheet.pageLabels).forEach(([key, value]) => {
              numericLabels[parseInt(key)] = value;
            });
            setPageLabels(numericLabels);
          } else {
            setPageLabels({});
          }
        }
      } catch {
        setPageLabels({});
      }
    } else {
      // No project, use sheet.pageLabels
      const sheet = sheets.find(s => s.id === sheetId);
      if (sheet?.pageLabels && Object.keys(sheet.pageLabels).length > 0) {
        const numericLabels = {};
        Object.entries(sheet.pageLabels).forEach(([key, value]) => {
          numericLabels[parseInt(key)] = value;
        });
        setPageLabels(numericLabels);
      } else {
        setPageLabels({});
      }
    }
  };
  
  const handleExtractLabel = () => {
    if (pdfViewerRef.current?.extractPageLabel) {
      pdfViewerRef.current.extractPageLabel();
    }
  };
  
  // Safety check to reset to home screen
  const resetToHome = () => {
    setCurrentProject(null);
    setProjectData(null);
    setSelectedSheet(null);
    setShowProjectList(false);
    localStorage.removeItem('currentProject');
    localStorage.removeItem('projectData');
    localStorage.removeItem('last_project'); // Clear any saved session
    window.location.hash = '';
    setCurrentView('home');
  };

  // MenuBar handlers
  const handleSaveProject = () => {
    // Trigger save via PDFViewer or backend
    if (pdfViewerRef.current?.saveMarkups) {
      pdfViewerRef.current.saveMarkups();
    }
  };

  const handleUndo = () => {
    if (pdfViewerRef.current?.undo) {
      pdfViewerRef.current.undo();
    }
  };

  const handleRedo = () => {
    if (pdfViewerRef.current?.redo) {
      pdfViewerRef.current.redo();
    }
  };

  const handleExport = async (format) => {
    if (!currentProject) {
      console.warn('No project to export');
      return;
    }
    // Export via backend not yet available in local/Electron mode
    alert(`${format === 'pdf' ? 'PDF' : 'Excel'} export will be available when the backend service is running.`);
  };

  const handleClearMarkups = () => {
    console.log('clearAllMarkups:', pdfViewerRef.current?.clearAllMarkups);

    if (!pdfViewerRef.current) {
      alert('PDF Viewer not loaded yet');
      return;
    }

    if (!pdfViewerRef.current.clearAllMarkups) {
      alert('clearAllMarkups function not available');
      return;
    }

    const confirmed = window.confirm(
      '⚠️ Are you sure you want to clear ALL markups?\n\n' +
      'This will remove every markup on every page.\n\n' +
      '🚫 THIS ACTION CANNOT BE UNDONE!'
    );
    if (confirmed) {
      pdfViewerRef.current.clearAllMarkups();
      console.log('✅ clearAllMarkups executed');
    }
  };

  const handleZoomIn = () => {
    if (pdfViewerRef.current?.zoomIn) {
      pdfViewerRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (pdfViewerRef.current?.zoomOut) {
      pdfViewerRef.current.zoomOut();
    }
  };

  const handleResetView = () => {
    if (pdfViewerRef.current?.resetView) {
      pdfViewerRef.current.resetView();
    }
  };

  const [windowSystems, setWindowSystems] = useState([]); // You should load this from your backend or define it
  const [projectSheets, setProjectSheets] = useState([]); // Add this if not present
  const [sheets, setSheets] = useState([]);

  // PDF file data loaded via Electron IPC or File API
  const [pdfFileData, setPdfFileData] = useState(null);

  // Check if running inside GlazeBid's own Electron shell (not VS Code Simple Browser)
  useEffect(() => {
    setIsElectron(window.electronAPI?.isDesktop === true);
  }, []);

  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('currentProject', currentProject);
      // Load full project data
      loadProjectData(currentProject);
      // Restore per-project bid settings (labor rate, markup %, etc.)
      try {
        const savedBS = localStorage.getItem(`glazebid:bidSettings:${currentProject}`);
        setBidSettings(savedBS ? { ...DEFAULT_BID_SETTINGS, ...JSON.parse(savedBS) } : DEFAULT_BID_SETTINGS);
      } catch {
        setBidSettings(DEFAULT_BID_SETTINGS);
      }
      // Restore last selected sheet for this project
      try {
        const savedSheet = localStorage.getItem(`glazebid:selectedSheet:${currentProject}`);
        if (savedSheet) setSelectedSheet(savedSheet);
      } catch {}
    } else {
      localStorage.removeItem('currentProject');
      localStorage.removeItem('projectData');
    }
  }, [currentProject]);

  // Glass-card cursor glow — tracks mouse position per card
  useEffect(() => {
    const handler = (e) => {
      document.querySelectorAll('.glass-card').forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Persist bid settings whenever they change (per-project)
  useEffect(() => {
    if (!currentProject) return;
    try {
      localStorage.setItem(`glazebid:bidSettings:${currentProject}`, JSON.stringify(bidSettings));
    } catch {}
  }, [bidSettings, currentProject]);

  // Maintain a persistent project registry so the home screen always shows all projects
  const upsertProjectRegistry = (name) => {
    if (!name?.trim()) return;
    try {
      const raw = localStorage.getItem('glazebid:projectRegistry');
      const registry = raw ? JSON.parse(raw) : [];
      const clean = name.trim();
      const entry = { name: clean, modified: new Date().toISOString() };
      const idx = registry.findIndex(p => p.name === clean);
      if (idx >= 0) registry[idx] = entry; else registry.push(entry);
      localStorage.setItem('glazebid:projectRegistry', JSON.stringify(registry));
    } catch { /* ignore */ }
  };

  // Load project data from local storage (no backend)
  const loadProjectData = async (projectName) => {
    try {
      const saved = localStorage.getItem('projectData');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.projectName === projectName || data.name === projectName) {
          setProjectData(data);
          return;
        }
      }
      // No saved data for this project — start fresh
      setProjectData({ projectName, sheets: [], metadata: {} });
      localStorage.setItem('projectData', JSON.stringify({ projectName, sheets: [], metadata: {} }));
    } catch (err) {
      console.warn('Could not load project data:', err.message);
      setProjectData({ projectName });
    }
  };

  // Restore project from localStorage on mount
  useEffect(() => {
    const savedProject = localStorage.getItem('currentProject');
    const savedData = localStorage.getItem('projectData');
    if (savedProject && savedData) {
      setCurrentProject(savedProject);
      setProjectData(JSON.parse(savedData));
    }
  }, []);

  useEffect(() => {
    const fetchSheets = async () => {
      // Sheets load from local project data — no backend required
      if (currentProject && (currentView === 'viewer' || currentView === 'projectHome')) {
        try {
          const saved = localStorage.getItem(`glazebid:sheets:${currentProject}`);
          if (saved) {
            const data = JSON.parse(saved);
            setSheets(data.sheets || []);
          } else {
            setSheets([]);
          }
        } catch (err) {
          console.warn('Failed to load sheets:', err.message);
          setSheets([]);
        }
      }
    };
    fetchSheets();
  }, [currentProject, currentView, selectedSheet]);

  // Load PDF file data when entering viewer mode
  useEffect(() => {
    if (currentView !== 'viewer' || !currentProject) {
      setPdfFileData(null);
      return;
    }
    const loadPdf = async () => {
      // Try 1: Electron IPC — read from filesystem path stored at intake
      const filePath = localStorage.getItem(`glazebid:filePath:${currentProject}`);
      if (filePath && window.electronAPI?.readPdfFile) {
        try {
          const result = await window.electronAPI.readPdfFile(filePath);
          if (result?.ok && result.buffer) {
            setPdfFileData({ data: result.buffer });
            return;
          }
        } catch (err) {
          console.warn('Electron PDF load failed, trying fallback:', err.message);
        }
      }
      // Try 2: File object from context (survives only within session)
      // architecturalFiles are File objects stored by ProjectIntake
      // We can't access context here directly, so we rely on the Electron path above
      console.warn('No PDF source available for project:', currentProject);
    };
    loadPdf();
  }, [currentView, currentProject, selectedSheet]);

  // 1. Ensure you have the upload function defined
  const handleUpload = async (event) => {
    // Legacy upload path — handled by ProjectIntake now
    console.log('handleUpload called (legacy path)');
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    if (view === 'home') {
      resetToHome();
    } else if (view === 'viewer' && currentProject) {
      // Already on viewer
    }
  };

  // Handle navigation from WorkflowSidebar or ProjectHome
  const handleCategoryNavigate = (navData) => {
    console.log('🧭 Category navigation:', navData);
    
    if (navData.view === 'projectHome') {
      setCurrentView('projectHome');
      return;
    }
    
    if (navData.view === 'documentViewer') {
      // Find specs document from sheets
      const specsDoc = sheets.find(s => s.category === 'Specifications');
      if (specsDoc) {
        setDocumentViewerPath(specsDoc.id);
        setCurrentView('documentViewer');
      } else {
        alert('No specification documents found in this project.');
      }
      return;
    }
    
    // Drawing viewer navigation - set active category and go to viewer
    if (navData.view === 'pdfViewer') {
      setActiveCategory(navData.category || 'architectural');
      
      // Auto-select first sheet of the category
      const categoryMap = {
        'architectural': 'Architectural',
        'structural': 'Structural',
        'other': 'Other'
      };
      const targetCategory = categoryMap[navData.category] || 'Architectural';
      const categorySheet = sheets.find(s => s.category === targetCategory);
      
      if (categorySheet) {
        setSelectedSheet(categorySheet.id);
      }
      
      setCurrentView('viewer');
    }
  };

  // Handle project ready from intake
  const handleProjectReady = async (intakeResults) => {
    console.log('🚀 handleProjectReady called with:', intakeResults);
    
    try {
      const projectName = intakeResults.projectName;
      console.log('   Setting current project to:', projectName);
      setCurrentProject(projectName);
      upsertProjectRegistry(projectName);
      
      // Load full project data — non-fatal, proceed to project home regardless
      console.log('   Loading project data...');
      try {
        await loadProjectData(projectName);
        console.log('   ✅ Project data loaded');
      } catch (loadErr) {
        console.warn('   ⚠️ Could not load project data (will proceed anyway):', loadErr.message);
      }
      
      // ── Rehydration Engine (project intake / re-open) ──────────────────────
      // For brand-new projects there won't be a saved bid, but if the estimator
      // re-opens a project they started earlier this will restore their work.
      try {
        const payload = await loadProjectFromCloud(projectName);
        if (payload) {
          useBidStore.getState().rehydrateBid({
            frames:       payload.takeoff?.frames          ?? [],
            financials:   payload.financials               ?? null,
            vendorQuotes: payload.financials?.vendorQuotes ?? null,
          });
          console.log('✅ Bid rehydrated from cloud for:', projectName);
        } else {
          useBidStore.getState().clearBid();
        }
      } catch (rehydErr) {
        console.warn('⚠️ Rehydration failed (non-fatal):', rehydErr.message);
      }
      // ── End Rehydration ──────────────────────────────────────────────────────

      // Always navigate to Project Home after intake
      console.log('   Navigating to Project Home');
      setCurrentView('projectHome');

      console.log('✅ Project ready complete');
    } catch (error) {
      console.error('❌ Error in handleProjectReady:', error);
      alert(`Failed to open project: ${error.message}`);
      resetToHome();
    }
  };

  // Handle selecting existing project
  const handleProjectSelect = async (project) => {
    setCurrentProject(project.name);
    upsertProjectRegistry(project.name);
    await loadProjectData(project.name);
    setShowProjectList(false);

    // ── Rehydration Engine ───────────────────────────────────────────────────
    // Silently restore the last saved bid (frames + financials) from the cloud.
    // If there's no saved bid yet (new project), clearBid wipes any stale state
    // from a previously opened project.
    try {
      const payload = await loadProjectFromCloud(project.name);
      if (payload) {
        useBidStore.getState().rehydrateBid({
          frames:       payload.takeoff?.frames       ?? [],
          financials:   payload.financials            ?? null,
          vendorQuotes: payload.financials?.vendorQuotes ?? null,
        });
        console.log('✅ Bid rehydrated from cloud for:', project.name);
      } else {
        useBidStore.getState().clearBid(); // wipe stale data from previous project
        console.log('ℹ️ No saved bid found for:', project.name, '— starting fresh');
      }
    } catch (rehydErr) {
      console.warn('⚠️ Rehydration failed (non-fatal):', rehydErr.message);
    }
    // ── End Rehydration ──────────────────────────────────────────────────────

    setCurrentView('projectHome');
  };

  // Calculate category counts from sheets for ProjectHome
  const getCategoryCounts = () => {
    const counts = {
      architectural: 0,
      structural: 0,
      specifications: 0,
      other: 0
    };
    
    sheets.forEach(sheet => {
      const cat = (sheet.category || '').toLowerCase();
      if (cat === 'architectural') counts.architectural++;
      else if (cat === 'structural') counts.structural++;
      else if (cat === 'specifications') counts.specifications++;
      else counts.other++;
    });
    
    return counts;
  };

  const SettingsView = () => {
    const [settingsTab, setSettingsTab] = React.useState('training');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 70px)' }}>

        {/* Settings header + tab nav — always visible */}
        <div style={{ padding: '16px 32px 0', background: 'var(--bg-deep)', borderBottom: '1px solid #30363d', flexShrink: 0 }}>
          <button
            onClick={() => setCurrentView(currentProject ? 'projectHome' : 'home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#8b949e',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '0',
              marginBottom: '8px',
            }}
          >
            ← Back
          </button>
          <h1 style={{ ...styles.settingsTitle, fontSize: '20px', margin: '0' }}>⚙️ System Configuration</h1>
          <p style={{ ...styles.settingsSubtitle, fontSize: '13px', marginTop: '3px', marginBottom: '0' }}>Manage AI training, admin settings, and system preferences</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => setSettingsTab('training')}
              style={{
                padding: '8px 20px',
                backgroundColor: settingsTab === 'training' ? '#1c2128' : 'transparent',
                border: 'none',
                borderBottom: settingsTab === 'training' ? '2px solid #58a6ff' : '2px solid transparent',
                color: settingsTab === 'training' ? '#58a6ff' : '#8b949e',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: '0.2s'
              }}
            >
              🧠 AI Training
            </button>
            <button
              onClick={() => setSettingsTab('admin')}
              style={{
                padding: '8px 20px',
                backgroundColor: settingsTab === 'admin' ? '#1c2128' : 'transparent',
                border: 'none',
                borderBottom: settingsTab === 'admin' ? '2px solid #58a6ff' : '2px solid transparent',
                color: settingsTab === 'admin' ? '#58a6ff' : '#8b949e',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: '0.2s'
              }}
            >
              🔒 Admin Dashboard
            </button>
          </div>
        </div>

        {/* AI Training Tab — padded narrow container */}
        {settingsTab === 'training' && (
          <div style={{ padding: '32px 40px', maxWidth: '900px', width: '100%', boxSizing: 'border-box' }}>
            <div style={styles.settingsSection}>
              <h2 style={styles.sectionTitle}>🧠 AI Training</h2>
              <p style={styles.sectionDescription}>
                Import your previously marked-up Bluebeam drawings to train the AI on your specific markup patterns and conventions.
              </p>
              <div style={styles.trainingPanelWrapper}>
                <AiTrainingPanel 
                  projectName="Master_Training" 
                  onTrainingComplete={(result) => {
                    console.log('Training complete:', result);
                  }}
                />
              </div>
            </div>
            <div style={styles.settingsSection}>
              <h2 style={styles.sectionTitle}>📁 Data Management</h2>
              <p style={styles.sectionDescription}>Coming soon: Export/import settings, backup training data, manage projects.</p>
            </div>
          </div>
        )}

        {/* Admin Dashboard Tab — full width, no extra padding */}
        {settingsTab === 'admin' && (
          <div style={{ flex: 1, padding: '24px', boxSizing: 'border-box', overflowY: 'auto' }}>
            <AdminDashboard onClose={() => setCurrentView('projectHome')} />
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    // Settings view - must be checked before the !currentProject guard
    if (currentView === 'settings') {
      return <SettingsView />;
    }

    // Project Intake or Project List (Home)
    if (currentView === 'home' || !currentProject) {
      // Show project list if requested
      if (showProjectList) {
        return (
          <ProjectList 
            onProjectSelect={handleProjectSelect}
            onNewProject={() => setShowProjectList(false)}
            onSettings={() => setCurrentView('settings')}
          />
        );
      }
      
      // Otherwise show intake
      return (
        <ProjectIntake 
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onProjectReady={handleProjectReady}
          onShowProjects={() => setShowProjectList(true)}
          onSettings={() => setCurrentView('settings')}
        />
      );
    }

    // Project Home Page (new landing after project load)
    if (currentView === 'projectHome') {
      const counts = getCategoryCounts();
      return (
        <ProjectHome 
          project={currentProject}
          projectData={projectData}
          categoryCounts={counts}
          sheets={sheets}
          onCategorySelect={handleCategoryNavigate}
          onBack={resetToHome}
          onNavigate={handleViewChange}
          bidSettings={bidSettings}
          onBidSettingsChange={setBidSettings}
          activeSidebarSection={activeSidebarSection}
          setActiveSidebarSection={setActiveSidebarSection}
        />
      );
    }

    // Spec Viewer for Specifications
    if (currentView === 'documentViewer') {
      return (
        <SpecViewer 
          project={currentProject}
          documentPath={documentViewerPath}
          documentName={sheets.find(s => s.id === documentViewerPath)?.name || 'Specifications'}
          onClose={() => setCurrentView('projectHome')}
        />
      );
    }

    // BidSheet (New Labor Estimation)
    if (currentView === 'bidsheet') {
      return <BidSheet project={currentProject} onNavigate={setCurrentView} bidSettings={bidSettings} onBidSettingsChange={setBidSettings} />;
    }

    // Bid Cart & Labor Engine
    if (currentView === 'bid-cart') {
      return <BidCart project={currentProject} onNavigate={setCurrentView} />;
    }

    // Proposal Generator
    if (currentView === 'proposal') {
      return <ProposalGenerator project={currentProject} />;
    }

    // NFRC Calculator
    if (currentView === 'nfrc') {
      return (
        <NFRCCalculator 
          project={currentProject}
          sheet={selectedSheet}
        />
      );
    }

    // RFQ Manager
    if (currentView === 'rfq') {
      return (
        <RFQManager 
          project={currentProject}
          onOpenDrawing={(sheet, page) => {
            setSelectedSheet(sheet);
            setRequestedPage(page);
            setCurrentView('viewer');
          }}
        />
      );
    }

    // Addendum Viewer
    if (currentView === 'addendum') {
      return <AddendumViewer project={currentProject} />;
    }

    // Door Schedule
    if (currentView === 'doors') {
      return <DoorSchedule project={currentProject} projectData={projectData} />;
    }

    // Placeholder views for modules not yet implemented
    if (['quote', 'structural'].includes(currentView)) {
      return (
        <div style={styles.placeholderContainer}>
          <div style={styles.placeholderIcon}>
            {currentView === 'quote' && '💰'}
            {currentView === 'structural' && '🏗️'}
          </div>
          <h2 style={styles.placeholderTitle}>
            {currentView === 'quote' && 'Quote Generator'}
            {currentView === 'structural' && 'Structural Analysis'}
          </h2>
          <p style={styles.placeholderText}>UI coming soon</p>
          <p style={styles.placeholderSubtext}>Backend module ready • Frontend interface in development</p>
        </div>
      );
    }

    // Studio Takeoffs Inbox
    if (currentView === 'inbox') {
      return (
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg-deep)' }}>
          <h2 style={{ color: '#60a5fa', marginBottom: '16px', fontSize: '18px', fontWeight: 700 }}>📥 Studio Takeoffs</h2>
          <StudioInbox />
        </div>
      );
    }

    // PDF Viewer (default project view)
    const viewerFileUrl = pdfFileData;
    const viewerPageNumber = requestedPage ?? pageInfo.currentPage ?? 1;

    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
        <SheetSidebar
          project={currentProject}
          sheetId={selectedSheet}
          numPages={pageInfo.numPages}
          currentPage={pageInfo.currentPage}
          onPageChange={(page) => setRequestedPage(page)}
          onRotate={(dir) => pdfViewerRef.current?.rotatePage?.(dir)}
          onDeletePage={(page) => pdfViewerRef.current?.deletePage?.(page)}
          onMovePage={(from, to) => pdfViewerRef.current?.movePage?.(from, to)}
          onExtractLabel={() => {}}
          isExtractingLabel={false}
          pageLabels={pageLabels}
          currentPageNum={viewerPageNumber}
          sheets={sheets}
          onSelectSheet={handleSelectSheet}
          onRenamePage={handleRenamePage}
          onStartRegionSelection={handleStartRegionSelection}
          onUpdateBookmarks={() => {}}
          pdfData={pdfFileData}
        />
        <PDFWorkspace
          file={viewerFileUrl}
          projectId={currentProject}
        />
      </div>
    );
  };

  return (
    <ProjectProvider> {/* Wrap entire app in ProjectProvider */}
      <div style={styles.appContainer}>
        {/* Custom title bar for Electron - includes menu when in project */}
        {isElectron && (
          <CustomTitleBar 
            showMenu={currentView !== 'home' && currentProject}
            onSave={handleSaveProject}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onExport={handleExport}
            onClearMarkups={handleClearMarkups}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
          />
        )}
        
        {/* 64px icon rail — home page only */}
        {currentView === 'home' && <SidebarNav currentView={currentView} onViewChange={handleViewChange} />}

        <div style={{...styles.mainWrapper, marginTop: isElectron ? '40px' : '0', marginLeft: currentView === 'home' ? '64px' : '0'}}>
          {/* Show global breadcrumb header whenever a project is loaded (all views except bare home/settings) */}
          {currentView !== 'home' && currentView !== 'documentViewer' && currentView !== 'settings' && currentProject && (
            <>
              <Header 
                project={currentProject} 
                projectData={projectData}
                onBack={resetToHome}
                onBackToProjectHome={currentView === 'projectHome' ? resetToHome : () => setCurrentView('projectHome')}
              />
              {/* Menu bar for non-Electron mode (browser) */}
              {!isElectron && (
                <MenuBar 
                  onSave={handleSaveProject}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onExport={handleExport}
                  onClearMarkups={handleClearMarkups}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onResetView={handleResetView}
                />
              )}
            </>
          )}
          {/* Project-level sidebar — shown for all inner project views */}
          {currentProject && currentView !== 'home' && currentView !== 'settings' && currentView !== 'documentViewer' ? (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <ProjectSideNav
                currentView={currentView}
                onNavigate={handleViewChange}
                project={currentProject}
                projectData={projectData}
                sheets={sheets}
                activeSidebarSection={activeSidebarSection}
                setActiveSidebarSection={setActiveSidebarSection}
                totalSheets={sheets ? sheets.filter(s => ['Architectural','Structural','Other'].includes(s.category)).length : 0}
              />
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {renderContent()}
              </div>
            </div>
          ) : renderContent()}
        </div>
      </div>
    </ProjectProvider>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column', /* sidebar is fixed; no flex row needed */
    height: '100vh',
    width: '100vw',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)',
    overflow: 'hidden'
  },
  mainWrapper: {
    flex: 1,              // Take up all remaining width
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },
  workspace: {
    display: 'flex',
    flex: 1,           // Fill remaining space under header
    height: 'calc(100vh - 70px)', // Full screen minus header height
    overflow: 'hidden',
    backgroundColor: 'var(--bg-deep)',
    position: 'relative',
    gap: 0,
  },
  centeredMessage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(45,51,59,0.96)',
    zIndex: 10,
    color: 'var(--text-primary)',
    fontSize: '1.2rem',
    fontWeight: 500,
    letterSpacing: '0.01em',
    textAlign: 'center',
    pointerEvents: 'none',
  },
  backBtn: {
    position: 'absolute',
    top: '20px',
    left: '280px',  // Move past sidebar
    zIndex: 200,     // Above everything but keep pointer-events on button only
    padding: '10px 20px',
    fontSize: '14px',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  placeholderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 70px)',
    backgroundColor: 'var(--bg-deep)',
    color: 'var(--text-primary)',
    textAlign: 'center',
    padding: '40px',
  },
  placeholderIcon: {
    fontSize: '80px',
    marginBottom: '20px',
    opacity: 0.7,
  },
  placeholderTitle: {
    fontSize: '28px',
    fontWeight: '600',
    marginBottom: '12px',
    color: 'var(--text-primary)',
  },
  placeholderText: {
    fontSize: '16px',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  placeholderSubtext: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  settingsContainer: {
    padding: '40px',
    maxWidth: '900px',
    margin: '0 auto',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: 'var(--bg-deep)',
    overflowY: 'auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  settingsHeader: {
    marginBottom: '40px',
  },
  settingsTitle: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
  },
  settingsSubtitle: {
    fontSize: '16px',
    color: 'var(--text-secondary)',
    marginTop: '8px',
  },
  settingsSection: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid var(--border-subtle)',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },
  sectionDescription: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '20px',
  },
  trainingPanelWrapper: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  fullScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-deep)',
  },
};

export default App;

