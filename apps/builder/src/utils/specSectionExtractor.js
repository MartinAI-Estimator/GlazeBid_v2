import { parseSpecSections } from '../lib/specSorter';

/**
 * Compatibility wrapper used by the existing intake UI.
 * Keeps current return shape while delegating parsing to specSorter.
 */
export async function extractSpecSections(source) {
  const data = await toArrayBuffer(source);
  const parsed = await parseSpecSections(data);

  if (!Array.isArray(parsed)) {
    console.warn('[specSectionExtractor] parseSpecSections failed:', parsed?.error || 'Unknown error');
    return {
      sections_found: 0,
      sections: [],
      division8: [],
      error: parsed?.error || 'Unable to parse specification sections.',
    };
  }

  const sections = parsed.map((s) => ({
    code: s.sectionNumber,
    name: s.sectionTitle,
    page: s.startPage,
    startPage: s.startPage,
    endPage: s.endPage,
    pageCount: s.pageCount,
    division: s.sectionNumber.slice(0, 2),
    isDiv8: s.sectionNumber.startsWith('08'),
    isGlazingRelevant: s.isGlazingRelevant,
  }));

  return {
    sections_found: sections.length,
    sections,
    division8: sections.filter((s) => s.isDiv8),
  };
}

/**
 * Legacy helper still used in some UI paths.
 */
export async function hasDiv8Content(file) {
  const data = await toArrayBuffer(file);
  const parsed = await parseSpecSections(data);
  if (!Array.isArray(parsed)) return false;
  return parsed.some((s) => s.sectionNumber.startsWith('08'));
}

async function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Uint8Array) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  if (typeof File !== 'undefined' && source instanceof File) {
    return source.arrayBuffer();
  }
  if (source && typeof source.arrayBuffer === 'function') {
    return source.arrayBuffer();
  }
  throw new Error('Unsupported spec source. Expected File, ArrayBuffer, or Uint8Array.');
}
