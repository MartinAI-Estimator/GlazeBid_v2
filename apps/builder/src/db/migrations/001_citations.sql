-- ─────────────────────────────────────────────────────────────────────────────
-- FILE: apps/builder/src/db/migrations/001_citations.sql
-- SQLite table definitions
-- Run via better-sqlite3 in Electron main process
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Citations table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citations (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL CHECK (created_by IN ('manual', 'ai')),

  -- Geometry (stored as JSON — queried rarely, displayed often)
  geometry_json     TEXT NOT NULL,

  -- Scope (indexed fields broken out for fast filtering)
  architect_tag     TEXT NOT NULL,
  system_type       TEXT NOT NULL,
  system_label      TEXT NOT NULL,
  quantity          REAL NOT NULL,
  unit              TEXT NOT NULL CHECK (unit IN ('EA', 'LF', 'SF')),

  -- Sheet reference (for fast sheet-based queries)
  sheet_number      TEXT NOT NULL,

  -- Logic type (for training data filtering)
  logic_type        TEXT NOT NULL,

  -- Full JSON blobs (sources, flags, implications, ai metadata)
  sources_json      TEXT NOT NULL DEFAULT '[]',
  flags_json        TEXT NOT NULL DEFAULT '[]',
  implications_json TEXT NOT NULL DEFAULT '[]',
  ai_metadata_json  TEXT,
  shadow_json       TEXT,

  -- Verification tracking
  human_verified    INTEGER NOT NULL DEFAULT 0,
  verified_at       TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_citations_project
  ON citations (project_id);

CREATE INDEX IF NOT EXISTS idx_citations_sheet
  ON citations (project_id, sheet_number);

CREATE INDEX IF NOT EXISTS idx_citations_system_type
  ON citations (project_id, system_type);

CREATE INDEX IF NOT EXISTS idx_citations_created_by
  ON citations (created_by, human_verified);

-- ── Implication Library table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS implication_library (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL,
  action       TEXT NOT NULL,
  cost_impact  TEXT NOT NULL CHECK (cost_impact IN ('low', 'medium', 'high', 'unknown')),
  triggers_json TEXT,           -- JSON: spec sections, system types, zip patterns, keywords
  usage_count  INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_by   TEXT NOT NULL CHECK (created_by IN ('system', 'estimator')),
  is_global    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_implication_category
  ON implication_library (category);

CREATE INDEX IF NOT EXISTS idx_implication_usage
  ON implication_library (usage_count DESC);
