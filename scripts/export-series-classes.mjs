// export-series-classes.mjs — Frame Builder SYSTEM_LIBRARY → sidecar/knowledge/series_classes.json
//
// The takeoff classifier and Frame Builder must agree on what a series is.
// Frame Builder's library is the source; this exports it for the Python sidecar.
// Martin, 2026-10-03: Kawneer + Tubelite only (other makers map to the nearest
// equivalent and get flagged).
//
//   node scripts/export-series-classes.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEM_LIBRARY } from '../packages/frame-engine/src/core/library.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// systemType → takeoff scope class
const CLASS = { 'Ext SF': 'ext_sf', 'Int SF': 'int_sf', 'Cap CW': 'ext_cw', 'SSG CW': 'ext_cw' };

// Extra names architects actually print, per library id.
const EXTRA_ALIASES = {
  'kawneer-450': ['TRIFAB 450', 'TRIFAB VG 450'],
  'kawneer-451': ['TRIFAB 451', 'TRIFAB VG 451'],
  'kawneer-451t': ['TRIFAB 451T', 'TRIFAB VG 451T', '451T'],
  'kawneer-451ut': ['TRIFAB 451UT', '451UT'],
  'kawneer-601': ['TRIFAB 601'],
  'kawneer-601t': ['TRIFAB 601T', '601T'],
  'kawneer-601ut': ['TRIFAB 601UT', '601UT'],
  'kawneer-501t-ir': ['IR 501T', 'IR501T', '501T'],
  'kawneer-1600-6': ['1600 WALL', '1600WALL', '1600 SYSTEM 1', '1600 SYSTEM1'],
  'kawneer-1600-75': ['1600 WALL SYSTEM 2', '1600 SYSTEM 2', '1600 SYSTEM2'],
  'kawneer-1600ut': ['1600UT', '1600 UT', '1600 UT SYSTEM'],
  'kawneer-1620': ['1620', '1620 SSG', '1620UT'],
  'tubelite-450': ['4500'],
  'tubelite-451': ['E14000', '14000'],
  'tubelite-451t': ['T14000'],
  'tubelite-451ut': ['TU14000'],
  'tubelite-601': ['E24650', '24650'],
  'tubelite-601t': ['T24650'],
  'tubelite-601ut': ['TU24650'],
  'tubelite-501t-ir': ['T34000', 'T34000 IR'],
  'tubelite-1600-6': ['400CW', '400 CW', '400 CURTAIN WALL', '400 SERIES'],
  'tubelite-1600-75': ['400CW', '400 CURTAIN WALL'],
  'tubelite-1600ut': ['400CW UT', '400 UT'],
  'tubelite-1620': ['200 SERIES', '200CW', '200 CURTAIN WALL'],
};

// A bare number ("450", "1600", "4500") is only trusted next to the maker's name
const needsContext = (a) => /^\d+[A-Z]*$/.test(a.replace(/\s/g, ''));

const systems = SYSTEM_LIBRARY
  .filter((s) => s.manufacturer === 'Kawneer' || s.manufacturer === 'Tubelite')
  .map((s) => {
    const aliases = [...new Set([s.series.toUpperCase(), ...(EXTRA_ALIASES[s.id] || [])])];
    return {
      id: s.id,
      manufacturer: s.manufacturer,
      series: s.series,
      name: s.name,
      system_type: s.systemType,
      family: s.family,
      scope_class: CLASS[s.systemType] || 'ext_sf',
      ssg_capable: /1620|SSG|200 Series/i.test(s.name),
      aliases: aliases.map((a) => ({ text: a, needs_manufacturer_context: needsContext(a) })),
    };
  });

const out = {
  _generated_by: 'scripts/export-series-classes.mjs from packages/frame-engine/src/core/library.js',
  _rule: 'Series code is the decisive SF vs CW signal when present. Never classify from panel size when a series is named.',
  window_wall: { status: 'pending', note: 'Martin will supply Kawneer/Tubelite window wall series later (2026-10-03).' },
  systems,
};
const path = join(root, 'sidecar', 'knowledge', 'series_classes.json');
writeFileSync(path, JSON.stringify(out, null, 1));
console.log(`wrote ${path} (${systems.length} systems)`);
