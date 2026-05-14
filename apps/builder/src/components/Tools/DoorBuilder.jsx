/**
 * GlazeBid — Door Builder
 * Drop-in React component. Self-contained — no external CSS dependencies.
 * All state managed locally with useState. SVG preview uses inline rendering.
 *
 * Usage:
 *   import DoorBuilder from './tools/DoorBuilder';
 *   <Route path="/tools/door-builder" element={<DoorBuilder />} />
 */

import { useState } from 'react';

// ─── Theme tokens (matches GlazeBid dark theme) ──────────────────────────────
const T = {
  bg:          '#111214',
  bgCard:      '#1a1c1f',
  bgElevated:  '#22252a',
  bgHover:     '#2a2d33',
  border:      '#2e3138',
  borderLight: '#3a3f4a',
  text:        '#e8eaed',
  textSub:     '#9aa0ab',
  textTert:    '#5c6370',
  blue:        '#3b82f6',
  blueBg:      'rgba(59,130,246,0.12)',
  blueBorder:  'rgba(59,130,246,0.35)',
  green:       '#22c55e',
  greenBg:     'rgba(34,197,94,0.12)',
  greenBorder: 'rgba(34,197,94,0.35)',
  amber:       '#f59e0b',
  amberBg:     'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.35)',
  red:         '#ef4444',
  redBg:       'rgba(239,68,68,0.12)',
  redBorder:   'rgba(239,68,68,0.35)',
};

const s = {
  // Layout
  app: { display:'grid', gridTemplateColumns:'1fr 420px', height:'100vh', background:T.bg, fontFamily:'"Inter", system-ui, sans-serif', color:T.text, overflow:'hidden' },
  toolbar: { gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:T.bgCard },
  canvas: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.bgElevated, padding:'8px 12px', gap:8, overflow:'hidden', height:'100%' },
  sidebar: { borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflowY:'auto', background:T.bgCard },
  sec: { padding:'12px 14px', borderBottom:`1px solid ${T.border}` },
  // Typography
  sLbl: { fontSize:10, fontWeight:600, color:T.textTert, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 },
  subLbl: { fontSize:10, color:T.textTert, marginBottom:5 },
  fKey: { fontSize:12, color:T.textSub, whiteSpace:'nowrap', minWidth:90 },
  hint: { fontSize:10, color:T.textTert },
  // Rows
  fieldRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7, gap:8 },
  fieldRowTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:7, gap:8 },
  // Controls
  input: { fontSize:12, padding:'4px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bgElevated, color:T.text, maxWidth:148, outline:'none' },
  inputFull: { fontSize:12, padding:'5px 8px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bgElevated, color:T.text, width:'100%', maxWidth:'100%', outline:'none' },
  inputSm: { fontSize:12, padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bgElevated, color:T.text, width:60, textAlign:'center', outline:'none' },
  inputParsed: { borderColor:T.blueBorder },
  inputError: { borderColor:T.redBorder, background:T.redBg },
  select: { fontSize:12, padding:'4px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bgElevated, color:T.text, maxWidth:148, outline:'none' },
  textarea: { fontSize:12, padding:'6px 8px', border:`1px solid ${T.border}`, borderRadius:6, background:T.bgElevated, color:T.text, width:'100%', resize:'none', lineHeight:1.5, maxWidth:'100%', outline:'none' },
  // Toggles
  toggle2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 },
  toggle3: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, marginBottom:8 },
  tOpt: { fontSize:11, padding:'5px 0', textAlign:'center', border:`1px solid ${T.border}`, borderRadius:6, cursor:'pointer', color:T.textSub, background:'transparent' },
  tOptActive: { background:T.blueBg, color:T.blue, borderColor:T.blueBorder, fontWeight:600 },
  tOptWarn: { background:T.amberBg, color:T.amber, borderColor:T.amberBorder, fontWeight:600 },
  tOptDanger: { background:T.redBg, color:T.red, borderColor:T.redBorder, fontWeight:600 },
  // Tabs
  dtab: { fontSize:12, padding:'5px 12px', border:`1px solid ${T.border}`, background:T.bgElevated, color:T.textSub, cursor:'pointer', borderRadius:0 },
  dtabActive: { background:T.bgCard, color:T.text, fontWeight:500 },
  // Buttons
  btnSave: { padding:8, border:`1px solid ${T.blueBorder}`, borderRadius:6, background:T.blueBg, color:T.blue, fontSize:13, fontWeight:500, cursor:'pointer', textAlign:'center', flex:1 },
  btnCopy: { display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:8, border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.textSub, fontSize:13, fontWeight:500, cursor:'pointer', flex:1 },
  btnUpload: { display:'flex', alignItems:'center', gap:6, width:'100%', padding:'6px 10px', border:`1px dashed ${T.border}`, borderRadius:6, background:'transparent', color:T.textSub, fontSize:12, cursor:'pointer', marginBottom:6 },
  btnAI: { display:'flex', alignItems:'center', gap:6, width:'100%', padding:'6px 10px', border:`1px solid ${T.blueBorder}`, borderRadius:6, background:T.blueBg, color:T.blue, fontSize:12, cursor:'pointer', fontWeight:500 },
  // Door type bar
  doorTypeBar: { display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:`1px solid ${T.border}` },
  dtypeBtn: { padding:'10px 0', textAlign:'center', fontSize:12, fontWeight:500, cursor:'pointer', border:'none', background:T.bgElevated, color:T.textTert, borderBottom:'2px solid transparent' },
  dtypeBtnStd: { background:T.bgCard, color:T.blue, borderBottom:`2px solid ${T.blue}` },
  dtypeBtnCust: { background:T.bgCard, color:T.amber, borderBottom:`2px solid ${T.amber}` },
  // Pills
  pill: (color) => ({ fontSize:11, padding:'2px 9px', borderRadius:20, border:`1px solid ${color === 'blue' ? T.blueBorder : color === 'amber' ? T.amberBorder : color === 'green' ? T.greenBorder : color === 'red' ? T.redBorder : T.border}`, background: color === 'blue' ? T.blueBg : color === 'amber' ? T.amberBg : color === 'green' ? T.greenBg : color === 'red' ? T.redBg : T.bgElevated, color: color === 'blue' ? T.blue : color === 'amber' ? T.amber : color === 'green' ? T.green : color === 'red' ? T.red : T.textSub, whiteSpace:'nowrap' }),
  pillWrap: { display:'flex', flexWrap:'wrap', gap:5, justifyContent:'center', maxWidth:260 },
  // Misc
  divider: { border:'none', borderTop:`1px solid ${T.border}`, margin:'8px 0' },
  checkRow: { display:'flex', alignItems:'center', gap:8, marginTop:6 },
  customBadge: { display:'inline-flex', alignItems:'center', gap:5, fontSize:11, padding:'3px 10px', borderRadius:20, background:T.amberBg, color:T.amber, border:`1px solid ${T.amberBorder}`, marginBottom:8 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MR_SIZE_MAP = { narrow: 3.5, medium: 4, wide: 5 };
const FRAME_OPTIONS = {
  '2x4h':  { label: '2" × 4-1/2"',     faceIn: 2.0  },
  '1hx4h': { label: '1-3/4" × 4-1/2"', faceIn: 1.75 },
  '2x6':   { label: '2" × 6"',          faceIn: 2.0  },
  'cw':    { label: '3/4" CW Adaptor',  faceIn: 0.75 },
};
const TOP_RAIL_IN = 3.5;

function parseIn(str) {
  if (!str) return null;
  const s = str.replace(/[“”"]/g, '"').replace(/[\u2018\u2019]/g, "'").trim();
  const ftIn = s.match(/^(\d+(?:\.\d+)?)['\.\s]+(\d+(?:\.\d+)?)'?$/);
  if (ftIn) return parseFloat(ftIn[1]) * 12 + parseFloat(ftIn[2]);
  const ftOnly = s.match(/^(\d+(?:\.\d+)?)'$/);
  if (ftOnly) return parseFloat(ftOnly[1]) * 12;
  const inOnly = s.match(/^(\d+(?:\.\d+)?)'?$/);
  if (inOnly) return parseFloat(inOnly[1]);
  return null;
}
function fmtIn(t) {
  if (!t && t !== 0) return '?';
  const ft = Math.floor(t / 12), inc = Math.round(t % 12);
  return `${ft}'-${inc}"`;
}

// ─── SVG Door Preview ─────────────────────────────────────────────────────────
function DoorSVG({ doWin, doHin, faceIn, transomIn, stileIn, brailIn, midrailIn, mrSizeIn, swing, glassSpec, hasTransom }) {
  const isPair = swing === 'pair';
  const frameWin = doWin + faceIn * 2;
  const frameHin = doHin + transomIn + faceIn;
  const ML = 52, MT = 30, MR = 20, MB = 22;
  const MAX_H = 520;
  const scale = MAX_H / frameHin;
  const facePx = faceIn * scale;
  const doWpx = doWin * scale, doHpx = doHin * scale;
  const transomPx = transomIn * scale;
  const frameWpx = frameWin * scale, frameHpx = frameHin * scale;
  const svgW = ML + frameWpx + MR, svgH = MT + frameHpx + MB;
  const fx = ML, fy = MT, floorY = fy + frameHpx;
  const ix = fx + facePx, iTopY = fy + facePx, iw = doWpx;
  const mrPx = (mrSizeIn || 4) * scale;

  const l1w = isPair && doWin ? doWin / 2 : doWin;
  const l2w = isPair && doWin ? doWin / 2 : doWin;

  function Panel({ x, y, w, h, pSwing }) {
    const stilePx = stileIn * scale, brailPx = brailIn * scale, tRailPx = TOP_RAIL_IN * scale;
    const vw = w - stilePx * 2;
    const vy = y + tRailPx;
    const mrHasRail = midrailIn > 0;
    const mrY = mrHasRail ? y + h - midrailIn * scale - mrPx : null;
    const vh = mrHasRail ? mrY - vy : (y + h - brailPx) - vy;
    const vy2 = mrHasRail ? mrY + mrPx : null;
    const vh2 = mrHasRail ? (y + h - brailPx) - vy2 : null;
    const pbx = pSwing === 'hl' ? x + stilePx + 1 : x + w - stilePx - 3;
    return (
      <>
        <rect x={x} y={y} width={Math.max(w,0.1)} height={Math.max(h,0.1)} fill={T.bgCard} stroke={T.borderLight} strokeWidth={0.5}/>
        <rect x={x} y={y} width={stilePx} height={h} fill={T.bgElevated} stroke={T.border} strokeWidth={0.5}/>
        <rect x={x+w-stilePx} y={y} width={stilePx} height={h} fill={T.bgElevated} stroke={T.border} strokeWidth={0.5}/>
        <rect x={x+stilePx} y={y} width={vw} height={tRailPx} fill={T.bgElevated} stroke={T.border} strokeWidth={0.5}/>
        <rect x={x+stilePx} y={y+h-brailPx} width={vw} height={brailPx} fill={T.bgElevated} stroke={T.border} strokeWidth={0.5}/>
        {mrHasRail && <rect x={x+stilePx} y={mrY} width={vw} height={mrPx} fill={T.bgElevated} stroke={T.border} strokeWidth={0.5}/>}
        <rect x={x+stilePx} y={vy} width={vw} height={Math.max(vh,0)} fill={T.blueBg} stroke={T.blueBorder} strokeWidth={0.5} fillOpacity={0.15}/>
        {vh > 18 && <text x={x+w/2} y={vy+vh/2+4} fontSize={9} fill={T.blue} textAnchor="middle">{glassSpec}</text>}
        {mrHasRail && <>
          <rect x={x+stilePx} y={vy2} width={vw} height={Math.max(vh2,0)} fill={T.blueBg} stroke={T.blueBorder} strokeWidth={0.5} fillOpacity={0.15}/>
          {vh2 > 12 && <text x={x+w/2} y={vy2+vh2/2+4} fontSize={9} fill={T.blue} textAnchor="middle">{glassSpec}</text>}
        </>}
        <rect x={pbx} y={y+h/2-14} width={2.5} height={28} fill="none" stroke={T.borderLight} strokeWidth={1}/>
      </>
    );
  }

  function DimLine({ x1, y1, x2, y2, label, color, offset, axis }) {
    const tk = 4;
    if (axis === 'h') {
      const y = y1 + offset;
      return <>
        <line x1={x1} y1={y1} x2={x1} y2={y+tk} stroke={color} strokeWidth={0.5}/>
        <line x1={x2} y1={y1} x2={x2} y2={y+tk} stroke={color} strokeWidth={0.5}/>
        <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={0.5}/>
        <line x1={x1} y1={y-tk} x2={x1} y2={y+tk} stroke={color} strokeWidth={0.5}/>
        <line x1={x2} y1={y-tk} x2={x2} y2={y+tk} stroke={color} strokeWidth={0.5}/>
        <text x={(x1+x2)/2} y={y-3} fontSize={8} fill={color} textAnchor="middle">{label}</text>
      </>;
    }
    const x = x1 + offset;
    const my = (y1 + y2) / 2;
    return <>
      <line x1={x1} y1={y1} x2={x+tk} y2={y1} stroke={color} strokeWidth={0.5}/>
      <line x1={x1} y1={y2} x2={x+tk} y2={y2} stroke={color} strokeWidth={0.5}/>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={0.5}/>
      <line x1={x-tk} y1={y1} x2={x+tk} y2={y1} stroke={color} strokeWidth={0.5}/>
      <line x1={x-tk} y1={y2} x2={x+tk} y2={y2} stroke={color} strokeWidth={0.5}/>
      <text x={x-4} y={my} fontSize={8} fill={color} textAnchor="middle" transform={`rotate(-90 ${x-4} ${my})`}>{label}</text>
    </>;
  }

  const doorStartY = hasTransom && transomPx > 0 ? iTopY + transomPx : iTopY;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
      {/* Frame */}
      <rect x={fx} y={fy} width={frameWpx} height={facePx} fill={T.bgElevated} stroke={T.text} strokeWidth={1}/>
      <rect x={fx} y={fy} width={facePx} height={frameHpx} fill={T.bgElevated} stroke={T.text} strokeWidth={1}/>
      <rect x={fx+frameWpx-facePx} y={fy} width={facePx} height={frameHpx} fill={T.bgElevated} stroke={T.text} strokeWidth={1}/>
      <path d={`M ${fx} ${floorY} L ${fx} ${fy} L ${fx+frameWpx} ${fy} L ${fx+frameWpx} ${floorY}`} stroke={T.text} strokeWidth={1.5} fill="none"/>
      <path d={`M ${ix} ${floorY} L ${ix} ${iTopY} L ${ix+iw} ${iTopY} L ${ix+iw} ${floorY}`} stroke={T.textSub} strokeWidth={0.5} fill="none"/>
      {/* Floor */}
      <line x1={fx-4} y1={floorY} x2={fx+frameWpx+4} y2={floorY} stroke={T.borderLight} strokeWidth={1.5}/>
      <text x={fx+frameWpx+6} y={floorY+3} fontSize={8} fill={T.textTert} textAnchor="start">F.F.L.</text>
      {/* Dims */}
      {isPair
        ? <>
            <DimLine x1={ix} y1={fy} x2={ix+l1w*scale} y2={fy} label={fmtIn(l1w)} color={T.blue} offset={-10} axis="h"/>
            <DimLine x1={ix+l1w*scale} y1={fy} x2={ix+(l1w+l2w)*scale} y2={fy} label={fmtIn(l2w)} color={T.blue} offset={-10} axis="h"/>
          </>
        : <DimLine x1={ix} y1={fy} x2={ix+iw} y2={fy} label={fmtIn(doWin)} color={T.blue} offset={-10} axis="h"/>
      }
      <DimLine x1={fx} y1={fy} x2={fx+frameWpx} y2={fy} label={fmtIn(doWin + faceIn*2)} color={T.textSub} offset={-22} axis="h"/>
      <text x={ix+iw/2} y={fy-22} fontSize={7} fill={T.blue} textAnchor="middle">D.O.</text>
      <text x={fx+frameWpx/2} y={fy-34} fontSize={7} fill={T.textSub} textAnchor="middle">Frame</text>
      <DimLine x1={fx} y1={iTopY} x2={fx} y2={floorY} label={fmtIn(doHin+transomIn)} color={T.blue} offset={-14} axis="v"/>
      <DimLine x1={fx} y1={fy} x2={fx} y2={floorY} label={fmtIn(frameHin)} color={T.textSub} offset={-28} axis="v"/>
      <text x={fx-18} y={iTopY+(floorY-iTopY)/2} fontSize={7} fill={T.blue} textAnchor="middle" transform={`rotate(-90 ${fx-18} ${iTopY+(floorY-iTopY)/2})`}>D.O.</text>
      <text x={fx-32} y={fy+(floorY-fy)/2} fontSize={7} fill={T.textSub} textAnchor="middle" transform={`rotate(-90 ${fx-32} ${fy+(floorY-fy)/2})`}>Frame</text>
      {/* Transom */}
      {hasTransom && transomPx > 0 && <>
        <rect x={ix} y={iTopY} width={iw} height={transomPx} fill={T.blueBg} stroke={T.blueBorder} strokeWidth={0.5} fillOpacity={0.18}/>
        {transomPx > 12 && <>
          <text x={ix+iw/2} y={iTopY+transomPx/2+3} fontSize={9} fill={T.blue} textAnchor="middle">Transom</text>
          <text x={ix+iw/2} y={iTopY+transomPx/2+13} fontSize={8} fill={T.textSub} textAnchor="middle">{fmtIn(transomIn)}</text>
        </>}
        <rect x={ix} y={iTopY+transomPx-Math.max(facePx,2)/2} width={iw} height={Math.max(facePx,2)} fill={T.bgElevated} stroke={T.textSub} strokeWidth={0.5}/>
      </>}
      {/* Door panels */}
      {isPair
        ? <>
            <Panel x={ix} y={doorStartY} w={l1w*scale} h={doHpx} pSwing="hr"/>
            <Panel x={ix+l1w*scale} y={doorStartY} w={l2w*scale} h={doHpx} pSwing="hl"/>
          </>
        : <Panel x={ix} y={doorStartY} w={iw} h={doHpx} pSwing={swing}/>
      }
    </svg>
  );
}

// ─── Pill component ───────────────────────────────────────────────────────────
function Pill({ color = 'default', children, style }) {
  return <span style={{ ...s.pill(color), ...style }}>{children}</span>;
}

// ─── Toggle button component ──────────────────────────────────────────────────
function TBtn({ active, variant = 'blue', onClick, children, style }) {
  const activeStyle = variant === 'amber' ? s.tOptWarn : variant === 'red' ? s.tOptDanger : s.tOptActive;
  return (
    <button onClick={onClick} style={{ ...s.tOpt, ...(active ? activeStyle : {}), ...style }}>
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DoorBuilder({ onBack }) {
  // Door type
  const [doorType, setDoorType] = useState('standard'); // 'standard' | 'custom'

  // Door tabs
  const [tabs, setTabs]       = useState(['D-101']);
  const [activeTab, setActiveTab] = useState(0);

  // Standard door state (per tab — stored as array)
  const defaultStdDoor = () => ({
    num: 'D-101', qty: 1,
    swing: 'hr',
    // Single size
    doWidth: "3'-0\"", doHeight: "7'-0\"",
    // Pair sizes
    leaf1W: "3'-0\"", leaf1H: "7'-0\"",
    leaf2W: "3'-0\"", leaf2H: "7'-0\"",
    stiles: '4', brail: '10',
    midrail: 'none', mrSize: 'medium', mrHeight: '',
    finish: 'Clear Anodized', paintCode: '',
    glass: '1" Tempered',
    frameType: '2x4h',
    transom: false, frameHeight: "8'-0\"",
    prepType: 'blank', hwGroup: 'HW Set 3A', hwType: 'std',
    notes: '',
  });

  const [stdDoors, setStdDoors] = useState([defaultStdDoor()]);

  const d = stdDoors[activeTab] || defaultStdDoor();
  const setD = (patch) => setStdDoors(prev => {
    const next = [...prev];
    next[activeTab] = { ...next[activeTab], ...patch };
    return next;
  });

  // Custom door state
  const [custDoorType, setCustDoorType] = useState('standard');
  const [custState, setCustState] = useState({
    num: 'D-101', qty: 1,
    width: '', height: '', swing: 'hr', finish: '',
    fireRating: 'none', frVal: '',
    frame: '', cripple: false, crippleH: '',
    glass: '', hwGroup: '', prepType: 'blank',
    notes: '',
  });
  const setC = (patch) => setCustState(prev => ({ ...prev, ...patch }));

  // Save button flash
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPair = d.swing === 'pair';
  const opt = FRAME_OPTIONS[d.frameType] || FRAME_OPTIONS['2x4h'];
  const frameHinInput = parseIn(d.frameHeight) || (parseIn(d.doHeight) || 84) + 12;
  const transomIn = d.transom ? Math.max(frameHinInput - (parseIn(d.doHeight) || 84), 0) : 0;

  // Normalise size input on blur
  const normalise = (field, val) => {
    const p = parseIn(val);
    if (p && p > 0) setD({ [field]: fmtIn(p) });
  };

  function addTab() {
    const newNum = `D-${(tabs.length + 101).toString().padStart(3, '0')}`;
    setTabs([...tabs, newNum]);
    setStdDoors([...stdDoors, { ...defaultStdDoor(), num: newNum }]);
    setActiveTab(tabs.length);
  }

  function copyDoor() {
    const newNum = d.num + ' (copy)';
    setTabs([...tabs, newNum]);
    setStdDoors([...stdDoors, { ...d, num: newNum }]);
    setActiveTab(tabs.length);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function saveDoor() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    // TODO: wire to project state / database
  }

  // Computed preview dimensions
  const previewDoW  = isPair ? ((parseIn(d.leaf1W)||36) + (parseIn(d.leaf2W)||36)) : (parseIn(d.doWidth)||36);
  const previewDoH  = isPair ? Math.max(parseIn(d.leaf1H)||84, parseIn(d.leaf2H)||84) : (parseIn(d.doHeight)||84);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={s.app}>
      {/* ── Toolbar ── */}
      <div style={s.toolbar}>
        <button onClick={onBack} style={{ background:'none', border:`1px solid ${T.border}`, color:T.textSub, padding:'5px 14px', borderRadius:6, cursor:'pointer', fontSize:'0.82rem' }}>← Suite Home</button>
        <span style={{ fontSize:13, fontWeight:500, marginRight:4 }}>Door Builder</span>
        <div style={{ flex:1 }}/>
        {/* Door tabs */}
        <div style={{ display:'flex' }}>
          {tabs.map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              style={{ ...s.dtab, ...(i === 0 ? { borderRadius:'6px 0 0 6px' } : {}), ...(activeTab === i ? s.dtabActive : {}) }}>
              {tab}
            </button>
          ))}
          <button onClick={addTab} style={{ ...s.dtab, borderRadius:'0 6px 6px 0', color:T.textTert, padding:'5px 8px' }}>+</button>
        </div>
        <button onClick={addTab} style={{ ...s.dtab, marginLeft:8, borderRadius:6, color:T.text }}>+ New Door</button>
      </div>

      {/* ── Canvas ── */}
      <div style={s.canvas}>
        <span style={{ fontSize:11, color:T.textTert, textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {doorType === 'standard' ? `${d.num} — Elevation Preview` : `${custState.num} — Custom Door`}
        </span>

        {doorType === 'standard' ? (
          <>
            <DoorSVG
              doWin={previewDoW} doHin={previewDoH}
              faceIn={opt.faceIn} transomIn={transomIn}
              stileIn={parseFloat(d.stiles)||4} brailIn={parseFloat(d.brail)||10}
              midrailIn={d.midrail === 'yes' ? (parseIn(d.mrHeight)||0) : 0}
              mrSizeIn={MR_SIZE_MAP[d.mrSize]||4}
              swing={d.swing} glassSpec={d.glass} hasTransom={d.transom}
            />
            {/* Spec pills */}
            <div style={s.pillWrap}>
              <Pill color="default" style={{ fontWeight:600 }}>
                {isPair ? `D.O. ${fmtIn(parseIn(d.leaf1W)||36)} + ${fmtIn(parseIn(d.leaf2W)||36)} × ${fmtIn(Math.max(parseIn(d.leaf1H)||84, parseIn(d.leaf2H)||84))}` : `D.O. ${fmtIn(parseIn(d.doWidth)||36)} × ${fmtIn(parseIn(d.doHeight)||84)}`}
              </Pill>
              <Pill color="blue">{isPair ? 'Pair' : d.swing === 'hr' ? 'Hinged Right (LH)' : 'Hinged Left (RH)'}</Pill>
              <Pill color="default">{{3.5:'Narrow',4:'Medium',5:'Wide'}[d.stiles]||'Medium'} Stiles</Pill>
              <Pill color="blue">{d.finish === 'Painted' ? (d.paintCode ? `Painted — ${d.paintCode}` : 'Painted') : d.finish}</Pill>
              <Pill color="blue">{d.glass}</Pill>
              <Pill color="amber">{opt.label} Frame</Pill>
              {d.transom && <Pill color="green">Transom — Frame Ht. {d.frameHeight}</Pill>}
              {d.midrail === 'yes' && <Pill color="green">Mid Rail {d.mrSize.charAt(0).toUpperCase()+d.mrSize.slice(1)}{d.mrHeight ? ` @ ${d.mrHeight}` : ''}</Pill>}
              <Pill color={d.prepType === 'blank' ? 'default' : 'amber'}>{d.prepType === 'blank' ? 'Blank Door' : 'Prep for HW'}</Pill>
            </div>
          </>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:20, textAlign:'center' }}>
            <span style={{ fontSize:28 }}>🚪</span>
            <span style={{ fontSize:13, fontWeight:500 }}>Custom Door</span>
            <span style={{ fontSize:11, color:T.textSub, maxWidth:220, lineHeight:1.5 }}>All specs entered manually. No automated preview — refer to submitted documentation and notes.</span>
            <div style={{ ...s.pillWrap, marginTop:8 }}>
              <Pill color="amber">{{standard:'Standard',frp:'FRP Door',thermal:'Thermal Door',other:'Custom'}[custDoorType]}</Pill>
              {custState.width && custState.height && <Pill color="default" style={{fontWeight:600}}>{custState.width} × {custState.height}</Pill>}
              {custState.finish && <Pill color="blue">{custState.finish}</Pill>}
              {custState.glass && <Pill color="blue">{custState.glass}</Pill>}
              {custState.fireRating === 'rated' && custState.frVal && <Pill color="red">{custState.frVal} Rated</Pill>}
              {custState.cripple && <Pill color="green">Cripple{custState.crippleH ? ` ${custState.crippleH}` : ''}</Pill>}
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        {/* Door Type Toggle */}
        <div style={s.doorTypeBar}>
          <button onClick={() => setDoorType('standard')}
            style={{ ...s.dtypeBtn, ...(doorType === 'standard' ? s.dtypeBtnStd : {}), borderRight:`1px solid ${T.border}` }}>
            ⬜ Standard Door
          </button>
          <button onClick={() => setDoorType('custom')}
            style={{ ...s.dtypeBtn, ...(doorType === 'custom' ? s.dtypeBtnCust : {}) }}>
            ⚙ Custom Door
          </button>
        </div>

        {/* ════ STANDARD SIDEBAR ════ */}
        {doorType === 'standard' && <>

          {/* Door ID */}
          <div style={s.sec}>
            <div style={s.sLbl}>Door Identification</div>
            <div style={s.fieldRow}><span style={s.fKey}>Door #</span><input style={s.input} value={d.num} onChange={e => setD({ num: e.target.value })}/></div>
            <div style={s.fieldRow}><span style={s.fKey}>Quantity</span><input type="number" style={{ ...s.input, maxWidth:60 }} value={d.qty} onChange={e => setD({ qty: e.target.value })}/></div>
          </div>

          {/* Configuration */}
          <div style={s.sec}>
            <div style={s.sLbl}>Configuration</div>

            {/* 1. Swing — first */}
            <div style={s.fieldRow}>
              <span style={s.fKey}>Swing</span>
              <select style={s.select} value={d.swing} onChange={e => setD({ swing: e.target.value })}>
                <option value="hr">Hinged Right (LH)</option>
                <option value="hl">Hinged Left (RH)</option>
                <option value="pair">Pair</option>
              </select>
            </div>

            {/* 2. Size — single */}
            {!isPair && (
              <div style={{ ...s.fieldRowTop, alignItems:'flex-start' }}>
                <span style={{ ...s.fKey, paddingTop:5 }}>Size (D.O.)</span>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input style={s.inputSm} value={d.doWidth} onChange={e => setD({ doWidth: e.target.value })} onBlur={e => normalise('doWidth', e.target.value)} placeholder="36"/>
                    <span style={{ fontSize:12, color:T.textSub }}>×</span>
                    <input style={s.inputSm} value={d.doHeight} onChange={e => setD({ doHeight: e.target.value })} onBlur={e => normalise('doHeight', e.target.value)} placeholder="84"/>
                  </div>
                  <span style={s.hint}>inches (36) or feet-inches (3&apos;-0&quot;)</span>
                </div>
              </div>
            )}

            {/* 2. Size — pair with individual leaf inputs */}
            {isPair && (
              <div style={{ marginBottom:7 }}>
                <div style={{ ...s.subLbl, marginBottom:6 }}>Size (D.O.) — per leaf</div>
                {[['leaf1W','leaf1H','Leaf 1'],['leaf2W','leaf2H','Leaf 2']].map(([wf, hf, lbl]) => (
                  <div key={lbl} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:11, color:T.textSub, minWidth:48 }}>{lbl}</span>
                    <input style={s.inputSm} value={d[wf]} onChange={e => setD({ [wf]: e.target.value })} onBlur={e => normalise(wf, e.target.value)} placeholder="W"/>
                    <span style={{ fontSize:12, color:T.textSub }}>×</span>
                    <input style={s.inputSm} value={d[hf]} onChange={e => setD({ [hf]: e.target.value })} onBlur={e => normalise(hf, e.target.value)} placeholder="H"/>
                  </div>
                ))}
                <div style={{ ...s.hint, paddingLeft:54 }}>accepts inches (36) or feet-inches (3&apos;-0&quot;)</div>
              </div>
            )}

            {/* Stiles */}
            <div style={s.fieldRow}>
              <span style={s.fKey}>Stiles</span>
              <select style={s.select} value={d.stiles} onChange={e => setD({ stiles: e.target.value })}>
                <option value="3.5">Narrow</option>
                <option value="4">Medium</option>
                <option value="5">Wide</option>
              </select>
            </div>
            {/* Bottom Rail */}
            <div style={s.fieldRow}>
              <span style={s.fKey}>Bottom Rail</span>
              <select style={s.select} value={d.brail} onChange={e => setD({ brail: e.target.value })}>
                <option value="6">Narrow</option>
                <option value="10">Medium</option>
                <option value="14">Wide</option>
              </select>
            </div>
            {/* Mid Rail */}
            <div style={{ ...s.fieldRow, marginBottom: d.midrail === 'yes' ? 0 : 7 }}>
              <span style={s.fKey}>Mid Rail</span>
              <select style={s.select} value={d.midrail} onChange={e => setD({ midrail: e.target.value })}>
                <option value="none">None</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {d.midrail === 'yes' && (
              <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${T.border}` }}>
                <div style={s.subLbl}>Size</div>
                <div style={{ ...s.toggle3 }}>
                  {['narrow','medium','wide'].map(sz => (
                    <TBtn key={sz} active={d.mrSize === sz} onClick={() => setD({ mrSize: sz })}>
                      {sz.charAt(0).toUpperCase()+sz.slice(1)}
                    </TBtn>
                  ))}
                </div>
                <div style={s.subLbl}>Height — bottom of door to bottom of mid rail</div>
                <input style={{ ...s.input, maxWidth:110, marginTop:5 }} value={d.mrHeight} onChange={e => setD({ mrHeight: e.target.value })} placeholder="34&quot;"/>
              </div>
            )}
            {/* Finish */}
            <div style={{ ...s.fieldRow, marginTop:7, marginBottom: d.finish === 'Painted' ? 0 : 7 }}>
              <span style={s.fKey}>Finish</span>
              <select style={s.select} value={d.finish} onChange={e => setD({ finish: e.target.value })}>
                <option>Clear Anodized</option>
                <option>Dark Bronze</option>
                <option>Black Anodized</option>
                <option value="Painted">Painted</option>
              </select>
            </div>
            {d.finish === 'Painted' && (
              <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${T.border}` }}>
                <div style={{ ...s.subLbl, color:T.amber }}>Color / Paint Code / Description</div>
                <input style={{ ...s.inputFull, border:`1px solid ${T.amberBorder}`, background:T.amberBg }} value={d.paintCode} onChange={e => setD({ paintCode: e.target.value })} placeholder="e.g. SW 7069 Urbane Bronze"/>
              </div>
            )}
          </div>

          {/* Glass */}
          <div style={s.sec}>
            <div style={s.sLbl}>Glass</div>
            <div style={s.toggle2}>
              <TBtn active={d.glass === '1" Tempered'} onClick={() => setD({ glass: '1" Tempered' })}>1&quot; Tempered</TBtn>
              <TBtn active={d.glass === '1/4" Tempered'} onClick={() => setD({ glass: '1/4" Tempered' })}>1/4&quot; Tempered</TBtn>
            </div>
          </div>

          {/* Framing */}
          <div style={s.sec}>
            <div style={s.sLbl}>Framing</div>
            <div style={s.fieldRow}>
              <span style={s.fKey}>Frame Type</span>
              <select style={s.select} value={d.frameType} onChange={e => setD({ frameType: e.target.value })}>
                {Object.entries(FRAME_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {d.frameType !== 'cw' && (
              <>
                <div style={s.checkRow}>
                  <input type="checkbox" checked={d.transom} onChange={e => setD({ transom: e.target.checked })} style={{ width:14, height:14, cursor:'pointer', accentColor:T.blue }}/>
                  <label style={{ fontSize:12, color:T.textSub, cursor:'pointer' }}>Transom</label>
                </div>
                {d.transom && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:7, gap:8, paddingTop:7, borderTop:`1px solid ${T.border}` }}>
                    <span style={s.fKey}>Frame Height</span>
                    <input style={{ ...s.input, maxWidth:70 }} value={d.frameHeight} onChange={e => setD({ frameHeight: e.target.value })} onBlur={e => normalise('frameHeight', e.target.value)} placeholder="96"/>
                  </div>
                )}
              </>
            )}
            {d.frameType === 'cw' && <div style={{ fontSize:11, color:T.textSub, marginTop:6, fontStyle:'italic' }}>Transom not applicable for CW Adaptor.</div>}
          </div>

          {/* Hardware Group */}
          <div style={s.sec}>
            <div style={s.sLbl}>Hardware Group</div>
            <div style={{ ...s.subLbl, marginBottom:5 }}>Door Order Type</div>
            <div style={{ ...s.toggle2, marginBottom:10 }}>
              <TBtn active={d.prepType === 'blank'} onClick={() => setD({ prepType: 'blank' })}>Blank Door</TBtn>
              <TBtn active={d.prepType === 'prep'} variant="amber" onClick={() => setD({ prepType: 'prep' })}>Prep for HW</TBtn>
            </div>
            <hr style={s.divider}/>
            <div style={s.fieldRow}>
              <span style={s.fKey}>HW Group</span>
              <input style={s.input} value={d.hwGroup} onChange={e => setD({ hwGroup: e.target.value })}/>
            </div>
            <div style={s.toggle2}>
              <TBtn active={d.hwType === 'std'} onClick={() => setD({ hwType: 'std' })}>Standard MF HW</TBtn>
              <TBtn active={d.hwType === 'custom'} onClick={() => setD({ hwType: 'custom' })}>Custom HW</TBtn>
            </div>
            <p style={{ fontSize:11, color:T.textTert, marginTop:6, lineHeight:1.5 }}>
              {d.prepType === 'blank' ? 'Door ordered blank. Hardware installed in shop per layout sheet.' : 'Door ordered prepped for hardware. Verify prep specs match hardware schedule before ordering.'}
            </p>
          </div>

          {/* Notes */}
          <div style={s.sec}>
            <div style={s.sLbl}>Notes</div>
            <textarea style={s.textarea} rows={2} value={d.notes} onChange={e => setD({ notes: e.target.value })} placeholder="Special conditions, field notes, vendor instructions\u2026"/>
          </div>

          {/* Schedule Import */}
          <div style={s.sec}>
            <div style={s.sLbl}>Schedule Import</div>
            <button style={s.btnUpload}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1" y="1" width="11" height="11" rx="2"/><path d="M6.5 8.5V4.5M4.5 6.5l2-2 2 2"/></svg>
              Attach hardware schedule
            </button>
            <button style={s.btnAI}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="6.5" cy="6.5" r="5"/><path d="M4.5 6.5h4M6.5 4.5v4"/></svg>
              Import arch door schedule (AI)
            </button>
          </div>
        </>}

        {/* ════ CUSTOM SIDEBAR ════ */}
        {doorType === 'custom' && <>
          <div style={s.sec}>
            <div style={s.sLbl}>Door Identification</div>
            <div style={s.customBadge}>⚙ Custom Door — Manual Entry</div>
            <div style={s.fieldRow}><span style={s.fKey}>Door #</span><input style={s.input} value={custState.num} onChange={e => setC({ num: e.target.value })}/></div>
            <div style={s.fieldRow}><span style={s.fKey}>Quantity</span><input type="number" style={{ ...s.input, maxWidth:60 }} value={custState.qty} onChange={e => setC({ qty: e.target.value })}/></div>
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Door Type</div>
            <div style={{ ...s.toggle2, marginBottom:6 }}>
              {['standard','frp'].map(t => <TBtn key={t} active={custDoorType===t} onClick={() => setCustDoorType(t)}>{t==='standard'?'Standard':'FRP'}</TBtn>)}
            </div>
            <div style={s.toggle2}>
              {['thermal','other'].map(t => <TBtn key={t} active={custDoorType===t} onClick={() => setCustDoorType(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</TBtn>)}
            </div>
            {custDoorType === 'other' && <input style={{ ...s.inputFull, marginTop:6 }} value={custState.otherType||''} onChange={e => setC({ otherType: e.target.value })} placeholder="Describe door type"/>}
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Size &amp; Configuration</div>
            <div style={s.fieldRowTop}>
              <span style={{ ...s.fKey, paddingTop:5 }}>Size (D.O.)</span>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input style={{ ...s.inputSm, width:56 }} value={custState.width} onChange={e => setC({ width: e.target.value })} placeholder="W"/>
                <span style={{ fontSize:12, color:T.textSub }}>×</span>
                <input style={{ ...s.inputSm, width:56 }} value={custState.height} onChange={e => setC({ height: e.target.value })} placeholder="H"/>
              </div>
            </div>
            <div style={s.fieldRow}><span style={s.fKey}>Swing</span>
              <select style={s.select} value={custState.swing} onChange={e => setC({ swing: e.target.value })}>
                <option value="hr">Hinged Right (LH)</option>
                <option value="hl">Hinged Left (RH)</option>
                <option value="pair">Pair</option>
              </select>
            </div>
            <div style={s.fieldRow}><span style={s.fKey}>Finish</span><input style={s.input} value={custState.finish} onChange={e => setC({ finish: e.target.value })} placeholder="e.g. Dark Bronze"/></div>
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Fire Rating</div>
            <div style={{ ...s.toggle2, marginBottom:6 }}>
              <TBtn active={custState.fireRating==='none'} onClick={() => setC({ fireRating:'none' })}>Not Rated</TBtn>
              <TBtn active={custState.fireRating==='rated'} variant="red" onClick={() => setC({ fireRating:'rated' })}>Rated</TBtn>
            </div>
            {custState.fireRating === 'rated' && (
              <>
                <div style={s.subLbl}>Rating</div>
                <div style={{ ...s.toggle2, marginBottom:6 }}>
                  {['20-min','45-min'].map(v => <TBtn key={v} active={custState.frVal===v} variant="red" onClick={() => setC({ frVal: v })}>{v}</TBtn>)}
                </div>
                <div style={s.toggle2}>
                  {['60-min','90-min'].map(v => <TBtn key={v} active={custState.frVal===v} variant="red" onClick={() => setC({ frVal: v })}>{v}</TBtn>)}
                </div>
              </>
            )}
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Frame</div>
            <div style={s.fieldRow}><span style={s.fKey}>Frame Type</span><input style={s.input} value={custState.frame} onChange={e => setC({ frame: e.target.value })} placeholder="e.g. 2×6 Cripple"/></div>
            <div style={s.checkRow}>
              <input type="checkbox" checked={custState.cripple} onChange={e => setC({ cripple: e.target.checked })} style={{ width:14, height:14, cursor:'pointer', accentColor:T.blue }}/>
              <label style={{ fontSize:12, color:T.textSub, cursor:'pointer' }}>Cripple Frame</label>
            </div>
            {custState.cripple && (
              <div style={{ marginTop:6 }}>
                <div style={{ ...s.subLbl, marginBottom:4 }}>Cripple height</div>
                <input style={{ ...s.input, maxWidth:100 }} value={custState.crippleH} onChange={e => setC({ crippleH: e.target.value })} placeholder='e.g. 12"'/>
              </div>
            )}
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Glass &amp; Hardware</div>
            <div style={s.fieldRow}><span style={s.fKey}>Glass Spec</span><input style={s.input} value={custState.glass} onChange={e => setC({ glass: e.target.value })} placeholder='e.g. 1" Temp.'/></div>
            <div style={s.fieldRow}><span style={s.fKey}>HW Group</span><input style={s.input} value={custState.hwGroup} onChange={e => setC({ hwGroup: e.target.value })} placeholder="e.g. HW Set 5A"/></div>
            <div style={{ ...s.subLbl, marginBottom:5 }}>Door Order Type</div>
            <div style={s.toggle2}>
              <TBtn active={custState.prepType==='blank'} onClick={() => setC({ prepType:'blank' })}>Blank Door</TBtn>
              <TBtn active={custState.prepType==='prep'} variant="amber" onClick={() => setC({ prepType:'prep' })}>Prep for HW</TBtn>
            </div>
          </div>
          <div style={s.sec}>
            <div style={s.sLbl}>Notes &amp; Special Conditions</div>
            <textarea style={s.textarea} rows={4} value={custState.notes} onChange={e => setC({ notes: e.target.value })} placeholder="Describe special requirements, installation conditions, vendor specs\u2026"/>
          </div>
        </>}

        {/* ── Save / Copy ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'12px 14px' }}>
          <button onClick={copyDoor} style={{ ...s.btnCopy, ...(copied ? { background:T.greenBg, borderColor:T.greenBorder, color:T.green } : {}) }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="4" width="8" height="8" rx="1"/><path d="M1 9V2a1 1 0 011-1h7"/></svg>
            {copied ? 'Copied!' : 'Copy Door'}
          </button>
          <button onClick={saveDoor} style={{ ...s.btnSave, ...(saved ? { background:T.greenBg, borderColor:T.greenBorder, color:T.green } : {}) }}>
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
