import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { SYSTEM_PACKAGES } from '../../data/systemPackages';
import useBidStore from '../../store/useBidStore';

// Use the same local worker that PDFViewer.jsx uses
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

//  Constants 
const ZOOM_MIN   = 0.1;
const ZOOM_MAX   = 32.0;

// Shared Bluebeam utilities (colors, system matching, BOM builder)
import { ANNOT_SYS_COLORS, matchSysId, buildBluebeamBom } from '../../utils/bluebeamParser';
// OpenCV.js auto-count engine
import { loadOpenCV, runTemplateMatch } from '../../utils/useAutoCount';

function normaliseBox({ startX, startY, curX, curY }) {
  return {
    x: Math.min(startX, curX),
    y: Math.min(startY, curY),
    w: Math.abs(curX - startX),
    h: Math.abs(curY - startY),
  };
}

// -- Auto-Count Dual-Engine Popup ----------------------------------------------
// Anchored in canvas-px space (inside the paper container div) so it follows
// the PDF when panning/zooming.  Inner content counter-scaled to always render
// at a constant 212 screen-px wide.
function AutoCountPopup({
  lastBox, neutralScale, paperWidth,
  engine, onEngine,
  scope, onScope,
  tagText, progress, running,
  onSearch, onClear,
}) {
  const POPUP_W = 212; // constant screen px
  const outerW  = POPUP_W * neutralScale;
  const gap     = 10  * neutralScale;
  const flipLeft = lastBox.x + lastBox.w + outerW + gap > paperWidth;
  const left = flipLeft ? lastBox.x - outerW - gap : lastBox.x + lastBox.w + gap;
  const top  = lastBox.y;

  const pvCol = progress.startsWith('?') ? '#f87171'
    : /No match|No text/.test(progress) ? '#f59e0b'
    : '#34d399';

  const s = (px) => px; // canvas-px passthrough � content counter-scaled
  return (
    <div
      style={{ position: 'absolute', left, top, width: outerW, pointerEvents: 'all', zIndex: 30 }}
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        transform: `scale(${1 / neutralScale})`, transformOrigin: '0 0',
        width: POPUP_W,
        background: 'rgba(13,17,23,0.97)',
        border: '1px solid rgba(96,165,250,0.35)',
        borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
        fontFamily: "'Inter','Segoe UI',sans-serif", userSelect: 'none',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2.2} strokeLinecap="round">
              <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e6edf3' }}>Auto-Count</span>
          </div>
          <button onClick={onClear}
            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, transition: 'color 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; }}>�</button>
        </div>

        {/* Engine pills */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Engine</div>
          <div style={{ display: 'flex', background: '#1c2128', border: '1px solid #2d333b', borderRadius: 7, padding: 2, gap: 2 }}>
            {[
              { key: 'shape', label: '? Shape' },
              { key: 'tag',   label: '?? Tag'   },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => onEngine(key)} style={{
                flex: 1, padding: '5px 6px', borderRadius: 5,
                background: engine === key ? 'rgba(167,139,250,0.25)' : 'transparent',
                border: engine === key ? '1px solid rgba(167,139,250,0.55)' : '1px solid transparent',
                color: engine === key ? '#c4b5fd' : '#52525b',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: '#52525b', marginTop: 4, paddingLeft: 2, lineHeight: 1.45 }}>
            {engine === 'shape'
              ? <>Finds identical pixel patterns (OpenCV)<br/>Works on scanned &amp; vector plans</>
              : <>Scrapes text tag from your selection,<br/>then hunts every callout on the plans</>
            }
          </div>
          {engine === 'tag' && tagText && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700,
              background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)',
              borderRadius: 4, padding: '3px 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{tagText}"
            </div>
          )}
        </div>

        {/* Scope pills */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Scope</div>
          <div style={{ display: 'flex', background: '#1c2128', border: '1px solid #2d333b', borderRadius: 7, padding: 2, gap: 2 }}>
            {[
              { key: 'page', label: 'This Page', disabled: false },
              { key: 'doc',  label: 'All Pages', disabled: engine === 'shape' },
            ].map(({ key, label, disabled }) => (
              <button key={key} onClick={() => !disabled && onScope(key)}
                title={disabled ? 'Shape engine: current page only' : undefined}
                style={{
                  flex: 1, padding: '5px 6px', borderRadius: 5,
                  background: scope === key && !disabled ? 'rgba(52,211,153,0.2)' : 'transparent',
                  border: scope === key && !disabled ? '1px solid rgba(52,211,153,0.55)' : '1px solid transparent',
                  color: disabled ? '#2d333b' : scope === key ? '#34d399' : '#52525b',
                  fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.12s',
                }}>{label}</button>
            ))}
          </div>
          {engine === 'shape' && (
            <div style={{ fontSize: 9, color: '#374151', marginTop: 3, paddingLeft: 2 }}>
              Shape matching across 50+ pages is too slow for the browser � use Tag for doc-wide hunts
            </div>
          )}
        </div>

        {/* Progress/result banner */}
        {progress && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: pvCol,
            background: `${pvCol}15`, border: `1px solid ${pvCol}35`,
            borderRadius: 5, padding: '5px 8px', lineHeight: 1.45,
          }}>{progress}</div>
        )}

        {/* Search CTA */}
        <button onClick={onSearch} disabled={running}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 7, border: 'none',
            background: running
              ? 'rgba(124,58,237,0.12)'
              : 'linear-gradient(135deg,rgba(109,40,217,0.85) 0%,rgba(139,92,246,1) 100%)',
            color: running ? '#6b21a8' : '#fff',
            fontSize: 12, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.12s',
            boxShadow: running ? 'none' : '0 2px 8px rgba(139,92,246,0.35)',
          }}
          onMouseEnter={e => { if (!running) e.currentTarget.style.filter = 'brightness(1.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
        >
          {running ? (
            <>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Scanning�
            </>
          ) : (
            <>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
                {engine === 'tag' ? <path d="M8 9h8M8 12h5"/> : <rect x={8} y={8} width={6} height={6} rx={1}/>}
              </svg>
              {engine === 'shape' ? 'Find Matching Shapes' : 'Find Tags on Plans'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

//  Icon-button helper 
function IBtn({ onClick, disabled, title, children }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: 30, height: 30, border: '1px solid #2d333b', borderRadius: 6,
        background: h && !disabled ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: disabled ? '#4b5563' : '#e6edf3',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background 0.1s',
      }}
    >{children}</button>
  );
}

//  Main component 
export default function BlueprintViewer({
  onBoxDrawn,
  /** When true the frame-builder drawer is open � block new canvas draws so
   *  the estimator's selection and sidebar state are not wiped by an accidental
   *  click.  Clear only via Save, � (close), or Escape. */
  editingActive = false,
  bays          = 1,
  rows          = 1,
  bayWidths   = [],
  rowHeights  = [],
  onGridAdjusted,
  quantity    = 1,
  setQuantity,
  activeSavedFrameId       = null,
  onActiveSavedFrameStamp,
}) {
  //  Store actions 
  const importBluebeamFrames = useBidStore(s => s.importBluebeamFrames);

  //  PDF state 
  const [pdfDoc,          setPdfDoc]          = useState(null);
  const [allPageObjects,  setAllPageObjects]  = useState({}); // { [pgNum]: pdfPageObj }
  const [pageNumber,      setPageNumber]      = useState(1);
  const [numPages,        setNumPages]        = useState(null);
  const [pdfError,        setPdfError]        = useState(null);

  //  Scale calibration (px at renderedScale=1  inches) 
  const [scaleMultiplier, setScaleMultiplier] = useState(0.5);

  //  Zoom / pan 
  // transform.scale = current visual zoom; renderedScale = scale used for last canvas render
  const [transform,     setTransform]     = useState({ scale: 1.0, x: 0, y: 0 });
  const [renderedScale, setRenderedScale] = useState(1.0);
  const [rotation,      setRotation]      = useState(0);
  const [isPanning,     setIsPanning]     = useState(false);

  //  Draw / measure overlay 
  const [drag,        setDrag]        = useState(null);   // live drag in PDF canvas-px (at renderedScale)
  const [lastBox,     setLastBox]     = useState(null);
  const [gridPreview, setGridPreview] = useState(null);   // { bayWidths, rowHeights } while dragging a grid line

  //  Stamp tool 
  const [drawMode,    setDrawMode]    = useState('draw'); // 'draw' | 'stamp'
  const [ghostPos,    setGhostPos]    = useState(null);   // canvas-px {x,y} of cursor in stamp mode
  const [stampBoxes,  setStampBoxes]  = useState([]);     // array of {x,y,w,h} permanent stamps
  // Pin markers for Build & Stamp (saved-frame counting): keyed by page number
  const [pinMarkers,  setPinMarkers]  = useState({});     // { [pageNum]: [{x, y, frameId}] }

  //  Bluebeam annotation extraction 
  const [annotsPdf,      setAnnotsPdf]      = useState([]);    // { id, sysId, label, pdfRect, widthIn, heightIn }
  const [bbImportFlash,  setBbImportFlash]  = useState(false); // success badge after import

  //  Auto-Count (OpenCV template matching) 
  const [acRunning,        setAcRunning]        = useState(false);
  const [acMatches,        setAcMatches]        = useState([]);   // { x, y, w, h, score } in canvas-px
  const [acEngine,         setAcEngine]         = useState('shape'); // 'shape' | 'tag'
  const [acScope,          setAcScope]          = useState('page');  // 'page' | 'doc'
  const [acTagText,        setAcTagText]        = useState('');  // scraped label from drawn box
  const [acAllPageCount,   setAcAllPageCount]   = useState(0);   // total across all pages (tag/doc scope)
  const [acProgress,       setAcProgress]       = useState('');  // status string while running

  // Auto-enter stamp mode when a saved frame is activated
  useEffect(() => {
    if (activeSavedFrameId) {
      setDrawMode('stamp');
      setGhostPos(null);
    } else {
      setDrawMode('draw');
    }
  }, [activeSavedFrameId]);

  // Pre-warm OpenCV when a PDF loads so the first Auto-Count click is instant
  useEffect(() => {
    if (pdfDoc) loadOpenCV().catch(() => {}); // fire-and-forget, errors are non-fatal
  }, [pdfDoc]);

  // Clear auto-count overlays on page change
  useEffect(() => {
    setAcMatches([]);
    setAcProgress('');
    setAcTagText('');
    setAcAllPageCount(0);
  }, [pageNumber]);

  //  Bluebeam annotation extraction (non-blocking, runs after page loads) 
  useEffect(() => {
    if (!pdfPage) { setAnnotsPdf([]); return; }
    let cancelled = false;

    pdfPage.getAnnotations().then(rawAnnots => {
      if (cancelled) return;
      const parsed = [];
      for (const a of rawAnnots) {
        // Only process rectangle and polygon markups
        if (a.subtype !== 'Square' && a.subtype !== 'Polygon') continue;
        // Match annotation text fields against known system keywords
        const needle = [a.subject, a.title, a.contents].filter(Boolean).join(' ');
        const sysId  = matchSysId(needle);
        if (!sysId) continue;

        // PDF rect = [x1, y1, x2, y2] in PDF user-space (bottom-left origin)
        const dx       = Math.abs(a.rect[2] - a.rect[0]);
        const dy       = Math.abs(a.rect[3] - a.rect[1]);
        const widthIn  = +(dx * scaleMultiplier).toFixed(1);
        const heightIn = +(dy * scaleMultiplier).toFixed(1);
        if (widthIn < 4 || heightIn < 4) continue; // ignore stray tiny marks

        parsed.push({
          id:       a.id ?? `bb_${Math.random().toString(36).slice(2, 8)}`,
          sysId,
          label:    SYSTEM_PACKAGES[sysId].name,
          pdfRect:  a.rect,   // raw � converted to viewport coords at render time
          widthIn,
          heightIn,
        });
      }
      setAnnotsPdf(parsed);
    }).catch(() => setAnnotsPdf([])); // silently absorb PDFs with no annotation layer

    return () => { cancelled = true; };
  // Re-run when page changes or calibration scale changes (affects inch conversion)
  }, [pdfPage, scaleMultiplier]);

  //  Refs 
  const containerRef    = useRef(null);
  const renderTaskRef   = useRef(null); // kept for compatibility
  const zoomTimerRef    = useRef(null);
  const spaceHeld       = useRef(false);
  const urlRef          = useRef(null);
  const gridDragRef     = useRef(null); // { type: 'v'|'h', idx, origBayWidths, origRowHeights }
  const pageCanvasRefs  = useRef([]);   // canvas element per page
  const pageWrapperRefs = useRef([]);   // wrapper div per page (for IntersectionObserver)
  const renderTasksRef  = useRef({});   // in-flight render tasks keyed by page number
  const allPageObjsRef  = useRef({});   // stable ref for renderPageToCanvas
  const renderedScaleRef = useRef(1);   // stable ref for renderPageToCanvas
  const rotationRef      = useRef(0);   // stable ref for renderPageToCanvas

  //  File upload 
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;

    setPdfError(null); setLastBox(null); setDrag(null); setPinMarkers({});
    setPageNumber(1); setNumPages(null); setAllPageObjects({});
    pageCanvasRefs.current = [];
    pageWrapperRefs.current = [];
    renderTasksRef.current = {};

    try {
      const doc = await pdfjs.getDocument(url).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
    } catch (err) {
      setPdfError(err.message);
    }
  };

  //  Load ALL pages when pdfDoc changes 
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const n = pdfDoc.numPages;

    (async () => {
      try {
        // Load every page in parallel
        const pageNums = Array.from({ length: n }, (_, i) => i + 1);
        const pages = await Promise.all(pageNums.map(p => pdfDoc.getPage(p)));
        if (cancelled) return;

        // Compute rotation from first page
        const first  = pages[0];
        const native = first.getViewport({ scale: 1.0 });
        let rot = native.rotation;
        if (native.height > native.width) rot = (rot + 90) % 360;
        setRotation(rot);

        // Build the page object map
        const map = {};
        pages.forEach((pg, i) => { map[i + 1] = pg; });
        setAllPageObjects(map);

        // Auto-fit scale based on first page width
        if (containerRef.current) {
          const corrected = first.getViewport({ scale: 1.0, rotation: rot });
          const cw = containerRef.current.clientWidth;
          const fitScale = Math.max(ZOOM_MIN, (cw - 48) / corrected.width);
          setTransform(prev => ({ ...prev, scale: fitScale }));
          setRenderedScale(fitScale);
        }
      } catch (err) {
        if (!cancelled) setPdfError(err.message);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc]);

  //  Render a single page to its canvas (stable � reads values via refs)  
  const renderPageToCanvas = useCallback(async (pgNum) => {
    const pageObj = allPageObjsRef.current[pgNum];
    const cv      = pageCanvasRefs.current[pgNum - 1];
    if (!pageObj || !cv) return;

    // Cancel any in-flight task for this page
    if (renderTasksRef.current[pgNum]) {
      try { renderTasksRef.current[pgNum].cancel(); } catch (_) {}
    }

    const scale    = renderedScaleRef.current;
    const rot      = rotationRef.current;
    const viewport = pageObj.getViewport({ scale, rotation: rot });
    const dpr      = window.devicePixelRatio || 1;
    const capR     = Math.max(viewport.width, viewport.height) > 8192
      ? 8192 / Math.max(viewport.width, viewport.height) : 1;
    const finalVP  = pageObj.getViewport({ scale: scale * capR * dpr, rotation: rot });

    const buf  = document.createElement('canvas');
    buf.width  = finalVP.width;
    buf.height = finalVP.height;
    const bctx = buf.getContext('2d');
    bctx.imageSmoothingEnabled = false;

    try {
      const task = pageObj.render({ canvasContext: bctx, viewport: finalVP });
      renderTasksRef.current[pgNum] = task;
      await task.promise;
      renderTasksRef.current[pgNum] = null;

      // Re-check canvas still exists (component may have unmounted)
      const target = pageCanvasRefs.current[pgNum - 1];
      if (!target) return;
      target.width  = finalVP.width;
      target.height = finalVP.height;
      target.getContext('2d').drawImage(buf, 0, 0);
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error('[BlueprintViewer] render error p' + pgNum, err);
    }
  }, []); // stable � all values via refs

  // Render all pages when they first load
  useEffect(() => {
    const pgNums = Object.keys(allPageObjects).map(Number);
    pgNums.forEach(n => renderPageToCanvas(n));
  }, [allPageObjects, renderPageToCanvas]);

  // Re-render all pages after zoom settles (renderedScale updated)
  useEffect(() => {
    const pgNums = Object.keys(allPageObjsRef.current).map(Number);
    pgNums.forEach(n => renderPageToCanvas(n));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedScale]);

  //  Non-passive wheel (Ctrl+scroll = zoom, all else = native scroll) 
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * -0.002);
        const ns = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, transform.scale * factor));
        setTransform(prev => ({ ...prev, scale: ns }));
        if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = setTimeout(() => setRenderedScale(ns), 300);
      }
      // Non-ctrl: let browser handle scrolling naturally
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [transform.scale]);

  //  Spacebar pan mode 
  useEffect(() => {
    const down = (e) => { if (e.code === 'Space' && !e.target.matches('input,textarea')) { spaceHeld.current = true; e.preventDefault(); } };
    const up   = (e) => { if (e.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  //  Mouse handlers 
  const panStart = useRef(null);

  const handleMouseDown = useCallback((e) => {
    // Guard: if a grid-line drag is already active, let it own the pointer exclusively
    if (gridDragRef.current) return;

    const isPanMode = e.button === 1 || (e.button === 0 && spaceHeld.current);
    if (isPanMode) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        mx: e.clientX, my: e.clientY,
        scrollTop:  containerRef.current?.scrollTop  ?? 0,
        scrollLeft: containerRef.current?.scrollLeft ?? 0,
      };
      return;
    }
    if (e.button !== 0) return;

    // Find which page canvas the cursor landed on
    const cssScale = transform.scale / renderedScale;
    let targetIdx = -1;
    for (let i = 0; i < pageCanvasRefs.current.length; i++) {
      const cv = pageCanvasRefs.current[i];
      if (!cv) continue;
      const r = cv.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        targetIdx = i; break;
      }
    }
    if (targetIdx === -1 || !allPageObjects[targetIdx + 1]) return;
    e.preventDefault();
    const activePg = targetIdx + 1;
    if (activePg !== pageNumber) setPageNumber(activePg);
    const activeCv = pageCanvasRefs.current[targetIdx];
    const cvRect   = activeCv.getBoundingClientRect();
    const localX   = (e.clientX - cvRect.left) / cssScale;
    const localY   = (e.clientY - cvRect.top)  / cssScale;

    if (!allPageObjects[activePg]) return;

    // While the frame-builder drawer is open, ignore accidental canvas clicks.
    if (editingActive) return;

    // -- Stamp mode: place a clone OR a saved-frame pin --------------------
    if (drawMode === 'stamp' && (lastBox || activeSavedFrameId)) {
      const cx = localX;
      const cy = localY;

      if (activeSavedFrameId) {
        // Build & Stamp: drop a pin marker, increment Zustand quantity.
        // Also store scale-1 normalised coords for clean AI training logs.
        const nx = +(cx / renderedScale).toFixed(3);
        const ny = +(cy / renderedScale).toFixed(3);
        setPinMarkers(prev => ({
          ...prev,
          [pageNumber]: [
            ...(prev[pageNumber] ?? []),
            { x: cx, y: cy, nx, ny, page: pageNumber, frameId: activeSavedFrameId },
          ],
        }));
        if (typeof onActiveSavedFrameStamp === 'function') onActiveSavedFrameStamp(activeSavedFrameId);
      } else if (lastBox) {
        // Regular stamp: center box clone at cursor
        const sx = cx - lastBox.w / 2;
        const sy = cy - lastBox.h / 2;
        setStampBoxes(prev => [...prev, { x: sx, y: sy, w: lastBox.w, h: lastBox.h }]);
        if (typeof setQuantity === 'function') setQuantity(q => q + 1);
      }
      return;
    }

    // -- Draw mode: start rubber-band box ----------------------------------
    const rx = localX;
    const ry = localY;
    setDrag({ startX: rx, startY: ry, curX: rx, curY: ry });
    setLastBox(null);
    setStampBoxes([]); // clear stamps when drawing a new box
    setPinMarkers({}); // also clear pin markers on fresh draw
  }, [transform.scale, renderedScale, allPageObjects, pageNumber, drawMode, lastBox, setQuantity,
      activeSavedFrameId, onActiveSavedFrameStamp, editingActive]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning && panStart.current) {
      if (containerRef.current) {
        containerRef.current.scrollTop  = panStart.current.scrollTop  - (e.clientY - panStart.current.my);
        containerRef.current.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.mx);
      }
      return;
    }

    // Get per-page canvas coords for the active page
    const cssScale = transform.scale / renderedScale;
    const activeCv = pageCanvasRefs.current[pageNumber - 1];
    const getCvCoords = () => {
      if (!activeCv) return { cx: 0, cy: 0 };
      const r = activeCv.getBoundingClientRect();
      return { cx: (e.clientX - r.left) / cssScale, cy: (e.clientY - r.top) / cssScale };
    };

    // -- Ghost cursor in stamp mode -----------------------------------------
    if (drawMode === 'stamp' && (lastBox || activeSavedFrameId)) {
      const { cx, cy } = getCvCoords();
      setGhostPos({ x: cx, y: cy });
      return;
    }
    if (drawMode === 'stamp') return;

    // -- Grid-line drag --------------------------------------------------
    if (gridDragRef.current && lastBox) {
      const gd = gridDragRef.current;
      const { cx, cy } = getCvCoords();
      const MIN_SEG = 6; // inches minimum bay/row width

      if (gd.type === 'v') {
        const dx     = cx - gd.startCX;
        const dInch  = (dx / renderedScale) * scaleMultiplier;
        const newBW  = [...gd.origBayWidths];
        const maxL   = newBW[gd.idx]     - MIN_SEG;
        const maxR   = newBW[gd.idx + 1] - MIN_SEG;
        const shift  = Math.max(-maxL, Math.min(maxR, dInch));
        newBW[gd.idx]     = +(gd.origBayWidths[gd.idx]     + shift).toFixed(2);
        newBW[gd.idx + 1] = +(gd.origBayWidths[gd.idx + 1] - shift).toFixed(2);
        setGridPreview({ bayWidths: newBW, rowHeights: gd.origRowHeights });
      } else {
        const dy     = cy - gd.startCY;
        const dInch  = (dy / renderedScale) * scaleMultiplier;
        const newRH  = [...gd.origRowHeights];
        const maxT   = newRH[gd.idx]     - MIN_SEG;
        const maxB   = newRH[gd.idx + 1] - MIN_SEG;
        const shift  = Math.max(-maxT, Math.min(maxB, dInch));
        newRH[gd.idx]     = +(gd.origRowHeights[gd.idx]     + shift).toFixed(2);
        newRH[gd.idx + 1] = +(gd.origRowHeights[gd.idx + 1] - shift).toFixed(2);
        setGridPreview({ bayWidths: gd.origBayWidths, rowHeights: newRH });
      }
      return;
    }

    if (!drag) return;
    const { cx: rx, cy: ry } = getCvCoords();
    setDrag(d => ({ ...d, curX: rx, curY: ry }));
  }, [isPanning, drag, transform.scale, renderedScale, pageNumber, lastBox, scaleMultiplier, drawMode]);

  const handleMouseUp = useCallback((e) => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
      return;
    }

    // -- Finalise grid-line drag ---------------------------------------------
    if (gridDragRef.current) {
      if (gridPreview && typeof onGridAdjusted === 'function') {
        onGridAdjusted({ newBayWidths: gridPreview.bayWidths, newRowHeights: gridPreview.rowHeights });
      }
      gridDragRef.current = null;
      setGridPreview(null);
      return;
    }

    if (!drag) return;
    const box = normaliseBox(drag);
    setDrag(null);
    if (box.w < 4 || box.h < 4) return;
    setLastBox(box);
    setAcMatches([]);     // clear previous auto-count results when a new box is drawn
    setAcProgress('');
    setAcTagText('');
    setAcAllPageCount(0);

    // box.w / box.h are in PDF canvas-px at renderedScale
    // divide by renderedScale to get px at scale=1, then  scaleMultiplier  inches
    const wIn = +((box.w / renderedScale) * scaleMultiplier).toFixed(1);
    const hIn = +((box.h / renderedScale) * scaleMultiplier).toFixed(1);
    if (typeof onBoxDrawn === 'function') onBoxDrawn(wIn, hIn);
  }, [isPanning, drag, renderedScale, scaleMultiplier, onBoxDrawn, gridPreview, onGridAdjusted]);

  // Clear ghost + cancel any active operation when pointer leaves the viewport
  const handleMouseLeaveViewport = useCallback(() => {
    setGhostPos(null);
    setIsPanning(false);
    panStart.current = null;
    if (drag) setDrag(null);
    if (gridDragRef.current) gridDragRef.current = null;
  }, [drag]);

  //  Derived 
  const liveBox = drag ? normaliseBox(drag) : null;
  const inStampMode = drawMode === 'stamp' && (lastBox || activeSavedFrameId);
  const cursor  = isPanning ? 'grabbing'
    : spaceHeld.current ? 'grab'
    : inStampMode ? (activeSavedFrameId ? 'cell' : 'crosshair')
    : (pdfPage ? 'crosshair' : 'default');

  // -- Tag (OCR) Count handler -------------------------------------------
  // 1. Extract text items inside lastBox from the current page
  // 2. Search matching text positions on every requested page
  const handleTagCount = useCallback(async () => {
    if (!lastBox || !pdfPage || !pdfDoc || acRunning) return;
    setAcRunning(true);
    setAcMatches([]);
    setAcAllPageCount(0);
    setAcProgress('Scraping tag from selection�');
    try {
      // -- Step 1: scrape text from inside the drawn box (current page) --
      const textContent = await pdfPage.getTextContent();
      const vp          = pdfPage.getViewport({ scale: renderedScale, rotation });
      let scraped = '';
      const BOX_PAD = 4; // px tolerance
      for (const item of textContent.items) {
        if (!item.transform) continue;
        const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
        if (
          vx >= lastBox.x - BOX_PAD && vx <= lastBox.x + lastBox.w + BOX_PAD &&
          vy >= lastBox.y - BOX_PAD && vy <= lastBox.y + lastBox.h + BOX_PAD
        ) {
          scraped += item.str;
        }
      }
      scraped = scraped.trim();
      setAcTagText(scraped);

      if (!scraped) {
        setAcProgress('?? No text found in selection � try Shape engine');
        return;
      }

      // -- Step 2: search pages for matching text items --
      const pagesToSearch = acScope === 'doc'
        ? Array.from({ length: numPages }, (_, i) => i + 1)
        : [pageNumber];

      let currentPageMatches = [];
      let totalCount = 0;

      for (let pi = 0; pi < pagesToSearch.length; pi++) {
        const pgNum = pagesToSearch[pi];
        setAcProgress(`Searching page ${pgNum} / ${pagesToSearch.length}�`);
        const pg = pgNum === pageNumber ? pdfPage : await pdfDoc.getPage(pgNum);
        const tc = await pg.getTextContent();
        const pgVp = pg.getViewport({ scale: renderedScale, rotation });

        for (const item of tc.items) {
          if (typeof item.str !== 'string') continue;
          if (!item.str.includes(scraped) && !scraped.includes(item.str.trim())) continue;

          const [ivx, ivy] = pgVp.convertToViewportPoint(
            item.transform[4],
            item.transform[5],
          );
          // Exclude the original drawn selection on the current page
          const isOrigin =
            pgNum === pageNumber &&
            Math.abs(ivx - (lastBox.x + lastBox.w / 2)) < lastBox.w &&
            Math.abs(ivy - (lastBox.y + lastBox.h / 2)) < lastBox.h;
          if (isOrigin) continue;

          totalCount++;
          if (pgNum === pageNumber) {
            currentPageMatches.push({
              x:     ivx - lastBox.w / 2,
              y:     ivy - lastBox.h / 2,
              w:     lastBox.w,
              h:     lastBox.h,
              score: 1.0,
              page:  pgNum,
              tag:   item.str,
            });
          }
        }
      }

      setAcMatches(currentPageMatches);
      setAcAllPageCount(totalCount);
      if (typeof setQuantity === 'function') {
        // 1 (original selection) + all matches across scope
        setQuantity(1 + totalCount);
      }
      setAcProgress(
        totalCount === 0
          ? `No matches found for �${scraped}�`
          : acScope === 'doc'
            ? `${totalCount} match${totalCount !== 1 ? 'es' : ''} across ${pagesToSearch.length} pages`
            : `${currentPageMatches.length} match${currentPageMatches.length !== 1 ? 'es' : ''} on this page`,
      );
    } catch (err) {
      console.error('Tag count failed:', err);
      setAcProgress(`? Error: ${err.message}`);
    } finally {
      setAcRunning(false);
    }
  }, [lastBox, pdfPage, pdfDoc, acScope, acRunning, renderedScale, rotation, pageNumber, numPages, setQuantity]);

  // -- Auto-Count handler ---------------------------------------------------
  const handleAutoCount = useCallback(async () => {
    const activeCv = pageCanvasRefs.current[pageNumber - 1];
    if (!lastBox || !activeCv || !pdfPage || acRunning) return;
    // Compute paper dimensions here (avoids temporal dead zone with the `paper` const below)
    const paper = pdfPage.getViewport({ scale: renderedScale, rotation });
    setAcRunning(true);
    setAcMatches([]); // clear stale results

    try {
      // pxRatio: physical canvas pixels � CSS canvas-px (renderedScale space)
      // activeCv.width == paper.width * dpr (or * dpr*cap for very large pages)
      const pxRatio = activeCv.width / paper.width;
      setAcProgress('? Scanning for matching shapes�');
      const matches = await runTemplateMatch(activeCv, lastBox, pxRatio, 0.88, 0.40);

      // Filter out the original drawn box itself (score � 1.0 at the same position)
      const external = matches.filter(
        m => Math.abs(m.x - lastBox.x) > 4 || Math.abs(m.y - lastBox.y) > 4,
      );

      setAcMatches(external);

      // Update quantity counter: 1 (original drawn box) + n auto-detected
      if (typeof setQuantity === 'function') {
        setQuantity(1 + external.length);
      }

      // Log scale-invariant (nx/ny) training coords for every auto-detected match.
      // These feed the master training data pool alongside manual stamps.
      external.forEach((m, i) => {
        const nx = +(m.x / renderedScale).toFixed(3);
        const ny = +(m.y / renderedScale).toFixed(3);
        const nw = +(m.w / renderedScale).toFixed(3);
        const nh = +(m.h / renderedScale).toFixed(3);
        console.log(
          `?? AutoCount [${i + 1}/${external.length}]`,
          { nx, ny, nw, nh, page: pageNumber, score: m.score },
        );
      });

      if (external.length === 0) {
        console.log('AutoCount: no additional matches found above threshold');
        setAcProgress('No matches found � redraw tighter around one shape');
      } else {
        setAcProgress(`? Found ${external.length + 1} matching shapes`);
      }
    } catch (err) {
      console.error('AutoCount failed:', err);
      setAcProgress(`? Error: ${err.message}`);
    } finally {
      setAcRunning(false);
    }
  }, [lastBox, pdfPage, rotation, acRunning, renderedScale, scaleMultiplier, pageNumber, setQuantity]);

  // -- Bluebeam import handler ----------------------------------------------
  const handleImportAnnotations = useCallback(() => {
    if (!annotsPdf.length || !pdfPage) return;
    const frames = annotsPdf.map(ann => {
      const pkg     = SYSTEM_PACKAGES[ann.sysId];
      const frameId = `bb_${ann.id}_${Date.now()}`;
      const tag     = `BB-${pkg.name.replace(/\s+/g, '-').substring(0, 10)}`;
      return {
        frameId,
        elevationTag: tag,
        systemType:   pkg.name,
        source:       'bluebeam',
        quantity:     1,
        inputs: {
          width:            ann.widthIn,
          height:           ann.heightIn,
          bays:             1,
          rows:             1,
          glassBite:        pkg.geometry.glassBite,
          mullionSightline: pkg.geometry.verticalSightline,
          headSightline:    2,
          sillSightline:    2,
          systemName:       pkg.name,
        },
        bom: buildBluebeamBom(ann.widthIn, ann.heightIn, pkg),
      };
    });
    importBluebeamFrames(frames);
    setBbImportFlash(true);
    setTimeout(() => setBbImportFlash(false), 2500);
  }, [annotsPdf, pdfPage, importBluebeamFrames]);

  // Keep live-value refs in sync so renderPageToCanvas always has fresh values
  useEffect(() => { allPageObjsRef.current   = allPageObjects; }, [allPageObjects]);
  useEffect(() => { renderedScaleRef.current = renderedScale;  }, [renderedScale]);
  useEffect(() => { rotationRef.current      = rotation;       }, [rotation]);

  // Derive current active page object + canvas ref alias for drawing tools
  const pdfPage   = allPageObjects[pageNumber] ?? null;
  const canvasRef = { current: pageCanvasRefs.current[pageNumber - 1] ?? null };

  // Paper dimensions at current visual scale (for SVG overlay sizing)
  const paper = pdfPage
    ? pdfPage.getViewport({ scale: renderedScale, rotation })
    : null;

  //  Styles 
  const S = {
    root: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', background: '#0b0e11', fontFamily: 'Inter,"Segoe UI",sans-serif' },
    bar:  { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: '#0d1117', borderBottom: '1px solid #2d333b', flexShrink: 0, flexWrap: 'wrap' },
    sep:  { width: 1, height: 20, background: '#2d333b', flexShrink: 0 },
    hint: { fontSize: '0.63rem', color: '#9ea7b3', marginLeft: 'auto', whiteSpace: 'nowrap', userSelect: 'none' },
  };

  return (
    <div style={S.root}>

      {/*  Toolbar  */}
      <div style={S.bar}>

        {/* Upload */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: '#2563eb', borderRadius: 7, cursor: 'pointer', color: '#fff', fontSize: '0.75rem', fontWeight: 700, userSelect: 'none', whiteSpace: 'nowrap', border: 'none' }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          {pdfDoc ? 'Change PDF' : 'Upload Plan PDF'}
          <input type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
        </label>

        {/* Page nav */}
        {numPages && (
          <>
            <div style={S.sep} />
            <IBtn onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} title="Previous page">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6"/></svg>
            </IBtn>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap', minWidth: 72, textAlign: 'center' }}>
              Page {pageNumber} of {numPages}
            </span>
            <IBtn onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages} title="Next page">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="9 18 15 12 9 6"/></svg>
            </IBtn>
          </>
        )}

        <div style={S.sep} />

        {/* Draw / Stamp toggle */}
        <div style={{ display: 'flex', background: '#0b0e11', border: '1px solid #2d333b', borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
          {[['draw','Draw',
              <svg key="d" width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><rect x={3} y={3} width={18} height={18} rx={2}/></svg>],
            ['stamp','Stamp',
              <svg key="s" width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><circle cx={12} cy={10} r={5}/><path d="M12 15v5M8 20h8"/></svg>]
          ].map(([mode, label, icon]) => {
            const active   = drawMode === mode;
            const disabled = mode === 'stamp' && !lastBox && !activeSavedFrameId;
            const isFrameStamp = mode === 'stamp' && activeSavedFrameId;
            const activeColor  = isFrameStamp ? '#fbbf24' : '#60a5fa';
            return (
              <button
                key={mode}
                onClick={() => {
                  if (disabled) return;
                  setDrawMode(mode);
                  if (mode === 'draw') setGhostPos(null);
                }}
                title={mode === 'stamp'
                  ? (activeSavedFrameId ? 'Build & Stamp mode � click to count this frame on plan'
                    : lastBox ? 'Stamp mode � click to clone this frame'
                    : 'Draw a box first to enable Stamp mode')
                  : 'Draw mode � drag to measure'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', border: 'none',
                  background: active ? `${activeColor}22` : 'transparent',
                  color: disabled ? '#374151' : active ? activeColor : '#9ea7b3',
                  fontSize: '0.68rem', fontWeight: active ? 700 : 500,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.12s',
                  borderRight: mode === 'draw' ? '1px solid #2d333b' : 'none',
                }}
              >
                {icon} {label}
                {mode === 'stamp' && lastBox && !activeSavedFrameId && (
                  <span style={{ marginLeft: 2, fontSize: '0.62rem', fontWeight: 700,
                    color: '#fbbf24', background: 'rgba(251,191,36,0.15)',
                    borderRadius: 8, padding: '0 5px' }}>
                    �{quantity}
                  </span>
                )}
                {mode === 'stamp' && activeSavedFrameId && (
                  <span style={{ marginLeft: 2, fontSize: '0.62rem', fontWeight: 700,
                    color: '#fbbf24', background: 'rgba(251,191,36,0.15)',
                    borderRadius: 8, padding: '0 5px' }}>
                    B&amp;S
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={S.sep} />

        {/* Zoom buttons */}
        <IBtn onClick={() => {
          const ns = Math.min(ZOOM_MAX, transform.scale * 1.25);
          setTransform(prev => ({ ...prev, scale: ns }));
          if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
          zoomTimerRef.current = setTimeout(() => setRenderedScale(ns), 300);
        }} title="Zoom in">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/><line x1={11} y1={8} x2={11} y2={14}/><line x1={8} y1={11} x2={14} y2={11}/></svg>
        </IBtn>

        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e6edf3', minWidth: 40, textAlign: 'center', userSelect: 'none' }}>
          {Math.round(transform.scale * 100)}%
        </span>

        <IBtn onClick={() => {
          const ns = Math.max(ZOOM_MIN, transform.scale / 1.25);
          setTransform(prev => ({ ...prev, scale: ns }));
          if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
          zoomTimerRef.current = setTimeout(() => setRenderedScale(ns), 300);
        }} title="Zoom out">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/><line x1={8} y1={11} x2={14} y2={11}/></svg>
        </IBtn>

        {/* Fit-to-window */}
        <IBtn onClick={() => {
          if (!pdfPage || !containerRef.current) return;
          const vp = pdfPage.getViewport({ scale: 1.0, rotation });
          const cw = containerRef.current.clientWidth;
          const ns = Math.max(ZOOM_MIN, (cw - 48) / vp.width);
          setTransform(prev => ({ ...prev, scale: ns }));
          if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
          zoomTimerRef.current = setTimeout(() => setRenderedScale(ns), 300);
        }} title="Fit to window">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </IBtn>

        <div style={S.sep} />

        {/* Scale calibration */}
        <label
          style={{ fontSize: '0.67rem', color: '#9ea7b3', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'help' }}
          title={`Pixels-to-inches multiplier at renderedScale=1. Tip: draw a line over a known dimension (e.g. a 10'-0" column bay), then adjust this number until the measurement badge reads correctly. Default 0.5 � 1/4" scale at 96 dpi.`}
        >Scale px?in:</label>
        <input
          type="number" value={scaleMultiplier} min={0.001} max={100} step={0.01}
          onChange={e => setScaleMultiplier(parseFloat(e.target.value) || 0.5)}
          style={{ width: 64, padding: '3px 7px', background: '#0b0e11', border: '1px solid #2d333b', borderRadius: 5, color: '#e6edf3', fontSize: '0.76rem', fontWeight: 600, outline: 'none' }}
        />

        {/* -- Bluebeam Import button � only visible when survey annotations detected -- */}
        {annotsPdf.length > 0 && (
          <>
            <div style={S.sep} />
            {bbImportFlash ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)',
                borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap' }}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                {annotsPdf.length} frames imported!
              </div>
            ) : (
              <button
                onClick={handleImportAnnotations}
                title={`Import ${annotsPdf.length} recognised Bluebeam markup${annotsPdf.length !== 1 ? 's' : ''} into the Bid`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                  background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)',
                  borderRadius: 7, color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(96,165,250,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(96,165,250,0.15)'; }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Import {annotsPdf.length} Bluebeam markup{annotsPdf.length !== 1 ? 's' : ''}
              </button>
            )}
          </>
        )}

        {/* -- Auto-Count results badge � shows after a count run -- */}
        {lastBox && !drag && (acMatches.length > 0 || acAllPageCount > 0) && (
          <>
            <div style={S.sep} />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px',
              background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
              borderRadius: 20, fontSize: '0.69rem', fontWeight: 700,
              color: '#c4b5fd', whiteSpace: 'nowrap',
            }}>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
              </svg>
              {acScope === 'doc' && acAllPageCount > 0
                ? `${acAllPageCount + 1} total � ${numPages} pages`
                : `${acMatches.length + 1} found`}
            </div>
          </>
        )}

        {/* Last measurement badge */}
        {lastBox && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 20, fontSize: '0.69rem', fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap' }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
            {((lastBox.w / renderedScale) * scaleMultiplier).toFixed(1)}  {((lastBox.h / renderedScale) * scaleMultiplier).toFixed(1)}
          </div>
        )}

        {!lastBox && <span style={S.hint}>Drag to measure  Ctrl+Scroll zoom  Space/ to pan</span>}        {lastBox && drawMode === 'draw' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.63rem', color: '#9ea7b3' }}>Qty:</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa',
              background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)',
              borderRadius: 10, padding: '1px 9px' }}>{quantity}</span>
          </div>
        )}      </div>

      {/*  Viewport � scrollable multi-page column  */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', position: 'relative', cursor, minHeight: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeaveViewport}
      >
        {/* Empty state */}
        {!pdfDoc && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#001a35',
            backgroundImage: ['linear-gradient(rgba(0,80,180,0.18) 1px,transparent 1px)','linear-gradient(90deg,rgba(0,80,180,0.18) 1px,transparent 1px)'].join(','),
            backgroundSize: '40px 40px',
            color: 'rgba(148,163,184,0.55)', gap: 12, zIndex: 5,
          }}>
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.9} style={{ opacity: 0.4 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1={8} y1={13} x2={16} y2={13}/><line x1={8} y1={17} x2={16} y2={17}/>
            </svg>
            <p style={{ margin: 0, fontSize: '0.78rem', maxWidth: 220, textAlign: 'center', lineHeight: 1.6 }}>
              Upload a plan PDF to begin.<br/>Drag any area on the drawing to measure and open the Frame Builder.
            </p>
          </div>
        )}

        {/* Error banner */}
        {pdfError && (
          <div style={{ position: 'sticky', top: 8, zIndex: 20, background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 16px', color: '#f87171', fontSize: '0.78rem', width: 'fit-content', margin: '0 auto' }}>
            {pdfError}
          </div>
        )}

        {/* -- All pages stacked vertically -- */}
        {pdfDoc && numPages && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '20px 20px 40px', minWidth: 'max-content' }}>
            {Array.from({ length: numPages }, (_, i) => {
              const pgNum   = i + 1;
              const pagePdf = allPageObjects[pgNum];
              const pageVP  = pagePdf ? pagePdf.getViewport({ scale: renderedScale, rotation }) : null;
              const cssScale = transform.scale / renderedScale;
              const displayW = pageVP ? Math.round(pageVP.width  * cssScale) : 800;
              const displayH = pageVP ? Math.round(pageVP.height * cssScale) : 600;
              const isActive = pageNumber === pgNum;

              return (
                <div
                  key={pgNum}
                  ref={el => { pageWrapperRefs.current[i] = el; }}
                  data-pagenum={pgNum}
                  style={{
                    position: 'relative',
                    width:  displayW,
                    height: pagePdf ? displayH : 600,
                    background: '#fff',
                    border: isActive ? '2px solid rgba(96,165,250,0.55)' : '1px solid #999',
                    boxShadow: isActive ? '0 6px 28px rgba(0,0,0,0.6)' : '0 3px 12px rgba(0,0,0,0.4)',
                    flexShrink: 0,
                  }}
                >
                  {/* Page number label */}
                  {numPages > 1 && (
                    <div style={{ position: 'absolute', bottom: -20, left: 0, fontSize: '0.63rem', color: '#4b5563', userSelect: 'none' }}>
                      Page {pgNum}
                    </div>
                  )}

                  {/* Canvas */}
                  <canvas
                    ref={el => { pageCanvasRefs.current[i] = el; }}
                    style={{ display: 'block', width: displayW, height: pagePdf ? displayH : 600 }}
                  />

                  {/* -- Active page: full overlay in canvas-px space, CSS-scaled to display -- */}
                  {isActive && pageVP && (() => {
                    const activeBW = (gridPreview?.bayWidths  ?? bayWidths).filter(Boolean);
                    const activeRH = (gridPreview?.rowHeights ?? rowHeights).filter(Boolean);
                    const totalW   = activeBW.reduce((a, b) => a + b, 0) || 1;
                    const totalH   = activeRH.reduce((a, b) => a + b, 0) || 1;
                    const vLines = [];
                    let cumW = 0;
                    for (let li = 0; li < activeBW.length - 1; li++) {
                      cumW += activeBW[li];
                      vLines.push({ idx: li, canvasX: lastBox ? lastBox.x + (cumW / totalW) * lastBox.w : 0 });
                    }
                    const hLines = [];
                    let cumH = 0;
                    for (let li = 0; li < activeRH.length - 1; li++) {
                      cumH += activeRH[li];
                      hLines.push({ idx: li, canvasY: lastBox ? lastBox.y + (cumH / totalH) * lastBox.h : 0 });
                    }
                    const HIT = 8;
                    const lineColor = 'rgba(96,165,250,0.85)';

                    const startGridDrag = (type, idx, e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const cv  = pageCanvasRefs.current[pgNum - 1];
                      const cvR = cv?.getBoundingClientRect();
                      if (!cvR) return;
                      const cx = (e.clientX - cvR.left) / cssScale;
                      const cy = (e.clientY - cvR.top)  / cssScale;
                      gridDragRef.current = {
                        type, idx,
                        startCX:        cx,
                        startCY:        cy,
                        origBayWidths:  [...(gridPreview?.bayWidths  ?? bayWidths)],
                        origRowHeights: [...(gridPreview?.rowHeights ?? rowHeights)],
                      };
                    };

                    return (
                      <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: pageVP.width, height: pageVP.height,
                        transform: `scale(${cssScale})`,
                        transformOrigin: '0 0',
                        pointerEvents: 'none',
                      }}>

                        {/* Smart Visual Grid */}
                        {lastBox && !drag && (
                          <>
                            {vLines.map(({ idx, canvasX }) => (
                              <div key={`v-${idx}`} onMouseDown={e => startGridDrag('v', idx, e)}
                                style={{ position: 'absolute', left: canvasX - HIT, top: lastBox.y, width: HIT * 2, height: lastBox.h, cursor: 'ew-resize', zIndex: 12, display: 'flex', alignItems: 'stretch', justifyContent: 'center', pointerEvents: 'all' }}
                              >
                                <div style={{ width: 1.5, background: lineColor, boxShadow: `0 0 4px ${lineColor}`, pointerEvents: 'none' }} />
                              </div>
                            ))}
                            {hLines.map(({ idx, canvasY }) => (
                              <div key={`h-${idx}`} onMouseDown={e => startGridDrag('h', idx, e)}
                                style={{ position: 'absolute', left: lastBox.x, top: canvasY - HIT, width: lastBox.w, height: HIT * 2, cursor: 'ns-resize', zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', pointerEvents: 'all' }}
                              >
                                <div style={{ height: 1.5, background: lineColor, boxShadow: `0 0 4px ${lineColor}`, pointerEvents: 'none' }} />
                              </div>
                            ))}
                          </>
                        )}

                        {/* SVG measurement / stamp / annotation overlays */}
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                          {/* Live draw box */}
                          {liveBox && liveBox.w > 2 && (
                            <>
                              <rect x={liveBox.x} y={liveBox.y} width={liveBox.w} height={liveBox.h}
                                fill="rgba(52,211,153,0.1)" stroke="rgba(52,211,153,0.9)" strokeWidth={2 / cssScale} />
                              <foreignObject x={liveBox.x} y={Math.max(liveBox.y - 26 / cssScale, 2)} width={120 / cssScale} height={24 / cssScale} style={{ overflow: 'visible' }}>
                                <div style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(52,211,153,0.5)', borderRadius: 4, padding: '1px 7px', fontSize: `${11 / cssScale}px`, fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif' }}>
                                  {((liveBox.w / renderedScale) * scaleMultiplier).toFixed(1)}&quot; � {((liveBox.h / renderedScale) * scaleMultiplier).toFixed(1)}&quot;
                                </div>
                              </foreignObject>
                            </>
                          )}
                          {/* Accepted box */}
                          {lastBox && !drag && (
                            <rect x={lastBox.x} y={lastBox.y} width={lastBox.w} height={lastBox.h}
                              fill="rgba(52,211,153,0.04)" stroke="rgba(52,211,153,0.45)" strokeWidth={2 / cssScale} />
                          )}
                          {/* Stamp clones */}
                          {stampBoxes.map((sb, si) => (
                            <g key={si}>
                              <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h}
                                fill="rgba(52,211,153,0.07)" stroke="rgba(52,211,153,0.75)" strokeWidth={1.5 / cssScale} />
                              <foreignObject x={sb.x + sb.w - 28 / cssScale} y={sb.y + sb.h - 18 / cssScale} width={24 / cssScale} height={14 / cssScale}>
                                <div style={{ background: 'rgba(52,211,153,0.85)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${9 / cssScale}px`, fontWeight: 700, color: '#0b0e11', lineHeight: 1, fontFamily: 'Inter,sans-serif' }}>{si + 2}</div>
                              </foreignObject>
                            </g>
                          ))}
                          {/* Ghost stamp (box clone) */}
                          {drawMode === 'stamp' && ghostPos && lastBox && !activeSavedFrameId && (
                            <rect x={ghostPos.x - lastBox.w / 2} y={ghostPos.y - lastBox.h / 2} width={lastBox.w} height={lastBox.h}
                              fill="rgba(251,191,36,0.06)" stroke="rgba(251,191,36,0.7)" strokeWidth={2 / cssScale}
                              strokeDasharray={`${6 / cssScale},${4 / cssScale}`} style={{ pointerEvents: 'none' }} />
                          )}
                          {/* Ghost pin crosshair (Build & Stamp) */}
                          {drawMode === 'stamp' && ghostPos && activeSavedFrameId && (() => {
                            const r = 9 / cssScale; const lw = 1.5 / cssScale;
                            return (
                              <g style={{ pointerEvents: 'none' }}>
                                <circle cx={ghostPos.x} cy={ghostPos.y} r={r} fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.9)" strokeWidth={lw} />
                                <line x1={ghostPos.x} y1={ghostPos.y - r*1.6} x2={ghostPos.x} y2={ghostPos.y + r*1.6} stroke="rgba(251,191,36,0.9)" strokeWidth={lw} />
                                <line x1={ghostPos.x - r*1.6} y1={ghostPos.y} x2={ghostPos.x + r*1.6} y2={ghostPos.y} stroke="rgba(251,191,36,0.9)" strokeWidth={lw} />
                              </g>
                            );
                          })()}
                          {/* Bluebeam annotation overlays */}
                          {annotsPdf.length > 0 && pdfPage && (() => {
                            const vp = pdfPage.getViewport({ scale: renderedScale, rotation });
                            return annotsPdf.map(ann => {
                              const col = ANNOT_SYS_COLORS[ann.sysId] ?? { stroke: '#9ea7b3', fill: 'rgba(158,167,179,0.08)' };
                              const [px1, py1] = vp.convertToViewportPoint(ann.pdfRect[0], ann.pdfRect[1]);
                              const [px2, py2] = vp.convertToViewportPoint(ann.pdfRect[2], ann.pdfRect[3]);
                              const rx = Math.min(px1, px2); const ry = Math.min(py1, py2);
                              const rw = Math.abs(px2 - px1); const rh = Math.abs(py2 - py1);
                              const lw = 2 / cssScale; const fs = Math.max(7, Math.min(14, 11 / cssScale));
                              return (
                                <g key={ann.id} style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); if (typeof onAnnotationClick === 'function') onAnnotationClick(ann.widthIn, ann.heightIn, ann.sysId); }}>
                                  <rect x={rx} y={ry} width={rw} height={rh} fill={col.fill} stroke={col.stroke} strokeWidth={lw} strokeDasharray={`${6/lw} ${3/lw}`} rx={2 / cssScale} style={{ pointerEvents: 'all' }} />
                                  <rect x={rx} y={ry - fs*1.6} width={rw} height={fs*1.6} fill={col.stroke} opacity={0.85} rx={2 / cssScale} style={{ pointerEvents: 'none' }} />
                                  <text x={rx + rw/2} y={ry - fs*0.35} textAnchor="middle" fontSize={fs} fontWeight="700" fill="#0b0e11" fontFamily="Inter,sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>{ann.label} � {ann.widthIn}"�{ann.heightIn}"</text>
                                </g>
                              );
                            });
                          })()}
                          {/* Auto-Count match boxes */}
                          {acMatches.map((m, mi) => {
                            const lw = 1.8 / cssScale; const fs = Math.max(7, Math.min(13, 10 / cssScale));
                            const bW = 36 / cssScale; const bH = 14 / cssScale;
                            return (
                              <g key={`ac-${mi}`}>
                                <rect x={m.x} y={m.y} width={m.w} height={m.h} fill="rgba(167,139,250,0.10)" stroke="rgba(167,139,250,0.90)" strokeWidth={lw} strokeDasharray={`${5/lw} ${3/lw}`} />
                                <foreignObject x={m.x + m.w - bW} y={m.y} width={bW} height={bH}>
                                  <div style={{ background: 'rgba(167,139,250,0.85)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, fontWeight: 700, color: '#1c0e2e', lineHeight: 1, fontFamily: 'Inter,sans-serif', height: '100%' }}>{Math.round(m.score * 100)}%</div>
                                </foreignObject>
                                <circle cx={m.x + m.w/2} cy={m.y + m.h/2} r={7 / cssScale} fill="rgba(167,139,250,0.20)" stroke="rgba(167,139,250,0.70)" strokeWidth={lw} />
                                <text x={m.x + m.w/2} y={m.y + m.h/2 + fs*0.38} textAnchor="middle" fontSize={fs} fontWeight="800" fill="#c4b5fd" fontFamily="Inter,sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>{mi + 2}</text>
                              </g>
                            );
                          })}
                          {/* Pin markers for this page */}
                          {(pinMarkers[pgNum] ?? []).map((pin, pi) => {
                            const r = 7 / cssScale; const fs = 8 / cssScale; const lw = 1.5 / cssScale;
                            return (
                              <g key={pi} style={{ pointerEvents: 'none' }}>
                                <circle cx={pin.x + lw} cy={pin.y + lw} r={r} fill="rgba(0,0,0,0.35)" />
                                <circle cx={pin.x} cy={pin.y} r={r} fill="rgba(251,191,36,0.9)" stroke="#92400e" strokeWidth={lw} />
                                <text x={pin.x} y={pin.y + fs*0.36} textAnchor="middle" fontSize={fs} fontWeight="800" fill="#1c1002" fontFamily="Inter,sans-serif">{pi + 1}</text>
                              </g>
                            );
                          })}
                        </svg>

                        {/* Auto-Count popup */}
                        {lastBox && !drag && (() => {
                          const neutralScale = renderedScale / transform.scale;
                          return (
                            <AutoCountPopup
                              lastBox={lastBox}
                              neutralScale={neutralScale}
                              paperWidth={paper?.width ?? pageVP.width}
                              engine={acEngine}   onEngine={v => { setAcEngine(v); if (v === 'shape') setAcScope('page'); }}
                              scope={acScope}     onScope={setAcScope}
                              tagText={acTagText}
                              progress={acProgress}
                              running={acRunning}
                              onSearch={() => { if (acEngine === 'tag') { handleTagCount(); } else { handleAutoCount(); } }}
                              onClear={() => { setAcMatches([]); setAcTagText(''); setAcProgress(''); setAcAllPageCount(0); }}
                            />
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Pin markers on non-active pages */}
                  {!isActive && pageVP && (pinMarkers[pgNum] ?? []).length > 0 && (
                    <svg viewBox={`0 0 ${pageVP.width} ${pageVP.height}`}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    >
                      {(pinMarkers[pgNum] ?? []).map((pin, pi) => {
                        const cssS = transform.scale / renderedScale;
                        const r = 7 / cssS; const fs = 8 / cssS; const lw = 1.5 / cssS;
                        return (
                          <g key={pi}>
                            <circle cx={pin.x + lw} cy={pin.y + lw} r={r} fill="rgba(0,0,0,0.35)" />
                            <circle cx={pin.x} cy={pin.y} r={r} fill="rgba(251,191,36,0.9)" stroke="#92400e" strokeWidth={lw} />
                            <text x={pin.x} y={pin.y + fs*0.36} textAnchor="middle" fontSize={fs} fontWeight="800" fill="#1c1002" fontFamily="Inter,sans-serif">{pi + 1}</text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
