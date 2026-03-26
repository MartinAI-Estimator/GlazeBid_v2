// ─────────────────────────────────────────────────────────────────────────────
// FILE: apps/builder/src/store/citationSchema.ts
// Zod validation schema — single source of truth for citation data shape
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

export const BoundingBoxSchema = z.object({
  x:      z.number(),
  y:      z.number(),
  width:  z.number().positive(),
  height: z.number().positive(),
});

export const RealWorldDimensionsSchema = z.object({
  widthInches:         z.number().positive(),
  heightInches:        z.number().positive(),
  sillElevationInches: z.number(),
  headElevationInches: z.number(),
});

export const GeometrySchema = z.object({
  sheetNumber:         z.string().min(1),
  sheetTitle:          z.string().optional(),
  boundingBox:         BoundingBoxSchema,
  realWorldDimensions: RealWorldDimensionsSchema,
  gridLocation:        z.string().optional(),
});

export const ScopeSchema = z.object({
  architectTag: z.string().min(1),
  systemType:   z.enum([
    'ext-sf-1', 'ext-sf-2', 'int-sf',
    'cap-cw',   'ssg-cw',   'fire-rated',
    'sunshade', 'bullet-resistant', 'film',
    'door-only', 'hardware-only', 'unknown'
  ]),
  systemLabel: z.string().min(1),
  quantity:    z.number().positive(),
  unit:        z.enum(['EA', 'LF', 'SF']),
});

export const SourceSchema = z.object({
  type: z.enum([
    'drawing', 'schedule', 'spec',
    'detail',  'elevation', 'domain_intuition'
  ]),
  reference:   z.string().min(1),   // "Sheet A7.2, Detail 8"
  description: z.string().min(1),   // "Head condition confirms aluminum framing"
  confidence:  z.number().min(0).max(1),
});

export const FlagSchema = z.object({
  type: z.enum([
    'span_exceeds_system',
    'tag_mismatch',
    'raster_uncertainty',
    'missing_detail',
    'spec_conflict',
    'code_compliance',
    'estimator_override',
  ]),
  description: z.string().min(1),
  resolution:  z.string().optional(),  // How estimator resolved it
});

export const ImplicationSchema = z.object({
  id:          z.string().uuid().optional(),  // links to ImplicationLibrary
  category:    z.enum(['glass', 'labor', 'hardware', 'structural', 'compliance']),
  description: z.string().min(1),
  action:      z.string().min(1),
  costImpact:  z.enum(['low', 'medium', 'high', 'unknown']),
});

export const AiMetadataSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  modelVersion:      z.string(),
  processingPath:    z.enum(['vector', 'raster', 'hybrid']),
  humanVerified:     z.boolean().default(false),
  verifiedAt:        z.string().datetime().optional(),
}).optional();

// ── Root Citation Schema ──────────────────────────────────────────────────────

export const CitationSchema = z.object({
  id:        z.string().uuid(),
  projectId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.enum(['manual', 'ai']),

  geometry:    GeometrySchema,
  scope:       ScopeSchema,
  sources:     z.array(SourceSchema).min(1),
  logicType:   z.enum([
    'visual_match', 'schedule_match', 'spec_match',
    'domain_intuition', 'conflict_resolution'
  ]),
  flags:       z.array(FlagSchema).default([]),
  implications: z.array(ImplicationSchema).default([]),
  aiMetadata:  AiMetadataSchema,

  // Shadow mode — AI pre-suggestion before human confirms
  shadowSuggestion: z.object({
    systemType:  ScopeSchema.shape.systemType.optional(),
    confidence:  z.number().min(0).max(1).optional(),
    suggestedBy: z.string().optional(),   // which model/layer suggested it
  }).optional(),
});

// ── Implication Library Schema ────────────────────────────────────────────────

export const ImplicationLibraryEntrySchema = z.object({
  id:          z.string().uuid(),
  category:    ImplicationSchema.shape.category,
  description: z.string().min(1),
  action:      z.string().min(1),
  costImpact:  ImplicationSchema.shape.costImpact,

  // Trigger conditions — when to auto-suggest this implication
  triggers: z.object({
    specSections:  z.array(z.string()).optional(),  // ["08.81", "08.88"]
    systemTypes:   z.array(z.string()).optional(),  // ["ext-sf-1", "cap-cw"]
    spanMinInches: z.number().optional(),
    spanMaxInches: z.number().optional(),
    zipPatterns:   z.array(z.string()).optional(),  // ["33", "34"] FL HVHZ prefix
    keywords:      z.array(z.string()).optional(),  // ["impact", "hurricane", "blast"]
  }).optional(),

  // Usage tracking — how often this implication is selected
  usageCount:    z.number().default(0),
  lastUsedAt:    z.string().datetime().optional(),
  createdBy:     z.enum(['system', 'estimator']),
  isGlobal:      z.boolean().default(true),  // false = project-specific
});

export type Citation               = z.infer<typeof CitationSchema>;
export type ImplicationLibraryEntry = z.infer<typeof ImplicationLibraryEntrySchema>;
export type Implication            = z.infer<typeof ImplicationSchema>;
