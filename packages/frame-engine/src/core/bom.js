/**
 * bom.js — one solved frame → takeoff lines (per frame, ×1).
 *
 *   metal       die-level cut pieces (incl. CW pressure plates / covers / isolators,
 *               stick receptors, door-jamb snap-in fillers), spliced to stock
 *   glass       per-lite schedule (glass.js)
 *   accessories counted from the real joint topology
 *   doors       door schedule + hardware placeholders (vendor-quoted package)
 *   brakeMetal  per piece (girth / bends / hems / length)
 *   counts      labor drivers for laborCalcEngine, split at the lift line
 *
 * Quantities here are PER FRAME.  takeoff.js multiplies by frame quantity and
 * aggregates across frame sets.
 */

import { num, r4, formatInches } from './units.js';
import { METAL_ROLES, ACCESSORY_ROLES, DEFAULT_RULES, describePart } from './library.js';
import { solveFrame } from './geometry.js';
import { evaluateGlass } from './glass.js';
import { doorGeometry, doorHardware, handingLabel, HARDWARE_PRESETS } from './doors.js';
import { splitForStock } from './optimizer.js';
import { brakePieces } from './brakeMetal.js';

const EPS = 1e-6;

/**
 * @param {object} spec      FrameSpec
 * @param {object} project   { glassTypes, defaultGlassTypeId, company: { doorFramingBy, temperAllMonolithic, rules }, customSystems, frameSets }
 */
export function buildFrameTakeoff(spec, project = {}) {
  const solved = solveFrame(spec, { customSystems: project.customSystems });
  const { es } = solved;
  const company = { doorFramingBy: 'vendor', ...(project.company ?? {}) };
  const rules = { ...DEFAULT_RULES, ...(project.company?.rules ?? {}), ...(spec.overrides?.rules ?? {}) };
  const warnings = [...solved.warnings];
  const fam = es.family;
  const joinery = es.joinery;
  const isCW = fam === 'curtainwall';
  const doorCols = solved.columns.filter((c) => c.kind === 'door').map((c) => c.index);
  const nCols = solved.columns.length;

  // ── Metal pieces ──
  const metal = [];
  const dieFor = (role) => es.dies[role] ?? null;
  const usable = es.stockLengthIn - 2 * rules.endTrimIn;
  const pushMetal = (role, length, note, extra = {}) => {
    if (!(length > EPS)) return;
    const parts = splitForStock(length, usable);
    parts.forEach((L, i) => metal.push({
      role, roleLabel: METAL_ROLES[role]?.label ?? role, die: extra.die ?? dieFor(role), length: L,
      note: [note, parts.length > 1 ? `spliced ${i + 1}/${parts.length} (run ${formatInches(length)})` : null].filter(Boolean).join(' · '),
      orient: extra.orient, y0: extra.y0, y1: extra.y1, x0: extra.x0, x1: extra.x1, member: extra.member, perimeter: !!extra.perimeter,
    }));
  };

  const vendorDoorFraming = company.doorFramingBy !== 'glazier';
  const doorPackageMembers = [];
  for (const p of solved.pieces) {
    let role = p.role === 'doorHeader' ? 'horizontal' : p.role;
    if (p.role === 'doorHeader' && vendorDoorFraming) { doorPackageMembers.push({ ...p, reason: 'door header — in door package' }); continue; }
    // a perimeter jamb that frames only a door (door in an end bay) is the vendor's door jamb
    if (vendorDoorFraming && p.perimeter && p.role === 'jamb') {
      const leftEnd = Math.min(p.x0, p.x1) < solved.width / 2;
      const c = leftEnd ? 0 : nCols - 1;
      if (doorCols.includes(c) && solved.columns[c].rows.length === 0) { doorPackageMembers.push({ ...p, reason: 'door jamb — in door package' }); continue; }
    }
    if (isCW && joinery === 'ssg_2side' && p.orient === 'v' && es.dies.ssgMullion && !p.perimeter) {
      pushMetal('mullion', p.length, `${p.note || ''} · SSG mullion`.replace(/^ · /, ''), { die: es.dies.ssgMullion, ...p });
      continue;
    }
    pushMetal(role, p.length, p.note, { orient: p.orient, y0: p.y0, y1: p.y1, x0: p.x0, x1: p.x1, member: p.member, perimeter: p.perimeter });
  }

  // CW: pressure plate / cover / isolator per framing piece (same length)
  if (isCW && joinery !== 'unitized') {
    const framing = metal.filter((m) => ['jamb', 'head', 'sill', 'mullion', 'horizontal'].includes(m.role));
    for (const m of framing) {
      const ssgEdge = joinery === 'ssg_4side' || (joinery === 'ssg_2side' && m.orient === 'v');
      if (ssgEdge) continue;
      const perim = m.perimeter;
      pushMetal('pressurePlate', m.length, `${perim ? 'perimeter ' : ''}${m.roleLabel.toLowerCase()} PP`, { die: (perim ? es.dies.pressurePlatePerimeter : null) ?? es.dies.pressurePlate, orient: m.orient, y0: m.y0, y1: m.y1 });
      pushMetal('cover', m.length, `${m.roleLabel.toLowerCase()} cover`, { die: es.dies.cover, orient: m.orient, y0: m.y0, y1: m.y1 });
      if (es.dies.thermalIsolator) pushMetal('thermalIsolator', m.length, `${m.roleLabel.toLowerCase()} isolator`, { die: es.dies.thermalIsolator, orient: m.orient, y0: m.y0, y1: m.y1 });
    }
  }

  // Door-jamb snap-in filler: each door side framed by a shared mullion (or any side when glazier owns door framing)
  for (const d of solved.doors) {
    // a side needs the filler when that door-jamb member is ours: a shared mullion, a perimeter
    // jamb that also frames a transom above the door, or when the glazier owns door framing
    const hasTransom = solved.columns[d.col].rows.length > 0;
    const sides = [];
    if (d.col > 0 || hasTransom || !vendorDoorFraming) sides.push('L');
    if (d.col < nCols - 1 || hasTransom || !vendorDoorFraming) sides.push('R');
    for (const s of sides) pushMetal('doorJambFiller', d.height, `open-back door jamb — ${s === 'L' ? 'left' : 'right'} of door bay ${d.col + 1}`, { orient: 'v', y0: 0, y1: d.height });
  }

  // Stick system: subsill (sill receptor) under each sill run + head receptor
  const sillRuns = sillRunsOf(solved);
  if (joinery === 'stick_receptor') {
    sillRuns.forEach((r) => pushMetal('subsill', r.length, 'sill receptor — run between door openings', { orient: 'h', y0: 0, y1: 0 }));
    if (solved.outline.template === 'rect') pushMetal('headReceptor', solved.width, 'head receptor — full frame width', { orient: 'h', y0: solved.height, y1: solved.height });
    else warnings.push('Head receptor on a shaped head — add it manually (curved / sloped receptor).');
  }

  // ── Glass ──
  const glass = evaluateGlass(solved, project);

  // ── Joint connections ──
  const conn = jointConnections(solved);

  // ── Accessories ──
  const acc = [];
  const pushAcc = (role, qty, note) => {
    if (!(qty > EPS)) return;
    acc.push({ role, label: ACCESSORY_ROLES[role]?.label ?? role, unit: ACCESSORY_ROLES[role]?.unit ?? 'ea',
      part: es.accessories[role] ?? null, qty: ACCESSORY_ROLES[role]?.unit === 'LF' ? r4(qty) : Math.ceil(qty - 1e-9), note });
  };
  const ordered = glass.filter((g) => g.ordered);
  pushAcc('settingBlock', ordered.length * rules.settingBlocksPerLite, `${rules.settingBlocksPerLite} per lite`);
  pushAcc('sideBlock', ordered.length * rules.sideBlocksPerLite, `${rules.sideBlocksPerLite} per lite`);
  if (joinery === 'screw_spline' || joinery === 'stick_receptor') {
    pushAcc('assemblyScrew', conn.hEnds * rules.screwsPerSplineJoint, `${rules.screwsPerSplineJoint} per horizontal end (${conn.hEnds} ends)`);
  }
  if (joinery === 'shear_block' || isCW) {
    pushAcc('shearBlock', conn.hEndsInterior, `1 per intermediate-horizontal end (${conn.hEndsInterior})`);
    pushAcc('shearBlockHS', conn.hEndsPerimeter, `1 per head / sill end (${conn.hEndsPerimeter})`);
    pushAcc('assemblyScrew', (conn.hEndsInterior + conn.hEndsPerimeter) * rules.screwsPerShearBlock, `${rules.screwsPerShearBlock} per shear block`);
  }
  const sillRunCount = joinery === 'stick_receptor' ? sillRuns.length : sillRuns.length;
  if (!isCW) {
    pushAcc('endDam', sillRunCount * rules.endDamsPerSill, `${rules.endDamsPerSill} per sill run (${sillRunCount})`);
    pushAcc('endDamScrew', sillRunCount * rules.endDamsPerSill * rules.endDamScrewsPerEndDam, `${rules.endDamScrewsPerEndDam} per end dam`);
    if (rules.waterDeflectorsPerSillEnd > 0) pushAcc('waterDeflector', sillRunCount * 2 * rules.waterDeflectorsPerSillEnd, 'per sill end');
  }
  const capturedGlassLF = ordered.reduce((s, g) => s + (g.perimeterIn / 12 - g.ssgLF), 0);
  pushAcc('gasketInterior', capturedGlassLF, 'captured glass edges');
  pushAcc('gasketExterior', capturedGlassLF, 'captured glass edges');
  const ssgLF = ordered.reduce((s, g) => s + g.ssgLF, 0);
  if (ssgLF > 0) {
    pushAcc('structuralSilicone', ssgLF, 'SSG glass edges');
    pushAcc('ssgSpacer', ssgLF, 'SSG glass edges');
  }
  if (isCW) {
    const ppLF = metal.filter((m) => m.role === 'pressurePlate').reduce((s, m) => s + m.length, 0) / 12;
    pushAcc('ppFastener', (ppLF * 12) / rules.ppFastenerSpacingIn, `@ ${rules.ppFastenerSpacingIn}" o.c. on ${r4(ppLF)} LF of PP`);
    pushAcc('zonePlug', conn.hEndsInterior * rules.zonePlugsPerJoint, 'per horizontal end');
    pushAcc('gasketPerimeter', perimeterCaulkLF(solved) , 'frame perimeter');
  }
  // perimeter: anchors, shims, sealant, backer
  const perimPieces = metal.filter((m) => m.perimeter && ['jamb', 'head', 'sill'].includes(m.role));
  const anchors = perimPieces.reduce((s, m) => s + Math.max(rules.anchorMinPerMember, Math.ceil(m.length / rules.anchorSpacingIn - 1e-9) + 1), 0);
  pushAcc('anchor', anchors, `@ ${rules.anchorSpacingIn}" o.c., min ${rules.anchorMinPerMember} per member`);
  pushAcc('shim', anchors * rules.shimsPerAnchor, 'per anchor');
  const caulkLF = perimeterCaulkLF(solved);
  pushAcc('sealantExterior', caulkLF * rules.beadsExterior, `${rules.beadsExterior} bead(s) × ${r4(caulkLF)} LF perimeter (door thresholds excluded)`);
  pushAcc('sealantInterior', caulkLF * rules.beadsInterior, `${rules.beadsInterior} bead(s)`);
  pushAcc('backerRod', caulkLF * rules.beadsExterior, 'behind exterior sealant');

  // ── Doors ──
  const doors = solved.doors.map((d, i) => {
    const ds = d.spec ?? {};
    const geo = doorGeometry(ds, d.width, d.height);
    warnings.push(...geo.warnings.map((w) => `Door bay ${d.col + 1}: ${w}`));
    return {
      col: d.col, mark: ds.mark || `${spec.mark || 'F'}-D${i + 1}`,
      kind: ds.kind, leaves: geo.leaves,
      openingW: r4(d.width), openingH: r4(d.height), x0: d.x0, x1: d.x1,
      geometry: geo, swing: ds.swing, handing: ds.handing, activeLeaf: ds.activeLeaf, handingLabel: handingLabel(ds),
      stile: ds.stile, topRail: ds.topRail, bottomRail: ds.bottomRail, midRail: ds.midRail,
      glassTypeId: ds.glassTypeId ?? spec.glass.frameDefault ?? project.defaultGlassTypeId ?? null,
      hardwarePreset: ds.hardwarePreset, hardwarePresetLabel: HARDWARE_PRESETS[ds.hardwarePreset]?.label ?? 'Custom',
      hardware: doorHardware(ds), threshold: ds.threshold !== false, notes: ds.notes ?? '',
      finish: spec.finish,
    };
  });

  // ── Brake metal ──
  const brake = brakePieces(spec.brakeMetal, solved);

  // ── Labor drivers ──
  const counts = laborCounts(solved, glass, metal, conn, brake, spec, project);

  return {
    spec: solved.spec, solved, warnings: [...new Set(warnings)],
    system: { id: es.sys.id, name: es.sys.name, manufacturer: es.sys.manufacturer, family: fam, joinery, laborType: es.sys.laborType, systemType: es.sys.systemType, stockLengthIn: es.stockLengthIn, dieMatch: es.sys.dieMatch },
    metal: metal.map((m, i) => ({ ...m, id: `M${i + 1}`, description: describePart(m.die) })),
    doorPackageMembers,
    glass, accessories: acc, doors, brakeMetal: brake, counts, connections: conn,
    totals: {
      metalPieces: metal.length,
      metalLF: r4(metal.reduce((s, m) => s + m.length, 0) / 12),
      lites: ordered.length,
      glassSf: r4(ordered.reduce((s, g) => s + g.actualSf, 0)),
      billingSf: r4(ordered.reduce((s, g) => s + g.billingSf, 0)),
      glassLb: r4(ordered.reduce((s, g) => s + g.weightLb, 0)),
      frameSf: r4(solved.outline.poly.length ? Math.abs(areaOf(solved.outline.poly)) / 144 : 0),
      glassAreaRatio: r4(ordered.filter((g) => g.glassKind === 'vision').reduce((s, g) => s + g.dloW * g.dloH, 0) / Math.max(1, Math.abs(areaOf(solved.outline.poly)))),
      perimeterLF: r4(solved.outline.perimeterIn / 12),
      doorLeaves: doors.reduce((s, d) => s + d.leaves, 0),
    },
  };
}

function areaOf(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

/** Contiguous sill runs (perimeter sill pieces merged across vertical faces, broken at doors / steps). */
function sillRunsOf(solved) {
  const sills = solved.pieces.filter((p) => p.perimeter && p.role === 'sill').map((p) => [Math.min(p.x0, p.x1), Math.max(p.x0, p.x1)]).sort((a, b) => a[0] - b[0]);
  const vs = solved.verticals;
  const runs = [];
  for (const [a, b] of sills) {
    const last = runs[runs.length - 1];
    // two sill pieces belong to one run when only a mullion separates them
    if (last && a - last[1] <= Math.max(0, ...vs.map((v) => v.sl)) + 0.01 && vs.some((v) => v.x > last[1] - EPS && v.x < a + EPS)) last[1] = b;
    else runs.push([a, b]);
  }
  // extend to the outside edges where a jamb stands on the run
  return runs.map(([a, b]) => ({ x0: a, x1: b, length: b - a }));
}

/** Perimeter caulk LF: outline perimeter less door openings along the sill. */
function perimeterCaulkLF(solved) {
  const doorW = solved.doors.reduce((s, d) => s + d.width, 0);
  return Math.max(0, solved.outline.perimeterIn - doorW) / 12;
}

/**
 * Count member-to-member connections from the joint list.
 *   hEnds          horizontal ends stopping against a vertical (shear block / screw spline joints)
 *   hEndsPerimeter … of head / sill members
 *   hEndsInterior  … of intermediate horizontals
 *   vEnds          vertical ends stopping against a horizontal
 *   total          all connections (labor "joints")
 */
export function jointConnections(solved) {
  let hEndsPerimeter = 0; let hEndsInterior = 0; let vEnds = 0;
  // perimeter pieces of ONE edge (the sill or head the vertical lands on) that end at x
  const perimEndsAt = (edgeKey, x, tol) => solved.pieces.filter((p) => p.perimeter && p.member === edgeKey
    && (Math.abs(p.x0 - x) < tol || Math.abs(p.x1 - x) < tol)).length;
  const byJoint = [];
  for (const j of solved.joints) {
    let h = 0; let v = 0; let hp = false;
    switch (j.type) {
      case 'corner': if (j.owner === 'h') v = 1; else { h = 1; hp = true; } break;
      case 'miter': h = 1; hp = true; break;
      case 'vPerim': {
        const vl = solved.verticals.find((x) => `${x.key}:bot` === j.key || `${x.key}:top` === j.key);
        const edgeKey = (j.members ?? [])[1];
        if (j.owner === 'h') v = 1; else { h = perimEndsAt(edgeKey, j.x - (vl?.sl ?? 0) / 2, 1e-3) + perimEndsAt(edgeKey, j.x + (vl?.sl ?? 0) / 2, 1e-3); hp = true; }
        break;
      }
      case 'vOnH': v = 1; break;
      case 'tee': if (j.owner === 'h') v = 2; else h = 1; break;
      case 'cross': if (j.owner === 'h') v = 2; else h = 2; break;
      case 'hPerim': if (j.owner === 'h') v = 2; else h = 1; break;
      default: break;
    }
    // door header ends are the vendor's (door package) — still a field joint, not a shear block
    const isDH = (j.members ?? []).some((m) => String(m).startsWith('DH'));
    if (hp) hEndsPerimeter += h; else if (!isDH) hEndsInterior += h;
    if (!isDH) vEnds += v;
    // door-header joints belong to the vendor's door package (installed under door labor)
    byJoint.push({ key: j.key, type: j.type, owner: j.owner, x: j.x, y: j.y, h: isDH ? 0 : h, v: isDH ? 0 : v });
  }
  const hEnds = hEndsPerimeter + hEndsInterior;
  return { hEnds, hEndsPerimeter, hEndsInterior, vEnds, total: hEnds + vEnds, byJoint };
}

/**
 * Labor drivers in laborCalcEngine's input shape, split below / above the lift line.
 * "Anything touching above = lift": an item counts as lift when ANY part of it is
 * above the line.
 */
export function laborCounts(solved, glass, metal, conn, brake, spec, project = {}) {
  const lineAFF = spec.liftLine ?? project.frameSets?.[spec.frameSet]?.liftLine ?? null;
  const yLine = lineAFF == null ? Infinity : lineAFF - solved.sillAFF;
  const above = (yTop) => yTop > yLine + 1e-6;
  const isCW = solved.es.family === 'curtainwall';
  const blank = () => ({ bays: 0, rows: 0, panels: 0, joints: 0, perimeter: 0, singles: 0, pairs: 0,
    verticals: 0, horizontals: 0, brakeMetal: 0, ssg: 0, subsills: 0 });
  const lo = blank(); const hi = blank();
  const pick = (yTop) => (above(yTop) ? hi : lo);

  // bays (columns): top of the column
  for (const c of solved.columns) pick(c.under + solved.es.profiles.head.sightline).bays += 1;
  // rows: count of rows (for CW formula) — use the tallest column's rows
  lo.rows = Math.max(...solved.columns.map((c) => c.rows.length || 1));
  // lites
  for (const g of glass) if (g.ordered) pick(g.topAFF - solved.sillAFF).panels += 1;
  // joints
  for (const j of conn.byJoint) pick(j.y).joints += j.h + j.v;
  // members (CW verticals / horizontals = framing pieces)
  for (const m of metal) {
    if (!['jamb', 'mullion', 'head', 'sill', 'horizontal'].includes(m.role)) continue;
    const top = Math.max(num(m.y0, 0), num(m.y1, 0));
    if (m.orient === 'v') pick(top).verticals += 1; else pick(top).horizontals += 1;
  }
  // perimeter LF per outline edge (door openings excluded at the sill)
  for (const e of solved.outline.edges) {
    const top = Math.max(e.a[1], e.b[1], ...(e.pts ?? []).map((p) => p[1]));
    let L = e.length;
    if (e.role === 'sill') L -= solved.doors.reduce((s, d) => s + d.width, 0);
    pick(top).perimeter += Math.max(0, L) / 12;
  }
  // doors
  for (const d of solved.doors) {
    const t = pick(d.height);
    if (d.spec?.kind === 'pair') t.pairs += 1; else t.singles += 1;
  }
  for (const b of brake) pick(b.yTop ?? 0).brakeMetal += b.qty;
  lo.ssg = glass.reduce((s, g) => s + (g.ssgLF > 0 ? 1 : 0), 0);
  const extra = spec.labor?.extra ?? {};
  for (const k of ['steel', 'vents', 'open', 'stoolTrim', 'ft', 'wlDl']) if (extra[k]) lo[k] = num(extra[k], 0);
  if (solved.es.joinery === 'stick_receptor') lo.subsills = 1; else if (solved.es.sys.systemType === 'Int SF') lo.subsills = 0;
  hi.subsills = 0;
  lo.perimeter = r4(lo.perimeter); hi.perimeter = r4(hi.perimeter);
  return { below: lo, above: hi, liftLineAFF: lineAFF, isCW, hasLift: Object.entries(hi).some(([k, v]) => k !== 'subsills' && v > 0) };
}
