/**
 * saveSortedFiles.js — ZIP-Free Local Export (File System Access API)
 *
 * Uses window.showDirectoryPicker() to write sorted project documents
 * directly to a local folder chosen by the estimator (e.g. an Egnyte
 * mapped drive) — no ZIP download, no manual unzipping.
 *
 * Folder structure written:
 *   <chosen root>/
 *     Drawings/
 *       Architectural/   ← drawing files the backend labelled 'Architectural'
 *       Structural/      ← drawing files labelled 'Structural'
 *       Other/           ← drawing files labelled anything else
 *     Specs/             ← every spec file (Division 08, etc.)
 *
 * Browser support: Chrome/Edge 86+.  Firefox and Safari do NOT support
 * showDirectoryPicker as of 2026 — call isFileSystemAccessSupported() first.
 */

// ─── Capability check ───────────────────────────────────────────────────────

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Creates or opens nested subdirectories and returns the deepest handle.
 * @param {FileSystemDirectoryHandle} root
 * @param {...string} parts  e.g. 'Drawings', 'Architectural'
 */
async function getOrCreateDir(root, ...parts) {
  let handle = root;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, { create: true });
  }
  return handle;
}

/**
 * Writes a browser File object into a FileSystemDirectoryHandle.
 * Overwrites if a file with the same name already exists.
 */
async function writeFileToDisk(dirHandle, file) {
  const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Prompts the user to pick a local folder, then writes all sorted files
 * into discipline sub-directories under that root.
 *
 * @param {File[]}  drawingFiles    Original File objects from the Drawings zone
 * @param {File[]}  specFiles       Original File objects from the Specs zone
 * @param {Object}  fileCategories  { filename → 'Architectural'|'Structural'|'Specs'|... }
 *                                  Returned by the backend in process-intake response.
 * @param {Function} onProgress     Called with { done, total, current: filename }
 *                                  after each file is written.
 *
 * @returns {Promise<{folder:string, drawingsWritten:number, specsWritten:number, total:number}|null>}
 *          null if the user cancelled the directory picker.
 *
 * @throws {Error} if the browser does not support the File System Access API.
 */
export async function saveToLocalFolder(
  drawingFiles  = [],
  specFiles     = [],
  fileCategories = {},
  onProgress    = () => {}
) {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      'Your browser does not support the File System Access API. ' +
      'Please use Chrome or Edge 86+ to save directly to a local folder.'
    );
  }

  // ── 1. Ask the user to choose a root folder ──────────────────────────────
  let rootHandle;
  try {
    rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err.name === 'AbortError') return null; // user hit Cancel
    throw err;
  }

  // ── 2. Build fast lookup maps ─────────────────────────────────────────────
  const drawingMap = Object.fromEntries(drawingFiles.map(f => [f.name, f]));
  const specMap    = Object.fromEntries(specFiles.map(f    => [f.name, f]));

  // ── 3. Group drawing files by the discipline the backend assigned ─────────
  //   fileCategories may look like: { 'A100.pdf': 'Architectural', 'S100.pdf': 'Structural' }
  //   We map each category to a sub-folder under Drawings/.
  //   Unknown / unmapped files fall back to 'Other'.
  const drawingGroups = {}; // { disciplineName: File[] }

  for (const [filename, category] of Object.entries(fileCategories)) {
    if (!drawingMap[filename]) continue; // it was a spec or not in our local files
    const folder = category === 'Specs' ? null : category; // specs handled separately
    if (!folder) continue;
    if (!drawingGroups[folder]) drawingGroups[folder] = [];
    drawingGroups[folder].push(drawingMap[filename]);
  }

  // Any drawing file NOT mentioned in fileCategories → 'Other'
  const categorisedFilenames = new Set(Object.keys(fileCategories));
  for (const f of drawingFiles) {
    if (!categorisedFilenames.has(f.name)) {
      if (!drawingGroups['Other']) drawingGroups['Other'] = [];
      drawingGroups['Other'].push(f);
    }
  }

  // ── 4. Count totals for progress reporting ────────────────────────────────
  const total = drawingFiles.length + specFiles.length;
  let done = 0;

  // ── 5. Write drawing files → Drawings/{Discipline}/ ──────────────────────
  for (const [discipline, files] of Object.entries(drawingGroups)) {
    const dirHandle = await getOrCreateDir(rootHandle, 'Drawings', discipline);
    for (const file of files) {
      onProgress({ done, total, current: file.name, phase: 'drawings' });
      await writeFileToDisk(dirHandle, file);
      done++;
      onProgress({ done, total, current: file.name, phase: 'drawings' });
    }
  }

  // ── 6. Write spec files → Specs/ ─────────────────────────────────────────
  if (specFiles.length > 0) {
    const specsDir = await getOrCreateDir(rootHandle, 'Specs');
    for (const file of specFiles) {
      onProgress({ done, total, current: file.name, phase: 'specs' });
      await writeFileToDisk(specsDir, file);
      done++;
      onProgress({ done, total, current: file.name, phase: 'specs' });
    }
  }

  // ── 7. Return summary ─────────────────────────────────────────────────────
  return {
    folder:          rootHandle.name,
    drawingsWritten: drawingFiles.length,
    specsWritten:    specFiles.length,
    total,
  };
}
