// ─────────────────────────────────────────────────────────────────────────────
// FILE: apps/builder/src/db/citationStore.ts
// Read/write layer — wraps better-sqlite3
// All write paths (manual, ai) go through this single module
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  CitationSchema,
  ImplicationLibraryEntrySchema,
  type Citation,
  type ImplicationLibraryEntry,
} from '../store/citationSchema';
import { seedImplicationLibrary } from './implicationSeed';

// ── Inlined migration SQL (avoids __dirname issues after esbuild bundling) ───
const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS citations (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL CHECK (created_by IN ('manual', 'ai')),
  geometry_json     TEXT NOT NULL,
  architect_tag     TEXT NOT NULL,
  system_type       TEXT NOT NULL,
  system_label      TEXT NOT NULL,
  quantity          REAL NOT NULL,
  unit              TEXT NOT NULL CHECK (unit IN ('EA', 'LF', 'SF')),
  sheet_number      TEXT NOT NULL,
  logic_type        TEXT NOT NULL,
  sources_json      TEXT NOT NULL DEFAULT '[]',
  flags_json        TEXT NOT NULL DEFAULT '[]',
  implications_json TEXT NOT NULL DEFAULT '[]',
  ai_metadata_json  TEXT,
  shadow_json       TEXT,
  human_verified    INTEGER NOT NULL DEFAULT 0,
  verified_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_citations_project ON citations (project_id);
CREATE INDEX IF NOT EXISTS idx_citations_sheet ON citations (project_id, sheet_number);
CREATE INDEX IF NOT EXISTS idx_citations_system_type ON citations (project_id, system_type);
CREATE INDEX IF NOT EXISTS idx_citations_created_by ON citations (created_by, human_verified);
CREATE TABLE IF NOT EXISTS implication_library (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL,
  action       TEXT NOT NULL,
  cost_impact  TEXT NOT NULL CHECK (cost_impact IN ('low', 'medium', 'high', 'unknown')),
  triggers_json TEXT,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_by   TEXT NOT NULL CHECK (created_by IN ('system', 'estimator')),
  is_global    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_implication_category ON implication_library (category);
CREATE INDEX IF NOT EXISTS idx_implication_usage ON implication_library (usage_count DESC);
`;

let db: Database.Database | null = null;

export function initCitationStore(dbPath: string) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');   // Better concurrent read performance
  db.pragma('foreign_keys = ON');

  // Run migrations — inlined to avoid __dirname path issues after esbuild bundling
  db.exec(MIGRATION_001);

  // Seed implication library if empty
  const count = (db.prepare('SELECT COUNT(*) as c FROM implication_library').get() as any).c;
  if (count === 0) seedImplicationLibrary(db);
}

// ── Write path (used by BOTH manual UI and AI generator) ─────────────────────

export function writeCitation(raw: unknown): Citation {
  if (!db) throw new Error('Citation store not initialized');

  // Validate — throws ZodError if schema violated
  const citation = CitationSchema.parse({
    ...raw,
    id:        (raw as any).id        ?? uuidv4(),
    createdAt: (raw as any).createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.prepare(`
    INSERT OR REPLACE INTO citations (
      id, project_id, created_at, updated_at, created_by,
      geometry_json, architect_tag, system_type, system_label,
      quantity, unit, sheet_number, logic_type,
      sources_json, flags_json, implications_json,
      ai_metadata_json, shadow_json, human_verified, verified_at
    ) VALUES (
      @id, @projectId, @createdAt, @updatedAt, @createdBy,
      @geometryJson, @architectTag, @systemType, @systemLabel,
      @quantity, @unit, @sheetNumber, @logicType,
      @sourcesJson, @flagsJson, @implicationsJson,
      @aiMetadataJson, @shadowJson, @humanVerified, @verifiedAt
    )
  `).run({
    id:              citation.id,
    projectId:       citation.projectId,
    createdAt:       citation.createdAt,
    updatedAt:       citation.updatedAt,
    createdBy:       citation.createdBy,
    geometryJson:    JSON.stringify(citation.geometry),
    architectTag:    citation.scope.architectTag,
    systemType:      citation.scope.systemType,
    systemLabel:     citation.scope.systemLabel,
    quantity:        citation.scope.quantity,
    unit:            citation.scope.unit,
    sheetNumber:     citation.geometry.sheetNumber,
    logicType:       citation.logicType,
    sourcesJson:     JSON.stringify(citation.sources),
    flagsJson:       JSON.stringify(citation.flags),
    implicationsJson: JSON.stringify(citation.implications),
    aiMetadataJson:  citation.aiMetadata ? JSON.stringify(citation.aiMetadata) : null,
    shadowJson:      citation.shadowSuggestion ? JSON.stringify(citation.shadowSuggestion) : null,
    humanVerified:   citation.aiMetadata?.humanVerified ? 1 : 0,
    verifiedAt:      citation.aiMetadata?.verifiedAt ?? null,
  });

  return citation;
}

// ── Read paths ────────────────────────────────────────────────────────────────

export function getCitationsByProject(projectId: string): Citation[] {
  if (!db) throw new Error('Citation store not initialized');
  const rows = db.prepare(
    'SELECT * FROM citations WHERE project_id = ? ORDER BY created_at ASC'
  ).all(projectId);
  return rows.map(deserializeCitation);
}

export function getCitationsBySheet(projectId: string, sheetNumber: string): Citation[] {
  if (!db) throw new Error('Citation store not initialized');
  const rows = db.prepare(
    'SELECT * FROM citations WHERE project_id = ? AND sheet_number = ? ORDER BY created_at ASC'
  ).all(projectId, sheetNumber);
  return rows.map(deserializeCitation);
}

export function verifyCitation(citationId: string): void {
  if (!db) throw new Error('Citation store not initialized');
  db.prepare(`
    UPDATE citations
    SET human_verified = 1, verified_at = ?, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), citationId);
}

// ── Implication Library ───────────────────────────────────────────────────────

export function getImplicationSuggestions(params: {
  systemType?:   string;
  specSections?: string[];
  keywords?:     string[];
}): ImplicationLibraryEntry[] {
  if (!db) throw new Error('Citation store not initialized');

  // Load all global implications and filter by trigger match
  // Simple approach — works well up to ~500 library entries
  const all = db.prepare(
    'SELECT * FROM implication_library WHERE is_global = 1 ORDER BY usage_count DESC'
  ).all();

  return all
    .map(row => ({
      ...row,
      triggers: row.triggers_json ? JSON.parse(row.triggers_json as string) : undefined,
    }))
    .filter(impl => {
      if (!impl.triggers) return true;  // No triggers = always show
      const t = impl.triggers;
      if (params.systemType && t.systemTypes?.includes(params.systemType)) return true;
      if (params.specSections?.some(s => t.specSections?.includes(s))) return true;
      if (params.keywords?.some(k => t.keywords?.some((kw: string) =>
        k.toLowerCase().includes(kw.toLowerCase())))) return true;
      return false;
    }) as ImplicationLibraryEntry[];
}

export function recordImplicationUsage(implicationId: string): void {
  if (!db) throw new Error('Citation store not initialized');
  db.prepare(`
    UPDATE implication_library
    SET usage_count = usage_count + 1, last_used_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), implicationId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deserializeCitation(row: any): Citation {
  return CitationSchema.parse({
    id:           row.id,
    projectId:    row.project_id,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    createdBy:    row.created_by,
    geometry:     JSON.parse(row.geometry_json),
    scope: {
      architectTag: row.architect_tag,
      systemType:   row.system_type,
      systemLabel:  row.system_label,
      quantity:     row.quantity,
      unit:         row.unit,
    },
    logicType:    row.logic_type,
    sources:      JSON.parse(row.sources_json),
    flags:        JSON.parse(row.flags_json),
    implications: JSON.parse(row.implications_json),
    aiMetadata:   row.ai_metadata_json ? JSON.parse(row.ai_metadata_json) : undefined,
    shadowSuggestion: row.shadow_json ? JSON.parse(row.shadow_json) : undefined,
  });
}
