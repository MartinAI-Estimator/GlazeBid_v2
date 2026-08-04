/**
 * companyPlaybook.js — the company's own spec rules, compiled and enforced.
 *
 * WHY THIS SHAPE (SPEC_SPLITTER_COMPANY_FEATURES.md §1)
 * Hard-coding one company's rules would make the product unsellable. So there
 * are two layers: the glazing BASELINE that ships with the app (SCAN_CATEGORIES),
 * and the company PLAYBOOK authored by the estimator on top of it.
 *
 * The estimator writes plain language — "flag any spec that makes us pay for
 * field water testing". They never see a regex. AI compiles that instruction
 * into search rules ONCE, at save time; scanning itself stays local and offline
 * forever after. With no API key the app degrades to keyword matching derived
 * from the instruction rather than refusing to work.
 */

import { buildSystemPrompt } from '../ai/specIntelligence';

export const PLAYBOOK_VERSION = 1;

/** An empty playbook — used when the company has not authored one yet. */
export function emptyPlaybook() {
  return {
    playbookVersion: PLAYBOOK_VERSION,
    company: '',
    updated: new Date().toISOString().slice(0, 10),
    scope: { alwaysReview: ['00', '01', '02', '05', '07', '08'], neverBid: [] },
    watchItems: [],
    overrides: [],
    preferredManufacturers: [],
    chatGuidance: '',
  };
}

// ─── Load / save ─────────────────────────────────────────────────────────────
// Stored per COMPANY in the app settings dir, not per project, so one file can
// be copied to every estimator in the shop.

export async function loadPlaybook() {
  try {
    const result = await window.electronAPI?.loadPlaybook?.();
    if (result?.ok && result.playbook) return result.playbook;
  } catch { /* fall through */ }
  return null;
}

export async function savePlaybook(playbook) {
  const toSave = {
    ...playbook,
    playbookVersion: PLAYBOOK_VERSION,
    updated: new Date().toISOString().slice(0, 10),
  };
  try {
    const result = await window.electronAPI?.savePlaybook?.(toSave);
    return result?.ok ? { ok: true, playbook: toSave } : { ok: false, error: result?.error || 'Save failed' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Compilation: plain language → search rules ──────────────────────────────

const STOP_WORDS = new Set([
  'flag','any','spec','that','makes','the','for','and','with','from','this','when',
  'which','shall','must','will','have','has','are','was','were','our','their','a','an',
  'is','it','to','of','in','on','be','by','or','as','if','we','us','you','all','not',
  'anything','something','where','who','pay','pays','look','watch','out','into','over',
]);

/**
 * Keyless fallback: derive keyword patterns straight from the instruction.
 * Deliberately conservative — requires the two most distinctive words together,
 * because a single common word would fire on every page in the book.
 */
export function compileByKeywords(instruction) {
  const words = String(instruction || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const unique = [...new Set(words)];
  if (unique.length === 0) return null;

  const primary = unique.slice(0, 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    patterns: primary.map((w) => `\\b${w}`),
    requireNear: unique.slice(3, 8).map((w) => `\\b${w}`),
    nearWindow: 250,
    method: 'keywords',
  };
}

/**
 * AI compilation via the company's own key. Returns null when unavailable so
 * the caller can fall back to keywords — a missing key must never block saving.
 */
export async function compileWithAi(instruction) {
  if (!window.electronAPI?.aiChat) return null;
  try {
    const result = await window.electronAPI.aiChat({
      systemPrompt: buildSystemPrompt({ mode: 'playbookCompile' }),
      messages: [{
        role: 'user',
        content:
          `Watch item: "${instruction}"\n\n` +
          'Return ONLY a JSON object: {"patterns":[".."],"requireNear":[".."],' +
          '"severity":"risk|warn|info","meaning":"one sentence, money consequence first"}. ' +
          'patterns are JavaScript regex source strings (no delimiters, no flags). ' +
          'Keep patterns specific enough that they do not match ordinary boilerplate.',
      }],
      maxTokens: 1024,
    });
    if (!result?.ok) return null;

    const match = (result.text || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.patterns) || parsed.patterns.length === 0) return null;

    // Every pattern must actually compile — a bad regex would throw mid-scan.
    const patterns = parsed.patterns.filter((p) => {
      try { new RegExp(p, 'i'); return true; } catch { return false; }
    });
    if (patterns.length === 0) return null;

    return {
      patterns,
      requireNear: Array.isArray(parsed.requireNear)
        ? parsed.requireNear.filter((p) => { try { new RegExp(p, 'i'); return true; } catch { return false; } })
        : [],
      nearWindow: 250,
      severity: parsed.severity,
      meaning: parsed.meaning,
      method: 'ai',
    };
  } catch {
    return null;
  }
}

/**
 * Compile one watch item. AI first, keywords as fallback.
 * A watch item that compiles to nothing is stored DISABLED with a reason rather
 * than silently dropped — the estimator must be able to see that a rule of
 * theirs is not running.
 */
export async function compileWatchItem(item) {
  const instruction = item?.instruction?.trim();
  if (!instruction) {
    return { ...item, enabled: false, compiled: null, compileError: 'No instruction text' };
  }

  const ai = await compileWithAi(instruction);
  const compiled = ai || compileByKeywords(instruction);

  if (!compiled) {
    return { ...item, enabled: false, compiled: null, compileError: 'Could not derive a rule from this wording' };
  }

  return {
    ...item,
    compiled,
    compiledBy: compiled.method,
    compiledAt: new Date().toISOString().slice(0, 10),
    severity: item.severity || compiled.severity || 'warn',
    meaning: item.meaning || compiled.meaning || '',
    enabled: item.enabled !== false,
    compileError: null,
  };
}

// ─── Turning a playbook into scan categories ─────────────────────────────────

/**
 * Convert enabled watch items into SCAN_CATEGORIES-shaped entries so playbook
 * rules run through the exact same local engine (and the same precision tiering
 * and verified-citation rules) as the baseline categories.
 */
export function playbookCategories(playbook) {
  const items = (playbook?.watchItems || []).filter((w) => w.enabled !== false && w.compiled);
  return items.map((w) => {
    const toRe = (src) => { try { return new RegExp(src, 'i'); } catch { return null; } };
    const patterns    = (w.compiled.patterns    || []).map(toRe).filter(Boolean);
    const requireNear = (w.compiled.requireNear || []).map(toRe).filter(Boolean);
    return {
      key: `playbook:${w.id}`,
      label: w.title || w.instruction?.slice(0, 60) || 'Playbook item',
      short: 'PB',
      description: w.meaning || w.instruction || '',
      // Keyword-derived rules are inherently lower precision, so they go through
      // the corroboration path rather than standing alone.
      ...(w.compiledBy === 'keywords' && requireNear.length
        ? { patterns: [], lowPrecision: patterns, requireNear }
        : { patterns, ...(requireNear.length ? { requireNear } : {}) }),
      isPlaybook: true,
      playbookSeverity: w.severity || 'warn',
      playbookMeaning: w.meaning || '',
    };
  });
}

// ─── Never-bid detection ─────────────────────────────────────────────────────

/**
 * Find never-bid scope in the analyzed sections.
 * Matches the plain-language phrase against section titles and any scanned
 * excerpt text, so "blast-resistant glazing" catches "08 88 53 Blast Resistant
 * Glazing" as well as a body mention.
 *
 * @returns {Array<{phrase:string, sectionNumber:string, sectionTitle:string, page:number|null}>}
 */
export function findNeverBidHits(playbook, sections = [], scanResults = {}) {
  const phrases = (playbook?.scope?.neverBid || []).map((p) => String(p).trim()).filter(Boolean);
  if (!phrases.length) return [];

  const hits = [];
  const seen = new Set();

  for (const phrase of phrases) {
    // Match on the distinctive words, so "blast-resistant glazing" still hits
    // "blast resistant glazing" and "glazing, blast-resistant".
    const words = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
    if (!words.length) continue;
    const matches = (text) => {
      const t = String(text || '').toLowerCase();
      return words.every((w) => t.includes(w));
    };

    for (const s of sections) {
      if (!matches(`${s.sectionNumber} ${s.sectionTitle}`)) continue;
      const key = `${phrase}::${s.sectionNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ phrase, sectionNumber: s.sectionNumber, sectionTitle: s.sectionTitle, page: s.startPage ?? null });
    }

    for (const [sectionNumber, res] of Object.entries(scanResults)) {
      for (const f of Object.values(res?.findings ?? {})) {
        if (!f?.found || !matches(f.excerpt)) continue;
        const key = `${phrase}::${sectionNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          phrase,
          sectionNumber,
          sectionTitle: res.sectionTitle || '',
          page: f.page ?? null,
        });
      }
    }
  }

  return hits;
}
