/**
 * Inspector panels for the Frame Builder.  Every edit is a pure spec → spec
 * function handed to `update(fn)`.
 */
import React, { useMemo } from 'react';
import {
  listSystems, getSystem, JOINERY, edit, formatInches, formatFeetInches, partsCatalog, describePart,
  HARDWARE_PRESETS, STILES, newBrakePiece, METAL_ROLES, DEFAULT_RULES, DEFAULT_LIFT_RATES, equivalentSystem,
} from '@glazebid/frame-engine/core';
import { Field, Section, DimInput, NumInput, TextInput, Select, Seg, Check } from './ui';
import { glassColorMap } from './FrameCanvas';

const r2 = (x) => Math.round(x * 100) / 100;

// ── Frame ────────────────────────────────────────────────────────────────────

const SHAPES = [
  { value: 'rect', label: 'Rectangle' }, { value: 'rake', label: 'Raked head' }, { value: 'gable', label: 'Gable' },
  { value: 'arch', label: 'Arch (segment)' }, { value: 'half_round', label: 'Half-round top' },
  { value: 'octagon', label: 'Octagon' }, { value: 'polygon', label: 'Custom polygon' },
];

export function FramePanel({ spec, update, takeoff, setFrameSet }) {
  const systems = useMemo(() => {
    const groups = {};
    for (const s of listSystems()) (groups[s.manufacturer] ??= []).push({ value: s.id, label: s.name });
    return Object.entries(groups).map(([group, options]) => ({ group, options }));
  }, []);
  const sys = getSystem(spec.systemId);
  const joineryOpts = sys.joinery.map((j) => ({ value: j, label: `${JOINERY[j].label}${JOINERY[j].reserved ? '' : ''}` }));
  const set = (patch) => update((s) => ({ ...s, ...patch }));
  const setSize = (patch) => update((s) => ({ ...s, size: { ...s.size, ...patch } }));
  const setJoint = (k, v) => update((s) => ({ ...s, size: { ...s.size, joints: { ...s.size.joints, [k]: v } } }));
  const setShape = (patch) => update((s) => ({ ...s, shape: { ...s.shape, ...patch, params: { ...(s.shape.params ?? {}), ...(patch.params ?? {}) } } }));
  const twin = equivalentSystem(spec.systemId);
  const sets = Object.keys(takeoff.frameSets ?? {});
  const p = spec.shape.params ?? {};
  return (
    <>
      <Section title="Identity">
        <div className="fbv1-grid2">
          <Field label="Mark"><TextInput value={spec.mark} onChange={(v) => set({ mark: v })} /></Field>
          <Field label="Quantity"><NumInput value={spec.quantity} min={1} onChange={(v) => set({ quantity: Math.round(v) })} /></Field>
          <Field label="Frame set" wide>
            <div className="fbv1-row">
              <Select value={spec.frameSet} onChange={(v) => set({ frameSet: v })} options={sets.map((s) => ({ value: s, label: s }))} />
              <button type="button" className="fbv1-btn ghost" onClick={() => {
                const n = window.prompt('New frame set name (e.g. EX CW, INT SF):');
                if (n) { setFrameSet(n, {}); set({ frameSet: n }); }
              }}>+ Set</button>
            </div>
          </Field>
        </div>
      </Section>
      <Section title="System">
        <Field label="Manufacturer system" wide>
          <Select value={spec.systemId} options={systems} onChange={(v) => {
            const ns = getSystem(v);
            set({ systemId: v, joinery: ns.joinery.includes(spec.joinery) ? spec.joinery : ns.defaultJoinery });
          }} />
        </Field>
        {twin && (
          <button type="button" className="fbv1-link" onClick={() => set({ systemId: twin.id })}>
            Switch to {twin.manufacturer} equivalent → {twin.name}
          </button>
        )}
        <div className="fbv1-grid2">
          <Field label="Joinery"><Select value={spec.joinery ?? sys.defaultJoinery} options={joineryOpts} onChange={(v) => set({ joinery: v })} /></Field>
          <Field label="Finish"><TextInput value={spec.finish} onChange={(v) => set({ finish: v })} placeholder="Clear Anodized" /></Field>
        </div>
        {spec.joinery === 'unitized' && <p className="fbv1-warn">Unitized is reserved for a later phase — the takeoff uses captured rules for now.</p>}
        <div className="fbv1-meta">{sys.family === 'curtainwall' ? 'Labor: COMBINATION (curtain wall)' : 'Labor: STANDARD (storefront)'} · stock {r2(sys.stockLengthIn / 12)}' · glass add {sys.glazing.addPerAxis}" per axis</div>
      </Section>
      <Section title="Size">
        <Seg value={spec.size.mode} onChange={(v) => setSize({ mode: v })}
          options={[{ value: 'frame', label: 'Exact frame size' }, { value: 'ro', label: 'Rough opening' }]} />
        <div className="fbv1-grid2">
          <Field label={spec.size.mode === 'ro' ? 'RO width' : 'Frame width'}><DimInput value={spec.size.width} onChange={(v) => setSize({ width: v })} /></Field>
          <Field label={spec.size.mode === 'ro' ? 'RO height' : 'Frame height'} hint={spec.shape.type !== 'rect' ? 'shape heights below rule' : undefined}><DimInput value={spec.size.height} onChange={(v) => setSize({ height: v })} /></Field>
        </div>
        {spec.size.mode === 'ro' && (
          <>
            <div className="fbv1-sub">Joint size per side (deducted from the RO)</div>
            <div className="fbv1-grid4">
              <Field label="Head"><DimInput feet={false} value={spec.size.joints.head} onChange={(v) => setJoint('head', v)} /></Field>
              <Field label="Sill"><DimInput feet={false} value={spec.size.joints.sill} onChange={(v) => setJoint('sill', v)} /></Field>
              <Field label="Left jamb"><DimInput feet={false} value={spec.size.joints.left} onChange={(v) => setJoint('left', v)} /></Field>
              <Field label="Right jamb"><DimInput feet={false} value={spec.size.joints.right} onChange={(v) => setJoint('right', v)} /></Field>
            </div>
            <div className="fbv1-meta">Frame size {formatFeetInches(spec.size.width - spec.size.joints.left - spec.size.joints.right)} × {formatFeetInches(spec.size.height - spec.size.joints.head - spec.size.joints.sill)}</div>
          </>
        )}
        <div className="fbv1-grid2">
          <Field label="Sill AFF" hint="frame bottom above floor"><DimInput value={spec.sillAFF} onChange={(v) => set({ sillAFF: v })} /></Field>
          <Field label="Lift line AFF" hint={spec.liftLine == null ? `set: ${takeoff.frameSets?.[spec.frameSet]?.liftLine != null ? formatFeetInches(takeoff.frameSets[spec.frameSet].liftLine) : 'none'}` : 'frame override'}>
            <DimInput value={spec.liftLine} allowEq placeholder="inherit" onChange={(v) => set({ liftLine: v })} />
          </Field>
        </div>
      </Section>
      <Section title="Shape">
        <Select value={spec.shape.type} options={SHAPES} onChange={(v) => setShape({ type: v })} />
        {(spec.shape.type === 'rake' || spec.shape.type === 'trapezoid') && (
          <div className="fbv1-grid2">
            <Field label="Left height"><DimInput value={p.leftHeight ?? spec.size.height} onChange={(v) => setShape({ params: { leftHeight: v } })} /></Field>
            <Field label="Right height"><DimInput value={p.rightHeight ?? spec.size.height} onChange={(v) => setShape({ params: { rightHeight: v } })} /></Field>
          </div>
        )}
        {spec.shape.type === 'gable' && (
          <div className="fbv1-grid2">
            <Field label="Left height"><DimInput value={p.leftHeight ?? spec.size.height * 0.75} onChange={(v) => setShape({ params: { leftHeight: v } })} /></Field>
            <Field label="Right height"><DimInput value={p.rightHeight ?? p.leftHeight ?? spec.size.height * 0.75} onChange={(v) => setShape({ params: { rightHeight: v } })} /></Field>
            <Field label="Peak height"><DimInput value={p.peakHeight ?? spec.size.height} onChange={(v) => setShape({ params: { peakHeight: v } })} /></Field>
            <Field label="Peak from left"><DimInput value={p.peakX ?? spec.size.width / 2} onChange={(v) => setShape({ params: { peakX: v } })} /></Field>
          </div>
        )}
        {spec.shape.type === 'arch' && (
          <div className="fbv1-grid2">
            <Field label="Spring line (jamb height)"><DimInput value={p.springHeight ?? spec.size.height * 0.8} onChange={(v) => setShape({ params: { springHeight: v } })} /></Field>
            <Field label="Rise"><DimInput value={p.rise ?? spec.size.height * 0.2} onChange={(v) => setShape({ params: { rise: v } })} /></Field>
          </div>
        )}
        {spec.shape.type === 'octagon' && (
          <Field label="Corner cut"><DimInput value={p.corner ?? Math.min(spec.size.width, spec.size.height) * 0.2929} onChange={(v) => setShape({ params: { corner: v } })} /></Field>
        )}
        {spec.shape.type === 'polygon' && <PolygonEditor spec={spec} update={update} />}
      </Section>
      <Section title="Notes">
        <textarea className="fbv1-input area" defaultValue={spec.notes} onBlur={(e) => set({ notes: e.target.value })} rows={3} />
      </Section>
    </>
  );
}

function PolygonEditor({ spec, update }) {
  const verts = spec.shape.vertices?.length ? spec.shape.vertices : [
    { x: 0, y: 0 }, { x: spec.size.width, y: 0 }, { x: spec.size.width, y: spec.size.height }, { x: 0, y: spec.size.height },
  ];
  const setV = (i, patch) => update((s) => ({ ...s, shape: { ...s.shape, vertices: verts.map((v, k) => (k === i ? { ...v, ...patch } : v)) } }));
  return (
    <div className="fbv1-poly">
      <div className="fbv1-sub">Vertices counter-clockwise from bottom-left. Bulge &gt; 0 makes the edge to the next vertex an arc (1 = half circle).</div>
      <table className="fbv1-table compact">
        <thead><tr><th>#</th><th>X</th><th>Y</th><th>Bulge</th><th /></tr></thead>
        <tbody>
          {verts.map((v, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><DimInput feet={false} value={v.x} onChange={(x) => setV(i, { x })} /></td>
              <td><DimInput feet={false} value={v.y} onChange={(y) => setV(i, { y })} /></td>
              <td><NumInput step={0.05} value={v.bulge ?? 0} onChange={(b) => setV(i, { bulge: b })} /></td>
              <td><button type="button" className="fbv1-x" onClick={() => update((s) => ({ ...s, shape: { ...s.shape, vertices: verts.filter((_, k) => k !== i) } }))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, shape: { ...s.shape, vertices: [...verts, { x: 0, y: spec.size.height / 2 }] } }))}>+ Vertex</button>
    </div>
  );
}

// ── Grid: bays + rows (two-way with the canvas) ──────────────────────────────

export function GridPanel({ spec, result, update, selectedCol, setSelectedCol }) {
  const cols = result?.solved?.columns ?? [];
  const nRows = spec.rows.length;
  const setCol = (i, patch) => update((s) => ({ ...s, columns: s.columns.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  const sc = Math.min(selectedCol ?? 0, spec.columns.length - 1);
  const bayRows = spec.bayRows?.[sc];
  const solvedRows = cols[sc]?.rows ?? [];
  return (
    <>
      <Section title="Bays (daylight openings)" right={
        <div className="fbv1-row">
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.setBays(s, s.columns.length - 1))} disabled={spec.columns.length <= 1}>− Bay</button>
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.setBays(s, s.columns.length + 1))}>+ Bay</button>
        </div>
      }>
        <div className="fbv1-sub">Blank = EQ (shares what is left). Door bays are locked. Click a bay # to edit its rows.</div>
        <table className="fbv1-table">
          <thead><tr><th>Bay</th><th>DLO</th><th>Solved</th><th>Type</th><th>Sill step</th></tr></thead>
          <tbody>
            {spec.columns.map((c, i) => (
              <tr key={i} className={i === sc ? 'on' : ''}>
                <td><button type="button" className="fbv1-chip" onClick={() => setSelectedCol(i)}>{String.fromCharCode(65 + i)}</button></td>
                <td><DimInput allowEq value={c.dlo} onChange={(v) => update((s) => edit.setColumnDlo(s, i, v))} /></td>
                <td className={`fbv1-solved ${cols[i]?.eq ? 'eq' : ''}`}>{cols[i] ? formatInches(cols[i].dlo) : '—'}{cols[i]?.eq ? ' EQ' : ''}</td>
                <td>
                  <Select value={c.kind === 'door' ? (c.door?.kind ?? 'single') : 'glass'} onChange={(v) => update((s) => edit.setDoor(s, i, v === 'glass' ? 'none' : v))}
                    options={[{ value: 'glass', label: 'Glass' }, { value: 'single', label: 'Door — single' }, { value: 'pair', label: 'Door — pair' }]} />
                </td>
                <td>{c.kind === 'door' ? '—' : <DimInput feet={false} value={c.sillStep || 0} onChange={(v) => setCol(i, { sillStep: v })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Rows — frame default (bottom → top)" right={
        <div className="fbv1-row">
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.setRows(s, nRows - 1))} disabled={nRows <= 1}>− Row</button>
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.setRows(s, nRows + 1))}>+ Row</button>
        </div>
      }>
        <table className="fbv1-table">
          <thead><tr><th>Row</th><th>DLO</th></tr></thead>
          <tbody>
            {spec.rows.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td><DimInput allowEq value={r.dlo} onChange={(v) => update((s) => edit.setRowDlo(s, i, v))} /></td></tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`Bay ${String.fromCharCode(65 + sc)} rows`} right={
        bayRows
          ? <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.resetBayRows(s, sc))}>Use frame rows</button>
          : <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.splitBayRows(s, sc, (spec.columns[sc]?.kind === 'door' ? 1 : nRows)))}>Override for this bay</button>
      }>
        {bayRows ? (
          <>
            <table className="fbv1-table">
              <thead><tr><th>Row</th><th>DLO</th><th>Solved</th></tr></thead>
              <tbody>
                {bayRows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><DimInput allowEq value={r.dlo} onChange={(v) => update((s) => edit.setRowDlo(s, i, v, sc))} /></td>
                    <td className="fbv1-solved">{solvedRows[i] != null ? formatInches(solvedRows[i]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="fbv1-row">
              <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.splitBayRows(s, sc, bayRows.length + 1))}>+ Row in bay</button>
              <button type="button" className="fbv1-btn ghost" disabled={bayRows.length <= 1} onClick={() => update((s) => ({ ...s, bayRows: { ...s.bayRows, [sc]: bayRows.slice(0, -1) } }))}>− Row in bay</button>
            </div>
          </>
        ) : <div className="fbv1-meta">Uses the frame rows. Solved: {solvedRows.map((v) => formatInches(v)).join(' · ') || '—'}</div>}
      </Section>
      {(spec.removedMembers.length > 0 || spec.extraMembers.length > 0) && (
        <Section title="Splits & merges">
          <div className="fbv1-meta">{spec.extraMembers.length} added member(s), {spec.removedMembers.length} removed.</div>
          <div className="fbv1-row">
            <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, extraMembers: [] }))}>Clear splits</button>
            <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => edit.restoreMembers(s))}>Restore removed</button>
          </div>
        </Section>
      )}
    </>
  );
}

// ── Glass ────────────────────────────────────────────────────────────────────

const HAZARDS = [{ k: 'stair', label: 'Stairs / landing' }, { k: 'wet', label: 'Wet area' }, { k: 'other', label: 'Other hazard' }];
const REASON = { door: 'within 24" of a door, below 60" AFF', large: '> 9 SF, bottom < 18", top > 36" AFF', company: 'company rule: monolithic glass tempered', spec: 'glass type is tempered' };

export function GlassPanel({ spec, update, takeoff, store, result, selection, activeGlassId, setActiveGlassId }) {
  const types = takeoff.glassTypes ?? [];
  const colors = glassColorMap(types);
  const lite = selection?.type === 'lite' ? result?.glass?.find((g) => g.key === selection.key) : null;
  return (
    <>
      <Section title="Glass types (project)" right={
        <button type="button" className="fbv1-btn ghost" onClick={() => {
          const n = types.length + 1;
          store.upsertGlassType({ id: `GL-${n}`, mark: `GL-${n}`, description: 'New glass type', kind: 'vision', makeup: '', plies: [0.25, 0.25], heat: 'annealed', nominal: 1 });
        }}>+ Type</button>
      }>
        <div className="fbv1-sub">Pick a type, then use the <b>Glass</b> tool to paint lites. Null glazing and spandrel live in the same slot.</div>
        <table className="fbv1-table">
          <thead><tr><th /><th>Mark</th><th>Description</th><th>Kind</th><th>Plies (in)</th><th>Default</th></tr></thead>
          <tbody>
            {types.map((g) => (
              <tr key={g.id} className={activeGlassId === g.id ? 'on' : ''}>
                <td><button type="button" className="fbv1-swatch" title="Paint with this type" onClick={() => setActiveGlassId(g.id)} style={{ background: colors[g.id] }} /></td>
                <td><TextInput value={g.mark} onChange={(v) => store.upsertGlassType({ ...g, mark: v })} /></td>
                <td><TextInput value={g.description} onChange={(v) => store.upsertGlassType({ ...g, description: v })} /></td>
                <td><Select value={g.kind} onChange={(v) => store.upsertGlassType({ ...g, kind: v })} options={[{ value: 'vision', label: 'Vision' }, { value: 'spandrel', label: 'Spandrel' }, { value: 'null', label: 'Null' }, { value: 'panel', label: 'Panel' }]} /></td>
                <td><TextInput value={(g.plies ?? []).join(' + ')} onChange={(v) => store.upsertGlassType({ ...g, plies: v.split('+').map((x) => Number(x.trim())).filter((x) => x > 0) })} /></td>
                <td><input type="radio" name="gdef" checked={takeoff.defaultGlassTypeId === g.id} onChange={() => store.updateTakeoff({ defaultGlassTypeId: g.id })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="This frame">
        <Field label="Frame default glass" wide>
          <Select value={spec.glass.frameDefault ?? ''} onChange={(v) => update((s) => ({ ...s, glass: { ...s.glass, frameDefault: v || null } }))}
            options={[{ value: '', label: 'Project default' }, ...types.map((g) => ({ value: g.id, label: `${g.mark} — ${g.description}` }))]} />
        </Field>
        <div className="fbv1-row">
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, glass: { ...s.glass, lites: {} } }))}>Clear lite overrides</button>
          <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, glass: { ...s.glass, temper: {} } }))}>Reset tempering to auto</button>
        </div>
      </Section>
      {lite && (
        <Section title={`Lite ${lite.tag}`}>
          <div className="fbv1-kv">
            <span>DLO</span><b>{formatInches(lite.dloW)} × {formatInches(lite.dloH)}</b>
            <span>Glass (order)</span><b>{formatInches(lite.orderW)} × {formatInches(lite.orderH)}</b>
            <span>Block size</span><b>{lite.blockW}" × {lite.blockH}"</b>
            <span>Area / billing</span><b>{lite.actualSf} SF / {lite.billingSf} SF</b>
            <span>Weight</span><b>{Math.round(lite.weightLb)} lb</b>
            <span>Bottom / top AFF</span><b>{formatFeetInches(lite.bottomAFF)} / {formatFeetInches(lite.topAFF)}</b>
            {lite.shapeInfo && <><span>Shape</span><b>{lite.shapeInfo.type}{lite.shapeInfo.leftHeight != null ? ` · L ${formatInches(lite.shapeInfo.leftHeight)} / R ${formatInches(lite.shapeInfo.rightHeight)}` : ''}</b></>}
          </div>
          <Field label="Glass type" wide>
            <Select value={spec.glass.lites[lite.key] ?? ''} onChange={(v) => update((s) => edit.setLiteGlass(s, lite.key, v || null))}
              options={[{ value: '', label: `Frame/project default (${lite.glassMark})` }, ...types.map((g) => ({ value: g.id, label: `${g.mark} — ${g.description}` }))]} />
          </Field>
          <Field label="Tempering" wide>
            <Seg value={spec.glass.temper[lite.key] === undefined ? 'auto' : spec.glass.temper[lite.key] ? 'T' : 'A'}
              onChange={(v) => update((s) => edit.setLiteTemper(s, lite.key, v === 'auto' ? null : v === 'T'))}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'T', label: 'Tempered' }, { value: 'A', label: 'Not tempered' }]} />
          </Field>
          <div className="fbv1-meta">
            {lite.temperReasons.length ? `Auto: ${lite.temperReasons.map((r) => REASON[r] ?? r.replace('flag:', 'flagged ')).join('; ')}` : 'Auto: no hazardous-location rule applies'}
          </div>
          <div className="fbv1-row wrap">
            {HAZARDS.map((h) => {
              const cur = spec.glass.hazards[lite.key] ?? [];
              const on = cur.includes(h.k);
              return <Check key={h.k} checked={on} label={h.label} onChange={(v) => update((s) => edit.setLiteHazard(s, lite.key, v ? [...cur, h.k] : cur.filter((x) => x !== h.k)))} />;
            })}
          </div>
        </Section>
      )}
    </>
  );
}

// ── Doors ────────────────────────────────────────────────────────────────────

export function DoorsPanel({ spec, update, result, takeoff }) {
  const doorCols = spec.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === 'door');
  if (!doorCols.length) return <div className="fbv1-empty small">No door bays. Set a bay's type to “Door” on the Grid tab.</div>;
  const setDoor = (i, patch) => update((s) => ({ ...s, columns: s.columns.map((c, k) => (k === i ? { ...c, door: { ...c.door, ...patch } } : c)) }));
  return doorCols.map(({ c, i }) => {
    const d = c.door; const r = result?.doors?.find((x) => x.col === i);
    return (
      <Section key={i} title={`Door in bay ${String.fromCharCode(65 + i)} — ${r?.mark ?? ''}`}>
        <div className="fbv1-sub">Door package is quoted by the vendor. These choices drive the drawing, the door schedule and the hardware schedule.</div>
        <div className="fbv1-grid2">
          <Field label="Door mark"><TextInput value={d.mark} placeholder={r?.mark} onChange={(v) => setDoor(i, { mark: v })} /></Field>
          <Field label="Type"><Seg value={d.kind} onChange={(v) => update((s) => edit.setDoor(s, i, v))} options={[{ value: 'single', label: 'Single' }, { value: 'pair', label: 'Pair' }]} /></Field>
          <Field label="Opening width (bay DLO)"><DimInput value={c.dlo} onChange={(v) => update((s) => edit.setColumnDlo(s, i, v))} /></Field>
          <Field label="Opening height / transom bar"><DimInput value={d.height} onChange={(v) => setDoor(i, { height: v })} /></Field>
          <Field label="Stile"><Select value={d.stile} onChange={(v) => setDoor(i, { stile: v })} options={Object.entries(STILES).map(([k, s]) => ({ value: k, label: `${s.label} (${s.width}")` }))} /></Field>
          <Field label="Top rail"><Select value={String(d.topRail)} onChange={(v) => setDoor(i, { topRail: v })} options={[{ value: 'standard', label: 'Standard (= stile)' }, { value: 'medium', label: 'Medium 3-1/2"' }, { value: 'wide', label: 'Wide 5"' }]} /></Field>
          <Field label="Bottom rail"><Select value={String(d.bottomRail)} onChange={(v) => setDoor(i, { bottomRail: v })} options={[{ value: 'standard', label: 'Standard 4"' }, { value: '6.5', label: '6-1/2"' }, { value: '10', label: '10" (ADA)' }]} /></Field>
          <Field label="Mid rail"><Select value={String(d.midRail)} onChange={(v) => setDoor(i, { midRail: v })} options={[{ value: 'none', label: 'None' }, { value: 'standard', label: 'Standard 4" @ 36"' }]} /></Field>
          <Field label="Swing"><Seg value={d.swing} onChange={(v) => setDoor(i, { swing: v })} options={[{ value: 'out', label: 'Out' }, { value: 'in', label: 'In' }]} /></Field>
          {d.kind === 'single'
            ? <Field label="Handing"><Select value={d.handing} onChange={(v) => setDoor(i, { handing: v })} options={['LH', 'RH', 'LHR', 'RHR'].map((h) => ({ value: h, label: h }))} /></Field>
            : <Field label="Active leaf"><Seg value={d.activeLeaf} onChange={(v) => setDoor(i, { activeLeaf: v })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} /></Field>}
          <Field label="Door glass" wide>
            <Select value={d.glassTypeId ?? ''} onChange={(v) => setDoor(i, { glassTypeId: v || null })}
              options={[{ value: '', label: 'Frame / project default' }, ...(takeoff.glassTypes ?? []).map((g) => ({ value: g.id, label: `${g.mark} — ${g.description}` }))]} />
          </Field>
          <Field label="Hardware" wide>
            <Select value={d.hardwarePreset} onChange={(v) => setDoor(i, { hardwarePreset: v, hardware: null })} options={Object.entries(HARDWARE_PRESETS).map(([k, p]) => ({ value: k, label: p.label }))} />
          </Field>
          <Check checked={d.threshold !== false} onChange={(v) => setDoor(i, { threshold: v })} label="Threshold" />
        </div>
        {r && (
          <div className="fbv1-kv">
            <span>Leaf</span><b>{formatInches(r.geometry.leafW)} × {formatInches(r.geometry.leafH)} {r.leaves > 1 ? '(each)' : ''}</b>
            <span>Door glass</span><b>{formatInches(r.geometry.glassW)} × {r.geometry.glassHs.map((h) => formatInches(h)).join(' + ')}</b>
          </div>
        )}
        {r && (
          <table className="fbv1-table compact">
            <thead><tr><th>Hardware item</th><th>Per</th><th>Qty</th></tr></thead>
            <tbody>{r.hardware.map((h, k) => <tr key={k}><td>{h.item}</td><td>{h.frequency}</td><td>{h.qtyPerOpening}</td></tr>)}</tbody>
          </table>
        )}
        <Field label="Door notes" wide><TextInput value={d.notes} onChange={(v) => setDoor(i, { notes: v })} /></Field>
      </Section>
    );
  });
}

// ── Joints ───────────────────────────────────────────────────────────────────

export function JointsPanel({ spec, update, result }) {
  const ov = spec.joints.overrides ?? {};
  const joints = result?.solved?.joints ?? [];
  return (
    <>
      <Section title="Run-through (frame defaults)">
        <Field label="Intermediate joints" wide>
          <Seg value={spec.joints.defaultRunThrough} onChange={(v) => update((s) => ({ ...s, joints: { ...s.joints, defaultRunThrough: v } }))}
            options={[{ value: 'v', label: 'Verticals run through' }, { value: 'h', label: 'Horizontals run through' }]} />
        </Field>
        <Field label="Perimeter corners" wide>
          <Seg value={spec.joints.cornerRunThrough} onChange={(v) => update((s) => ({ ...s, joints: { ...s.joints, cornerRunThrough: v } }))}
            options={[{ value: 'v', label: 'Jambs run through' }, { value: 'h', label: 'Head & sill run through' }]} />
        </Field>
        <div className="fbv1-sub">Use the <b>Joints</b> tool on the drawing to flip any single intersection.</div>
      </Section>
      <Section title={`Per-joint overrides (${Object.keys(ov).length})`} right={
        Object.keys(ov).length ? <button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, joints: { ...s.joints, overrides: {} } }))}>Clear all</button> : null
      }>
        <table className="fbv1-table compact">
          <thead><tr><th>Joint</th><th>Type</th><th>Runs through</th><th /></tr></thead>
          <tbody>
            {joints.filter((j) => ov[j.key] !== undefined).map((j) => (
              <tr key={j.key}><td>{j.key}</td><td>{j.type}</td><td>{j.owner === 'v' ? 'vertical' : j.owner === 'h' ? 'horizontal' : 'miter'}</td>
                <td><button type="button" className="fbv1-x" onClick={() => update((s) => { const o = { ...s.joints.overrides }; delete o[j.key]; return { ...s, joints: { ...s.joints, overrides: o } }; })}>×</button></td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

// ── Members / dies ───────────────────────────────────────────────────────────

export function MembersPanel({ spec, update, result }) {
  const catalog = useMemo(() => partsCatalog(spec.systemId), [spec.systemId]);
  const sys = getSystem(spec.systemId);
  const dies = { ...sys.dies, ...(spec.overrides?.dies ?? {}) };
  const profiles = result?.solved?.es?.profiles ?? {};
  const setDie = (role, part) => update((s) => ({ ...s, overrides: { ...s.overrides, dies: { ...(s.overrides?.dies ?? {}), [role]: part || null } } }));
  const setProf = (role, patch) => update((s) => ({ ...s, overrides: { ...s.overrides, profiles: { ...(s.overrides?.profiles ?? {}), [role]: { ...(s.overrides?.profiles?.[role] ?? {}), ...patch } } } }));
  const roles = ['jamb', 'head', 'sill', 'mullion', 'horizontal', 'doorJambFiller', 'subsill', 'headReceptor', 'pressurePlate', 'pressurePlatePerimeter', 'cover', 'thermalIsolator', 'ssgMullion'];
  return (
    <>
      <Section title="Profiles (sightline / depth)">
        <table className="fbv1-table compact">
          <thead><tr><th>Role</th><th>Sightline</th><th>Depth</th></tr></thead>
          <tbody>
            {['jamb', 'head', 'sill', 'mullion', 'horizontal'].map((r) => (
              <tr key={r}><td>{METAL_ROLES[r]?.label ?? r}</td>
                <td><DimInput feet={false} value={profiles[r]?.sightline} onChange={(v) => setProf(r, { sightline: v })} /></td>
                <td><DimInput feet={false} value={profiles[r]?.depth} onChange={(v) => setProf(r, { depth: v })} /></td></tr>
            ))}
          </tbody>
        </table>
        <div className="fbv1-grid2">
          <Field label="Glass add per axis"><DimInput feet={false} value={spec.overrides?.glassAddPerAxis ?? sys.glazing.addPerAxis} onChange={(v) => update((s) => ({ ...s, overrides: { ...s.overrides, glassAddPerAxis: v } }))} /></Field>
          <Field label="SSG add per edge" hint="per mfr instructions"><DimInput feet={false} allowEq placeholder="not set" value={spec.overrides?.ssgAddPerEdge ?? sys.glazing.ssgAddPerEdge} onChange={(v) => update((s) => ({ ...s, overrides: { ...s.overrides, ssgAddPerEdge: v } }))} /></Field>
          <Field label="Stock length"><DimInput value={spec.overrides?.stockLengthIn ?? sys.stockLengthIn} onChange={(v) => update((s) => ({ ...s, overrides: { ...s.overrides, stockLengthIn: v } }))} /></Field>
        </div>
      </Section>
      <Section title="Die map (role → part)">
        <table className="fbv1-table compact">
          <thead><tr><th>Role</th><th>Part</th><th>Match</th></tr></thead>
          <tbody>
            {roles.filter((r) => dies[r] !== undefined || ['jamb', 'head', 'sill', 'mullion', 'horizontal'].includes(r)).map((r) => (
              <tr key={r}>
                <td>{METAL_ROLES[r]?.label ?? r}</td>
                <td>
                  <select className="fbv1-input" value={dies[r] ?? ''} onChange={(e) => setDie(r, e.target.value)}>
                    <option value="">— none —</option>
                    {dies[r] && !catalog.some((p) => p.part === dies[r]) && <option value={dies[r]}>{dies[r]}</option>}
                    {catalog.filter((p) => p.tier === 'Extrusion').map((p) => <option key={p.part + p.kawneer} value={p.part}>{p.part} — {p.description}</option>)}
                  </select>
                </td>
                <td className="fbv1-meta">{sys.dieMatch?.[r]?.match ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fbv1-meta">Part descriptions from the vendor-portal cross-reference. APPROX = nearest equivalent, verify on the vendor quote.</div>
      </Section>
    </>
  );
}

// ── Labor ────────────────────────────────────────────────────────────────────

export function LaborPanel({ spec, update, frameResult }) {
  const lab = frameResult?.labor; const counts = frameResult?.bom?.counts;
  const extra = spec.labor?.extra ?? {};
  const setExtra = (k, v) => update((s) => ({ ...s, labor: { ...s.labor, extra: { ...s.labor.extra, [k]: v } } }));
  const isCW = counts?.isCW;
  const rows = isCW
    ? [['verticals', 'Verticals'], ['horizontals', 'Horizontals'], ['panels', 'DLOs (lites)'], ['joints', 'Joints'], ['perimeter', 'Perimeter LF'], ['singles', 'Single doors'], ['pairs', 'Pair doors'], ['brakeMetal', 'Brake metal pcs']]
    : [['bays', 'Bays'], ['panels', 'DLOs (lites)'], ['joints', 'Joints'], ['perimeter', 'Perimeter LF'], ['singles', 'Single doors'], ['pairs', 'Pair doors'], ['brakeMetal', 'Brake metal pcs']];
  return (
    <>
      <Section title="Hours (this frame, × 1)">
        {lab?.missing && <p className="fbv1-warn">Labor rates are not loaded — set them in Settings → Production Rates.</p>}
        <div className="fbv1-kv big">
          <span>Shop</span><b>{r2(lab?.shop ?? 0)}</b>
          <span>Distribution</span><b>{r2(lab?.dist ?? 0)}</b>
          <span>Field</span><b>{r2(lab?.field ?? 0)}</b>
          <span>…of which lift (×{lab?.liftFactor ?? 1})</span><b>{r2(lab?.liftHours ?? 0)}</b>
          <span>Total</span><b>{r2(lab?.total ?? 0)}</b>
          <span>× qty {spec.quantity}</span><b>{r2((lab?.total ?? 0) * spec.quantity)}</b>
        </div>
      </Section>
      <Section title={`Drivers from the built frame${counts?.liftLineAFF != null ? ` · lift line ${formatFeetInches(counts.liftLineAFF)} AFF` : ''}`}>
        <table className="fbv1-table compact">
          <thead><tr><th>Driver</th><th>Below line</th><th>Above (lift)</th></tr></thead>
          <tbody>{rows.map(([k, label]) => <tr key={k}><td>{label}</td><td>{r2(counts?.below?.[k] ?? 0)}</td><td>{r2(counts?.above?.[k] ?? 0)}</td></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Adjusters & extra items">
        <div className="fbv1-grid2">
          <Field label="Difficulty (frame)" hint="× hours"><NumInput step={0.05} min={0.1} value={spec.labor.difficulty} onChange={(v) => update((s) => ({ ...s, labor: { ...s.labor, difficulty: v } }))} /></Field>
          {(isCW ? ['steel', 'vents', 'stoolTrim', 'ft', 'wlDl'] : ['steel', 'vents', 'open']).map((k) => (
            <Field key={k} label={{ steel: 'Steel', vents: 'Vents', open: 'Open item', stoolTrim: 'Stool trim', ft: 'F/T', wlDl: 'WL/DL' }[k]}>
              <NumInput min={0} value={extra[k] ?? 0} onChange={(v) => setExtra(k, v)} />
            </Field>
          ))}
        </div>
      </Section>
    </>
  );
}

// ── Brake metal ──────────────────────────────────────────────────────────────

export function BrakePanel({ spec, update, frameResult }) {
  const list = spec.brakeMetal ?? [];
  const set = (i, patch) => update((s) => ({ ...s, brakeMetal: s.brakeMetal.map((b, k) => (k === i ? { ...b, ...patch } : b)) }));
  const resolved = frameResult?.bom?.brakeMetal ?? [];
  return (
    <Section title="Brake metal (per frame)" right={<button type="button" className="fbv1-btn ghost" onClick={() => update((s) => ({ ...s, brakeMetal: [...s.brakeMetal, newBrakePiece()] }))}>+ Piece</button>}>
      <div className="fbv1-sub">Length follows the frame edge unless you type one. Sill flashing skips door openings.</div>
      {list.map((b, i) => (
        <div key={b.id ?? i} className="fbv1-card">
          <div className="fbv1-grid2">
            <Field label="Description" wide><TextInput value={b.description} onChange={(v) => set(i, { description: v })} /></Field>
            <Field label="Edge"><Select value={b.edge ?? ''} onChange={(v) => set(i, { edge: v || null })} options={[{ value: '', label: 'Typed length' }, { value: 'sill', label: 'Sill' }, { value: 'head', label: 'Head' }, { value: 'jambs', label: 'Both jambs' }, { value: 'jambL', label: 'Left jamb' }, { value: 'jambR', label: 'Right jamb' }, { value: 'perimeter', label: 'Perimeter' }]} /></Field>
            <Field label="Length"><DimInput allowEq placeholder={resolved[i] ? formatFeetInches(resolved[i].length) : 'from edge'} value={b.length} onChange={(v) => set(i, { length: v })} /></Field>
            <Field label="Girth"><DimInput feet={false} value={b.girth} onChange={(v) => set(i, { girth: v })} /></Field>
            <Field label="Qty"><NumInput min={0} value={b.qty} onChange={(v) => set(i, { qty: v })} /></Field>
            <Field label="Brakes"><NumInput min={0} value={b.bends} onChange={(v) => set(i, { bends: v })} /></Field>
            <Field label="Hems"><NumInput min={0} value={b.hems} onChange={(v) => set(i, { hems: v })} /></Field>
            <Field label="Gauge"><TextInput value={b.gauge} onChange={(v) => set(i, { gauge: v })} /></Field>
            <Field label="Finish"><TextInput value={b.finish} placeholder={spec.finish} onChange={(v) => set(i, { finish: v })} /></Field>
          </div>
          <button type="button" className="fbv1-btn ghost danger" onClick={() => update((s) => ({ ...s, brakeMetal: s.brakeMetal.filter((_, k) => k !== i) }))}>Remove</button>
        </div>
      ))}
    </Section>
  );
}

// ── Takeoff (this frame) ─────────────────────────────────────────────────────

export function TakeoffPanel({ frameResult }) {
  const b = frameResult?.bom;
  if (!b) return <div className="fbv1-empty small">{frameResult?.error ?? 'No takeoff.'}</div>;
  return (
    <>
      {b.warnings.length > 0 && (
        <Section title={`Check (${b.warnings.length})`}>
          <ul className="fbv1-warnlist">{b.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Section>
      )}
      <Section title={`Metal — ${r2(b.totals.metalLF)} LF per frame`}>
        <table className="fbv1-table compact">
          <thead><tr><th>Qty</th><th>Die</th><th>Role</th><th>Length</th><th>Note</th></tr></thead>
          <tbody>{groupMetal(b.metal).map((m) => <tr key={m.key}><td>{m.qty}</td><td>{m.die ?? '—'}</td><td>{m.roleLabel}</td><td>{formatInches(m.length)}</td><td className="fbv1-meta">{m.note}</td></tr>)}</tbody>
        </table>
        {b.doorPackageMembers.length > 0 && <div className="fbv1-meta">In the vendor door package: {b.doorPackageMembers.map((p) => `${p.role} ${formatInches(p.length)}`).join(', ')}</div>}
      </Section>
      <Section title={`Glass — ${b.totals.lites} lites · ${b.totals.glassSf} SF · ${Math.round(b.totals.glassLb)} lb`}>
        <table className="fbv1-table compact">
          <thead><tr><th>Lite</th><th>Type</th><th>Order size</th><th>Block</th><th>SF</th></tr></thead>
          <tbody>{b.glass.filter((g) => g.ordered).map((g) => <tr key={g.key}><td>{g.tag}</td><td>{g.glassMark}{g.tempered ? ' (T)' : ''}</td><td>{formatInches(g.orderW)} × {formatInches(g.orderH)}</td><td>{g.blockW} × {g.blockH}</td><td>{g.billingSf}</td></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Accessories">
        <table className="fbv1-table compact">
          <thead><tr><th>Item</th><th>Part</th><th>Qty</th><th>Rule</th></tr></thead>
          <tbody>{b.accessories.map((a, i) => <tr key={i}><td>{a.label}</td><td>{a.part ?? '—'}</td><td>{a.qty} {a.unit}</td><td className="fbv1-meta">{a.note}</td></tr>)}</tbody>
        </table>
      </Section>
    </>
  );
}

function groupMetal(metal) {
  const m = new Map();
  for (const x of metal) {
    const k = `${x.die}|${x.role}|${Math.round(x.length * 16)}|${x.note}`;
    if (!m.has(k)) m.set(k, { ...x, key: k, qty: 0 });
    m.get(k).qty += 1;
  }
  return [...m.values()];
}

// ── Job settings ─────────────────────────────────────────────────────────────

export function JobPanel({ takeoff, store }) {
  const c = takeoff.company ?? {}; const rules = { ...DEFAULT_RULES, ...(c.rules ?? {}) }; const lab = takeoff.labor ?? {};
  const setC = (patch) => store.updateTakeoff((tp) => ({ ...tp, company: { ...tp.company, ...patch } }));
  const setR = (k, v) => store.updateTakeoff((tp) => ({ ...tp, company: { ...tp.company, rules: { ...(tp.company?.rules ?? {}), [k]: v } } }));
  const setL = (patch) => store.updateTakeoff((tp) => ({ ...tp, labor: { ...tp.labor, ...patch } }));
  return (
    <>
      <Section title="Frame sets">
        <table className="fbv1-table compact">
          <thead><tr><th>Set</th><th>Lift line AFF</th><th>Difficulty</th><th>Frames</th></tr></thead>
          <tbody>
            {Object.entries(takeoff.frameSets ?? {}).map(([name, fs]) => (
              <tr key={name}>
                <td><TextInput value={name} onChange={(v) => store.renameFrameSet(name, v)} /></td>
                <td><DimInput allowEq placeholder="none" value={fs.liftLine} onChange={(v) => store.setFrameSet(name, { liftLine: v })} /></td>
                <td><NumInput step={0.05} min={0.1} value={fs.difficulty ?? 1} onChange={(v) => store.setFrameSet(name, { difficulty: v })} /></td>
                <td>{takeoff.frames.filter((f) => f.frameSet === name).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Company rules">
        <Field label="Door framing" wide>
          <Seg value={c.doorFramingBy ?? 'vendor'} onChange={(v) => setC({ doorFramingBy: v })}
            options={[{ value: 'vendor', label: 'Vendor door package (we take fillers)' }, { value: 'glazier', label: 'Glazier frames the door' }]} />
        </Field>
        <Check checked={c.temperAllMonolithic !== false} onChange={(v) => setC({ temperAllMonolithic: v })} label="Temper all monolithic glass (no plate)" />
        <div className="fbv1-grid2">
          <Field label="Saw kerf"><DimInput feet={false} value={rules.kerfIn} onChange={(v) => setR('kerfIn', v)} /></Field>
          <Field label="Bar end trim (each end)"><DimInput feet={false} value={rules.endTrimIn} onChange={(v) => setR('endTrimIn', v)} /></Field>
          <Field label="Setting blocks / lite"><NumInput min={0} value={rules.settingBlocksPerLite} onChange={(v) => setR('settingBlocksPerLite', v)} /></Field>
          <Field label="Side blocks / lite"><NumInput min={0} value={rules.sideBlocksPerLite} onChange={(v) => setR('sideBlocksPerLite', v)} /></Field>
          <Field label="Screws / spline joint"><NumInput min={0} value={rules.screwsPerSplineJoint} onChange={(v) => setR('screwsPerSplineJoint', v)} /></Field>
          <Field label="Screws / shear block"><NumInput min={0} value={rules.screwsPerShearBlock} onChange={(v) => setR('screwsPerShearBlock', v)} /></Field>
          <Field label="Anchor spacing"><DimInput feet={false} value={rules.anchorSpacingIn} onChange={(v) => setR('anchorSpacingIn', v)} /></Field>
          <Field label="PP screw spacing"><DimInput feet={false} value={rules.ppFastenerSpacingIn} onChange={(v) => setR('ppFastenerSpacingIn', v)} /></Field>
          <Field label="Exterior beads"><NumInput min={0} value={rules.beadsExterior} onChange={(v) => setR('beadsExterior', v)} /></Field>
          <Field label="Interior beads"><NumInput min={0} value={rules.beadsInterior} onChange={(v) => setR('beadsInterior', v)} /></Field>
        </div>
      </Section>
      <Section title="Labor & lift">
        <div className="fbv1-grid2">
          <Field label="Lift factor" hint="× field hours above the line"><NumInput step={0.05} min={1} value={lab.liftFactor ?? 1.25} onChange={(v) => setL({ liftFactor: v })} /></Field>
          <Field label="Job difficulty"><NumInput step={0.05} min={0.1} value={lab.jobDifficulty ?? 1} onChange={(v) => setL({ jobDifficulty: v })} /></Field>
          <Field label="Lift type"><Select value={lab.liftType ?? 'scissor'} onChange={(v) => setL({ liftType: v })} options={Object.entries(DEFAULT_LIFT_RATES).map(([k, r]) => ({ value: k, label: r.label }))} /></Field>
          <Field label="Crew on lift"><NumInput min={1} value={lab.crew ?? 2} onChange={(v) => setL({ crew: v })} /></Field>
          <Field label="Hours / day"><NumInput min={1} value={lab.hoursPerDay ?? 8} onChange={(v) => setL({ hoursPerDay: v })} /></Field>
        </div>
      </Section>
    </>
  );
}

export { describePart };
