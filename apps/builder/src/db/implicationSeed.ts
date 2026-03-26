// ─────────────────────────────────────────────────────────────────────────────
// FILE: apps/builder/src/db/implicationSeed.ts
// Seed data for the Implication Library
// This is where 15 years of estimating expertise gets encoded
// Add to this file continuously as new implications are discovered
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';

export function seedImplicationLibrary(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO implication_library
      (id, category, description, action, cost_impact, triggers_json, created_by, is_global)
    VALUES
      (@id, @category, @description, @action, @costImpact, @triggersJson, 'system', 1)
  `);

  const implications = [

    // ── Compliance ───────────────────────────────────────────────────────────
    {
      id: uuidv4(),
      category: 'compliance',
      description: 'Florida HVHZ — Impact-rated glazing required',
      action: 'Verify spec §08.81 for performance criteria. Price impact glass — do not price standard monolithic.',
      costImpact: 'high',
      triggers: {
        specSections: ['08.81', '08 81', '088100'],
        keywords: ['hvhz', 'impact', 'hurricane', 'high velocity'],
      },
    },
    {
      id: uuidv4(),
      category: 'compliance',
      description: 'Blast-resistant glazing specified',
      action: 'Send drawings to specialty vendor for pricing. Standard frame vendors cannot quote this scope.',
      costImpact: 'high',
      triggers: {
        specSections: ['08 88 53', '088853'],
        keywords: ['blast', 'gsa', 'dod', 'anti-terrorism'],
      },
    },
    {
      id: uuidv4(),
      category: 'compliance',
      description: 'Fire-rated framing required',
      action: 'Confirm rating (20/45/60/90 min). Send to fire-rated specialty vendor. Cannot use standard storefront vendor.',
      costImpact: 'high',
      triggers: {
        specSections: ['08 41 26', '084126'],
        keywords: ['fire rated', 'fire-rated', 'firerated', 'rated assembly'],
      },
    },
    {
      id: uuidv4(),
      category: 'compliance',
      description: 'Bullet-resistant glazing specified',
      action: 'Confirm UL rating level (BR1-BR8). Send to specialty vendor. Long lead time — flag for schedule.',
      costImpact: 'high',
      triggers: {
        keywords: ['bullet', 'ballistic', 'br-', 'ul 752'],
      },
    },

    // ── Structural ───────────────────────────────────────────────────────────
    {
      id: uuidv4(),
      category: 'structural',
      description: 'Span exceeds standard storefront limits — steel reinforcement likely required',
      action: 'Verify structural drawings for embedded steel tube or HSS. Add steel supply and install to scope if present.',
      costImpact: 'medium',
      triggers: {
        systemTypes: ['ext-sf-1', 'ext-sf-2', 'int-sf'],
        spanMinInches: 288, // 24 feet
      },
    },
    {
      id: uuidv4(),
      category: 'structural',
      description: 'Raked/sloped system detected — non-standard fabrication',
      action: 'Add 15% labor premium for field installation. Verify drainage requirements with architect.',
      costImpact: 'medium',
      triggers: {
        keywords: ['rake', 'raked', 'sloped', 'angled', 'slope'],
      },
    },
    {
      id: uuidv4(),
      category: 'structural',
      description: 'Curtain wall over 4 stories — engineering stamp may be required',
      action: 'Check if spec requires PE stamp on shop drawings. Confirm with GC before bidding.',
      costImpact: 'low',
      triggers: {
        systemTypes: ['cap-cw', 'ssg-cw'],
      },
    },

    // ── Glass ────────────────────────────────────────────────────────────────
    {
      id: uuidv4(),
      category: 'glass',
      description: 'Bird-friendly glazing specified',
      action: 'Check spec for pattern requirements (fritted, etched, UV-visible). Non-standard glass — confirm with vendor.',
      costImpact: 'medium',
      triggers: {
        keywords: ['bird', 'avian', 'frit pattern', 'bird safe'],
      },
    },
    {
      id: uuidv4(),
      category: 'glass',
      description: 'Window film specified — separate scope item',
      action: 'Do not include in glass pricing. Hire film sub. Get quote from film contractor separately.',
      costImpact: 'low',
      triggers: {
        specSections: ['08 87 00', '088700'],
        keywords: ['film', 'window film', '3m', 'solar film'],
      },
    },
    {
      id: uuidv4(),
      category: 'glass',
      description: 'Electrochromic / dynamic glass specified',
      action: 'Long lead time (12-16 weeks). Requires electrical rough-in coordination. Specialty vendor only.',
      costImpact: 'high',
      triggers: {
        keywords: ['electrochromic', 'dynamic glass', 'smartglass', 'view glass', 'sageglass'],
      },
    },

    // ── Labor ────────────────────────────────────────────────────────────────
    {
      id: uuidv4(),
      category: 'labor',
      description: 'Prevailing wage / Davis-Bacon project',
      action: 'Verify wage determination for this county. Adjust labor rates before finalizing bid.',
      costImpact: 'high',
      triggers: {
        keywords: ['prevailing wage', 'davis-bacon', 'davis bacon', 'public works'],
      },
    },
    {
      id: uuidv4(),
      category: 'labor',
      description: 'High-rise installation — swing stage or man-lift required',
      action: 'Add equipment rental to scope. Verify if GC is providing hoist access or if glazier must supply.',
      costImpact: 'high',
      triggers: {
        keywords: ['swing stage', 'high rise', 'highrise', 'tower'],
      },
    },

    // ── Hardware ─────────────────────────────────────────────────────────────
    {
      id: uuidv4(),
      category: 'hardware',
      description: 'Automatic door operators specified',
      action: 'Confirm if glazier is supplying operator or GC hardware allowance covers it. Check spec §08 71 00.',
      costImpact: 'medium',
      triggers: {
        specSections: ['08 71 00', '087100'],
        keywords: ['automatic', 'auto operator', 'ada', 'power operator'],
      },
    },
    {
      id: uuidv4(),
      category: 'hardware',
      description: 'Patch fitting / all-glass door system',
      action: 'Confirm patch fitting manufacturer matches spec. Verify tempered glass thickness (3/4" min typical).',
      costImpact: 'medium',
      triggers: {
        keywords: ['patch fitting', 'all glass', 'all-glass', 'frameless door'],
      },
    },

  ];

  const insertMany = db.transaction((items: typeof implications) => {
    for (const impl of items) {
      insert.run({
        id:           impl.id,
        category:     impl.category,
        description:  impl.description,
        action:       impl.action,
        costImpact:   impl.costImpact,
        triggersJson: impl.triggers ? JSON.stringify(impl.triggers) : null,
      });
    }
  });

  insertMany(implications);
  console.log(`✅ Seeded ${implications.length} implications into library`);
}
