import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, 
  Download, Maximize2, RotateCw, FileText, List, Grid,
  ChevronDown, ChevronUp, X, Sidebar, BookOpen, Bookmark,
  Highlighter, StickyNote, Hash, MessageSquare, Trash2,
  PenTool, Type, Square, Minus, Circle, Eraser, MousePointer,
  Strikethrough, Underline, PanelRightClose, PanelRight
} from 'lucide-react';

// Use legacy build for better compatibility
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Outline item component - renders TOC item with children
const OutlineItem = ({ item, goToPage, level }) => {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels
  
  return (
    <div style={{ marginLeft: `${level * 12}px` }}>
      <div
        onClick={() => {
          if (item.page) goToPage(item.page);
          if (item.items && item.items.length > 0) setExpanded(!expanded);
        }}
        style={{
          padding: '6px 8px',
          fontSize: '12px',
          color: '#d1d5db',
          cursor: 'pointer',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.15s',
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(28, 33, 40, 0.6)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {item.items && item.items.length > 0 && (
          <ChevronRight 
            size={12} 
            style={{ 
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            }} 
          />
        )}
        <span style={{ flex: 1 }}>{item.title}</span>
        {item.page && <span style={{ fontSize: '10px', color: '#6b7280' }}>p.{item.page}</span>}
      </div>
      {expanded && item.items && item.items.map((child, idx) => (
        <OutlineItem key={idx} item={child} goToPage={goToPage} level={level + 1} />
      ))}
    </div>
  );
};

// Configure PDF.js worker - served from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '/pdf.worker.min.mjs',
  window.location.origin
).href;

const PDFJS_VERSION = pdfjsLib.version;

// Annotation tool configurations
const ANNOTATION_TOOLS = {
  select: { icon: 'MousePointer', label: 'Select', shortcut: 'V' },
  highlight: { 
    icon: 'Highlighter', 
    label: 'Highlight', 
    shortcut: 'H',
    colors: [
      { name: 'Yellow', color: 'rgba(255, 235, 59, 0.4)' },
      { name: 'Green', color: 'rgba(76, 175, 80, 0.4)' },
      { name: 'Blue', color: 'rgba(33, 150, 243, 0.4)' },
      { name: 'Pink', color: 'rgba(233, 30, 99, 0.4)' },
      { name: 'Orange', color: 'rgba(255, 152, 0, 0.4)' },
    ]
  },
  underline: { icon: 'Underline', label: 'Underline', shortcut: 'U', color: '#2196F3' },
  strikethrough: { icon: 'Strikethrough', label: 'Strikethrough', shortcut: 'S', color: '#f44336' },
  note: { icon: 'StickyNote', label: 'Sticky Note', shortcut: 'N' },
  textbox: { icon: 'Type', label: 'Text Box', shortcut: 'T' },
  freehand: { icon: 'PenTool', label: 'Freehand', shortcut: 'P' },
  line: { icon: 'Minus', label: 'Line', shortcut: 'L' },
  rectangle: { icon: 'Square', label: 'Rectangle', shortcut: 'R' },
  ellipse: { icon: 'Circle', label: 'Ellipse', shortcut: 'E' },
  eraser: { icon: 'Eraser', label: 'Eraser', shortcut: 'X' },
};

const ZOOM_LEVELS = Object.freeze([0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]);

/**
 * SpecViewer - Adobe-style PDF viewer for specifications
 * 
 * Features:
 * - Page thumbnail sidebar with PDF Outline/Bookmarks
 * - Continuous scroll or single-page view
 * - Text search with Regex support
 * - Highlight & Sticky Note annotations
 * - Multiple zoom modes (fit width, fit page, actual size)
 * - Page rotation
 * - Keyboard navigation
 * - Right-side annotation toolbar
 */
const SpecViewer = ({ 
  project, 
  documentPath,
  documentName,
  onClose 
}) => {
  // Document state
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // View state
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [viewMode, setViewMode] = useState('continuous'); // 'single' or 'continuous'
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('pages'); // 'pages', 'bookmarks', 'notes'
  const [showAnnotationTools, setShowAnnotationTools] = useState(true);
  
  // Annotation state
  const [activeTool, setActiveTool] = useState('select');
  const [activeColor, setActiveColor] = useState('rgba(255, 235, 59, 0.4)'); // Yellow highlight
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [annotations, setAnnotations] = useState([]); // All annotations for this document
  
  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [useRegex, setUseRegex] = useState(false);
  const [searchingAll, setSearchingAll] = useState(false);
  
  // PDF Outline (Table of Contents)
  const [pdfOutline, setPdfOutline] = useState([]);
  const [specSections, setSpecSections] = useState(null); // Extracted spec sections
  const [extractingSpecs, setExtractingSpecs] = useState(false);
  const [sectionScope, setSectionScope] = useState({}); // Track which sections are in scope
  const [showOutOfScope, setShowOutOfScope] = useState(false); // Toggle for out-of-scope sections
  
  // User Bookmarks & Notes
  const [userBookmarks, setUserBookmarks] = useState([]);
  const [userNotes, setUserNotes] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  
  // Annotation mode
  const [annotationMode, setAnnotationMode] = useState(null); // null, 'highlight', 'note'
  
  // Thumbnails
  const [thumbnails, setThumbnails] = useState({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  
  // Continuous scroll - rendered pages
  const [renderedPages, setRenderedPages] = useState({});
  const [pageBaseDimensions, setPageBaseDimensions] = useState({}); // Store base dimensions at scale=1
  
  // Refs
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pageRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const annotationCanvasRefs = useRef({}); // Canvas refs for each page's annotations
  const renderTimeoutRef = useRef(null); // For debouncing zoom renders
  const lastScaleRef = useRef(1.0); // Track last scale for scroll position preservation
  const isRenderingRef = useRef(false); // Prevent overlapping renders
  const pendingScaleRef = useRef(null); // Queue scale changes during render
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // For freehand drawing
  const [textboxInput, setTextboxInput] = useState(null); // { page, x, y } for active textbox
  const [textboxValue, setTextboxValue] = useState('');
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  
  // Generate unique ID for annotations
  const generateId = () => `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Get storage key for annotations
  const getAnnotationKey = useCallback(() => (
    `specviewer_annotations_${project}_${documentPath}`
  ), [project, documentPath]);

  // Load annotations from localStorage
  const loadAnnotationsFromStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(getAnnotationKey());
      if (saved) {
        const data = JSON.parse(saved);
        setAnnotations(data || []);
        console.log(`📝 Loaded ${data?.length || 0} annotations`);
      }
    } catch (err) {
      console.warn('Failed to load annotations:', err);
    }
  }, [getAnnotationKey]);

  // Save annotations to localStorage
  const saveAnnotationsToStorage = useCallback((anns) => {
    try {
      localStorage.setItem(getAnnotationKey(), JSON.stringify(anns));
    } catch (err) {
      console.warn('Failed to save annotations:', err);
    }
  }, [getAnnotationKey]);

  // Add annotation
  const addAnnotation = useCallback((annotation) => {
    const newAnnotations = [...annotations, { ...annotation, id: generateId() }];
    setAnnotations(newAnnotations);
    saveAnnotationsToStorage(newAnnotations);
  }, [annotations, saveAnnotationsToStorage]);

  // Delete annotation
  const deleteAnnotation = useCallback((id) => {
    const newAnnotations = annotations.filter(a => a.id !== id);
    setAnnotations(newAnnotations);
    saveAnnotationsToStorage(newAnnotations);
    setSelectedAnnotation(null);
  }, [annotations, saveAnnotationsToStorage]);

  // Get annotations for a specific page
  const getPageAnnotations = useCallback((pageNum) => {
    return annotations.filter(a => a.page === pageNum);
  }, [annotations]);

  // Render annotations on canvas - scales annotations based on current zoom
  const renderAnnotations = useCallback((pageNum, canvas) => {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const pageAnns = getPageAnnotations(pageNum);
    
    // Get the scale factor - annotations are stored at scale 1.0
    // Canvas size is at current scale, so we scale annotation coords
    const currentScale = scale;
    
    pageAnns.forEach(ann => {
      ctx.save();
      
      // Scale all coordinates by current scale
      const s = currentScale;
      
      switch (ann.type) {
        case 'highlight':
          ctx.fillStyle = ann.color || activeColor;
          ctx.fillRect(ann.x * s, ann.y * s, ann.width * s, ann.height * s);
          break;
          
        case 'underline':
          ctx.strokeStyle = ann.color || '#2196F3';
          ctx.lineWidth = 2 * s;
          ctx.beginPath();
          ctx.moveTo(ann.x * s, (ann.y + ann.height) * s);
          ctx.lineTo((ann.x + ann.width) * s, (ann.y + ann.height) * s);
          ctx.stroke();
          break;
          
        case 'strikethrough':
          ctx.strokeStyle = ann.color || '#f44336';
          ctx.lineWidth = 2 * s;
          ctx.beginPath();
          ctx.moveTo(ann.x * s, (ann.y + ann.height / 2) * s);
          ctx.lineTo((ann.x + ann.width) * s, (ann.y + ann.height / 2) * s);
          ctx.stroke();
          break;
          
        case 'freehand':
          if (ann.points && ann.points.length > 1) {
            ctx.strokeStyle = ann.color || '#007BFF';
            ctx.lineWidth = (ann.strokeWidth || 2) * s;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x * s, ann.points[0].y * s);
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x * s, ann.points[i].y * s);
            }
            ctx.stroke();
          }
          break;
          
        case 'line':
          ctx.strokeStyle = ann.color || '#007BFF';
          ctx.lineWidth = (ann.strokeWidth || 2) * s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ann.x * s, ann.y * s);
          ctx.lineTo(ann.x2 * s, ann.y2 * s);
          ctx.stroke();
          break;
          
        case 'rectangle':
          ctx.strokeStyle = ann.color || '#007BFF';
          ctx.lineWidth = (ann.strokeWidth || 2) * s;
          ctx.strokeRect(ann.x * s, ann.y * s, ann.width * s, ann.height * s);
          break;
          
        case 'ellipse':
          ctx.strokeStyle = ann.color || '#007BFF';
          ctx.lineWidth = (ann.strokeWidth || 2) * s;
          ctx.beginPath();
          const centerX = (ann.x + ann.width / 2) * s;
          const centerY = (ann.y + ann.height / 2) * s;
          ctx.ellipse(centerX, centerY, Math.abs(ann.width / 2) * s, Math.abs(ann.height / 2) * s, 0, 0, 2 * Math.PI);
          ctx.stroke();
          break;
          
        case 'textbox':
          // Draw textbox background
          ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
          const padding = 6 * s;
          const fontSize = 14 * s;
          ctx.font = `${fontSize}px Arial`;
          const textWidth = ctx.measureText(ann.text).width;
          ctx.fillRect(ann.x * s - padding, ann.y * s - 16 * s, textWidth + padding * 2, 22 * s);
          ctx.strokeStyle = '#ccc';
          ctx.lineWidth = 1 * s;
          ctx.strokeRect(ann.x * s - padding, ann.y * s - 16 * s, textWidth + padding * 2, 22 * s);
          // Draw text
          ctx.fillStyle = '#333';
          ctx.fillText(ann.text, ann.x * s, ann.y * s);
          break;
          
        case 'note':
          // Draw note icon - scaled
          const noteSize = 20 * s;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(ann.x * s, ann.y * s);
          ctx.lineTo(ann.x * s + noteSize, ann.y * s);
          ctx.lineTo(ann.x * s + noteSize, ann.y * s + noteSize);
          ctx.lineTo(ann.x * s, ann.y * s + noteSize);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1 * s;
          ctx.stroke();
          // Corner fold
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(ann.x * s + 14 * s, ann.y * s);
          ctx.lineTo(ann.x * s + noteSize, ann.y * s + 6 * s);
          ctx.lineTo(ann.x * s + 14 * s, ann.y * s + 6 * s);
          ctx.closePath();
          ctx.fill();
          break;
      }
      
      // Draw selection border if selected
      if (selectedAnnotation === ann.id) {
        ctx.strokeStyle = '#007BFF';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        if (ann.type === 'line') {
          const minX = Math.min(ann.x, ann.x2) * s - 5;
          const minY = Math.min(ann.y, ann.y2) * s - 5;
          const maxX = Math.max(ann.x, ann.x2) * s + 5;
          const maxY = Math.max(ann.y, ann.y2) * s + 5;
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        } else if (ann.type === 'freehand' && ann.points) {
          const xs = ann.points.map(p => p.x * s);
          const ys = ann.points.map(p => p.y * s);
          const minX = Math.min(...xs) - 5;
          const minY = Math.min(...ys) - 5;
          const maxX = Math.max(...xs) + 5;
          const maxY = Math.max(...ys) + 5;
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        } else if (ann.type === 'note') {
          ctx.strokeRect(ann.x * s - 3, ann.y * s - 3, 20 * s + 6, 20 * s + 6);
        } else {
          ctx.strokeRect(ann.x * s - 3, ann.y * s - 3, (ann.width || 100) * s + 6, (ann.height || 20) * s + 6);
        }
        ctx.setLineDash([]);
      }
      
      ctx.restore();
    });
  }, [getPageAnnotations, selectedAnnotation, activeColor, scale]);

  // Toggle section scope (in/out)
  const toggleSectionScope = (code, page) => {
    const key = `${code}_${page}`;
    setSectionScope(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Get sections that are in scope
  const getInScopeSections = () => {
    if (!specSections) return [];
    return specSections.sections.filter(section => {
      const key = `${section.code}_${section.page}`;
      return sectionScope[key] !== false; // Default to true if not set
    });
  };

  // Get sections that are out of scope
  const getOutOfScopeSections = () => {
    if (!specSections) return [];
    return specSections.sections.filter(section => {
      const key = `${section.code}_${section.page}`;
      return sectionScope[key] === false;
    });
  };

  // Group sections by category
  const groupSectionsByCategory = (sections) => {
    const grouped = {};
    sections.forEach(section => {
      if (!grouped[section.category]) {
        grouped[section.category] = [];
      }
      grouped[section.category].push(section);
    });
    return grouped;
  };

  // Mouse event handlers for annotation drawing
  const handleAnnotationMouseDown = useCallback((e, pageNum) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    
    // Get mouse position relative to displayed element
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    
    // Account for CSS scaling: canvas may be displayed at different size than its pixel dimensions
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert to canvas pixel coordinates
    const canvasX = displayX * scaleX;
    const canvasY = displayY * scaleY;
    
    // Store both for drawing preview (canvas coords) and normalized (at scale 1.0)
    const screenX = canvasX;
    const screenY = canvasY;
    const x = canvasX / scale;
    const y = canvasY / scale;
    
    if (activeTool === 'select') {
      // Check if clicking on an annotation (compare in normalized coords)
      const pageAnns = getPageAnnotations(pageNum);
      const hitTolerance = 10 / scale;
      const clicked = pageAnns.find(ann => {
        if (ann.type === 'line') {
          const dist = pointToLineDistance(x, y, ann.x, ann.y, ann.x2, ann.y2);
          return dist < hitTolerance;
        } else if (ann.type === 'freehand' && ann.points) {
          return ann.points.some(p => Math.abs(p.x - x) < hitTolerance && Math.abs(p.y - y) < hitTolerance);
        } else if (ann.type === 'note') {
          return x >= ann.x && x <= ann.x + 20 && y >= ann.y && y <= ann.y + 20;
        } else {
          return x >= ann.x && x <= ann.x + (ann.width || 100) && 
                 y >= ann.y && y <= ann.y + (ann.height || 20);
        }
      });
      
      setSelectedAnnotation(clicked?.id || null);
      return;
    }
    
    if (activeTool === 'eraser') {
      const pageAnns = getPageAnnotations(pageNum);
      const hitTolerance = 10 / scale;
      const toDelete = pageAnns.find(ann => {
        if (ann.type === 'line') {
          const dist = pointToLineDistance(x, y, ann.x, ann.y, ann.x2, ann.y2);
          return dist < hitTolerance;
        } else if (ann.type === 'freehand' && ann.points) {
          return ann.points.some(p => Math.abs(p.x - x) < hitTolerance && Math.abs(p.y - y) < hitTolerance);
        } else if (ann.type === 'note') {
          return x >= ann.x && x <= ann.x + 20 && y >= ann.y && y <= ann.y + 20;
        } else {
          return x >= ann.x && x <= ann.x + (ann.width || 100) && 
                 y >= ann.y && y <= ann.y + (ann.height || 20);
        }
      });
      
      if (toDelete) {
        deleteAnnotation(toDelete.id);
      }
      return;
    }
    
    if (activeTool === 'note') {
      addAnnotation({
        type: 'note',
        page: pageNum,
        x, y, // Store in normalized coords
        text: '',
      });
      return;
    }
    
    if (activeTool === 'textbox') {
      setTextboxInput({ page: pageNum, x: screenX, y: screenY, normX: x, normY: y });
      setTextboxValue('');
      return;
    }
    
    // Drawing tools - store start in normalized coords
    if (['highlight', 'underline', 'strikethrough', 'freehand', 'line', 'rectangle', 'ellipse'].includes(activeTool)) {
      setIsDrawing(true);
      setDrawingStart({ x, y, screenX, screenY, page: pageNum });
      
      if (activeTool === 'freehand') {
        setCurrentPath([{ x, y }]);
      }
    }
  }, [activeTool, getPageAnnotations, addAnnotation, deleteAnnotation, scale]);

  const handleAnnotationMouseMove = useCallback((e, pageNum) => {
    if (!isDrawing || !drawingStart || drawingStart.page !== pageNum) return;
    
    const targetCanvas = e.currentTarget;
    const rect = targetCanvas.getBoundingClientRect();
    
    // Account for CSS scaling
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    
    const screenX = displayX * scaleX;
    const screenY = displayY * scaleY;
    const x = screenX / scale;
    const y = screenY / scale;
    
    if (activeTool === 'freehand') {
      setCurrentPath(prev => [...prev, { x, y }]);
    }
    
    // Live preview on canvas (draw in screen coords since canvas is at current scale)
    const annotationCanvas = annotationCanvasRefs.current[pageNum];
    if (annotationCanvas) {
      renderAnnotations(pageNum, annotationCanvas);
      const ctx = annotationCanvas.getContext('2d');
      
      ctx.save();
      // Use screen coordinates for preview since canvas is already scaled
      const startScreenX = drawingStart.screenX;
      const startScreenY = drawingStart.screenY;
      
      switch (activeTool) {
        case 'highlight':
          ctx.fillStyle = activeColor;
          ctx.fillRect(
            Math.min(startScreenX, screenX),
            Math.min(startScreenY, screenY),
            Math.abs(screenX - startScreenX),
            Math.abs(screenY - startScreenY)
          );
          break;
        case 'underline':
          ctx.strokeStyle = '#2196F3';
          ctx.lineWidth = 2 * scale;
          ctx.beginPath();
          ctx.moveTo(startScreenX, Math.max(startScreenY, screenY));
          ctx.lineTo(screenX, Math.max(startScreenY, screenY));
          ctx.stroke();
          break;
        case 'strikethrough':
          ctx.strokeStyle = '#f44336';
          ctx.lineWidth = 2 * scale;
          ctx.beginPath();
          const midY = (startScreenY + screenY) / 2;
          ctx.moveTo(startScreenX, midY);
          ctx.lineTo(screenX, midY);
          ctx.stroke();
          break;
        case 'freehand':
          if (currentPath.length > 1) {
            ctx.strokeStyle = '#007BFF';
            ctx.lineWidth = strokeWidth * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(currentPath[0].x * scale, currentPath[0].y * scale);
            for (let i = 1; i < currentPath.length; i++) {
              ctx.lineTo(currentPath[i].x * scale, currentPath[i].y * scale);
            }
            ctx.stroke();
          }
          break;
        case 'line':
          ctx.strokeStyle = '#007BFF';
          ctx.lineWidth = strokeWidth * scale;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(startScreenX, startScreenY);
          ctx.lineTo(screenX, screenY);
          ctx.stroke();
          break;
        case 'rectangle':
          ctx.strokeStyle = '#007BFF';
          ctx.lineWidth = strokeWidth * scale;
          ctx.strokeRect(
            Math.min(startScreenX, screenX),
            Math.min(startScreenY, screenY),
            Math.abs(screenX - startScreenX),
            Math.abs(screenY - startScreenY)
          );
          break;
        case 'ellipse':
          ctx.strokeStyle = '#007BFF';
          ctx.lineWidth = strokeWidth * scale;
          ctx.beginPath();
          const w = screenX - startScreenX;
          const h = screenY - startScreenY;
          const cx = startScreenX + w / 2;
          const cy = startScreenY + h / 2;
          ctx.ellipse(cx, cy, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }
  }, [isDrawing, drawingStart, activeTool, activeColor, strokeWidth, currentPath, renderAnnotations, scale]);

  const handleAnnotationMouseUp = useCallback((e, pageNum) => {
    if (!isDrawing || !drawingStart || drawingStart.page !== pageNum) return;
    
    const targetCanvas = e.currentTarget;
    const rect = targetCanvas.getBoundingClientRect();
    
    // Account for CSS scaling
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    
    const screenX = displayX * scaleX;
    const screenY = displayY * scaleY;
    // Convert to normalized coords
    const x = screenX / scale;
    const y = screenY / scale;
    
    // Create annotation in normalized coordinates
    let annotation = null;
    const minThreshold = 5 / scale;
    
    switch (activeTool) {
      case 'highlight':
        annotation = {
          type: 'highlight',
          page: pageNum,
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: activeColor,
        };
        break;
      case 'underline':
        annotation = {
          type: 'underline',
          page: pageNum,
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: '#2196F3',
        };
        break;
      case 'strikethrough':
        annotation = {
          type: 'strikethrough',
          page: pageNum,
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: '#f44336',
        };
        break;
      case 'freehand':
        if (currentPath.length > 1) {
          annotation = {
            type: 'freehand',
            page: pageNum,
            points: [...currentPath], // Already in normalized coords
            color: '#007BFF',
            strokeWidth: strokeWidth,
          };
        }
        break;
      case 'line':
        annotation = {
          type: 'line',
          page: pageNum,
          x: drawingStart.x,
          y: drawingStart.y,
          x2: x,
          y2: y,
          color: '#007BFF',
          strokeWidth: strokeWidth,
        };
        break;
      case 'rectangle':
        annotation = {
          type: 'rectangle',
          page: pageNum,
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: '#007BFF',
          strokeWidth: strokeWidth,
        };
        break;
      case 'ellipse':
        annotation = {
          type: 'ellipse',
          page: pageNum,
          x: Math.min(drawingStart.x, x),
          y: Math.min(drawingStart.y, y),
          width: Math.abs(x - drawingStart.x),
          height: Math.abs(y - drawingStart.y),
          color: '#007BFF',
          strokeWidth: strokeWidth,
        };
        break;
    }
    
    if (annotation && (annotation.width > minThreshold || annotation.height > minThreshold || annotation.points?.length > 2 || 
        (activeTool === 'line' && Math.hypot(x - drawingStart.x, y - drawingStart.y) > minThreshold))) {
      addAnnotation(annotation);
    }
    
    setIsDrawing(false);
    setDrawingStart(null);
    setCurrentPath([]);
  }, [isDrawing, drawingStart, activeTool, activeColor, strokeWidth, currentPath, addAnnotation, scale]);

  // Helper: distance from point to line segment
  const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;
    
    let xx, yy;
    if (param < 0) {
      xx = x1; yy = y1;
    } else if (param > 1) {
      xx = x2; yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    return Math.hypot(px - xx, py - yy);
  };

  // Submit textbox annotation
  const submitTextbox = useCallback(() => {
    if (textboxInput && textboxValue.trim()) {
      addAnnotation({
        type: 'textbox',
        page: textboxInput.page,
        x: textboxInput.normX, // Use normalized coordinates
        y: textboxInput.normY,
        text: textboxValue.trim(),
      });
    }
    setTextboxInput(null);
    setTextboxValue('');
  }, [textboxInput, textboxValue, addAnnotation]);

  // Re-render annotations when they change
  useEffect(() => {
    Object.keys(annotationCanvasRefs.current).forEach(pageNum => {
      const canvas = annotationCanvasRefs.current[pageNum];
      if (canvas) {
        renderAnnotations(parseInt(pageNum), canvas);
      }
    });
  }, [annotations, selectedAnnotation]);

  // Load annotations when document loads
  useEffect(() => {
    if (pdfDoc) {
      loadAnnotationsFromStorage();
    }
  }, [pdfDoc, loadAnnotationsFromStorage]);

  // Keyboard shortcuts for annotation tools
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't capture if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      else if (key === 'h') setActiveTool('highlight');
      else if (key === 'u') setActiveTool('underline');
      else if (key === 's' && !e.ctrlKey) setActiveTool('strikethrough');
      else if (key === 'n') setActiveTool('note');
      else if (key === 't') setActiveTool('textbox');
      else if (key === 'p') setActiveTool('freehand');
      else if (key === 'l') setActiveTool('line');
      else if (key === 'r') setActiveTool('rectangle');
      else if (key === 'e') setActiveTool('ellipse');
      else if (key === 'x') setActiveTool('eraser');
      else if (key === 'delete' || key === 'backspace') {
        if (selectedAnnotation) {
          deleteAnnotation(selectedAnnotation);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotation, deleteAnnotation]);

  // Load PDF document
  useEffect(() => {
    if (!documentPath) return;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        // Only http/https URLs are supported in offline/Electron mode.
        let pdfUrl;
        if (documentPath.startsWith('http')) {
          pdfUrl = documentPath;
        } else {
          setError('Document not available in offline mode. Re-import the file to view it.');
          setLoading(false);
          return;
        }

        console.log('📄 Loading spec document:', pdfUrl);
        
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/cmaps/',
          cMapPacked: true,
        });
        
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
        
        console.log(`✅ Spec loaded: ${pdf.numPages} pages`);
        
        // Load PDF outline (Table of Contents)
        loadOutline(pdf);
        
        // Start loading thumbnails
        loadThumbnails(pdf);
        
        // Load saved bookmarks and notes
        loadSavedAnnotations();
      } catch (err) {
        console.error('❌ Failed to load spec:', err);
        setError(`Failed to load document: ${err.message}`);
        setLoading(false);
      }
    };

    loadPdf();
  }, [documentPath, project]);

  // Extract detailed requirements for in-scope sections
  const extractRequirements = async () => {
    if (!specSections || !documentPath) return;
    // Requirements extraction requires the GlazeBid backend server.
    alert('Spec extraction is not available in offline mode.');
    return;
    // eslint-disable-next-line no-unreachable
    try {
      console.log('📋 Extracting requirements for in-scope sections...');
      const extractingReqs = true;
      
      // Get in-scope sections
      const inScopeSections = specSections.sections.filter(section => {
        const key = `${section.code}_${section.page}`;
        return sectionScope[key] !== false; // Include if not explicitly unchecked
      });
      
      if (inScopeSections.length === 0) {
        alert('No sections are marked in scope. Check at least one section first.');
        return;
      }
      
      console.log(`  📄 Processing ${inScopeSections.length} in-scope sections`);
      
      // Fetch the PDF file
      let pdfUrl;
      if (documentPath.startsWith('http')) {
        pdfUrl = documentPath;
      } else {
        pdfUrl = `http://localhost:8000/pdf/${encodeURIComponent(project)}/${encodeURIComponent(documentPath)}`;
      }
      
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      
      // Send to backend for requirements extraction
      const formData = new FormData();
      formData.append('file', blob, documentName || 'spec.pdf');
      formData.append('sections', JSON.stringify(inScopeSections));
      
      const extractResponse = await fetch('http://localhost:8000/api/spec/extract-requirements', {
        method: 'POST',
        body: formData
      });
      
      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        console.error('❌ Server error:', errorText);
        throw new Error(`Failed to extract requirements: ${extractResponse.status} - ${errorText}`);
      }
      
      const result = await extractResponse.json();
      console.log(`✅ Extracted requirements for ${Object.keys(result.requirements).length} sections`);
      if (result.door_schedules && Object.keys(result.door_schedules).length > 0) {
        console.log(`✅ Extracted door schedules for ${Object.keys(result.door_schedules).length} hardware sections`);
      }
      
      // Save to project data
      const projectName = encodeURIComponent(project);
      const saveResponse = await fetch(`http://localhost:8000/api/projects/${projectName}/spec-requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements: result.requirements,
          door_schedules: result.door_schedules,
          sections: inScopeSections,
          extractedAt: new Date().toISOString()
        })
      });
      
      if (!saveResponse.ok) {
        const saveError = await saveResponse.text();
        console.error('❌ Failed to save to project:', saveError);
        throw new Error(`Failed to save requirements: ${saveResponse.status} - ${saveError}`);
      }
      
      console.log('✅ Requirements saved to project');
      
      let successMsg = `Successfully extracted requirements from ${Object.keys(result.requirements).length} sections!`;
      if (result.door_schedules && Object.keys(result.door_schedules).length > 0) {
        const totalDoors = Object.values(result.door_schedules).reduce((sum, ds) => sum + (ds.door_schedules?.total_doors || 0), 0);
        successMsg += `\n\n🚪 Also extracted ${totalDoors} doors from ${Object.keys(result.door_schedules).length} hardware section(s).`;
      }
      alert(successMsg);
      
    } catch (err) {
      console.error('❌ Failed to extract requirements:', err);
      alert(`Failed to extract requirements: ${err.message}`);
    }
  };

  // Extract spec sections using pattern matching (no AI)
  const extractSpecSections = async () => {
    if (!documentPath) return;
    // Section extraction requires the GlazeBid backend server.
    alert('Spec section extraction is not available in offline mode.');
    return;
    // eslint-disable-next-line no-unreachable
    try {
      console.log('🔍 Extracting spec sections...');
      setExtractingSpecs(true);
      
      // Fetch the PDF file
      let pdfUrl;
      if (documentPath.startsWith('http')) {
        pdfUrl = documentPath;
      } else {
        pdfUrl = `http://localhost:8000/pdf/${encodeURIComponent(project)}/${encodeURIComponent(documentPath)}`;
      }
      
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      
      // Send to backend for extraction
      const formData = new FormData();
      formData.append('file', blob, documentName || 'spec.pdf');
      
      const extractResponse = await fetch('http://localhost:8000/api/spec/extract-sections', {
        method: 'POST',
        body: formData
      });
      
      if (!extractResponse.ok) {
        throw new Error('Failed to extract sections');
      }
      
      const result = await extractResponse.json();
      console.log(`✅ Extracted ${result.sections_found} spec sections`);
      
      // Save extracted sections
      setSpecSections(result);
      
      // Initialize scope - all sections start as "in scope" (checked)
      const initialScope = {};
      result.sections.forEach(section => {
        const key = `${section.code}_${section.page}`;
        initialScope[key] = true; // Default all to in-scope
      });
      setSectionScope(initialScope);
      
      setExtractingSpecs(false);
      return result;
      
    } catch (err) {
      console.error('❌ Failed to extract spec sections:', err);
      alert(`Failed to extract sections: ${err.message}`);
      setExtractingSpecs(false);
    }
  };

  // Load PDF outline/bookmarks
  const loadOutline = async (pdf) => {
    try {
      const outline = await pdf.getOutline();
      if (outline && outline.length > 0) {
        console.log('📑 PDF Outline loaded:', outline.length, 'items');
        
        // Process outline to get page numbers
        const processedOutline = await processOutlineItems(pdf, outline);
        setPdfOutline(processedOutline);
      } else {
        console.log('📑 No PDF outline found');
        setPdfOutline([]);
      }
    } catch (err) {
      console.warn('Failed to load PDF outline:', err);
      setPdfOutline([]);
    }
  };

  // Process outline items to resolve destinations to page numbers
  const processOutlineItems = async (pdf, items, level = 0) => {
    const processed = [];
    
    for (const item of items) {
      let pageNum = 1;
      
      try {
        if (item.dest) {
          // Resolve named destination or explicit destination
          let dest = item.dest;
          if (typeof dest === 'string') {
            dest = await pdf.getDestination(dest);
          }
          if (dest && dest[0]) {
            const pageRef = dest[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            pageNum = pageIndex + 1;
          }
        }
      } catch (err) {
        // Destination resolution failed, default to page 1
      }
      
      const processedItem = {
        title: item.title,
        page: pageNum,
        level: level,
        items: item.items ? await processOutlineItems(pdf, item.items, level + 1) : []
      };
      
      processed.push(processedItem);
    }
    
    return processed;
  };

  // Load saved annotations from localStorage
  const loadSavedAnnotations = () => {
    const key = `specviewer_${project}_${documentPath}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        setUserBookmarks(data.bookmarks || []);
        setUserNotes(data.notes || []);
        setSectionScope(data.sectionScope || {});
      }
    } catch (err) {
      console.warn('Failed to load saved annotations:', err);
    }
  };

  // Save annotations to localStorage
  const saveAnnotations = useCallback(() => {
    const key = `specviewer_${project}_${documentPath}`;
    try {
      localStorage.setItem(key, JSON.stringify({
        bookmarks: userBookmarks,
        notes: userNotes,
        sectionScope: sectionScope  // Save scope selections
      }));
    } catch (err) {
      console.warn('Failed to save annotations:', err);
    }
  }, [project, documentPath, userBookmarks, userNotes, sectionScope]);

  // Auto-save when bookmarks or notes change
  useEffect(() => {
    if (pdfDoc) {
      saveAnnotations();
    }
  }, [userBookmarks, userNotes, sectionScope, pdfDoc, saveAnnotations]);


  // Load thumbnails in background
  const loadThumbnails = async (pdf) => {
    setLoadingThumbnails(true);
    const thumbs = {};
    
    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) { // Limit to first 50 for performance
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.15 });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: viewport,
        }).promise;
        
        thumbs[i] = canvas.toDataURL();
        
        // Update state periodically for progressive loading
        if (i % 10 === 0 || i === pdf.numPages) {
          setThumbnails({...thumbs});
        }
      } catch (err) {
        console.warn(`Failed to load thumbnail for page ${i}:`, err);
      }
    }
    
    setThumbnails(thumbs);
    setLoadingThumbnails(false);
  };

  // Render current page (single page mode)
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || viewMode !== 'single') return;

    const renderPage = async () => {
      try {
        console.log(`🎨 Rendering page ${currentPage} at scale ${scale}`);
        const page = await pdfDoc.getPage(currentPage);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr, rotation });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        // Set canvas dimensions — render at physical pixel density for sharp output
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width  = `${viewport.width  / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        
        // Clear canvas first
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
        
        console.log(`✅ Page ${currentPage} rendered (${viewport.width}x${viewport.height})`);
        
        // Update annotation canvas dimensions and re-render annotations
        const annotationCanvas = annotationCanvasRefs.current[currentPage];
        if (annotationCanvas) {
          annotationCanvas.width  = viewport.width;
          annotationCanvas.height = viewport.height;
          annotationCanvas.style.width  = `${viewport.width  / dpr}px`;
          annotationCanvas.style.height = `${viewport.height / dpr}px`;
          // Call renderAnnotations directly with current scale
          const ctx = annotationCanvas.getContext('2d');
          ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
          renderAnnotations(currentPage, annotationCanvas);
        }
        
        lastScaleRef.current = scale;
      } catch (err) {
        console.error('Failed to render page:', err);
      }
    };

    renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, scale, rotation, viewMode]);

  // Render all pages for continuous scroll mode
  useEffect(() => {
    if (!pdfDoc || viewMode !== 'continuous') return;

    const renderVisiblePages = async () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const pageElements = container.querySelectorAll('[data-page]');
      const currentScale = scale;
      
      // Find pages that need rendering
      const pagesToRender = [];
      pageElements.forEach(el => {
        const pageNum = parseInt(el.dataset.page);
        const rect = el.getBoundingClientRect();
        
        // Check if page is visible or near viewport
        const isNearViewport = rect.top < containerRect.bottom + 500 && 
                               rect.bottom > containerRect.top - 500;
        
        if (isNearViewport && !renderedPages[pageNum]) {
          pagesToRender.push(pageNum);
        }
      });

      if (pagesToRender.length === 0) return;

      console.log('📜 Rendering pages:', pagesToRender);

      // Render pages in parallel — use devicePixelRatio for sharp output on hi-DPI displays
      const dpr = window.devicePixelRatio || 1;
      const newPages = { ...renderedPages };
      const promises = pagesToRender.map(async (pageNum) => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: currentScale * dpr, rotation });
          
          const canvas = document.createElement('canvas');
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          
          const context = canvas.getContext('2d');
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
          
          newPages[pageNum] = canvas.toDataURL('image/jpeg', 0.85);
        } catch (err) {
          console.warn(`Failed to render page ${pageNum}:`, err);
        }
      });

      await Promise.all(promises);
      setRenderedPages(newPages);
    };

    // Initial render
    renderVisiblePages();

    // Re-render on scroll
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', renderVisiblePages);
      return () => container.removeEventListener('scroll', renderVisiblePages);
    }
  }, [pdfDoc, viewMode, scale, rotation, numPages, renderedPages]);

  // Clear rendered pages when scale changes to force re-render
  useEffect(() => {
    if (viewMode === 'continuous') {
      setRenderedPages({});
    }
  }, [scale, viewMode]);

  // Track scroll position to update current page in continuous mode
  useEffect(() => {
    if (viewMode !== 'continuous' || !scrollContainerRef.current) return;

    const handleScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const pageElements = container.querySelectorAll('[data-page]');
      
      for (const el of pageElements) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if page is in view (top half visible)
        if (rect.top <= containerRect.top + containerRect.height / 2 && 
            rect.bottom >= containerRect.top) {
          const pageNum = parseInt(el.dataset.page);
          if (pageNum !== currentPage) {
            setCurrentPage(pageNum);
          }
          break;
        }
      }
    };

    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [viewMode, currentPage]);

  // Scroll to page when clicking sidebar in continuous mode
  const scrollToPage = useCallback((pageNum) => {
    if (viewMode === 'continuous' && scrollContainerRef.current) {
      const pageEl = scrollContainerRef.current.querySelector(`[data-page="${pageNum}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setCurrentPage(pageNum);
  }, [viewMode]);

  // Navigation
  const goToNextPage = useCallback(() => {
    if (currentPage < numPages) {
      const nextPage = currentPage + 1;
      if (viewMode === 'continuous') {
        scrollToPage(nextPage);
      } else {
        setCurrentPage(nextPage);
      }
    }
  }, [currentPage, numPages, viewMode, scrollToPage]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      if (viewMode === 'continuous') {
        scrollToPage(prevPage);
      } else {
        setCurrentPage(prevPage);
      }
    }
  }, [currentPage, viewMode, scrollToPage]);

  const goToPage = useCallback((pageNum) => {
    if (pageNum >= 1 && pageNum <= numPages) {
      if (viewMode === 'continuous') {
        scrollToPage(pageNum);
      } else {
        setCurrentPage(pageNum);
      }
    }
  }, [numPages, viewMode, scrollToPage]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.findIndex(z => z >= scale);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setScale(ZOOM_LEVELS[currentIndex + 1]);
    }
  }, [scale]);

  const handleZoomOut = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.findIndex(z => z >= scale);
    if (currentIndex > 0) {
      setScale(ZOOM_LEVELS[currentIndex - 1]);
    }
  }, [scale]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentPage(numPages);
      } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else if (e.key === 'Escape') {
        setShowSearch(false);
      } else if (e.key === '+' || e.key === '=') {
        if (e.ctrlKey) {
          e.preventDefault();
          handleZoomIn();
        }
      } else if (e.key === '-') {
        if (e.ctrlKey) {
          e.preventDefault();
          handleZoomOut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, goToNextPage, goToPrevPage, handleZoomIn, handleZoomOut]);

  const handleFitWidth = useCallback(async () => {
    if (containerRef.current && pdfDoc) {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current.clientWidth - (showSidebar ? 40 : 40);
      const newScale = containerWidth / viewport.width;
      setScale(Math.min(Math.max(newScale, 0.5), 3.0));
    }
  }, [pdfDoc, currentPage, showSidebar]);

  const handleFitPage = useCallback(async () => {
    if (containerRef.current && pdfDoc) {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current.clientWidth - 40;
      const containerHeight = containerRef.current.clientHeight - 40;
      const scaleWidth = containerWidth / viewport.width;
      const scaleHeight = containerHeight / viewport.height;
      setScale(Math.min(scaleWidth, scaleHeight, 3.0));
    }
  }, [pdfDoc, currentPage]);

  const handleRotate = () => {
    setRotation((rotation + 90) % 360);
  };

  // Page input handler
  const handlePageInput = (e) => {
    const pageNum = parseInt(e.target.value);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      setCurrentPage(pageNum);
    }
  };

  // Search with Regex support
  const handleSearch = async () => {
    if (!searchTerm || !pdfDoc) return;
    
    setSearchingAll(true);
    const results = [];
    
    let searchPattern;
    if (useRegex) {
      try {
        searchPattern = new RegExp(searchTerm, 'gi');
      } catch (err) {
        console.error('Invalid regex:', err);
        setSearchingAll(false);
        return;
      }
    }
    
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        
        let matches = [];
        if (useRegex) {
          const regexMatches = text.match(searchPattern);
          if (regexMatches) {
            matches = regexMatches;
          }
        } else {
          if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
            matches = [searchTerm];
          }
        }
        
        if (matches.length > 0) {
          // Find context around the match
          const lowerText = text.toLowerCase();
          const matchIndex = useRegex ? text.search(searchPattern) : lowerText.indexOf(searchTerm.toLowerCase());
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(text.length, matchIndex + searchTerm.length + 50);
          const context = (contextStart > 0 ? '...' : '') + 
                          text.substring(contextStart, contextEnd) + 
                          (contextEnd < text.length ? '...' : '');
          
          results.push({
            page: i,
            text: context,
            matchCount: matches.length,
            matches: matches.slice(0, 5) // Show first 5 unique matches
          });
        }
      } catch (err) {
        console.warn(`Search failed on page ${i}:`, err);
      }
    }
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    setSearchingAll(false);
    
    if (results.length > 0) {
      goToPage(results[0].page);
    }
    
    console.log(`🔍 Search complete: ${results.length} pages with matches`);
  };

  const goToNextSearchResult = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentSearchIndex + 1) % searchResults.length;
      setCurrentSearchIndex(nextIndex);
      goToPage(searchResults[nextIndex].page);
    }
  };

  const goToPrevSearchResult = () => {
    if (searchResults.length > 0) {
      const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
      setCurrentSearchIndex(prevIndex);
      goToPage(searchResults[prevIndex].page);
    }
  };

  // Bookmark functions
  const addBookmark = () => {
    const newBookmark = {
      id: Date.now(),
      page: currentPage,
      title: `Page ${currentPage}`,
      timestamp: new Date().toISOString()
    };
    setUserBookmarks([...userBookmarks, newBookmark]);
  };

  const removeBookmark = (id) => {
    setUserBookmarks(userBookmarks.filter(b => b.id !== id));
  };

  const isPageBookmarked = (pageNum) => {
    return userBookmarks.some(b => b.page === pageNum);
  };

  // Note functions
  const addNote = () => {
    if (!newNoteText.trim()) return;
    
    const newNote = {
      id: Date.now(),
      page: currentPage,
      text: newNoteText.trim(),
      timestamp: new Date().toISOString()
    };
    setUserNotes([...userNotes, newNote]);
    setNewNoteText('');
    setShowNoteModal(false);
  };

  const removeNote = (id) => {
    setUserNotes(userNotes.filter(n => n.id !== id));
  };

  const getNotesForPage = (pageNum) => {
    return userNotes.filter(n => n.page === pageNum);
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p>Loading specifications...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <FileText size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <p style={{ fontSize: 16, marginBottom: 8 }}>Unable to load document</p>
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>{error}</p>
          <button onClick={onClose} style={styles.errorButton}>
            <ChevronLeft size={16} />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top Toolbar */}
      <div style={styles.toolbar}>
        {/* Left - Back Button & Document Name */}
        <div style={styles.toolbarSection}>
          <button onClick={onClose} style={styles.backButton}>
            <ChevronLeft size={16} />
            <span>Project Home</span>
          </button>
          <div style={styles.divider} />
          <span style={styles.docName}>
            <FileText size={16} style={{ marginRight: 8, opacity: 0.7 }} />
            {documentName || 'Specifications'}
          </span>
        </div>
        
        {/* Center - Navigation & Zoom */}
        <div style={styles.toolbarCenter}>
          {/* Page Navigation */}
          <button onClick={goToPrevPage} disabled={currentPage <= 1} style={styles.navButton}>
            <ChevronLeft size={20} />
          </button>
          
          <div style={styles.pageNav}>
            <input
              type="number"
              value={currentPage}
              onChange={handlePageInput}
              style={styles.pageInput}
              min={1}
              max={numPages}
            />
            <span style={styles.pageTotal}>of {numPages}</span>
          </div>
          
          <button onClick={goToNextPage} disabled={currentPage >= numPages} style={styles.navButton}>
            <ChevronRight size={20} />
          </button>
          
          <div style={styles.divider} />
          
          {/* Zoom Controls */}
          <button onClick={handleZoomOut} style={styles.iconButton} title="Zoom Out (Ctrl+-)">
            <ZoomOut size={18} />
          </button>
          
          <select 
            value={scale} 
            onChange={(e) => setScale(parseFloat(e.target.value))}
            style={styles.zoomSelect}
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2.0}>200%</option>
            <option value={3.0}>300%</option>
          </select>
          
          <button onClick={handleZoomIn} style={styles.iconButton} title="Zoom In (Ctrl++)">
            <ZoomIn size={18} />
          </button>
          
          <div style={styles.divider} />
          
          <button onClick={handleFitWidth} style={styles.iconButton} title="Fit Width">
            <Maximize2 size={18} />
          </button>
          
          <button onClick={handleRotate} style={styles.iconButton} title="Rotate">
            <RotateCw size={18} />
          </button>
          
          <div style={styles.divider} />
          
          {/* View Mode Toggle */}
          <button 
            onClick={() => setViewMode(viewMode === 'single' ? 'continuous' : 'single')}
            style={{...styles.iconButton, backgroundColor: viewMode === 'continuous' ? 'rgba(0,123,255,0.2)' : 'transparent'}}
            title={viewMode === 'single' ? 'Switch to Continuous Scroll' : 'Switch to Single Page'}
          >
            <List size={18} />
          </button>
        </div>
        
        {/* Right - Search & Annotation Tools */}
        <div style={styles.toolbarSection}>
          {/* Bookmark current page */}
          <button 
            onClick={addBookmark}
            style={{
              ...styles.iconButton, 
              backgroundColor: isPageBookmarked(currentPage) ? 'rgba(0,123,255,0.2)' : 'transparent',
              color: isPageBookmarked(currentPage) ? '#007BFF' : '#9ca3af'
            }}
            title="Bookmark this page"
          >
            <Bookmark size={18} />
          </button>
          
          {/* Add note */}
          <button 
            onClick={() => setShowNoteModal(true)}
            style={styles.iconButton}
            title="Add note to this page"
          >
            <StickyNote size={18} />
          </button>
          
          <div style={styles.divider} />
          
          {/* Toggle annotation sidebar */}
          <button 
            onClick={() => setShowAnnotationTools(!showAnnotationTools)} 
            style={{
              ...styles.iconButton, 
              backgroundColor: showAnnotationTools ? 'rgba(0,123,255,0.2)' : 'transparent',
              position: 'relative',
            }}
            title="Toggle Annotation Tools"
          >
            <PenTool size={18} />
            {annotations.length > 0 && (
              <span style={{
                position: 'absolute',
                top: 2,
                right: 2,
                backgroundColor: '#007BFF',
                color: '#fff',
                fontSize: '9px',
                padding: '1px 4px',
                borderRadius: '8px',
                minWidth: '14px',
                textAlign: 'center',
              }}>
                {annotations.length}
              </span>
            )}
          </button>
          
          <div style={styles.divider} />
          
          <button 
            onClick={() => {
              setShowSearch(!showSearch);
              if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
            }} 
            style={{...styles.iconButton, backgroundColor: showSearch ? 'rgba(0,123,255,0.2)' : 'transparent'}}
            title="Search (Ctrl+F)"
          >
            <Search size={18} />
          </button>
        </div>
      </div>
      
      {/* Search Bar with Regex */}
      {showSearch && (
        <div style={styles.searchBar}>
          <div style={styles.searchInputWrapper}>
            <Search size={16} style={{ color: '#6b7280', marginRight: 8 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={useRegex ? "Regex pattern (e.g. tempered|laminated)" : "Search in document..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={styles.searchInput}
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setSearchResults([]); }} style={styles.clearSearch}>
                <X size={14} />
              </button>
            )}
          </div>
          
          {/* Regex Toggle */}
          <button 
            onClick={() => setUseRegex(!useRegex)}
            style={{
              ...styles.regexToggle,
              backgroundColor: useRegex ? 'rgba(0,123,255,0.2)' : 'transparent',
              borderColor: useRegex ? '#007BFF' : '#2d333b'
            }}
            title="Use Regular Expression"
          >
            <Hash size={14} style={{ marginRight: 4 }} />
            Regex
          </button>
          
          {searchResults.length > 0 && (
            <div style={styles.searchNav}>
              <span style={styles.searchCount}>
                {currentSearchIndex + 1} of {searchResults.length} pages
              </span>
              <button onClick={goToPrevSearchResult} style={styles.searchNavBtn}>
                <ChevronUp size={16} />
              </button>
              <button onClick={goToNextSearchResult} style={styles.searchNavBtn}>
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          
          <button onClick={handleSearch} disabled={searchingAll} style={styles.searchButton}>
            {searchingAll ? 'Searching...' : 'Find All'}
          </button>
        </div>
      )}
      
      {/* Note Modal */}
      {showNoteModal && (
        <div style={styles.modalOverlay} onClick={() => setShowNoteModal(false)}>
          <div style={styles.noteModal} onClick={e => e.stopPropagation()}>
            <div style={styles.noteModalHeader}>
              <StickyNote size={18} />
              <span>Add Note - Page {currentPage}</span>
            </div>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Enter your note (e.g., Verify lead time on this hardware)"
              style={styles.noteTextarea}
              autoFocus
            />
            <div style={styles.noteModalActions}>
              <button onClick={() => setShowNoteModal(false)} style={styles.noteCancelBtn}>
                Cancel
              </button>
              <button onClick={addNote} style={styles.noteSaveBtn}>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content Area */}
      <div style={styles.mainContent}>
        {/* Sidebar with Tabs */}
        {showSidebar && (
          <div style={styles.sidebar}>
            {/* Sidebar Tabs */}
            <div style={styles.sidebarTabs}>
              <button 
                onClick={() => setSidebarTab('pages')}
                style={{...styles.sidebarTab, ...(sidebarTab === 'pages' ? styles.sidebarTabActive : {})}}
                title="Pages"
              >
                <Grid size={16} />
              </button>
              <button 
                onClick={() => setSidebarTab('bookmarks')}
                style={{...styles.sidebarTab, ...(sidebarTab === 'bookmarks' ? styles.sidebarTabActive : {})}}
                title="Bookmarks"
              >
                <Bookmark size={16} />
                {userBookmarks.length > 0 && <span style={styles.tabBadge}>{userBookmarks.length}</span>}
              </button>
              <button 
                onClick={() => setShowSidebar(!showSidebar)}
                style={styles.sidebarTab}
                title="Toggle Sidebar"
              >
                <Sidebar size={16} />
              </button>
            </div>
            
            {/* Pages Tab */}
            {sidebarTab === 'pages' && (
              <div style={styles.pageList}>
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <div
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    style={{
                      ...styles.pageThumb,
                      ...(currentPage === pageNum ? styles.pageThumbActive : {}),
                    }}
                  >
                    {thumbnails[pageNum] ? (
                      <img 
                        src={thumbnails[pageNum]} 
                        alt={`Page ${pageNum}`} 
                        style={styles.thumbImage}
                      />
                    ) : (
                      <div style={styles.thumbPlaceholder}>
                        <FileText size={24} style={{ opacity: 0.3 }} />
                      </div>
                    )}
                    <div style={styles.pageThumbFooter}>
                      <span style={styles.pageNumber}>{pageNum}</span>
                      {isPageBookmarked(pageNum) && <Bookmark size={12} style={{ color: '#007BFF' }} />}
                      {getNotesForPage(pageNum).length > 0 && <StickyNote size={12} style={{ color: '#f59e0b' }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Bookmarks Tab */}
            {sidebarTab === 'bookmarks' && (
              <div style={styles.bookmarkList}>
                {/* PDF Outline Section */}
                {pdfOutline.length > 0 && (
                  <div>
                    <div style={{...styles.sectionHeader, marginTop: 0}}>
                      <BookOpen size={14} />
                      <span>Table of Contents</span>
                    </div>
                    {pdfOutline.map((item, idx) => (
                      <OutlineItem key={idx} item={item} goToPage={goToPage} level={0} />
                    ))}
                  </div>
                )}
                
                {/* Spec Sections Section */}
                <div>
                  <div style={styles.sectionHeader}>
                    <Hash size={14} />
                    <span>Glazing Scope</span>
                    <button
                      onClick={extractSpecSections}
                      disabled={extractingSpecs}
                      style={styles.extractBtn}
                      title="Extract Division 08 + specialty items (canopies, railings, sunshades)"
                    >
                      {extractingSpecs ? 'Extracting...' : specSections ? 'Re-extract' : 'Extract'}
                    </button>
                  </div>
                  
                  {specSections && specSections.sections && specSections.sections.length > 0 && (
                    <div>
                      <div style={styles.scopeSummary}>
                        {getInScopeSections().length} of {specSections.sections.length} sections in scope
                        <button
                          onClick={extractRequirements}
                          style={styles.extractReqsBtn}
                          title="Extract warranty, finish, BOD, and testing requirements from in-scope sections"
                        >
                          📋 Extract Requirements
                        </button>
                      </div>
                      
                      {/* In-Scope Sections */}
                      {Object.entries(groupSectionsByCategory(getInScopeSections())).map(([category, sections], idx) => (
                        <div key={idx}>
                          <div style={styles.categoryTitle}>{category}</div>
                          {sections.map((section, sidx) => {
                            const key = `${section.code}_${section.page}`;
                            const inScope = sectionScope[key] !== false;
                            
                            return (
                              <div
                                key={sidx}
                                style={styles.specSectionItem}
                              >
                                <input
                                  type="checkbox"
                                  checked={inScope}
                                  onChange={() => toggleSectionScope(section.code, section.page)}
                                  style={styles.scopeCheckbox}
                                  title="Remove from scope"
                                />
                                <span 
                                  style={styles.specSectionTitle}
                                  onClick={() => goToPage(section.page)}
                                  onMouseEnter={(e) => e.currentTarget.style.color = '#007BFF'}
                                  onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                                >
                                  {section.code} - {section.name}
                                </span>
                                <span style={styles.specSectionPage}>p.{section.page}</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      
                      {/* Out of Scope - Collapsed Section */}
                      {getOutOfScopeSections().length > 0 && (
                        <div style={styles.outOfScopeSection}>
                          <div 
                            style={styles.outOfScopeHeader}
                            onClick={() => setShowOutOfScope(!showOutOfScope)}
                          >
                            <ChevronRight 
                              size={14} 
                              style={{ 
                                transform: showOutOfScope ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s'
                              }} 
                            />
                            <span>Out of Scope ({getOutOfScopeSections().length})</span>
                          </div>
                          
                          {showOutOfScope && (
                            <div style={styles.outOfScopeContent}>
                              {getOutOfScopeSections().map((section, sidx) => {
                                const key = `${section.code}_${section.page}`;
                                
                                return (
                                  <div
                                    key={sidx}
                                    style={styles.outOfScopeItem}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={false}
                                      onChange={() => toggleSectionScope(section.code, section.page)}
                                      style={styles.scopeCheckbox}
                                      title="Add back to scope"
                                    />
                                    <span 
                                      style={{
                                        ...styles.specSectionTitle,
                                        textDecoration: 'line-through',
                                        opacity: 0.6
                                      }}
                                      onClick={() => goToPage(section.page)}
                                      onMouseEnter={(e) => e.currentTarget.style.color = '#007BFF'}
                                      onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
                                    >
                                      {section.code} - {section.name}
                                    </span>
                                    <span style={{...styles.specSectionPage, opacity: 0.6}}>p.{section.page}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!specSections && !extractingSpecs && (
                    <div style={styles.emptyState}>
                      <Hash size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <span style={{fontSize: 12}}>Click Extract to find Division 08</span>
                      <span style={{fontSize: 11, opacity: 0.7, marginTop: 4}}>+ canopies, railings, sunshades</span>
                    </div>
                  )}
                </div>
                
                {/* User Bookmarks Section */}
                {userBookmarks.length > 0 && (
                  <div>
                    <div style={styles.sectionHeader}>
                      <Bookmark size={14} />
                      <span>My Bookmarks</span>
                    </div>
                    {userBookmarks.map(bookmark => (
                      <div key={bookmark.id} style={styles.bookmarkItem}>
                        <div 
                          style={styles.bookmarkContent}
                          onClick={() => goToPage(bookmark.page)}
                        >
                          <Bookmark size={14} style={{ color: '#007BFF', marginRight: 8, flexShrink: 0 }} />
                          <div style={styles.bookmarkText}>
                            <span style={styles.bookmarkTitle}>{bookmark.title}</span>
                            <span style={styles.bookmarkMeta}>
                              {new Date(bookmark.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeBookmark(bookmark.id)}
                          style={styles.removeBtn}
                          title="Remove bookmark"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Document View - Single Page Mode */}
        {viewMode === 'single' && (
          <div ref={containerRef} style={styles.documentContainer}>
            <div style={styles.canvasWrapper}>
              <div style={{ position: 'relative' }}>
                <canvas ref={canvasRef} style={styles.canvas} />
                {/* Annotation overlay canvas */}
                <canvas
                  ref={(el) => { 
                    annotationCanvasRefs.current[currentPage] = el;
                    // Match dimensions with main canvas
                    if (el && canvasRef.current) {
                      el.width = canvasRef.current.width;
                      el.height = canvasRef.current.height;
                    }
                  }}
                  style={{
                    ...styles.canvas,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: activeTool === 'select' ? 'auto' : 'auto',
                    cursor: activeTool === 'select' ? 'default' : 
                            activeTool === 'eraser' ? 'crosshair' : 'crosshair',
                  }}
                  onMouseDown={(e) => handleAnnotationMouseDown(e, currentPage)}
                  onMouseMove={(e) => handleAnnotationMouseMove(e, currentPage)}
                  onMouseUp={(e) => handleAnnotationMouseUp(e, currentPage)}
                  onMouseLeave={(e) => {
                    if (isDrawing) handleAnnotationMouseUp(e, currentPage);
                  }}
                />
                {/* Textbox input overlay */}
                {textboxInput && textboxInput.page === currentPage && (
                  <input
                    type="text"
                    value={textboxValue}
                    onChange={(e) => setTextboxValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitTextbox();
                      if (e.key === 'Escape') { setTextboxInput(null); setTextboxValue(''); }
                    }}
                    onBlur={submitTextbox}
                    autoFocus
                    style={{
                      position: 'absolute',
                      left: textboxInput.x,
                      top: textboxInput.y - 16,
                      padding: '4px 8px',
                      fontSize: '14px',
                      border: '2px solid #007BFF',
                      borderRadius: '4px',
                      outline: 'none',
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 200, 0.95)',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Document View - Continuous Scroll Mode */}
        {viewMode === 'continuous' && (
          <div ref={scrollContainerRef} style={styles.documentContainer}>
            <div style={styles.continuousWrapper}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <div 
                  key={pageNum} 
                  data-page={pageNum}
                  style={styles.continuousPage}
                >
                  {renderedPages[pageNum] ? (
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={renderedPages[pageNum]} 
                        alt={`Page ${pageNum}`}
                        style={styles.pageImage}
                        onLoad={(e) => {
                          // Update annotation canvas size when image loads
                          const canvas = annotationCanvasRefs.current[pageNum];
                          if (canvas) {
                            const imgWidth = e.target.naturalWidth;
                            const imgHeight = e.target.naturalHeight;
                            if (canvas.width !== imgWidth || canvas.height !== imgHeight) {
                              canvas.width = imgWidth;
                              canvas.height = imgHeight;
                              // Only render annotations after canvas resize
                              renderAnnotations(pageNum, canvas);
                            }
                          }
                        }}
                      />
                      {/* Annotation overlay canvas */}
                      <canvas
                        ref={(el) => { 
                          annotationCanvasRefs.current[pageNum] = el;
                          // Don't render here - let onLoad handle it to avoid double render
                        }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          cursor: activeTool === 'select' ? 'default' : 
                                  activeTool === 'eraser' ? 'crosshair' : 'crosshair',
                        }}
                        onMouseDown={(e) => handleAnnotationMouseDown(e, pageNum)}
                        onMouseMove={(e) => handleAnnotationMouseMove(e, pageNum)}
                        onMouseUp={(e) => handleAnnotationMouseUp(e, pageNum)}
                        onMouseLeave={(e) => {
                          if (isDrawing) handleAnnotationMouseUp(e, pageNum);
                        }}
                      />
                      {/* Textbox input overlay */}
                      {textboxInput && textboxInput.page === pageNum && (
                        <input
                          type="text"
                          value={textboxValue}
                          onChange={(e) => setTextboxValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitTextbox();
                            if (e.key === 'Escape') { setTextboxInput(null); setTextboxValue(''); }
                          }}
                          onBlur={submitTextbox}
                          autoFocus
                          style={{
                            position: 'absolute',
                            left: textboxInput.x,
                            top: textboxInput.y - 16,
                            padding: '4px 8px',
                            fontSize: '14px',
                            border: '2px solid #007BFF',
                            borderRadius: '4px',
                            outline: 'none',
                            minWidth: '100px',
                            backgroundColor: 'rgba(255, 255, 200, 0.95)',
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={styles.pageLoading}>
                      <div style={styles.spinnerSmall} />
                      <span>Loading page {pageNum}...</span>
                    </div>
                  )}
                  <div style={styles.pageLabel}>Page {pageNum}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Right Annotation Tools Sidebar */}
        <div 
          style={{
            ...styles.annotationSidebar,
            ...(showAnnotationTools ? {} : styles.annotationSidebarCollapsed)
          }}
        >
          {showAnnotationTools && (
            <>
              {/* Toggle Header */}
              <div style={styles.annotationHeader}>
                <button 
                  onClick={() => setShowAnnotationTools(false)}
                  style={styles.annotationToggle}
                  title="Hide Annotation Tools"
                >
                  <PanelRightClose size={18} />
                </button>
              </div>
              
              {/* Select Tool */}
              <div style={styles.annotationSection}>
                <div style={styles.annotationSectionLabel}>Select</div>
                <div style={styles.annotationToolsGrid}>
                  <button 
                    onClick={() => setActiveTool('select')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'select' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Select (V)"
                  >
                    <MousePointer size={18} />
                  </button>
                </div>
              </div>
              
              {/* Text Markup Tools */}
              <div style={styles.annotationSection}>
                <div style={styles.annotationSectionLabel}>Text</div>
                <div style={styles.annotationToolsGrid}>
                  <button 
                    onClick={() => setActiveTool('highlight')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'highlight' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Highlight (H)"
                  >
                    <Highlighter size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('underline')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'underline' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Underline (U)"
                  >
                    <Underline size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('strikethrough')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'strikethrough' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Strikethrough (S)"
                  >
                    <Strikethrough size={18} />
                  </button>
                </div>
              </div>
              
              {/* Highlight Colors */}
              {activeTool === 'highlight' && (
                <div style={styles.annotationSection}>
                  <div style={styles.annotationSectionLabel}>Color</div>
                  <div style={styles.colorSwatchContainer}>
                    {ANNOTATION_TOOLS.highlight.colors.map((c) => (
                      <div
                        key={c.name}
                        onClick={() => setActiveColor(c.color)}
                        style={{
                          ...styles.colorSwatch,
                          backgroundColor: c.color.replace('0.4', '1'),
                          ...(activeColor === c.color ? styles.colorSwatchActive : {})
                        }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Annotation Tools */}
              <div style={styles.annotationSection}>
                <div style={styles.annotationSectionLabel}>Annotate</div>
                <div style={styles.annotationToolsGrid}>
                  <button 
                    onClick={() => { setActiveTool('note'); setShowNoteModal(true); }}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'note' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Sticky Note (N)"
                  >
                    <StickyNote size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('textbox')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'textbox' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Text Box (T)"
                  >
                    <Type size={18} />
                  </button>
                </div>
              </div>
              
              {/* Drawing Tools */}
              <div style={styles.annotationSection}>
                <div style={styles.annotationSectionLabel}>Draw</div>
                <div style={styles.annotationToolsGrid}>
                  <button 
                    onClick={() => setActiveTool('freehand')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'freehand' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Freehand (P)"
                  >
                    <PenTool size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('line')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'line' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Line (L)"
                  >
                    <Minus size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('rectangle')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'rectangle' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Rectangle (R)"
                  >
                    <Square size={18} />
                  </button>
                  <button 
                    onClick={() => setActiveTool('ellipse')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'ellipse' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Ellipse (E)"
                  >
                    <Circle size={18} />
                  </button>
                </div>
              </div>
              
              {/* Stroke Width for drawing tools */}
              {['freehand', 'line', 'rectangle', 'ellipse'].includes(activeTool) && (
                <div style={styles.annotationSection}>
                  <div style={styles.annotationSectionLabel}>Width</div>
                  <div style={styles.strokeWidthControl}>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      style={styles.strokeWidthSlider}
                    />
                    <span style={styles.strokeWidthLabel}>{strokeWidth}px</span>
                  </div>
                </div>
              )}
              
              {/* Eraser */}
              <div style={styles.annotationSection}>
                <div style={styles.annotationSectionLabel}>Erase</div>
                <div style={styles.annotationToolsGrid}>
                  <button 
                    onClick={() => setActiveTool('eraser')}
                    style={{
                      ...styles.annotationToolBtn,
                      ...(activeTool === 'eraser' ? styles.annotationToolBtnActive : {})
                    }}
                    title="Eraser (X)"
                  >
                    <Eraser size={18} />
                  </button>
                </div>
              </div>
              
              {/* Clear All - only show if there are annotations */}
              {annotations.length > 0 && (
                <div style={styles.annotationSection}>
                  <div style={styles.annotationSectionLabel}>Clear</div>
                  <div style={styles.annotationToolsGrid}>
                    <button 
                      onClick={() => {
                        if (window.confirm(`Delete all ${annotations.length} annotations?`)) {
                          setAnnotations([]);
                          saveAnnotationsToStorage([]);
                        }
                      }}
                      style={{
                        ...styles.annotationToolBtn,
                        color: '#ef4444',
                      }}
                      title="Clear All Annotations"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div style={{ 
                    fontSize: '9px', 
                    color: '#6b7280', 
                    textAlign: 'center',
                    marginTop: '4px' 
                  }}>
                    {annotations.length} items
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Collapsed Annotation Sidebar Toggle */}
        {!showAnnotationTools && (
          <button 
            onClick={() => setShowAnnotationTools(true)}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: '#15191e',
              border: '1px solid #2d333b',
              borderRight: 'none',
              borderRadius: '6px 0 0 6px',
              padding: '12px 6px',
              color: '#9ca3af',
              cursor: 'pointer',
              zIndex: 10,
            }}
            title="Show Annotation Tools"
          >
            <PanelRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

// Outline Tree Component for PDF table of contents
const OutlineTree = ({ items, onNavigate, currentPage, level = 0 }) => {
  const [expandedItems, setExpandedItems] = useState({});
  
  const toggleExpand = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  return (
    <div style={{ paddingLeft: level > 0 ? 12 : 0 }}>
      {items.map((item, index) => (
        <div key={index}>
          <div 
            style={{
              ...outlineStyles.item,
              backgroundColor: currentPage === item.page ? 'rgba(0,123,255,0.1)' : 'transparent',
            }}
          >
            {item.items && item.items.length > 0 && (
              <button 
                onClick={() => toggleExpand(index)}
                style={outlineStyles.expandBtn}
              >
                {expandedItems[index] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            <div 
              style={outlineStyles.itemContent}
              onClick={() => onNavigate(item.page)}
            >
              <span style={outlineStyles.itemTitle}>{item.title}</span>
              <span style={outlineStyles.itemPage}>{item.page}</span>
            </div>
          </div>
          {item.items && item.items.length > 0 && expandedItems[index] && (
            <OutlineTree 
              items={item.items} 
              onNavigate={onNavigate} 
              currentPage={currentPage}
              level={level + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const outlineStyles = {
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  expandBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '2px',
    marginRight: '4px',
    display: 'flex',
  },
  itemContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  itemTitle: {
    fontSize: '12px',
    color: '#e6e6e6',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    marginRight: '8px',
  },
  itemPage: {
    fontSize: '11px',
    color: '#6b7280',
    flexShrink: 0,
  },
};

// Styles
const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b0e11',
    height: '100%',
    overflow: 'hidden',
  },
  
  // Toolbar
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: '#161b22',
    borderBottom: '1px solid #2d333b',
    flexShrink: 0,
    gap: '16px',
  },
  toolbarSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 0,
  },
  docName: {
    display: 'flex',
    alignItems: 'center',
    color: '#e6e6e6',
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'all 0.2s',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pageInput: {
    width: '55px',
    padding: '6px 8px',
    backgroundColor: '#1c2128',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#fff',
    textAlign: 'center',
    fontSize: '13px',
  },
  pageTotal: {
    color: '#6b7280',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  zoomSelect: {
    padding: '6px 8px',
    backgroundColor: '#1c2128',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#e6e6e6',
    fontSize: '13px',
    cursor: 'pointer',
  },
  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: '#2d333b',
    margin: '0 4px',
  },
  
  // Search Bar
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: '#1c2128',
    borderBottom: '1px solid #2d333b',
  },
  searchInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    maxWidth: '400px',
    padding: '6px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
  },
  clearSearch: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
  },
  searchNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  searchCount: {
    color: '#9ca3af',
    fontSize: '12px',
    marginRight: '8px',
  },
  searchNavBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
  },
  searchButton: {
    padding: '6px 16px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  
  // Main Content
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  
  // Sidebar
  sidebar: {
    width: '180px',
    backgroundColor: '#161b22',
    borderRight: '1px solid #2d333b',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #2d333b',
    color: '#e6e6e6',
    fontSize: '13px',
    fontWeight: 600,
  },
  pageCountBadge: {
    backgroundColor: '#2d333b',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    color: '#9ca3af',
  },
  pageList: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pageThumb: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#1c2128',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'all 0.15s',
  },
  pageThumbActive: {
    borderColor: '#007BFF',
    backgroundColor: 'rgba(0,123,255,0.1)',
  },
  thumbImage: {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0e11',
    borderRadius: '4px',
  },
  pageNumber: {
    marginTop: '6px',
    color: '#9ca3af',
    fontSize: '12px',
  },
  
  // Document
  documentContainer: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#3d4450',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
  },
  canvasWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  canvas: {
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    backgroundColor: '#fff',
  },
  
  // Continuous scroll mode
  continuousWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    paddingBottom: '40px',
  },
  continuousPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  },
  pageImage: {
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    backgroundColor: '#fff',
    maxWidth: '100%',
  },
  pageLabel: {
    marginTop: '8px',
    color: '#9ca3af',
    fontSize: '12px',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '4px 12px',
    borderRadius: '12px',
  },
  pageLoading: {
    width: '600px',
    height: '800px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    color: '#6b7280',
    gap: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  },
  spinnerSmall: {
    width: '24px',
    height: '24px',
    border: '2px solid #e5e7eb',
    borderTop: '2px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  
  // Loading & Error
  loading: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    gap: '16px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '3px solid #2d333b',
    borderTop: '3px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    textAlign: 'center',
    padding: '40px',
  },
  errorButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1c2128',
    border: '1px solid #2d333b',
    color: '#e6e6e6',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  
  // Regex toggle button
  regexToggle: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 10px',
    fontSize: '12px',
    color: '#9ca3af',
    border: '1px solid #2d333b',
    borderRadius: '4px',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  
  // Sidebar Tabs
  sidebarTabs: {
    display: 'flex',
    borderBottom: '1px solid #2d333b',
    padding: '8px',
    gap: '4px',
  },
  sidebarTab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 4px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative',
  },
  sidebarTabActive: {
    backgroundColor: 'rgba(0,123,255,0.15)',
    color: '#007BFF',
  },
  tabBadge: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    backgroundColor: '#007BFF',
    color: '#fff',
    fontSize: '9px',
    padding: '1px 4px',
    borderRadius: '8px',
    minWidth: '14px',
    textAlign: 'center',
  },
  
  // Outline container
  outlineContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  
  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#6b7280',
    textAlign: 'center',
    fontSize: '13px',
  },
  
  // Bookmarks
  bookmarkList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 8px 8px 8px',
    marginTop: '16px',
    color: '#9ca3af',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #2d333b',
  },
  extractBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    fontSize: '11px',
    backgroundColor: '#007BFF',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  extractReqsBtn: {
    marginLeft: '12px',
    padding: '6px 12px',
    fontSize: '11px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  categoryTitle: {
    padding: '8px',
    fontSize: '13px',
    color: '#e6e6e6',
    fontWeight: 600,
    backgroundColor: '#1c2128',
    borderRadius: '6px',
    marginTop: '8px',
    marginBottom: '4px',
  },
  scopeSummary: {
    padding: '8px 12px',
    marginBottom: '8px',
    fontSize: '12px',
    color: '#9ca3af',
    backgroundColor: 'rgba(0, 123, 255, 0.1)',
    borderRadius: '6px',
    textAlign: 'center',
    fontWeight: 500,
  },
  specSectionItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    marginBottom: '2px',
    backgroundColor: 'rgba(28, 33, 40, 0.5)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    gap: '8px',
  },
  scopeCheckbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#007BFF',
    flexShrink: 0,
  },
  specSectionTitle: {
    fontSize: '12px',
    color: '#d1d5db',
    flex: 1,
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  specSectionPage: {
    fontSize: '11px',
    color: '#6b7280',
    marginLeft: '8px',
  },
  outOfScopeSection: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid #2d333b',
  },
  outOfScopeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: 600,
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  outOfScopeContent: {
    marginTop: '4px',
  },
  outOfScopeItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    marginBottom: '2px',
    backgroundColor: 'rgba(28, 33, 40, 0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    gap: '8px',
  },
  bookmarkItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#1c2128',
    borderRadius: '6px',
    marginBottom: '6px',
    gap: '8px',
  },
  bookmarkContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    minWidth: 0,
  },
  bookmarkText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  bookmarkTitle: {
    fontSize: '13px',
    color: '#e6e6e6',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bookmarkMeta: {
    fontSize: '11px',
    color: '#6b7280',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    transition: 'color 0.15s',
  },
  
  // Notes
  notesList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  noteItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '10px',
    backgroundColor: '#1c2128',
    borderRadius: '6px',
    marginBottom: '6px',
    borderLeft: '3px solid #f59e0b',
  },
  noteContent: {
    flex: 1,
    cursor: 'pointer',
    minWidth: 0,
  },
  noteHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '6px',
  },
  notePage: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: 500,
  },
  noteText: {
    fontSize: '12px',
    color: '#e6e6e6',
    margin: 0,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  noteMeta: {
    fontSize: '10px',
    color: '#6b7280',
    marginTop: '6px',
    display: 'block',
  },
  
  // Note Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  noteModal: {
    width: '400px',
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    border: '1px solid #2d333b',
    overflow: 'hidden',
  },
  noteModalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px',
    borderBottom: '1px solid #2d333b',
    color: '#e6e6e6',
    fontSize: '15px',
    fontWeight: 600,
  },
  noteTextarea: {
    width: '100%',
    height: '120px',
    padding: '16px',
    backgroundColor: '#0b0e11',
    border: 'none',
    color: '#e6e6e6',
    fontSize: '14px',
    resize: 'none',
    outline: 'none',
  },
  noteModalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #2d333b',
  },
  noteCancelBtn: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#9ca3af',
    fontSize: '13px',
    cursor: 'pointer',
  },
  noteSaveBtn: {
    padding: '8px 16px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  
  // Page thumbnail footer
  pageThumbFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '6px',
  },
  
  // Annotation Tools Sidebar (right side)
  annotationSidebar: {
    width: '52px',
    backgroundColor: '#15191e',
    borderLeft: '1px solid #2d333b',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width 0.15s ease',
    overflowY: 'auto',
  },
  annotationSidebarCollapsed: {
    width: '0px',
    borderLeft: 'none',
    overflow: 'hidden',
  },
  annotationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 8px',
    borderBottom: '1px solid #2d333b',
  },
  annotationToggle: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  annotationSection: {
    padding: '8px',
    borderBottom: '1px solid #2d333b',
  },
  annotationSectionLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#4b5563', // Darker, more subtle
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
    textAlign: 'center',
    opacity: 0.7,
  },
  annotationToolsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'center',
  },
  annotationToolBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative',
    opacity: 0.6,
    outline: 'none',
    boxShadow: 'none',
  },
  annotationToolBtnActive: {
    backgroundColor: 'rgba(0,123,255,0.2)',
    border: '1px solid #007BFF',
    color: '#007BFF',
    opacity: 1,
  },
  colorSwatchContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'center',
  },
  colorSwatch: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'all 0.15s',
  },
  colorSwatchActive: {
    borderColor: '#fff',
    transform: 'scale(1.1)',
  },
  strokeWidthControl: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
  },
  strokeWidthSlider: {
    width: '32px',
    writingMode: 'vertical-lr',
    direction: 'rtl',
    accentColor: '#007BFF',
  },
  strokeWidthLabel: {
    fontSize: '10px',
    color: '#6b7280',
  },
};

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default SpecViewer;
