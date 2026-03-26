/**
 * citationStore.ts — Studio renderer-side citation wrapper
 *
 * The actual SQLite store runs in Electron main process.
 * This thin wrapper calls IPC via window.electron so Studio components
 * never reference window.electron directly for citation operations.
 *
 * Import from here, not from window.electron:
 *   import { writeCitation, getCitationsBySheet } from '../../db/citationStore';
 */

// ── Lightweight types matching citationSchema.ts ─────────────────────────────

export interface CitationGeometry {
  sheetNumber:          string;
  sheetTitle?:          string;
  boundingBox:          { x: number; y: number; width: number; height: number };
  realWorldDimensions?: {
    widthInches:         number;
    heightInches:        number;
    sillElevationInches: number;
    headElevationInches: number;
  };
  gridLocation?: string;
}

export interface CitationScope {
  architectTag: string;
  systemType:   string;
  systemLabel:  string;
  quantity:      number;
  unit:         'EA' | 'LF' | 'SF';
}

export interface CitationSource {
  type:        'drawing' | 'schedule' | 'spec' | 'detail' | 'elevation' | 'domain_intuition';
  reference:   string;
  description: string;
  confidence:  number;
}

export interface CitationImplication {
  id?:         string;
  category:    string;
  description: string;
  action:      string;
  costImpact:  string;
}

export interface Citation {
  id:           string;
  projectId:    string;
  createdAt:    string;
  updatedAt:    string;
  createdBy:    'manual' | 'ai';
  geometry:     CitationGeometry;
  scope:        CitationScope;
  sources:      CitationSource[];
  logicType:    string;
  flags:        unknown[];
  implications: CitationImplication[];
  shadowSuggestion?: {
    systemType?: string;
    confidence?: number;
    suggestedBy?: string;
  };
  aiMetadata?: unknown;
}

export interface ImplicationLibraryEntry {
  id:          string;
  category:    string;
  description: string;
  action:      string;
  costImpact:  string;
  triggers?: {
    specSections?:  string[];
    systemTypes?:   string[];
    spanMinInches?: number;
    spanMaxInches?: number;
    zipPatterns?:   string[];
    keywords?:      string[];
  };
  usageCount?:  number;
  lastUsedAt?:  string;
  createdBy?:   string;
  isGlobal?:    boolean;
}

// ── IPC Wrappers ─────────────────────────────────────────────────────────────

export async function writeCitation(raw: unknown): Promise<Citation> {
  const result = await window.electron.writeCitation(raw);
  if (!result.ok || !result.citation) {
    throw new Error(result.error ?? 'writeCitation failed');
  }
  return result.citation as Citation;
}

export async function getCitationsByProject(projectId: string): Promise<Citation[]> {
  const result = await window.electron.getCitationsByProject(projectId);
  if (!result.ok) {
    console.warn('[citationStore] getCitationsByProject failed:', result.error);
    return [];
  }
  return (result.citations ?? []) as Citation[];
}

export async function getCitationsBySheet(
  projectId: string,
  sheetNumber: string
): Promise<Citation[]> {
  const result = await window.electron.getCitationsBySheet(projectId, sheetNumber);
  if (!result.ok) {
    console.warn('[citationStore] getCitationsBySheet failed:', result.error);
    return [];
  }
  return (result.citations ?? []) as Citation[];
}

export async function verifyCitation(citationId: string): Promise<void> {
  const result = await window.electron.verifyCitation(citationId);
  if (!result.ok) {
    throw new Error(result.error ?? 'verifyCitation failed');
  }
}

export async function getImplicationSuggestions(params: {
  systemType?:   string;
  specSections?: string[];
  keywords?:     string[];
}): Promise<ImplicationLibraryEntry[]> {
  const result = await window.electron.getImplications(params);
  if (!result.ok) {
    console.warn('[citationStore] getImplications failed:', result.error);
    return [];
  }
  return (result.suggestions ?? []) as ImplicationLibraryEntry[];
}

export async function recordImplicationUsage(implicationId: string): Promise<void> {
  await window.electron.recordImplicationUsage(implicationId);
}
