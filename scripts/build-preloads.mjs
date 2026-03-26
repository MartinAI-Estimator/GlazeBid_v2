/**
 * build-preloads.mjs
 *
 * Compiles the Electron main process and both app preload scripts using
 * esbuild.  Output: CJS bundles that Electron can load directly.
 *
 * Runs automatically via the predev:builder / predev:studio npm lifecycle hooks.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Ensure output directories exist
fs.mkdirSync(path.join(root, 'dist-electron'),              { recursive: true });
fs.mkdirSync(path.join(root, 'apps/builder/dist-electron'), { recursive: true });
fs.mkdirSync(path.join(root, 'apps/studio/dist-electron'),  { recursive: true });

await Promise.all([
  // Electron main process (TypeScript)
  build({
    entryPoints: [path.join(root, 'electron/main.ts')],
    bundle:      true,
    platform:    'node',
    target:      'node18',
    outfile:     path.join(root, 'dist-electron/main.js'),
    external:    ['electron', 'better-sqlite3'],
    format:      'cjs',
    logLevel:    'silent',
  }),

  // Builder preload (vanilla JS — legacy builder)
  build({
    entryPoints: [path.join(root, 'apps/builder/electron/preload.js')],
    bundle:      true,
    platform:    'node',
    target:      'node18',
    outfile:     path.join(root, 'apps/builder/dist-electron/preload.js'),
    external:    ['electron'],
    format:      'cjs',
    logLevel:    'silent',
  }),

  // Studio preload (TypeScript)
  build({
    entryPoints: [path.join(root, 'apps/studio/src/preload/index.ts')],
    bundle:      true,
    platform:    'node',
    target:      'node18',
    outfile:     path.join(root, 'apps/studio/dist-electron/preload.js'),
    external:    ['electron'],
    format:      'cjs',
    logLevel:    'silent',
  }),
]);

console.log('✔ Electron main + preloads compiled');
