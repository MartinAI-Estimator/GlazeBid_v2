/**
 * useImplicationTrigger.ts
 *
 * Real-time implication suggestions as the estimator enters citation data.
 * Watches input state and fires matching implications from the library
 * via IPC to the main-process SQLite store.
 *
 * Debounced at 180 ms so it never fires on every keystroke.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getImplicationSuggestions, type ImplicationLibraryEntry as LibEntry } from '../db/citationStore';

// ── Lightweight types (avoid cross-app imports) ──────────────────────────────

interface ImplicationEntry {
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

export interface TriggerInput {
  systemType?:         string;
  architectTag?:       string;
  widthInches?:        number;
  heightInches?:       number;
  specSectionsFound?:  string[];
  keywordsFound?:      string[];
}

export interface TriggerResult {
  implication:    ImplicationEntry;
  matchReason:    string;
  matchStrength:  'exact' | 'partial' | 'contextual';
  highlightTerms: string[];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useImplicationTrigger(input: TriggerInput) {
  const [triggered, setTriggered] = useState<TriggerResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const runTriggers = useCallback(async (current: TriggerInput) => {
    setIsLoading(true);
    try {
      const suggestions: ImplicationEntry[] =
        (await getImplicationSuggestions({
          systemType:   current.systemType,
          specSections: current.specSectionsFound,
          keywords:     current.keywordsFound,
        })) as ImplicationEntry[];

      const results: TriggerResult[] = suggestions
        .map(impl => scoreImplication(impl, current))
        .filter((r): r is TriggerResult => r !== null);

      results.sort((a, b) => {
        const order = { exact: 0, partial: 1, contextual: 2 };
        return order[a.matchStrength] - order[b.matchStrength];
      });

      setTriggered(results.slice(0, 5));
    } catch (err) {
      console.warn('[ImplicationTrigger] IPC error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runTriggers(input), 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.systemType,
    input.architectTag,
    input.widthInches,
    input.specSectionsFound?.join(','),
    input.keywordsFound?.join(','),
    runTriggers,
  ]);

  return { triggered, isLoading };
}

// ── Scoring engine ───────────────────────────────────────────────────────────

function scoreImplication(
  impl: ImplicationEntry,
  input: TriggerInput,
): TriggerResult | null {
  if (!impl.triggers) return null;

  const t = impl.triggers;
  const highlightTerms: string[] = [];
  let matchStrength: TriggerResult['matchStrength'] = 'contextual';
  let matchReason = '';

  // Exact: spec section match
  if (t.specSections && input.specSectionsFound) {
    const hit = t.specSections.find(s =>
      input.specSectionsFound!.some(found =>
        normalizeSpec(found) === normalizeSpec(s)
      )
    );
    if (hit) {
      matchStrength = 'exact';
      matchReason   = `Spec §${hit} detected in project`;
      highlightTerms.push(hit);
    }
  }

  // Exact: system type match + span threshold
  if (t.systemTypes?.includes(input.systemType ?? '')) {
    if (t.spanMinInches && input.widthInches) {
      if (input.widthInches >= t.spanMinInches) {
        matchStrength = 'exact';
        matchReason   = `${(input.widthInches / 12).toFixed(1)}' span exceeds ${(t.spanMinInches / 12).toFixed(0)}' limit for ${input.systemType}`;
        highlightTerms.push(`${(input.widthInches / 12).toFixed(1)}'`);
      }
    } else {
      if (matchStrength !== 'exact') matchStrength = 'partial';
      matchReason = matchReason || `System type ${input.systemType} matches`;
    }
  }

  // Partial: keyword match
  if (t.keywords && input.keywordsFound) {
    const hit = t.keywords.find(kw =>
      input.keywordsFound!.some(found =>
        found.toLowerCase().includes(kw.toLowerCase())
      )
    );
    if (hit) {
      if (matchStrength === 'contextual') {
        matchStrength = 'partial';
        matchReason   = matchReason || `Keyword "${hit}" found in project documents`;
      }
      highlightTerms.push(hit);
    }
  }

  if (!matchReason) return null;

  return { implication: impl, matchReason, matchStrength, highlightTerms };
}

function normalizeSpec(s: string): string {
  return s.replace(/[\s.]/g, '').toUpperCase();
}
