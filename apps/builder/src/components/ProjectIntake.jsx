import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { pdfjs } from 'react-pdf';
import { 
  Upload, FileText, FolderOpen, CheckCircle2, AlertCircle, 
  Clock, BookOpen, Settings, Zap, BarChart3, HelpCircle,
  Plus, Search, TrendingUp, Calendar, Download
} from 'lucide-react';
import StatusChip from './StatusChip';
import topLogo from '../assets/TOP_LOGO.svg';
import { extractAnnotations } from '../utils/pdfAnnotationParser';
import { buildBluebeamFramesFromAnnotations } from '../utils/bluebeamParser';
import { useProject } from '../context/ProjectContext';
import { saveToLocalFolder, isFileSystemAccessSupported } from '../utils/saveSortedFiles';

const ProjectIntake = ({ onProjectReady, onShowProjects, onSettings }) => {
  const { setMarkups, setArchitecturalFiles, setIntakeFileCategories } = useProject();
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState(''); // Text describing current stage
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [projectStats, setProjectStats] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(() => {
    // Load calendar preference from localStorage
    const saved = localStorage.getItem('calendarEnabled');
    return saved === 'true';
  });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [pendingFiles, setPendingFiles] = useState(null);
  const [pendingFileCategories, setPendingFileCategories] = useState({}); // { filename → 'drawing'|'spec' }
  const [pendingDrawings, setPendingDrawings] = useState([]);
  const [pendingSpecs, setPendingSpecs]       = useState([]);
  const [draggingZone, setDraggingZone]       = useState(null); // 'drawings' | 'specs' | null
  const [activeFilter,  setActiveFilter]       = useState('all'); // 'all' | 'mine' | 'urgent'
  const [searchQuery,   setSearchQuery]        = useState('');
  const [fileCategories, setFileCategories]   = useState({}); // from backend: { filename → 'Architectural'|... }
  const [localSaveProgress, setLocalSaveProgress] = useState(null); // null | { done, total, current }
  const [localSaveResult, setLocalSaveResult] = useState(null);
  const [showLocalSavePrompt, setShowLocalSavePrompt] = useState(false);
  const [pendingNavigationData, setPendingNavigationData] = useState(null); // held until save/skip
  const [showProjectMetadataModal, setShowProjectMetadataModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [bidDate, setBidDate] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedAnnotations, setScannedAnnotations] = useState(null);
  const [scannedBluebeamFrames, setScannedBluebeamFrames] = useState(null);
  const [scanResultMessage, setScanResultMessage] = useState('');
  const projectNameInputRef = useRef(null);

  // Imperatively focus the project name input when the modal opens.
  // Using a ref + setTimeout is necessary because alert() and setIsScanning
  // re-renders destroy autoFocus before the user can type.
  useEffect(() => {
    if (showProjectMetadataModal) {
      const t = setTimeout(() => projectNameInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [showProjectMetadataModal]);

  // Fetch recent projects on mount
  useEffect(() => {
    fetchRecentProjects();
    fetchProjectStats();
    if (calendarEnabled) {
      fetchUpcomingDeadlines();
    }
  }, [calendarEnabled]);

  // Save calendar preference
  useEffect(() => {
    localStorage.setItem('calendarEnabled', calendarEnabled.toString());
  }, [calendarEnabled]);

  const fetchUpcomingDeadlines = async () => {
    // Mock deadlines for now - will connect to backend later
    const mockDeadlines = [
      {
        id: 1,
        title: 'Hospital Project Bid Due',
        date: '2026-01-24T14:00:00',
        project: 'Hospital Expansion',
        priority: 'high',
      },
      {
        id: 2,
        title: 'Chipotle Shop Drawings',
        date: '2026-01-26T17:00:00',
        project: 'Chipotle Fountain Valley',
        priority: 'medium',
      },
      {
        id: 3,
        title: 'Site Visit - Office Tower',
        date: '2026-01-30T10:00:00',
        project: 'Downtown Office Complex',
        priority: 'low',
      },
    ];
    setUpcomingDeadlines(mockDeadlines);
  };

  const toggleCalendar = () => {
    setCalendarEnabled(!calendarEnabled);
  };

  const fetchRecentProjects = async () => {
    try {
      const projectMap = new Map();

      const addProject = (name, modified = null, status = 'in_progress') => {
        if (!name || typeof name !== 'string') return;
        const cleanName = name.trim();
        if (!cleanName) return;
        const date = modified ? new Date(modified) : new Date();
        const normalizedModified = Number.isNaN(date.getTime())
          ? new Date().toISOString()
          : date.toISOString();
        const existing = projectMap.get(cleanName);
        if (!existing) {
          projectMap.set(cleanName, { name: cleanName, status, modified: normalizedModified });
          return;
        }
        if (new Date(normalizedModified).getTime() > new Date(existing.modified).getTime()) {
          existing.modified = normalizedModified;
        }
      };

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        let match = key.match(/^glazebid:sheets:(.+)$/);
        if (match) { addProject(match[1]); continue; }
        match = key.match(/^glazebid:bidSettings:(.+)$/);
        if (match) { addProject(match[1]); continue; }
        match = key.match(/^glazebid:selectedSheet:(.+)$/);
        if (match) { addProject(match[1]); continue; }
      }

      addProject(localStorage.getItem('currentProject'));

      try {
        const pdRaw = localStorage.getItem('projectData');
        if (pdRaw) {
          const pd = JSON.parse(pdRaw);
          addProject(pd?.projectName || pd?.name, pd?.updatedAt || pd?.modified);
        }
      } catch { /* ignore */ }

      for (const listKey of ['glazebid:projects', 'recentProjects', 'projects']) {
        try {
          const raw = localStorage.getItem(listKey);
          if (!raw) continue;
          const arr = JSON.parse(raw);
          if (!Array.isArray(arr)) continue;
          arr.forEach(p => {
            if (typeof p === 'string') addProject(p);
            else addProject(
              p?.projectName || p?.name || p?.title,
              p?.updatedAt || p?.modified || p?.lastOpened,
              p?.status || 'in_progress'
            );
          });
        } catch { /* ignore */ }
      }

      // Project registry — updated every time a project is opened
      try {
        const regRaw = localStorage.getItem('glazebid:projectRegistry');
        if (regRaw) {
          const reg = JSON.parse(regRaw);
          if (Array.isArray(reg)) reg.forEach(p => addProject(p.name, p.modified));
        }
      } catch { /* ignore */ }

      // Scan glazebid:bid: and glazebid:filePath: keys added by current version
      for (let j = 0; j < localStorage.length; j += 1) {
        const key = localStorage.key(j);
        if (!key) continue;
        const m = key.match(/^glazebid:(?:bid|filePath|bidSummary):(.+)$/);
        if (m) { addProject(m[1]); }
      }

      const recovered = [...projectMap.values()].sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );
      setRecentProjects(recovered);
    } catch {
      setRecentProjects([]);
    }
  };

  const fetchProjectStats = async () => {
    // No backend — stats derive from local .gbid files
  };

  // Determine project status based on available data
  const getProjectStatus = (project) => {
    // If currently being processed
    if (project.isProcessing) return 'scanning';
    
    // Check for takeoff data but no quote
    if (project.hasTakeoff && !project.hasQuote) return 'drafting';
    
    // Check if quote is generated
    if (project.hasQuote) return 'completed';
    
    // If modified in last 24 hours, consider in progress
    const lastModified = new Date(project.modified).getTime();
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (lastModified > dayAgo) return 'in_progress';
    
    // Default to new project
    return 'new';
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragging(true);
    }
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear the overlay when the cursor truly leaves the intake page
    // (not when it moves between child elements within the page)
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.zip') || 
             f.type === 'application/pdf' || f.type === 'application/zip';
    });

    if (files.length > 0) {
      // Route through the two-zone sort modal so the user can categorise
      // drawings vs specifications before naming the project.
      setPendingDrawings(files);
      setPendingSpecs([]);
      setPendingFileCategories({});
      setShowUploadModal(true);
    } else {
      setError('Please drop PDF or ZIP files only');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Generate default project name from first file
      const defaultName = files[0].name.replace(/\.(pdf|zip)$/i, '').replace(/_/g, ' ');
      setProjectName(defaultName);
      setBidDate('');
      setPendingFiles(files);
      setShowUploadModal(false); // Close upload modal
      setShowProjectMetadataModal(true); // Show metadata modal
    }
  };

  const handleFiles = async (files, projectNameInput, bidDateInput, fileCategories = {}) => {
    setProcessing(true);
    setProgress(0);
    setProgressStage('Creating project...');
    setError(null);
    setResults(null);

    try {
      // Build local project data — no backend upload required
      // PDFs are loaded directly in Studio via file dialog
      const localData = {
        projectName: projectNameInput,
        bidDate: bidDateInput,
        projectPath: '',
        architectural: (files || [])
          .filter(f => (fileCategories[f.name] || 'drawing') === 'drawing')
          .map(f => f.name),
        structural: [],
        spec: (files || [])
          .filter(f => fileCategories[f.name] === 'spec')
          .map(f => f.name),
        file_categories: fileCategories,
      };

      // Store file objects in ProjectContext if drawings were provided
      if (pendingDrawings.length > 0 && setArchitecturalFiles) {
        setArchitecturalFiles(pendingDrawings);
      }

      // Capture the real filesystem path of the first drawing for Studio PDF auto-load.
      // getPathForFile is synchronous and only available in Electron.
      const allDrawingFiles = pendingDrawings.length > 0
        ? pendingDrawings
        : (files || []).filter(f => (fileCategories[f.name] || 'drawing') === 'drawing');
      if (allDrawingFiles.length > 0 && window.electronAPI?.getPathForFile) {
        try {
          const fp = window.electronAPI.getPathForFile(allDrawingFiles[0]);
          if (fp) localStorage.setItem(`glazebid:filePath:${projectNameInput}`, fp);
        } catch { /* path capture is best-effort */ }
      }

      setProgress(100);
      setProgressStage('Project ready!');
      setProcessing(false);

      if (onProjectReady) {
        onProjectReady(localData);
      } else {
        setResults(localData);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to process documents');
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setProgress(0);
    setProgressStage('');
    setError(null);
  };

  const handleProjectMetadataSubmit = () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    
    setError(null); // Clear any previous errors
    setShowProjectMetadataModal(false);
    
    // If we have scanned annotations, inject them after project creation
    if (scannedAnnotations && scannedAnnotations.length > 0) {
      console.log('📥 Queueing', scannedAnnotations.length, 'annotations for import after project creation');
      // Store them temporarily to inject after project loads
      sessionStorage.setItem('pendingAnnotations', JSON.stringify(scannedAnnotations));
    }

    // Queue Bluebeam-parsed frames for the BidSheet auto-import
    if (scannedBluebeamFrames && scannedBluebeamFrames.length > 0) {
      console.log('📐 Queueing', scannedBluebeamFrames.length, 'BidSheet frame(s) for Bluebeam import');
      sessionStorage.setItem('pendingBluebeamFrames', JSON.stringify(scannedBluebeamFrames));
    }
    
    handleFiles(pendingFiles, projectName, bidDate, pendingFileCategories);
  };

  const handleProjectMetadataCancel = () => {
    setShowProjectMetadataModal(false);
    setPendingFiles(null);
    setPendingFileCategories({});
    setPendingDrawings([]);
    setPendingSpecs([]);
    setProjectName('');
    setBidDate('');
    setScannedAnnotations(null);
    setScannedBluebeamFrames(null);
    setIsScanning(false);
    setError(null); // Clear errors on cancel
  };

  // Smart Scan: Upload files from tile and scan them
  const handleSmartScanUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Filter PDF files only
    const pdfFiles = files.filter(f => 
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      setError('Please select PDF files only');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      let allAnnotations = [];

      // Scan each PDF file
      for (const file of pdfFiles) {
        console.log(`📄 Scanning ${file.name} for annotations...`);
        
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdfDocument = await loadingTask.promise;
        
        // Extract annotations from this PDF
        const annotations = await extractAnnotations(pdfDocument);
        console.log(`✅ Found ${annotations.length} annotations in ${file.name}`);
        
        allAnnotations = [...allAnnotations, ...annotations];
      }

      // Store scanned annotations (even if 0 found)
      setScannedAnnotations(allAnnotations.length > 0 ? allAnnotations : null);

      // Build Bluebeam frame payloads for the BidSheet
      const bbFrames = buildBluebeamFramesFromAnnotations(allAnnotations);
      setScannedBluebeamFrames(bbFrames.length > 0 ? bbFrames : null);
      console.log(`📐 Smart Scan: ${bbFrames.length} BidSheet frame(s) derived from annotations`);

      // Generate default project name from first file
      const defaultName = pdfFiles[0].name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
      setProjectName(defaultName);
      setBidDate('');
      
      // Store files for project creation
      setPendingFiles(pdfFiles);
      
      // Show result inline (never use alert() — it blocks focus restoration)
      setScanResultMessage(allAnnotations.length > 0
        ? `✅ ${allAnnotations.length} annotation(s) found — will be imported automatically`
        : `📑 No annotations found — you can still create the project manually`);
      
      // Open metadata modal to name the project
      setShowProjectMetadataModal(true);
      
    } catch (err) {
      console.error('❌ Smart Scan error:', err);
      setError(`Smart Scan failed: ${err.message}`);
      setScannedAnnotations(null);
    } finally {
      setIsScanning(false);
      // Reset file input
      e.target.value = '';
    }
  };

  // Smart Scan: Scan already uploaded files (from metadata modal)
  const handleSmartScan = async () => {
    if (!pendingFiles || isScanning) return;

    // Filter PDF files only
    const pdfFiles = Array.from(pendingFiles).filter(f => 
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      setError('No PDF files to scan in the upload');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      let allAnnotations = [];

      // Scan each PDF file
      for (const file of pdfFiles) {
        console.log(`📄 Scanning ${file.name} for annotations...`);
        
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdfDocument = await loadingTask.promise;
        
        // Extract annotations from this PDF
        const annotations = await extractAnnotations(pdfDocument);
        console.log(`✅ Found ${annotations.length} annotations in ${file.name}`);
        
        allAnnotations = [...allAnnotations, ...annotations];
      }

      if (allAnnotations.length === 0) {
        setError('📑 No annotations found in the PDF(s)');
        setScannedAnnotations(null);
        setScannedBluebeamFrames(null);
        setTimeout(() => setError(null), 3000);
      } else {
        setScannedAnnotations(allAnnotations);
        const bbFrames = buildBluebeamFramesFromAnnotations(allAnnotations);
        setScannedBluebeamFrames(bbFrames.length > 0 ? bbFrames : null);
        console.log(`📐 Smart Scan (modal): ${bbFrames.length} BidSheet frame(s) derived`);
        setScanResultMessage(`✅ ${allAnnotations.length} annotation(s) found${bbFrames.length > 0 ? ` · ${bbFrames.length} frame(s) ready` : ''} — will be imported when you start processing`);
      }
    } catch (err) {
      console.error('❌ Smart Scan error:', err);
      setError(`Smart Scan failed: ${err.message}`);
      setScannedAnnotations(null);
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpenProject = () => {
    console.log('handleOpenProject called with results:', results);
    
    if (!results) {
      console.error('No results available');
      setError('No project data available. Please try uploading again.');
      return;
    }
    
    if (!results.projectName) {
      console.error('No projectName in results:', results);
      setError('Project name not found. Please try uploading again.');
      return;
    }
    
    if (!onProjectReady) {
      console.error('onProjectReady callback not provided');
      setError('Navigation error. Please refresh the page.');
      return;
    }
    
    console.log('Calling onProjectReady with:', results);
    setOpeningProject(true);
    setError(null);
    
    // Pass entire results object (includes projectPath, projectFile, etc.)
    try {
      onProjectReady(results);
      // Keep loading state - parent will handle navigation
      // Don't reset loading state here, let it stay until component unmounts
    } catch (err) {
      console.error('Error calling onProjectReady:', err);
      setError(`Failed to open project: ${err.message}`);
      setOpeningProject(false);
    }
  };

  // ── Kanban helpers ────────────────────────────────────────
  const KANBAN_COLUMNS = [
    { label: 'Intake & AI',      statusKey: 'new',         color: '#007BFF', progress: 10,  progressLabel: 'Intake'   },
    { label: 'Takeoff',          statusKey: 'in_progress', color: '#8b5cf6', progress: 45,  progressLabel: 'Takeoff'  },
    { label: 'Pricing & Quotes', statusKey: 'drafting',    color: '#f59e0b', progress: 75,  progressLabel: 'Pricing'  },
    { label: 'Ready for Review', statusKey: 'completed',   color: '#3fb950', progress: 100, progressLabel: 'Complete' },
  ];
  const getDaysLeft   = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  const formatBidDate = (dateStr) => { try { return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return dateStr; } };
  const isDueSoon     = (dateStr) => { try { return getDaysLeft(dateStr) <= 7; } catch { return false; } };
  const filteredProjects = (recentProjects ?? []).filter(p => {
    const matchesFilter = activeFilter === 'urgent' ? isDueSoon(p.bidDate) : true;
    const matchesSearch = !searchQuery || (p.name ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Show processing overlay if uploading (check this FIRST)
  if (processing) {
    return (
      <div style={styles.processingOverlay}>
        <div style={styles.processingCard}>
          <div style={styles.spinner} />
          <h2 style={styles.processingTitle}>Processing Documents...</h2>
          <p style={styles.processingText}>
            {progressStage || 'Initializing...'}
          </p>
          <div style={styles.progressBar}>
            <div style={{...styles.progressFill, width: `${progress}%`, transition: 'width 0.5s ease-out'}} />
          </div>
          <p style={styles.progressText}>{progress}%</p>
        </div>
      </div>
    );
  }

  // Save-to-disk prompt — shown when File System Access API is available (Chrome/Edge)
  if (showLocalSavePrompt && pendingNavigationData) {
    const totalFiles = pendingDrawings.length + pendingSpecs.length;
    return (
      <div style={styles.processingOverlay}>
        <div style={{ ...styles.processingCard, maxWidth: '520px', textAlign: 'left', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px', textAlign: 'center' }}>✅</div>
          <h2 style={{ ...styles.processingTitle, marginBottom: '8px' }}>Project Processed!</h2>
          <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} sorted — save them directly to your local project folder now?
          </p>

          {/* Category breakdown */}
          {Object.keys(fileCategories).length > 0 && (
            <div style={{ marginBottom: '20px', background: '#091528', borderRadius: '8px', padding: '12px' }}>
              {['Architectural', 'Structural', 'Specs', 'Other'].map(cat => {
                const count = Object.values(fileCategories).filter(v => v === cat).length;
                if (count === 0) return null;
                const colors = { Architectural: '#58a6ff', Structural: '#a371f7', Specs: '#3fb950', Other: '#d29922' };
                return (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: colors[cat] || '#8b949e', fontSize: '13px' }}>{cat}</span>
                    <span style={{ color: '#c9d1d9', fontWeight: '600', fontSize: '13px' }}>{count} file{count !== 1 ? 's' : ''}</span>
                  </div>
                );
              })}
            </div>
          )}

          {localSaveResult ? (
            <div style={{ background: '#0d4429', border: '1px solid #3fb950', borderRadius: '8px', padding: '12px', marginBottom: '20px', textAlign: 'center' }}>
              <span style={{ color: '#3fb950', fontSize: '14px' }}>
                ✅ Saved to “{localSaveResult.folder}” — {localSaveResult.total} files written
              </span>
            </div>
          ) : (
            <button
              onClick={async () => {
                try {
                  const result = await saveToLocalFolder(
                    pendingDrawings,
                    pendingSpecs,
                    fileCategories,
                    ({ done, total, current }) => setLocalSaveProgress({ done, total, current })
                  );
                  if (result) setLocalSaveResult(result);
                } catch (err) {
                  console.warn('Save cancelled or failed:', err.message);
                } finally {
                  setLocalSaveProgress(null);
                }
              }}
              style={{
                width: '100%', padding: '12px 20px', background: '#1f6feb', border: 'none',
                borderRadius: '8px', color: '#fff', fontWeight: '600', fontSize: '14px',
                cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px'
              }}
            >
              {localSaveProgress
                ? `💾 Saving... ${localSaveProgress.done}/${localSaveProgress.total} — ${localSaveProgress.current || ''}`
                : '💾 Save Sorted Files to Local Folder'}
            </button>
          )}

          <button
            onClick={() => {
              setShowLocalSavePrompt(false);
              onProjectReady(pendingNavigationData);
            }}
            style={{
              width: '100%', padding: '12px 20px',
              background: localSaveResult ? '#1f6feb' : 'transparent',
              border: localSaveResult ? 'none' : '1px solid #1d3a5f',
              borderRadius: '8px',
              color: localSaveResult ? '#fff' : '#8b949e',
              fontWeight: localSaveResult ? '600' : '400',
              fontSize: '14px', cursor: 'pointer'
            }}
          >
            {localSaveResult ? 'Open Project →' : 'Skip — Open Project Without Saving'}
          </button>
        </div>
      </div>
    );
  }

  // Show results view if processing complete
  if (results) {
    return (
      <div style={styles.container}>
        <div style={styles.successHeader}>
          <CheckCircle2 size={48} color="#10b981" />
          <h1 style={styles.successTitle}>Project Collated Successfully</h1>
          <p style={styles.subtitle}>Your documents have been organized and are ready for takeoff</p>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div style={styles.resultsGrid}>
          {/* Architectural Card */}
          <div style={{...styles.resultCard, borderColor: results.architectural.length > 0 ? '#007BFF' : '#6b7280'}}>
            <div style={styles.cardHeader}>
              <FolderOpen size={24} color={results.architectural.length > 0 ? '#007BFF' : '#6b7280'} />
              <h3 style={styles.cardTitleText}>Architectural</h3>
            </div>
            <div style={styles.cardCount}>{results.architectural.length}</div>
            <div style={styles.cardLabel}>
              {results.architectural.length > 0 ? 'Drawing Sheets' : 'None Found'}
            </div>
          </div>

          {/* Structural Card */}
          <div style={{...styles.resultCard, borderColor: results.structural.length > 0 ? '#8b5cf6' : '#6b7280'}}>
            <div style={styles.cardHeader}>
              <FolderOpen size={24} color={results.structural.length > 0 ? '#8b5cf6' : '#6b7280'} />
              <h3 style={styles.cardTitleText}>Structural</h3>
            </div>
            <div style={styles.cardCount}>{results.structural.length}</div>
            <div style={styles.cardLabel}>
              {results.structural.length > 0 ? 'Drawing Sheets' : 'None Found'}
            </div>
          </div>

          {/* Specifications Card */}
          <div style={{...styles.resultCard, borderColor: (results.spec?.length ?? 0) > 0 ? '#10b981' : '#6b7280'}}>
            <div style={styles.cardHeader}>
              <FileText size={24} color={(results.spec?.length ?? 0) > 0 ? '#10b981' : '#6b7280'} />
              <h3 style={styles.cardTitleText}>Specifications</h3>
            </div>
            <div style={styles.cardCount}>{results.spec?.length ?? 0}</div>
            <div style={styles.cardLabel}>
              {(results.spec?.length ?? 0) > 0 ? 'Spec Documents' : 'None Found'}
            </div>
          </div>

          {/* Other Card */}
          <div style={{...styles.resultCard, borderColor: results.other.length > 0 ? '#f59e0b' : '#6b7280'}}>
            <div style={styles.cardHeader}>
              <FolderOpen size={24} color={results.other.length > 0 ? '#f59e0b' : '#6b7280'} />
              <h3 style={styles.cardTitleText}>Other</h3>
            </div>
            <div style={styles.cardCount}>{results.other.length}</div>
            <div style={styles.cardLabel}>
              {results.other.length > 0 ? 'Documents' : 'None Found'}
            </div>
          </div>
        </div>

        <div style={styles.actionButtons}>
          {/* Local Save — only shown in fallback results view */}
          {isFileSystemAccessSupported() && (pendingDrawings.length > 0 || pendingSpecs.length > 0) && (
            <>
              {localSaveResult ? (
                <div style={{ color: '#3fb950', fontSize: '13px', padding: '8px 0' }}>
                  ✅ Saved to “{localSaveResult.folder}” — {localSaveResult.total} files
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const result = await saveToLocalFolder(
                        pendingDrawings, pendingSpecs, fileCategories,
                        ({ done, total, current }) => setLocalSaveProgress({ done, total, current })
                      );
                      if (result) setLocalSaveResult(result);
                    } catch (err) {
                      console.warn('Save cancelled:', err.message);
                    } finally {
                      setLocalSaveProgress(null);
                    }
                  }}
                  style={styles.secondaryButton}
                >
                  {localSaveProgress
                    ? `💾 ${localSaveProgress.done}/${localSaveProgress.total}...`
                    : '💾 Save Sorted Files'}
                </button>
              )}
            </>
          )}
          <button 
            onClick={handleOpenProject} 
            style={{
              ...styles.primaryButton,
              opacity: openingProject ? 0.7 : 1,
              cursor: openingProject ? 'wait' : 'pointer',
            }}
            disabled={openingProject}
          >
            <FolderOpen size={20} style={{ marginRight: '8px' }} />
            {openingProject ? 'Opening Project...' : 'Open Project in Viewer'}
          </button>
          <button onClick={() => setResults(null)} style={styles.secondaryButton}>
            Start Another Project
          </button>
        </div>
      </div>
    );
  }

  // Show upload modal if triggered
  if (showUploadModal) {
    const canContinue = true; // always allow — files are optional (PDFs load in Studio)

    const makeZoneDrop = (zone) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingZone(null);
      const files = Array.from(e.dataTransfer.files).filter(f => {
        const n = f.name.toLowerCase();
        return n.endsWith('.pdf') || f.type === 'application/pdf';
      });
      if (files.length === 0) {
        setError('Please drop PDF files only');
        setTimeout(() => setError(null), 3000);
        return;
      }
      if (zone === 'drawings') setPendingDrawings(prev => [...prev, ...files]);
      else                     setPendingSpecs(prev => [...prev, ...files]);
    };

    const makeZoneInput = (zone) => (e) => {
      const files = Array.from(e.target.files);
      if (zone === 'drawings') setPendingDrawings(prev => [...prev, ...files]);
      else                     setPendingSpecs(prev => [...prev, ...files]);
      e.target.value = '';
    };

    const removeDrawing = (i) => setPendingDrawings(prev => prev.filter((_, idx) => idx !== i));
    const removeSpec    = (i) => setPendingSpecs(prev => prev.filter((_, idx) => idx !== i));

    const handleContinue = () => {
      const combined = [...pendingDrawings, ...pendingSpecs];
      const firstName = pendingDrawings[0]?.name || pendingSpecs[0]?.name || '';
      const defaultName = firstName
        ? firstName.replace(/\.pdf$/i, '').replace(/_/g, ' ')
        : 'New Project';

      // Build a filename → category map so the backend receives two distinct fields
      const categories = {};
      pendingDrawings.forEach(f => { categories[f.name] = 'drawing'; });
      pendingSpecs.forEach(f    => { categories[f.name] = 'spec'; });

      setProjectName(defaultName);
      setBidDate('');
      setPendingFiles(combined);          // raw Files — SmartScan reads this path safely
      setPendingFileCategories(categories); // category map travels alongside
      setShowUploadModal(false);
      setShowProjectMetadataModal(true);
    };

    const handleClose = () => {
      setShowUploadModal(false);
      setPendingDrawings([]);
      setPendingSpecs([]);
      setDraggingZone(null);
      setError(null);
    };

    const zoneStyle = (zone) => ({
      flex: 1,
      minHeight: 220,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '1rem',
      borderRadius: 12,
      border: draggingZone === zone
        ? '2px solid #007BFF'
        : zone === 'drawings'
          ? '2px dashed rgba(0,123,255,0.45)'
          : '2px dashed rgba(52,211,153,0.45)',
      background: draggingZone === zone
        ? 'rgba(0,123,255,0.08)'
        : zone === 'drawings'
          ? 'rgba(0,123,255,0.03)'
          : 'rgba(52,211,153,0.03)',
      transition: 'border-color 0.18s, background 0.18s',
      cursor: 'default',
      boxSizing: 'border-box',
    });

    const FileChip = ({ name, onRemove, color }) => (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        padding: '3px 8px 3px 10px', borderRadius: 20,
        background: color === 'blue' ? 'rgba(0,123,255,0.1)' : 'rgba(52,211,153,0.1)',
        border: `1px solid ${color === 'blue' ? 'rgba(0,123,255,0.3)' : 'rgba(52,211,153,0.3)'}`,
        maxWidth: '100%',
      }}>
        <span style={{ fontSize: '0.72rem', color: color === 'blue' ? '#60a5fa' : '#34d399', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
          {name}
        </span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.85rem', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
        >×</button>
      </div>
    );

    return (
      <div
        style={styles.modalOverlay}
        onClick={handleClose}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <div
          style={{ ...styles.modalContent, maxWidth: 700, width: '90vw' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ marginBottom: '0.25rem' }}>
            <h2 style={styles.modalTitle}>Upload Project Documents</h2>
            <p style={{ ...styles.modalSubtitle, marginBottom: 0 }}>
              Add your drawings and specifications — at least one drawing is required to continue
            </p>
          </div>

          {error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Two-zone grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1rem 0' }}>

            {/* ── Zone 1: Drawings ── */}
            <div
              style={zoneStyle('drawings')}
              onDragEnter={(e) => { e.preventDefault(); setDraggingZone('drawings'); }}
              onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; e.preventDefault(); setDraggingZone(null); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={makeZoneDrop('drawings')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', alignSelf: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(0,123,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={15} color="#60a5fa" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#e6edf3' }}>Drawings</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#6b7280' }}>Architectural, structural, glazing PDFs</p>
                </div>
              </div>

              {/* File list */}
              {pendingDrawings.length > 0 ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem', maxHeight: 110, overflowY: 'auto' }}>
                  {pendingDrawings.map((f, i) => (
                    <FileChip key={i} name={f.name} color="blue" onRemove={() => removeDrawing(i)} />
                  ))}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', paddingBottom: '0.5rem' }}>
                  <Upload size={28} color="rgba(0,123,255,0.5)" style={{ marginBottom: '0.4rem' }} />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>Drag &amp; drop PDF drawings here</p>
                </div>
              )}

              <input type="file" multiple accept=".pdf,application/pdf" onChange={makeZoneInput('drawings')} style={{ display: 'none' }} id="drawingsInput" />
              <label htmlFor="drawingsInput" style={{
                marginTop: 'auto', padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(0,123,255,0.1)', border: '1px solid rgba(0,123,255,0.35)',
                color: '#60a5fa', fontSize: '0.78rem', fontWeight: 600, userSelect: 'none',
              }}>
                {pendingDrawings.length > 0 ? '+ Add More' : 'Browse Files'}
              </label>
            </div>

            {/* ── Zone 2: Specifications ── */}
            <div
              style={zoneStyle('specs')}
              onDragEnter={(e) => { e.preventDefault(); setDraggingZone('specs'); }}
              onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; e.preventDefault(); setDraggingZone(null); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={makeZoneDrop('specs')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', alignSelf: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={15} color="#34d399" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#e6edf3' }}>Specifications</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#6b7280' }}>Project specs, Division 08, addenda</p>
                </div>
              </div>

              {/* File list */}
              {pendingSpecs.length > 0 ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem', maxHeight: 110, overflowY: 'auto' }}>
                  {pendingSpecs.map((f, i) => (
                    <FileChip key={i} name={f.name} color="green" onRemove={() => removeSpec(i)} />
                  ))}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', paddingBottom: '0.5rem' }}>
                  <BookOpen size={28} color="rgba(52,211,153,0.45)" style={{ marginBottom: '0.4rem' }} />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>Drag &amp; drop spec PDFs here</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: '#4b5563', marginTop: '0.2rem', textAlign: 'center' }}>Optional</p>
                </div>
              )}

              <input type="file" multiple accept=".pdf,application/pdf" onChange={makeZoneInput('specs')} style={{ display: 'none' }} id="specsInput" />
              <label htmlFor="specsInput" style={{
                marginTop: 'auto', padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)',
                color: '#34d399', fontSize: '0.78rem', fontWeight: 600, userSelect: 'none',
              }}>
                {pendingSpecs.length > 0 ? '+ Add More' : 'Browse Files'}
              </label>
            </div>

          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: '#4b5563' }}>
              {pendingDrawings.length + pendingSpecs.length > 0
                ? `${pendingDrawings.length} drawing${pendingDrawings.length !== 1 ? 's' : ''}${pendingSpecs.length > 0 ? ` · ${pendingSpecs.length} spec${pendingSpecs.length !== 1 ? 's' : ''}` : ''} selected`
                : 'No files selected yet'}
            </span>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={handleClose} style={styles.closeButton}>Cancel</button>
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                style={{
                  padding: '8px 22px', borderRadius: 8, border: 'none',
                  background: canContinue ? '#007BFF' : '#374151',
                  color: canContinue ? '#fff' : '#6b7280',
                  fontWeight: 700, fontSize: '0.88rem',
                  cursor: canContinue ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                Continue →
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ── Bento Box Home Base ─────────────────────────────────────────
  const formatDueDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return d; } };
  const statusMeta    = { new: { label: 'Intake',   color: '#58a6ff' }, in_progress: { label: 'Takeoff',  color: '#a371f7' }, drafting: { label: 'Pricing',  color: '#d29922' }, completed: { label: 'Complete', color: '#3fb950' } };
  const activeCount   = (recentProjects ?? []).filter(p => getProjectStatus(p) !== 'completed').length;
  const getProjectProgress = (name) => {
    try {
      const bid = JSON.parse(localStorage.getItem(`glazebid:bid:${name}`) || 'null');
      if (!bid?.frames?.length) return 0;
      return Math.min(Math.round((bid.frames.length / 20) * 100), 95);
    } catch { return 0; }
  };

  return (
    <div
      style={styles.bentoPage}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* ── Upload error toast — shown when processing fails ── */}
      {error && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
          background: '#2d1515', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: '12px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          color: '#fca5a5', fontSize: 14, maxWidth: '90vw',
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', marginLeft: 8, fontSize: 18, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* ── TOP NAV ── */}
      <header style={styles.bentoNav}>
        <img src={topLogo} alt="GlazeBid Builder" style={styles.bentoNavLogo} />
        <div style={styles.bentoSearchWrap}>
          <Search size={14} color="#6b7280" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search projects or GC names..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={styles.bentoSearchInput}
          />
        </div>
        <div style={styles.bentoPills}>
          {[['all','All'],['mine','My Bids'],['urgent','Urgent']].map(([k,l]) => (
            <button key={k} onClick={() => setActiveFilter(k)}
              style={activeFilter === k ? styles.bentoPillActive : styles.bentoPill}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button style={styles.bentoNavIcon} onClick={onSettings} title="Settings"><Settings size={16} color="#6b7280" /></button>
        <button style={styles.bentoNavNew} onClick={() => setShowUploadModal(true)}>
          <Plus size={15} style={{ marginRight: 5 }} />New Project
        </button>
      </header>

      {/* â”€â”€ BODY â”€â”€ */}
      <div style={styles.bentoBody}>

        {/* 12-column Bento Grid */}
        {(() => {
          const hero      = (recentProjects ?? []).find(p => getProjectStatus(p) !== 'completed') || (recentProjects ?? [])[0];
          const secondary = (recentProjects ?? []).filter(p => p !== hero).slice(0, 2);
          return (
            <div style={styles.bentoGridNew}>

              {/* â”€â”€ HERO CARD (col-span-8) â”€â”€ */}
              {hero ? (
                <motion.div
                  className="glass-card"
                  style={styles.heroCard}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
                  onClick={() => onProjectReady({ projectName: hero.name })}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(14,165,233,0.12), 0 8px 32px rgba(0,0,0,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)'; }}
                >
                  <div style={styles.heroShimmer} />
                  <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        {(() => {
                          const st = statusMeta[getProjectStatus(hero)] || statusMeta['new'];
                          return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid', color: st.color, borderColor: st.color + '55', background: st.color + '18', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{st.label}</span>;
                        })()}
                        {hero.bidDate && <span style={{ fontSize: 11, color: '#a1a1aa' }}>{getDaysLeft(hero.bidDate)}d to bid</span>}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', marginBottom: 6, lineHeight: 1.2, letterSpacing: '-0.3px' }}>{hero.name}</div>
                      <div style={{ fontSize: 12, color: '#71717a' }}>Last modified {new Date(hero.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#71717a' }}>Progress</span>
                        <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600 }}>{getProjectProgress(hero.name)}%</span>
                      </div>
                      <div style={{ height: 4, background: '#27272a', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${getProjectProgress(hero.name)}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 20, right: 24, zIndex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0ea5e9' }}>Open &#8594;</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="glass-card"
                  style={{ ...styles.heroCard, alignItems: 'center', justifyContent: 'center' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
                  onClick={() => setShowUploadModal(true)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; }}
                >
                  <Plus size={32} color="#0ea5e9" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }}>Start your first project</div>
                  <div style={{ fontSize: 13, color: '#52525b' }}>Drop drawings &amp; specs to begin intake</div>
                </motion.div>
              )}

              {/* â”€â”€ RADAR PANEL (col-span-4) â”€â”€ */}
              <motion.div
                className="glass-card"
                style={styles.radarCard}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                <div>
                  <div style={styles.bentoWidgetHeader}>
                    <Calendar size={13} style={{ marginRight: 7, color: '#52525b', flexShrink: 0 }} />
                    <span style={styles.bentoWidgetTitle}>Deadlines</span>
                  </div>
                  {upcomingDeadlines.length === 0
                    ? <div style={{ color: '#52525b', fontSize: 12, padding: '8px 0' }}>No upcoming deadlines</div>
                    : upcomingDeadlines.slice(0, 3).map(dl => {
                        const days = getDaysLeft(dl.date);
                        return (
                          <div key={dl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1c1c1f' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: dl.priority === 'high' ? '#ef4444' : dl.priority === 'medium' ? '#f59e0b' : '#3fb950' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dl.title}</div>
                              <div style={{ fontSize: 11, color: '#52525b' }}>{dl.project}</div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: days <= 3 ? '#ef4444' : '#a1a1aa', flexShrink: 0 }}>{days}d</div>
                          </div>
                        );
                      })
                  }
                </div>
                <div style={{ borderTop: '1px solid #27272a', paddingTop: 14, marginTop: 14 }}>
                  <div style={styles.bentoWidgetHeader}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3fb950', display: 'inline-block', marginRight: 8, flexShrink: 0 }} />
                    <span style={styles.bentoWidgetTitle}>System</span>
                  </div>
                  {[['AI Engine', true], ['Bid Database', true], ['PDF Parser', true]].map(([label, online]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                      <span style={{ fontSize: 12, color: '#71717a' }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, color: online ? '#3fb950' : '#ef4444', background: online ? '#3fb95018' : '#ef444418', border: `1px solid ${online ? '#3fb95040' : '#ef444440'}` }}>{online ? 'Online' : 'Offline'}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                    <span style={{ fontSize: 12, color: '#71717a' }}>Projects</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{(recentProjects ?? []).length}</span>
                  </div>
                </div>
              </motion.div>

              {/* â”€â”€ SECONDARY PROJECT CARDS (col-span-4 each) â”€â”€ */}
              {secondary.map((p, i) => {
                const st   = statusMeta[getProjectStatus(p)] || statusMeta['new'];
                const prog = getProjectProgress(p.name);
                return (
                  <motion.div
                    key={i}
                    className="glass-card"
                    style={styles.projectMiniCard}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.06, ease: [0.23, 1, 0.32, 1] }}
                    onClick={() => onProjectReady({ projectName: p.name })}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#27272a'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, border: '1px solid', color: st.color, borderColor: st.color + '55', background: st.color + '18', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{st.label}</span>
                      <span style={{ fontSize: 11, color: '#52525b' }}>{new Date(p.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#52525b', marginBottom: 14 }}>Takeoff in progress</div>
                    <div style={{ height: 3, background: '#27272a', borderRadius: 9999, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: `${prog}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)', borderRadius: 9999 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}>Open &#8594;</span>
                  </motion.div>
                );
              })}

              {/* â”€â”€ NEW TAKEOFF CTA (col-span-4) â”€â”€ */}
              <motion.div
                className="glass-card"
                style={styles.newTakeoffCard}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.42, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => setShowUploadModal(true)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'; e.currentTarget.style.background = 'rgba(14,165,233,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#3f3f46'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Plus size={20} color="#0ea5e9" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', marginBottom: 4 }}>Start New Takeoff</div>
                <div style={{ fontSize: 12, color: '#52525b', lineHeight: 1.4 }}>Drop drawings &amp; specs or browse files to begin</div>
              </motion.div>

            </div>
          );
        })()}

      </div>{/* end bentoBody */}

      {/* Drag overlay */}
      {dragging && (
        <div style={styles.bentoDragOverlay}>
          <div style={styles.bentoDragInner}>
            <Upload size={36} color="#007BFF" style={{ marginBottom: 12 }} />
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>Drop to upload drawings</p>
          </div>
        </div>
      )}

      {/* Project Metadata Modal */}
      {showProjectMetadataModal && (
      <div style={styles.modalOverlay} onClick={handleProjectMetadataCancel}>
        <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <h2 style={styles.modalTitle}>Project Information</h2>
          <p style={styles.modalSubtitle}>Enter details for your new project</p>

          {scanResultMessage && (
            <div style={{
              margin: '12px 0 4px',
              padding: '9px 14px',
              backgroundColor: scanResultMessage.startsWith('✅') ? '#052e16' : '#1c1917',
              border: `1px solid ${scanResultMessage.startsWith('✅') ? '#166534' : '#44403c'}`,
              borderRadius: '6px',
              color: scanResultMessage.startsWith('✅') ? '#86efac' : '#a8a29e',
              fontSize: '13px',
              lineHeight: '1.4'
            }}>
              {scanResultMessage}
            </div>
          )}
          
          <div style={styles.modalForm}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Project Name <span style={{color: '#ef4444'}}>*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Downtown Office Complex"
                style={styles.formInput}
                ref={projectNameInputRef}
                onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                onBlur={e => { e.target.style.borderColor = '#1d3a5f'; }}
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Bid Date (Optional)
              </label>
              <input
                type="datetime-local"
                value={bidDate}
                onChange={(e) => setBidDate(e.target.value)}
                style={styles.formInput}
              />
            </div>
          </div>
          
          {/* Smart Scan Section */}
          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#0d1f3c',
            borderRadius: '8px',
            border: '1px solid #1d3a5f'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={{ color: '#f3f4f6', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                  📥 Smart Scan
                </div>
                <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                  Import existing annotations from PDF before processing
                </div>
              </div>
              <button
                onClick={handleSmartScan}
                disabled={isScanning || !pendingFiles}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: (isScanning || !pendingFiles) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: isScanning ? '#6e40aa' : (scannedAnnotations ? '#10b981' : '#8b5cf6'),
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: (isScanning || !pendingFiles) ? 0.5 : 1
                }}
              >
                {isScanning ? '⏳ Scanning...' : scannedAnnotations ? `✅ ${scannedAnnotations.length} Found` : '🔍 Scan Now'}
              </button>
            </div>
            {scannedAnnotations && (
              <div style={{ 
                marginTop: '8px', 
                padding: '8px 12px', 
                backgroundColor: '#10b98120',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#10b981'
              }}>
                ✓ {scannedAnnotations.length} annotation(s) will be imported: {scannedAnnotations.filter(m => m.type === 'AREA').length} areas, {scannedAnnotations.filter(m => m.type === 'LINEAR').length} linear
              </div>
            )}
          </div>
          
          {error && (
            <div style={styles.modalError}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          <div style={styles.modalActions}>
            <button 
              onClick={handleProjectMetadataCancel}
              style={styles.modalBtnSecondary}
            >
              Cancel
            </button>
            <button 
              onClick={handleProjectMetadataSubmit}
              style={styles.modalBtnPrimary}
            >
              Start Processing {scannedAnnotations && `(+${scannedAnnotations.length} annotations)`}
            </button>
          </div>
        </div>
      </div>
      )}

    </div>// bentoPage
  );
};

const styles = {
  // ── Bento Box Layout ──────────────────────────────────────────────
  bentoPage: {
    backgroundColor: 'var(--bg-deep)',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
    color: 'var(--text-primary)',
  },
  bentoNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px',
    height: 52,
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-panel)',
    flexShrink: 0,
  },
  bentoNavLogo: { height: 26, width: 'auto', marginRight: 6, flexShrink: 0 },
  bentoSearchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#091528', border: '1px solid #1d3a5f', borderRadius: 8,
    padding: '0 12px', height: 34, width: 260, flexShrink: 0,
  },
  bentoSearchInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#e6edf3', fontSize: 13, width: '100%', fontFamily: 'inherit',
  },
  bentoPills: { display: 'flex', gap: 6 },
  bentoPill: {
    padding: '4px 13px', borderRadius: 20, border: '1px solid #1d3a5f',
    background: 'transparent', color: '#8b949e', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
  },
  bentoPillActive: {
    padding: '4px 13px', borderRadius: 20, border: '1px solid #007BFF',
    background: 'rgba(0,123,255,.12)', color: '#58a6ff', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
  },
  bentoNavIcon: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
  },
  bentoNavNew: {
    display: 'flex', alignItems: 'center', padding: '6px 14px',
    background: '#007BFF', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background .15s', flexShrink: 0,
  },
  bentoBody: {
    flex: 1, overflowY: 'auto', padding: '32px 40px 40px',
    display: 'flex', flexDirection: 'column', gap: 28,
  },
  bentoWelcome: { flexShrink: 0 },
  bentoWelcomeH1: {
    fontSize: 28, fontWeight: 700, color: '#ffffff',
    margin: '0 0 6px 0', letterSpacing: '-0.5px',
  },
  bentoWelcomeP: { fontSize: 15, color: '#8b949e', margin: 0 },
  bentoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: 20,
    flex: 1,
    alignItems: 'start',
  },
  bentoLeft: { display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 },
  bentoRight: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },

  // ── New 12-col Bento Grid styles ───────────────────────────────
  bentoGridNew: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: 16,
    alignItems: 'start',
  },
  heroCard: {
    gridColumn: 'span 8',
    position: 'relative',
    background: 'linear-gradient(135deg, #18181b 0%, #1c1917 60%, #18181b 100%)',
    border: '1px solid #27272a',
    borderRadius: 16,
    padding: '28px 28px 24px',
    cursor: 'pointer',
    minHeight: 200,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'border-color .2s, box-shadow .2s',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  heroShimmer: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: '45%',
    background: 'linear-gradient(90deg, transparent 0%, rgba(14,165,233,0.06) 100%)',
    pointerEvents: 'none',
  },
  radarCard: {
    gridColumn: 'span 4',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 16,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  projectMiniCard: {
    gridColumn: 'span 4',
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 14,
    padding: '18px 20px',
    cursor: 'pointer',
    transition: 'border-color .2s',
    display: 'flex',
    flexDirection: 'column',
  },
  newTakeoffCard: {
    gridColumn: 'span 4',
    background: 'transparent',
    border: '1px dashed #3f3f46',
    borderRadius: 14,
    padding: '24px 20px',
    cursor: 'pointer',
    transition: 'border-color .2s, background .2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  // Quick Launch card
  quickLaunchCard: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '24px 28px',
    background: 'linear-gradient(135deg, #0d2a4a 0%, #1a3a6b 50%, #0f3460 100%)',
    border: '1px solid rgba(0,123,255,.35)',
    borderRadius: 16, cursor: 'pointer',
    transition: 'transform .2s, box-shadow .2s',
    boxShadow: '0 4px 24px rgba(0,123,255,.08)',
    flexShrink: 0,
  },
  qlIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    background: 'rgba(0,123,255,.3)', border: '1px solid rgba(0,123,255,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  qlTitle: { fontSize: 17, fontWeight: 700, color: '#e6edf3', marginBottom: 4 },
  qlSub:   { fontSize: 13, color: '#8b949e', lineHeight: 1.4 },
  qlArrow: { marginLeft: 'auto', fontSize: 22, color: 'rgba(0,123,255,.6)', flexShrink: 0 },
  // Widget shell
  bentoWidget: {
    background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
    borderRadius: 14, padding: '18px 20px',
  },
  bentoWidgetHeader: {
    display: 'flex', alignItems: 'center',
    marginBottom: 14, paddingBottom: 12,
    borderBottom: '1px solid var(--border-subtle)',
  },
  bentoWidgetTitle: {
    fontSize: 12, fontWeight: 700, color: '#8b949e',
    textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
  },
  bentoViewAll: {
    background: 'transparent', border: 'none', color: '#58a6ff',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
  },
  // Workspace rows
  workspaceRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '9px 10px', borderRadius: 9,
    transition: 'background .15s', cursor: 'default',
  },
  wsThumb: {
    width: 36, height: 36, borderRadius: 8, background: '#091528',
    border: '1px solid #1d3a5f', display: 'flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  wsInfo: { flex: 1, minWidth: 0 },
  wsName: { fontSize: 13, fontWeight: 600, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  wsMeta: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  wsPill: {
    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
    border: '1px solid', flexShrink: 0,
  },
  wsOpenBtn: {
    padding: '5px 14px', borderRadius: 8, border: '1px solid #1d3a5f',
    background: '#091528', color: '#8b949e', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    transition: 'border-color .15s, color .15s',
  },
  // Deadlines
  deadlineItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '9px 0', borderBottom: '1px solid #091528',
  },
  // Status widget
  statusRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' },
  statusLabel: { fontSize: 13, color: '#6b7280' },
  statusValue: { fontSize: 13, fontWeight: 600, color: '#e6edf3' },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 },
  // Drag overlay
  bentoDragOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, backdropFilter: 'blur(4px)',
  },
  bentoDragInner: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '44px 60px', background: '#091528',
    border: '2px dashed #007BFF', borderRadius: 16,
  },

  // ── Legacy layout styles (kept for results/processing/modal views) ──
  dashboardContainer: {
    backgroundColor: 'var(--bg-deep)',
    minHeight: '100vh',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  },
  leftSidebar: {
    width: '80px',
    backgroundColor: 'var(--bg-panel)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
    gap: '8px',
    flexShrink: 0,
  },
  sidebarItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '16px 8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderRadius: '8px',
    margin: '0 8px',
  },
  sidebarLabel: {
    fontSize: '10px',
    color: '#9ca3af',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: '1.2',
    fontFamily: 'Inter, sans-serif',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '24px',
    maxWidth: '1600px',
    margin: '0 auto',
    width: '100%',
  },
  dashboardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  dashboardTitle: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0 0 8px 0',
    background: 'linear-gradient(135deg, #007BFF 0%, #001F3F 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  dashboardLogo: {
    height: '32px',
    width: 'auto',
    margin: '0',
    display: 'block',
  },
  dashboardSubtitle: {
    fontSize: '16px',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  statsBar: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#007BFF',
  },
  statLabel: {
    fontSize: '10px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statDivider: {
    width: '1px',
    height: '30px',
    backgroundColor: '#1d3a5f',
  },

  // Tiles Grid
  tilesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '0',
  },
  tile: {
    backgroundColor: '#0d1f3c',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#1d3a5f',
    borderRadius: '10px',
    padding: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
    minHeight: '100px',
    display: 'flex',
    flexDirection: 'column',
  },
  tilePrimary: {
    background: 'linear-gradient(135deg, #001F3F 0%, #007BFF 100%)',
    borderWidth: '0',
    color: '#ffffff',
  },
  tileSecondary: {
    borderColor: '#007BFF',
  },
  tileInfo: {
    borderColor: '#8b5cf6',
  },
  tileAccent: {
    borderColor: '#10b981',
  },
  tileWarning: {
    borderColor: '#f59e0b',
  },
  tileStats: {
    borderColor: '#06b6d4',
  },
  tileDefault: {
    borderColor: '#1d3a5f',
  },
  tileCalendar: {
    borderColor: '#f59e0b',
    minHeight: '150px',
  },
  tileDisabled: {
    borderColor: '#1d3a5f',
    opacity: 0.7,
  },
  tileViewer: {
    borderColor: '#3b82f6',
    cursor: 'pointer',
  },
  tileIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '6px',
  },
  tileTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#ffffff',
    margin: '0 0 2px 0',
    fontFamily: 'Inter, sans-serif',
  },
  tileDescription: {
    fontSize: '12px',
    color: '#9ca3af',
    lineHeight: '1.3',
    margin: '0 0 6px 0',
  },
  tileBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.5px',
    fontFamily: 'Inter, sans-serif',
  },
  tileBadgeOutline: {
    display: 'inline-block',
    padding: '4px 12px',
    border: '1px solid #007BFF',
    color: '#007BFF',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.5px',
    fontFamily: 'Inter, sans-serif',
  },

  // Recent Projects List
  recentList: {
    marginTop: '12px',
  },
  recentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #1d3a5f',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  recentName: {
    fontSize: '13px',
    color: '#ffffff',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '180px',
  },
  recentDate: {
    fontSize: '11px',
    color: '#6b7280',
  },
  emptyText: {
    fontSize: '13px',
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: '8px',
  },
  recentItemEnhanced: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundColor: 'transparent',
  },
  recentThumbnail: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    backgroundColor: '#1d3a5f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  recentInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  recentNameEnhanced: {
    fontSize: '13px',
    color: '#ffffff',
    fontWeight: '600',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'Inter, sans-serif',
  },

  // Calendar/Deadlines Styles
  deadlinesList: {
    marginTop: '12px',
    marginBottom: '12px',
  },
  priorityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  deadlineContent: {
    flex: 1,
    minWidth: 0,
  },
  deadlineTitle: {
    fontSize: '13px',
    color: '#ffffff',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deadlineDate: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '2px',
  },
  calendarActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  },
  viewCalendarButton: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#007BFF',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  disableButton: {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    border: '1px solid #007BFF',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },

  // Upload Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  modalContent: {
    backgroundColor: '#0d1f3c',
    border: '2px solid #1d3a5f',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  modalSubtitle: {
    fontSize: '14px',
    color: '#9ca3af',
    margin: '0 0 24px 0',
  },
  closeButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1a3a6b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '16px',
  },

  // Processing Overlay
  processingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 14, 17, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  processingCard: {
    backgroundColor: '#0d1f3c',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    maxWidth: '500px',
  },
  processingTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#ffffff',
    margin: '24px 0 8px 0',
  },
  processingText: {
    fontSize: '14px',
    color: '#9ca3af',
    marginBottom: '24px',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#1d3a5f',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007BFF',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '14px',
    color: '#9ca3af',
    fontWeight: '600',
  },

  // Original styles for results view
  container: {
    padding: '40px',
    maxWidth: '1600px',
    margin: '0 auto',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#060f1c',
    overflow: 'hidden',
  },
  successHeader: {
    textAlign: 'center',
    marginBottom: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  successTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#9ca3af',
    maxWidth: '600px',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
    marginBottom: '32px',
    flex: 1,
    alignContent: 'start',
  },
  resultCard: {
    backgroundColor: '#1a1f26',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    transition: 'transform 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  cardTitleText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    margin: 0,
  },
  cardCount: {
    fontSize: '48px',
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 1,
    marginBottom: '8px',
  },
  cardLabel: {
    fontSize: '14px',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  actionButtons: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    flexShrink: 0,
    paddingTop: '20px',
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 28px',
    backgroundColor: '#007BFF',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  secondaryButton: {
    padding: '14px 28px',
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: '2px solid #007BFF',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },

  // Drop zone styles
  dropZone: {
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#007BFF',
    borderRadius: '12px',
    padding: '48px',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 123, 255, 0.05)',
    transition: 'all 0.3s',
    cursor: 'pointer',
  },
  dropZoneActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#2563eb',
    transform: 'scale(1.02)',
  },
  uploadText: {
    fontSize: '18px',
    color: '#ffffff',
    fontWeight: '600',
    margin: '16px 0 8px 0',
  },
  uploadHint: {
    fontSize: '14px',
    color: '#9ca3af',
    marginBottom: '24px',
  },
  fileInput: {
    display: 'none',
  },
  browseButton: {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#007BFF',
    color: '#ffffff',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#ef4444',
    marginBottom: '16px',
    fontSize: '14px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #2d333b',
    borderTop: '4px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
  
  // Metadata modal details
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginBottom: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e2e8f0',
  },
  formInput: {
    padding: '12px 16px',
    backgroundColor: '#0d1117',
    border: '2px solid #2d333b',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  modalError: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  modalBtnPrimary: {
    padding: '12px 24px',
    backgroundColor: '#007BFF',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  modalBtnSecondary: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    border: '2px solid #2d333b',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

// Add spinner animation and sidebar hover effects
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Sidebar hover effects */
  .sidebar-item:hover {
    background-color: rgba(0, 123, 255, 0.1);
  }
  
  .sidebar-item:hover span {
    color: #007BFF;
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('intake-animations')) {
  styleSheet.id = 'intake-animations';
  document.head.appendChild(styleSheet);
}

export default ProjectIntake;

