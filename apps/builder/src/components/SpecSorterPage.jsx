/**
 * SpecSorterPage.jsx
 *
 * Dedicated page: upload spec PDF → view in built-in viewer → parse sections →
 * toggle in/out of scope → deep-scan selected sections → save results.
 *
 * Layout:
 *  ┌──────── top bar ────────────────────────────────┐
 *  │  ← Back   Spec Sorter   [file name]   [actions] │
 *  ├──────────────────────┬──────────────────────────┤
 *  │  PDF Viewer          │  Spec Sorter Panel       │
 *  │  (pdfjs, canvas)     │  Sections / Readings     │
 *  └──────────────────────┴──────────────────────────┘
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { parseSpecSectionsV2 } from '../lib/specSorterV2';
import { classifySection } from '../lib/glazingScope';
import { loadPlaybook, playbookCategories, findNeverBidHits } from '../lib/companyPlaybook';
import { extractSections } from '../lib/specSorter';
import { scanSection } from '../lib/specReader';
import { scanSpecSection, SCAN_CATEGORIES, extractPageTexts, aiEnhanceSection, detectCrossReferences } from '../lib/specScanner';
import SpecChatPanel from './SpecChatPanel';

// Wire pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ReadableStream polyfill for Electron 29 / Chrome 122
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// ── Division metadata ──────────────────────────────────────────────────────────
const DIVISION_NAMES = {
  '01': 'General Requirements', '03': 'Concrete', '04': 'Masonry',
  '05': 'Metals', '06': 'Wood & Plastics', '07': 'Thermal & Moisture',
  '08': 'Openings', '09': 'Finishes', '10': 'Specialties',
};

const DIVISION_COLORS = {
  '08': '#3b82f6',   // blue — glazing
  '07': '#10b981',   // green — thermal/moisture
  '05': '#8b5cf6',   // purple — metals
  '01': '#6b7280',   // gray — general
};

function divColor(sectionNumber) {
  const div = (sectionNumber || '').replace(/[\s.\-]/g, '').slice(0, 2);
  return DIVISION_COLORS[div] || '#374151';
}

function divLabel(sectionNumber) {
  const div = (sectionNumber || '').replace(/[\s.\-]/g, '').slice(0, 2);
  const name = DIVISION_NAMES[div];
  return name ? `Div ${div} — ${name}` : `Div ${div}`;
}

function isGlazingDiv(sectionNumber) {
  const div = (sectionNumber || '').replace(/[\s.\-]/g, '').slice(0, 2);
  return ['05', '07', '08'].includes(div);
}

// ── Category badges for scan results ──────────────────────────────────────────
const CATEGORY_META = {
  basisOfDesign: { label: 'Basis of Design', short: 'BOD', color: '#2563eb' },
  finish:        { label: 'Finish',           short: 'FIN', color: '#7c3aed' },
  performance:   { label: 'Performance',      short: 'PRF', color: '#0891b2' },
  substitution:  { label: 'Substitution',     short: 'SUB', color: '#d97706' },
  submittals:    { label: 'Submittals',        short: 'SBMT', color: '#059669' },
  warranty:      { label: 'Warranty',          short: 'WTY', color: '#dc2626' },
};

// ── Risk checklist definitions ────────────────────────────────────────────────
// Each item maps to a scanner finding key + evaluation logic
const CHECKLIST_GROUPS = [
  {
    label: '📌 Scope & Coverage',
    color: '#3b82f6',
    items: [
      {
        id: 'bod_found',
        label: 'Basis of Design named',
        impact: 'You know which system to quote — alternates may still be allowed.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.categories?.basisOfDesign?.status === 'found');
          if (!hit) return { status: 'missing', text: 'No manufacturer found in scanned sections', page: null, section: null };
          const item = hit.categories.basisOfDesign.items?.[0];
          return { status: 'ok', text: item?.manufacturer || 'Manufacturer detected', page: item?.page, section: hit.sectionNumber, highlight: item?.excerpt };
        },
      },
      {
        id: 'div08_present',
        label: 'Division 08 sections present',
        impact: 'Confirms glazing scope is in the spec book.',
        evaluate: (results, sections) => {
          const div08 = sections.filter(s => s.sectionNumber.replace(/[\s.\-]/g,'').startsWith('08'));
          if (!div08.length) return { status: 'missing', text: 'No Div 08 sections detected', page: null };
          return { status: 'ok', text: div08.map(s => s.sectionNumber).join(', '), page: div08[0].startPage };
        },
      },
      {
        id: 'finish_found',
        label: 'Finish specification found',
        impact: 'Required to confirm finish allowance in your pricing.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.finish?.found || r.categories?.finish?.status === 'found');
          if (!hit) return { status: 'warn', text: 'Finish not detected — verify in spec', page: null };
          const page = hit.findings?.finish?.page || hit.categories?.finish?.items?.[0]?.page;
          return { status: 'ok', text: hit.findings?.finish?.excerpt?.slice(0,80) || 'Finish language found', page, section: hit.sectionNumber, highlight: hit.findings?.finish?.excerpt || hit.categories?.finish?.items?.[0]?.excerpt };
        },
      },
      {
        id: 'performance_found',
        label: 'Performance values specified',
        impact: 'DP, U-value, SHGC — needed for system selection and engineering.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.performance?.found || r.categories?.performance?.status === 'found');
          if (!hit) return { status: 'warn', text: 'No performance criteria found — may be in structural/civil sections', page: null };
          const page = hit.findings?.performance?.page || hit.categories?.performance?.items?.[0]?.page;
          return { status: 'ok', text: hit.findings?.performance?.excerpt?.slice(0,80) || 'Performance values found', page, section: hit.sectionNumber, highlight: hit.findings?.performance?.excerpt || hit.categories?.performance?.items?.[0]?.excerpt };
        },
      },
    ],
  },
  {
    label: '🔴 High Risk Flags',
    color: '#ef4444',
    items: [
      {
        id: 'no_subs',
        label: 'NO SUBSTITUTIONS / Sole Source / Proprietary',
        impact: 'You MUST bid the named manufacturer. No alternates will be accepted without prior written approval.',
        evaluate: (results) => {
          const allExcerpts = Object.values(results)
            .map(r => (r.categories?.substitution?.items || []).map(i => i.excerpt || '').join(' '))
            .join(' ');
          const isSoleSource = /no\s+substitut|sole\s+source|proprietary|no\s+equal/i.test(allExcerpts);
          const hit = Object.values(results).find(r =>
            (r.categories?.substitution?.items || []).some(i =>
              /no\s+substitut|sole\s+source|proprietary|no\s+equal/i.test(i.excerpt || '')
            ) || /no\s+substitut|sole\s+source/i.test(r.findings?.substitutions?.excerpt || '')
          );
          if (isSoleSource || hit?.findings?.substitutions?.found) {
            const page = hit?.findings?.substitutions?.page || hit?.categories?.substitution?.items?.[0]?.page;
            const noSubExcerpt = (hit?.categories?.substitution?.items || []).find(i => /no\s+substitut|sole\s+source|proprietary|no\s+equal/i.test(i.excerpt || ''))?.excerpt || hit?.findings?.substitutions?.excerpt;
            return { status: 'risk', text: 'No substitution language detected — must quote named system', page, section: hit?.sectionNumber, highlight: noSubExcerpt };
          }
          return { status: 'clear', text: 'No blanket substitution restriction found', page: null };
        },
      },
      {
        id: 'delegated_design',
        label: 'Delegated Design required',
        impact: 'Engineer of Record has delegated structural calculations to you. Requires licensed PE to stamp shop drawings — budget $2,000–$8,000.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.delegatedDesign?.found);
          if (!hit) return { status: 'clear', text: 'No delegated design requirement found', page: null };
          return { status: 'warn', text: hit.findings.delegatedDesign.excerpt?.slice(0,100) || 'Delegated design language found', page: hit.findings.delegatedDesign.page, section: hit.sectionNumber, highlight: hit.findings.delegatedDesign.excerpt };
        },
      },
    ],
  },
  {
    label: '⚠️ Watch List',
    color: '#f59e0b',
    items: [
      {
        id: 'mockup',
        label: 'Mock-up required',
        impact: 'Full-size prototype panel before production. Budget 80–160 shop/field MH + material cost.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.mockup?.found);
          if (!hit) return { status: 'clear', text: 'No mock-up requirement found', page: null };
          return { status: 'warn', text: hit.findings.mockup.excerpt?.slice(0,100) || 'Mock-up language found', page: hit.findings.mockup.page, section: hit.sectionNumber, highlight: hit.findings.mockup.excerpt };
        },
      },
      {
        id: 'field_testing',
        label: 'Field testing required (AAMA / ASTM)',
        impact: 'Owner-witnessed performance test after installation. Budget $3,000–$10,000 per test location.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.testRequirements?.found);
          if (!hit) return { status: 'clear', text: 'No field testing requirement found', page: null };
          return { status: 'warn', text: hit.findings.testRequirements.excerpt?.slice(0,100) || 'Testing requirement found', page: hit.findings.testRequirements.page, section: hit.sectionNumber, highlight: hit.findings.testRequirements.excerpt };
        },
      },
      {
        id: 'qualifications',
        label: 'Installer qualifications required',
        impact: 'Manufacturer-certified or experienced installer required. Verify your crew qualifies before bidding.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.qualifications?.found);
          if (!hit) return { status: 'clear', text: 'No installer qualification requirement found', page: null };
          return { status: 'warn', text: hit.findings.qualifications.excerpt?.slice(0,100) || 'Qualification language found', page: hit.findings.qualifications.page, section: hit.sectionNumber, highlight: hit.findings.qualifications.excerpt };
        },
      },
      {
        id: 'approved_equal',
        label: 'Approved equal / alternate accepted',
        impact: 'Substitutions may be allowed with prior approval. Submit alternate manufacturer with supporting data.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r =>
            (r.categories?.substitution?.items || []).some(i =>
              /approved\s+equal|or\s+equal|alternate/i.test(i.excerpt || '')
            ) || /approved\s+equal/i.test(r.findings?.substitutions?.excerpt || '')
          );
          if (!hit) return { status: 'clear', text: 'No approved-equal language found', page: null };
          const item = hit.categories?.substitution?.items?.find(i => /approved\s+equal|or\s+equal|alternate/i.test(i.excerpt || '')) || hit.categories?.substitution?.items?.[0];
          return { status: 'info', text: 'Approved equal language found — alternates may be submittal-eligible', page: item?.page || hit.findings?.substitutions?.page, section: hit.sectionNumber, highlight: item?.excerpt || hit.findings?.substitutions?.excerpt };
        },
      },
    ],
  },
  {
    label: 'ℹ️ Administrative',
    color: '#6b7280',
    items: [
      {
        id: 'submittals',
        label: 'Submittal requirements defined',
        impact: 'Shop drawings, product data, and/or samples required before fabrication.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.submittals?.found || r.categories?.submittals?.status === 'found');
          if (!hit) return { status: 'info', text: 'No explicit submittal schedule found', page: null };
          const page = hit.findings?.submittals?.page || hit.categories?.submittals?.items?.[0]?.page;
          return { status: 'ok', text: 'Submittal requirements found', page, section: hit.sectionNumber, highlight: hit.findings?.submittals?.excerpt || hit.categories?.submittals?.items?.[0]?.excerpt };
        },
      },
      {
        id: 'warranty',
        label: 'Warranty requirements',
        impact: 'Confirm warranty period and what is covered before you price your contingency.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.warranty?.found || r.categories?.warranty?.status === 'found');
          if (!hit) return { status: 'info', text: 'No warranty requirement found', page: null };
          const page = hit.findings?.warranty?.page || hit.categories?.warranty?.items?.[0]?.page;
          const excerpt = hit.findings?.warranty?.excerpt || hit.categories?.warranty?.items?.[0]?.excerpt;
          return { status: 'ok', text: excerpt?.slice(0,100) || 'Warranty language found', page, section: hit.sectionNumber, highlight: excerpt };
        },
      },
      {
        id: 'warranty_duration',
        label: 'Warranty duration detected',
        impact: '20-year or lifetime warranty requires premium-tier systems and glass — verify your allowance covers it.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.warrantyDuration?.found);
          if (!hit) return { status: 'info', text: 'Warranty duration not explicitly stated — check manually', page: null };
          const m = (hit.findings.warrantyDuration.excerpt || '').match(/\b(10|15|20|25|lifetime)[\s\-]?year/i);
          const years = m ? m[0] : 'Duration found';
          const isLong = /20|25|lifetime/i.test(years);
          return {
            status: isLong ? 'warn' : 'ok',
            text: `${years}${isLong ? ' — may require premium system selection' : ''}`,
            page: hit.findings.warrantyDuration.page,
            section: hit.sectionNumber,
            highlight: hit.findings.warrantyDuration.excerpt,
          };
        },
      },
      {
        id: 'aama_class',
        label: 'AAMA finish class specified',
        impact: 'AAMA 2605 (Kynar/PVDF) costs 20–25% more than 2604 or 2603 — confirm class before pricing finish allowance.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.aamaClass?.found);
          if (!hit) return { status: 'info', text: 'AAMA class not detected — verify finish class in spec', page: null };
          const is2605 = /2605|Kynar\s+500|high[\s\-]performance\s+(organic|fluoropolymer)/i.test(hit.findings.aamaClass.excerpt || '');
          return {
            status: is2605 ? 'warn' : 'ok',
            text: `${hit.findings.aamaClass.excerpt?.slice(0, 80) || 'AAMA class found'}${is2605 ? ' — premium finish (2605)' : ''}`,
            page: hit.findings.aamaClass.page,
            section: hit.sectionNumber,
            highlight: hit.findings.aamaClass.excerpt,
          };
        },
      },
      {
        id: 'pre_install_meeting',
        label: 'Pre-installation conference required',
        impact: 'Add ~4–8 PM labor hours for coordination meeting attendance.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.preInstallMeeting?.found);
          if (!hit) return { status: 'clear', text: 'No pre-installation conference requirement found', page: null };
          return { status: 'info', text: 'Pre-installation meeting required', page: hit.findings.preInstallMeeting.page, section: hit.sectionNumber, highlight: hit.findings.preInstallMeeting.excerpt };
        },
      },
    ],
  },
  {
    label: '🔶 Special Systems',
    color: '#f97316',
    items: [
      {
        id: 'fire_rated',
        label: 'Fire-rated glazing assembly',
        impact: 'Fire-rated glass assemblies are 3–8× the cost of standard glazing. Requires UL-listed framing + glass — verify product availability before bidding.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.fireRating?.found);
          if (!hit) return { status: 'clear', text: 'No fire-rated glazing requirement detected', page: null };
          return { status: 'risk', text: hit.findings.fireRating.excerpt?.slice(0, 100) || 'Fire-rated glazing required', page: hit.findings.fireRating.page, section: hit.sectionNumber, highlight: hit.findings.fireRating.excerpt };
        },
      },
      {
        id: 'impact_glazing',
        label: 'Impact / Hurricane glazing (HVHZ)',
        impact: 'Requires Miami-Dade NOA or Florida Product Approval. Impact interlayer glass and certified hardware adds significant cost. Verify jurisdictional requirement.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.impactResistance?.found);
          if (!hit) return { status: 'clear', text: 'No hurricane/impact requirement detected', page: null };
          return { status: 'risk', text: hit.findings.impactResistance.excerpt?.slice(0, 100) || 'Impact glazing required', page: hit.findings.impactResistance.page, section: hit.sectionNumber, highlight: hit.findings.impactResistance.excerpt };
        },
      },
      {
        id: 'blast',
        label: 'Blast-resistant glazing (GSA / UFC)',
        impact: 'Blast-rated glazing requires specialty laminated glass, structural framing, and may need third-party engineering. Significant cost premium — consider declining or pricing separately.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.blastResistance?.found);
          if (!hit) return { status: 'clear', text: 'No blast resistance requirement detected', page: null };
          return { status: 'risk', text: hit.findings.blastResistance.excerpt?.slice(0, 100) || 'Blast resistance required', page: hit.findings.blastResistance.page, section: hit.sectionNumber, highlight: hit.findings.blastResistance.excerpt };
        },
      },
      {
        id: 'acoustic',
        label: 'Acoustic / STC glazing required',
        impact: 'STC 35+ requires laminated glass makeup. Budget additional glass premium and verify STC ratings are achievable with your proposed system.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.acousticRequirements?.found);
          if (!hit) return { status: 'clear', text: 'No acoustic glazing requirement detected', page: null };
          const m = (hit.findings.acousticRequirements.excerpt || '').match(/STC[\s\-]?(\d+)/i);
          const rating = m ? `STC ${m[1]}` : 'Acoustic requirement';
          const isHigh = m && parseInt(m[1], 10) >= 35;
          return {
            status: isHigh ? 'risk' : 'warn',
            text: `${rating} — ${isHigh ? 'high acoustic spec, verify glass makeup' : 'acoustic glazing required'}`,
            page: hit.findings.acousticRequirements.page,
            section: hit.sectionNumber,
            highlight: hit.findings.acousticRequirements.excerpt,
          };
        },
      },
    ],
  },
  {
    label: '📄 Contract & General Conditions',
    color: '#94a3b8',
    items: [
      {
        id: 'liquidated_damages',
        label: 'Liquidated damages clause',
        impact: 'Daily penalty for late completion. $2,000+/day is high risk — factor into your schedule and contingency. Glazing delays (glass lead times, shop drawings) are common LD triggers.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.liquidatedDamages?.found);
          if (!hit) return { status: 'clear', text: 'No liquidated damages clause detected', page: null };
          const exc = hit.findings.liquidatedDamages.excerpt || '';
          const m = exc.match(/\$([\d,]+)\s*(per|a)\s*(calendar\s+)?day/i);
          const amount = m ? `$${m[1]}/day` : 'LDs apply';
          const daily = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
          return {
            status: daily >= 2000 || !m ? 'risk' : 'warn',
            text: `${amount} — review schedule risk and glass lead times`,
            page: hit.findings.liquidatedDamages.page,
            section: hit.sectionNumber,
            highlight: exc || undefined,
          };
        },
      },
      {
        id: 'retainage_pct',
        label: 'Retainage percentage',
        impact: '10% retainage on a $500K glazing contract = $50K held until closeout. Affects cash flow — factor into your pricing and financing needs.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.retainage?.found);
          if (!hit) return { status: 'info', text: 'Retainage not explicitly stated — confirm with GC', page: null };
          const exc = hit.findings.retainage.excerpt || '';
          const m = exc.match(/\b(\d+)\s*%/);
          const pct = m ? parseInt(m[1], 10) : null;
          if (pct === null) return { status: 'warn', text: 'Retainage clause found — verify percentage', page: hit.findings.retainage.page, section: hit.sectionNumber, highlight: exc || undefined };
          return {
            status: pct >= 10 ? 'warn' : 'ok',
            text: `${pct}% retainage${pct >= 10 ? ' — impacts cash flow on large contracts' : ' — standard'}`,
            page: hit.findings.retainage.page,
            section: hit.sectionNumber,
            highlight: exc || undefined,
          };
        },
      },
      {
        id: 'bond_required',
        label: 'Performance / payment bond required',
        impact: 'Bond premiums typically add 1–3% to your contract value. A $400K sub-contract bond costs $4,000–$12,000 — include in your bid.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.bondRequirements?.found);
          if (!hit) return { status: 'clear', text: 'No bond requirement detected', page: null };
          return {
            status: 'risk',
            text: 'Bond required — add 1–3% bond premium to your bid price',
            page: hit.findings.bondRequirements.page,
            section: hit.sectionNumber,
            highlight: hit.findings.bondRequirements.excerpt,
          };
        },
      },
      {
        id: 'insurance_limits',
        label: 'Insurance requirements',
        impact: 'High umbrella limits ($10M+) may require you to purchase higher coverage. Verify your current policy limits before bidding.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.insuranceRequirements?.found);
          if (!hit) return { status: 'clear', text: 'No unusual insurance requirements detected', page: null };
          const exc = hit.findings.insuranceRequirements.excerpt || '';
          const m = exc.match(/\$([\d,]+)\s*(million|M)/i);
          const limit = m ? `$${m[1]}M umbrella` : 'Custom insurance limits';
          const millions = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
          return {
            status: millions >= 10 ? 'risk' : 'warn',
            text: `${limit} — verify your policy covers this`,
            page: hit.findings.insuranceRequirements.page,
            section: hit.sectionNumber,
            highlight: exc || undefined,
          };
        },
      },
      {
        id: 'pay_if_paid',
        label: 'Pay-if-paid / pay-when-paid',
        impact: 'Pay-if-paid means the GC can withhold your payment indefinitely if the owner defaults. Pay-when-paid is less risky but still delays your cash. Know which clause applies.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.payWhenPaid?.found);
          if (!hit) return { status: 'clear', text: 'No conditional payment clause detected', page: null };
          const exc = (hit.findings.payWhenPaid.excerpt || '').toLowerCase();
          const isPayIfPaid = /pay[\s\-]?if[\s\-]?paid|condition\s+precedent/.test(exc);
          return {
            status: isPayIfPaid ? 'risk' : 'warn',
            text: isPayIfPaid
              ? 'Pay-if-paid — GC can hold payment if owner defaults'
              : 'Pay-when-paid — payment delayed until GC receives from owner',
            page: hit.findings.payWhenPaid.page,
            section: hit.sectionNumber,
            highlight: hit.findings.payWhenPaid.excerpt,
          };
        },
      },
      {
        id: 'working_hours',
        label: 'Working hours restrictions',
        impact: 'Limited working hours (occupied building, downtown, noise ordinance) can require nights/weekends for glazing installation — add labor premium to bid.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.workingHours?.found);
          if (!hit) return { status: 'clear', text: 'No working hour restrictions detected', page: null };
          return {
            status: 'warn',
            text: 'Working hour restrictions — verify if premium labor rates apply',
            page: hit.findings.workingHours.page,
            section: hit.sectionNumber,
            highlight: hit.findings.workingHours.excerpt,
          };
        },
      },
      {
        id: 'leed',
        label: 'LEED / sustainability requirements',
        impact: 'LEED requires recycled content documentation, regional material tracking, and potentially EPD/HPD submittals for each product. Budget 4–8 hours of admin per submittal.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.leedRequirements?.found);
          if (!hit) return { status: 'clear', text: 'No LEED or sustainability requirements detected', page: null };
          return {
            status: 'warn',
            text: 'LEED/sustainability requirements — recycled content tracking and EPD submittals likely required',
            page: hit.findings.leedRequirements.page,
            section: hit.sectionNumber,
            highlight: hit.findings.leedRequirements.excerpt,
          };
        },
      },
      {
        id: 'owner_furnished',
        label: 'Owner-furnished items / allowances',
        impact: 'Owner-furnished glass, hardware, or materials change your scope boundary. Clarify who is responsible for delivery, storage, and installation damage.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.ownerFurnished?.found);
          if (!hit) return { status: 'clear', text: 'No owner-furnished items or allowances detected', page: null };
          return {
            status: 'info',
            text: 'Owner-furnished items or cash allowances — verify scope boundary and coordinate delivery',
            page: hit.findings.ownerFurnished.page,
            section: hit.sectionNumber,
            highlight: hit.findings.ownerFurnished.excerpt,
          };
        },
      },
      {
        id: 'phasing',
        label: 'Phasing / occupied building',
        impact: 'Occupied buildings require protection measures, sequenced installs, and may restrict access. Budget for protection, sequencing costs, and extended mobilization.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.phasing?.found);
          if (!hit) return { status: 'clear', text: 'No phasing or occupied building restrictions detected', page: null };
          return {
            status: 'warn',
            text: 'Phased work / occupied building — protection, sequencing, and access restrictions likely',
            page: hit.findings.phasing.page,
            section: hit.sectionNumber,
            highlight: hit.findings.phasing.excerpt,
          };
        },
      },
      {
        id: 'closeout_reqs',
        label: 'Close-out / O&M manuals / as-builts',
        impact: 'Close-out deliverables (O&M manuals, as-built drawings, training) must be submitted before final payment release. Allocate PM time for document preparation.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.closeout?.found);
          if (!hit) return { status: 'clear', text: 'No special close-out requirements detected', page: null };
          return {
            status: 'info',
            text: 'Close-out deliverables required — O&M manuals, as-built drawings, and/or training',
            page: hit.findings.closeout.page,
            section: hit.sectionNumber,
            highlight: hit.findings.closeout.excerpt,
          };
        },
      },
    ],
  },
  // ─── Labor & Materials ────────────────────────────────────────────────────
  {
    label: '🏗️ Labor & Materials',
    color: '#a78bfa',
    items: [
      {
        id: 'prevailing_wage',
        label: 'Prevailing wage / Davis-Bacon',
        impact: 'Prevailing wage or Davis-Bacon requirements mandate higher labor rates set by the government. Your standard crew rates will not suffice — re-price labor using the published wage determination for each trade.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.prevailingWage?.found);
          if (!hit) return { status: 'clear', text: 'No prevailing wage or Davis-Bacon requirement detected', page: null };
          return {
            status: 'risk',
            text: 'Prevailing wage / Davis-Bacon applies — re-price all labor at government-mandated rates',
            page: hit.findings.prevailingWage.page,
            section: hit.sectionNumber,
            highlight: hit.findings.prevailingWage.excerpt,
          };
        },
      },
      {
        id: 'buy_america',
        label: 'Buy America / domestic content restriction',
        impact: 'Buy America (BABA) requires all iron, steel, and manufactured goods to be produced in the U.S. Foreign-made aluminum extrusions (most off-the-shelf systems) may be disqualified — verify your manufacturer\'s compliance before bidding.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.buyAmerica?.found);
          if (!hit) return { status: 'clear', text: 'No Buy America or domestic content restriction detected', page: null };
          return {
            status: 'risk',
            text: 'Buy America / BABA restriction — verify aluminum system and glass domestic-origin compliance',
            page: hit.findings.buyAmerica.page,
            section: hit.sectionNumber,
            highlight: hit.findings.buyAmerica.excerpt,
          };
        },
      },
      {
        id: 'ocip_ccip',
        label: 'OCIP / CCIP wrap-up insurance program',
        impact: 'If the project is enrolled in a wrap-up (OCIP/CCIP), you may be required to deduct your standard GL and workers\' comp premiums from your bid price. Failure to deduct = you\'re carrying duplicate insurance. Verify enrollment form and premium credit amount.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.ocip?.found);
          if (!hit) return { status: 'clear', text: 'No OCIP/CCIP wrap-up insurance program detected', page: null };
          return {
            status: 'warn',
            text: 'OCIP/CCIP detected — deduct your standard insurance premiums from bid price',
            page: hit.findings.ocip.page,
            section: hit.sectionNumber,
            highlight: hit.findings.ocip.excerpt,
          };
        },
      },
    ],
  },
  // ─── Scope & Execution Gotchas ─────────────────────────────────────────────
  {
    label: '🔧 Scope Gotchas',
    color: '#34d399',
    items: [
      {
        id: 'perimeter_sealants',
        label: 'Perimeter sealants in glazing scope',
        impact: 'Perimeter sealant is sometimes in Div 07 (sealant contractor) and sometimes assigned to the glazier. If the spec explicitly lists sealant by glazier, add material + 0.5–1.0 MH/LF labor. If unclear, include an exclusion in your bid.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.perimeterSealants?.found);
          if (!hit) return { status: 'clear', text: 'No perimeter sealant scope language detected', page: null };
          return {
            status: 'warn',
            text: 'Perimeter sealant language found — verify whether glazier or Div 07 contractor installs',
            page: hit.findings.perimeterSealants.page,
            section: hit.sectionNumber,
            highlight: hit.findings.perimeterSealants.excerpt,
          };
        },
      },
      {
        id: 'brake_metal',
        label: 'Brake metal / sill flashing in scope',
        impact: 'Custom brake-formed sill flashings, caps, and trim are often assigned to the glazing contractor but priced separately. Identify profile gauge, finish, and length — add material + shop fabrication time.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.brakeMetalFlashing?.found);
          if (!hit) return { status: 'clear', text: 'No brake metal or custom flashing language detected', page: null };
          return {
            status: 'warn',
            text: 'Brake metal or sill flashing language found — verify scope and include fabrication cost',
            page: hit.findings.brakeMetalFlashing.page,
            section: hit.sectionNumber,
            highlight: hit.findings.brakeMetalFlashing.excerpt,
          };
        },
      },
      {
        id: 'electrified_hardware',
        label: 'Electrified hardware / auto-operators',
        impact: 'Automatic door operators, card readers, electric strikes, and access control interfaces can add $2,000–$15,000+ per opening. Clarify whether you furnish hardware, rough-in conduit only, or furnish-and-install complete. Coordinate with Div 26/28.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.electrifiedHardware?.found);
          if (!hit) return { status: 'clear', text: 'No electrified hardware or auto-operator requirement detected', page: null };
          return {
            status: 'risk',
            text: 'Electrified hardware / auto-operators detected — clarify furnish vs install scope and conduit responsibility',
            page: hit.findings.electrifiedHardware.page,
            section: hit.sectionNumber,
            highlight: hit.findings.electrifiedHardware.excerpt,
          };
        },
      },
      {
        id: 'glass_upgrades',
        label: 'Specialty / upgraded glass (frit, dynamic, spandrel)',
        impact: 'Bird-friendly frit, electrochromic, and oversized glass can be 2–10× the cost of standard IGU. Verify manufacturer availability, lead times (often 12–20 weeks), and that your system can accept the specified unit.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.glassUpgrades?.found);
          if (!hit) return { status: 'clear', text: 'No specialty glass upgrades detected', page: null };
          const exc = hit.findings.glassUpgrades.excerpt || '';
          const isDynamic = /electrochromic|dynamic\s+glazing|SageGlass|View\s+Glass/i.test(exc);
          return {
            status: isDynamic ? 'risk' : 'warn',
            text: `Specialty glass: ${exc.slice(0, 80)} — verify availability, lead time, and system compatibility`,
            page: hit.findings.glassUpgrades.page,
            section: hit.sectionNumber,
            highlight: exc,
          };
        },
      },
      {
        id: 'hoisting_access',
        label: 'Hoisting / crane / scaffold by glazier',
        impact: 'If the spec assigns crane or scaffold to the glazing contractor, add $5,000–$40,000+ depending on building height and duration. Verify who provides the crane and whether GC will share access.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.hoisting?.found);
          if (!hit) return { status: 'clear', text: 'No hoisting or scaffold responsibility assigned to glazier', page: null };
          return {
            status: 'risk',
            text: 'Crane/scaffold responsibility language found — verify if assigned to glazing contractor',
            page: hit.findings.hoisting.page,
            section: hit.sectionNumber,
            highlight: hit.findings.hoisting.excerpt,
          };
        },
      },
      {
        id: 'protection_cleaning',
        label: 'Protection & final cleaning by glazier',
        impact: 'Protecting installed glazing from subsequent trades and performing final cleaning are often under-priced. Hard water, silicone overspray, and razor-blade cleaning can cost $5–$15/SF. Include labor in your estimate.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r => r.findings?.protectionCleaning?.found);
          if (!hit) return { status: 'clear', text: 'No protection or final cleaning requirement assigned to glazier', page: null };
          return {
            status: 'warn',
            text: 'Protection and/or final cleaning assigned to glazier — add 0.05–0.15 MH/SF for cleaning labor',
            page: hit.findings.protectionCleaning.page,
            section: hit.sectionNumber,
            highlight: hit.findings.protectionCleaning.excerpt,
          };
        },
      },
    ],
  },
  // ─── Cross-References ────────────────────────────────────────────────────
  {
    label: '🔀 Cross-References',
    color: '#60a5fa',
    items: [
      {
        id: 'div05_ref',
        label: 'Division 05 – Structural metals cross-referenced',
        impact: 'Division 05 cross-references often mean you must furnish tube-steel subframes, embed plates, or structural angles. This scope is easy to miss and can add $10,000–$60,000+ to your cost. Clarify with GC who provides steel.',
        evaluate: (results) => {
          const hits = Object.values(results).flatMap(r => (r.crossRefs || []).filter(ref => ref.division === '05'));
          if (!hits.length) return { status: 'clear', text: 'No Division 05 structural metals references detected', page: null };
          const hit = hits[0];
          return { status: 'risk', text: `Div 05 reference — verify steel subframe scope: "${hit.context?.slice(0, 80)}"`, page: hit.page, highlight: hit.context };
        },
      },
      {
        id: 'div07_ref',
        label: 'Division 07 – Thermal & moisture cross-referenced',
        impact: 'Division 07 cross-references indicate perimeter sealants, waterproofing, or flashings that may have product specifications you must comply with. Often requires premium sealant brands (Dow, Tremco) at 2–3× commodity prices.',
        evaluate: (results) => {
          const hits = Object.values(results).flatMap(r => (r.crossRefs || []).filter(ref => ref.division === '07'));
          if (!hits.length) return { status: 'clear', text: 'No Division 07 thermal/moisture cross-references detected', page: null };
          const hit = hits[0];
          return { status: 'risk', text: `Div 07 reference — check sealant/flashing scope and approved products: "${hit.context?.slice(0, 80)}"`, page: hit.page, highlight: hit.context };
        },
      },
      {
        id: 'div26_28_ref',
        label: 'Division 26/28 – Electrical/security cross-referenced',
        impact: 'References to Div 26 (Electrical) or Div 28 (Electronic Safety) suggest powered hardware, wiring conduit, or access control in your door/opening scope. Clarify whether you furnish rough-in only, or supply and program the complete system.',
        evaluate: (results) => {
          const hits = Object.values(results).flatMap(r => (r.crossRefs || []).filter(ref => ref.division === '26' || ref.division === '28'));
          if (!hits.length) return { status: 'clear', text: 'No Division 26/28 electrical or security cross-references detected', page: null };
          const hit = hits[0];
          return { status: 'risk', text: `Div ${hit.division} reference — clarify electrical/access control scope boundary: "${hit.context?.slice(0, 80)}"`, page: hit.page, highlight: hit.context };
        },
      },
      {
        id: 'div01_testing_ref',
        label: 'Division 01 – General requirements cross-referenced',
        impact: 'Division 01 governs testing, mock-ups, and QC. Cross-references may mean you must pay for 3rd-party AAMA 501.2 water tests or provide additional field samples. Add $2,000–$8,000 if testing agency costs are your responsibility.',
        evaluate: (results) => {
          const hits = Object.values(results).flatMap(r => (r.crossRefs || []).filter(ref => ref.division === '01'));
          if (!hits.length) return { status: 'clear', text: 'No Division 01 general requirements cross-references detected', page: null };
          const hit = hits[0];
          return { status: 'warn', text: `Div 01 reference — verify testing and QC cost responsibility: "${hit.context?.slice(0, 80)}"`, page: hit.page, highlight: hit.context };
        },
      },
    ],
  },
  // ─── Bid Day Paperwork (Div 00/01) ────────────────────────────────────────
  {
    label: '📋 Bid Day Paperwork',
    color: '#818cf8',
    items: [
      {
        id: 'bid_forms',
        label: 'Bid form / proposal form required',
        impact: 'Submit the specified bid form — not a letter of proposal. Wrong form = disqualified bid. Download from the bid portal and use as-is.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r =>
            (r.categories?.bidForms?.items || []).length > 0
          );
          if (!hit) return { status: 'info', text: 'No explicit bid form section detected — confirm with GC', page: null };
          const item = hit.categories.bidForms.items[0];
          return { status: 'warn', text: "Bid form required \u2014 use the owner\u2019s form, not a letter of proposal", page: item?.page, section: hit.sectionNumber, highlight: item?.excerpt };
        },
      },
      {
        id: 'sub_form_deadline',
        label: 'Substitution request deadline',
        impact: 'Most specs require alternates to be pre-approved in writing before bid day. Miss the deadline = no alternates allowed. Note the cutoff date and build your submittal schedule accordingly.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r =>
            (r.categories?.substitutionForms?.items || []).length > 0
          );
          if (!hit) return { status: 'clear', text: 'No substitution request form or deadline detected', page: null };
          const item = hit.categories.substitutionForms.items[0];
          return { status: 'warn', text: 'Substitution request form / deadline found — submit alternates before the cutoff', page: item?.page, section: hit.sectionNumber, highlight: item?.excerpt };
        },
      },
      {
        id: 'tax_treatment',
        label: 'Tax treatment specified',
        impact: 'Sales/use tax can add 5–10% to material costs. "Owner is tax-exempt" means you must obtain exemption certificates for each purchase order — missing them = you pay the tax.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r =>
            (r.categories?.taxes?.items || []).length > 0
          );
          if (!hit) return { status: 'info', text: 'No explicit tax treatment language found — assume standard applicable taxes', page: null };
          const item = hit.categories.taxes.items[0];
          const exc = item?.excerpt || '';
          const isExempt = /tax[\s\-]?exempt/i.test(exc);
          return {
            status: 'warn',
            text: isExempt
              ? 'Owner is tax-exempt \u2014 obtain exemption certificates for all material purchases'
              : 'Tax treatment language found \u2014 verify who is responsible for sales/use tax',
            page: item?.page,
            section: hit.sectionNumber,
            highlight: exc,
          };
        },
      },
      {
        id: 'contract_form',
        label: 'Contract form identified (AIA / ConsensusDocs)',
        impact: 'AIA A201 and ConsensusDocs have different default dispute resolution, indemnification, and change order provisions. Know which form governs before you sign the subcontract.',
        evaluate: (results) => {
          const hit = Object.values(results).find(r =>
            (r.categories?.contractTerms?.items || []).length > 0
          );
          if (!hit) return { status: 'info', text: 'Contract form not detected — verify governing document with GC', page: null };
          const item = hit.categories.contractTerms.items[0];
          return { status: 'info', text: 'Contract form identified — review dispute resolution, indemnification, and change order terms', page: item?.page, section: hit.sectionNumber, highlight: item?.excerpt };
        },
      },
    ],
  },
];

// ── Risk score computation ────────────────────────────────────────────────────
function computeRiskScore(checklistResults) {
  let riskPoints = 0;
  checklistResults.forEach(group => {
    group.items.forEach(item => {
      if (item.result.status === 'risk')    riskPoints += 3;
      if (item.result.status === 'warn')    riskPoints += 1;
      if (item.result.status === 'missing') riskPoints += 1;
    });
  });
  if (riskPoints === 0) return { level: 'Low',    color: '#3fb950', bg: 'rgba(63,185,80,0.12)' };
  if (riskPoints <= 3)  return { level: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return                       { level: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
};

const STATUS_ICON = { ok: '✅', warn: '⚠️', risk: '🔴', missing: '❌', clear: '✔', info: 'ℹ️' };
const STATUS_COLOR = { ok: '#3fb950', warn: '#f59e0b', risk: '#ef4444', missing: '#ef4444', clear: '#6b7280', info: '#58a6ff' };

// ── localStorage helpers ───────────────────────────────────────────────────────
function storageKey(project) {
  return `glazebid:specSort:${project}`;
}

function loadSaved(project) {
  try {
    const raw = localStorage.getItem(storageKey(project));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToStorage(project, data) {
  try {
    localStorage.setItem(storageKey(project), JSON.stringify(data));
  } catch (e) {
    console.warn('specSort: localStorage write failed', e.message);
  }
}

// Transform [x, y] by a 6-element PDF matrix [a,b,c,d,e,f]
function applyMatrix([x, y], [a, b, c, d, e, f]) {
  return [a * x + c * y + e, b * x + d * y + f];
}

// ── PDF canvas renderer ────────────────────────────────────────────────────────
// ── Single page canvas with double-buffer rendering (from legacy PDFViewer) ───
// Borrowed from: GlazeBid AIQ Suite/_LEGACY_ARCHIVE/GlazeBid_AIQ/PDFViewer_FULL_CODE.jsx
// Double-buffer: render to off-screen canvas, then blit to visible → no white flash.
function PageCanvas({ pdfDoc, pageNum, containerWidth, shouldRender, highlight, storedRects }) {
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);           // semi-transparent highlight overlay
  const renderTask   = useRef(null);
  const bufferCanvas = useRef(document.createElement('canvas')); // off-screen
  const lastKey      = useRef(null);
  const renderInfo   = useRef(null);           // { page, vp, dpr } saved after each render
  const [cssSize, setCssSize] = useState(null); // { w, h } in CSS pixels once rendered

  useEffect(() => {
    if (!shouldRender || !pdfDoc || !containerWidth) return;

    const key = `${pageNum}:${containerWidth}`;
    if (lastKey.current === key) return; // already rendered at this size

    let cancelled = false;

    async function render() {
      if (renderTask.current) {
        try { renderTask.current.cancel(); } catch {}
        renderTask.current = null;
      }

      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      const vp0 = page.getViewport({ scale: 1 });
      const targetScale = Math.min((containerWidth - 32) / vp0.width, 2);
      const dpr = window.devicePixelRatio || 1;
      const vp  = page.getViewport({ scale: targetScale });

      const cssW = vp.width;
      const cssH = vp.height;
      const pxW  = Math.round(cssW * dpr);
      const pxH  = Math.round(cssH * dpr);

      // Render into the off-screen buffer
      const buf = bufferCanvas.current;
      buf.width  = pxW;
      buf.height = pxH;
      const bufCtx = buf.getContext('2d');
      bufCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const task = page.render({ canvasContext: bufCtx, viewport: vp });
      renderTask.current = task;

      try {
        await task.promise;
        if (cancelled) return;

        // Blit buffer → visible canvas (instant swap, no flash)
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width  = pxW;
        canvas.height = pxH;
        canvas.style.width  = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.getContext('2d').drawImage(buf, 0, 0);

        // Store render info for the highlight overlay
        renderInfo.current = { page, vp, dpr };

        // Size the overlay canvas to match
        const overlay = overlayRef.current;
        if (overlay) {
          overlay.width  = pxW;
          overlay.height = pxH;
          overlay.style.width  = `${cssW}px`;
          overlay.style.height = `${cssH}px`;
          overlay.getContext('2d').clearRect(0, 0, pxW, pxH);
        }

        lastKey.current = key;
        setCssSize({ w: cssW, h: cssH });
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') console.error('[PageCanvas]', err);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, containerWidth, shouldRender]);

  // ── Highlight overlay: draw yellow mask over matching text items ─────────
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!cssSize || !renderInfo.current) return;

    const { vp, dpr } = renderInfo.current;

    // Phase 4 fast path: draw stored rects directly without re-searching
    if (storedRects && storedRects.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(250, 210, 0, 0.45)';
      for (const rect of storedRects) {
        const [x1, y1] = applyMatrix([rect.x, rect.y + rect.height], vp.transform);
        const [x2, y2] = applyMatrix([rect.x + rect.width, rect.y], vp.transform);
        const rx = Math.min(x1, x2) * dpr;
        const ry = Math.min(y1, y2) * dpr - 2;
        const rw = Math.abs(x2 - x1) * dpr;
        const rh = Math.abs(y2 - y1) * dpr + 4;
        if (rw > 2 && rh > 2) ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.restore();
      return;
    }

    if (!highlight || !highlight.trim()) return;

    const { page, vp: vp2, dpr: dpr2 } = renderInfo.current;

    page.getTextContent().then(tc => {
      // ── Shared normalizer (identical to what both scanners use) ──────────
      const norm = s =>
        s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

      // Strip leading/trailing ellipsis specScanner adds to excerpts
      const cleanExcerpt = highlight
        .replace(/^[\u2026\.]{1,3}/, '')
        .replace(/[\u2026\.]{1,3}$/, '')
        .trim();
      const normExcerpt = norm(cleanExcerpt);
      if (normExcerpt.length < 8) return;

      // ── Build two candidate text representations of this page ────────────
      // 1) Natural pdfjs order — matches specScanner excerpts exactly
      // 2) Y-sorted line order — matches specReader excerpts exactly
      //    (specReader uses collapseItemsToLines which sorts by y desc, then x asc)
      const realItems = tc.items.filter(it => typeof it.str === 'string' && it.str);

      const naturalItems = realItems;

      const sortedItems = [...realItems].sort((a, b) => {
        const ay = Math.round(a.transform?.[5] ?? 0);
        const by = Math.round(b.transform?.[5] ?? 0);
        if (ay !== by) return by - ay;  // Y descending (PDF y=0 is bottom)
        return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0); // X ascending
      });

      // Try to find the excerpt in both orderings; prefer the one that matches.
      function tryMatch(items) {
        const normFull = norm(items.map(it => it.str).join(' '));
        let mStart = -1, mLen = 0;
        for (let len = Math.min(normExcerpt.length, 90); len >= 8; len = Math.floor(len * 0.75)) {
          const i = normFull.indexOf(normExcerpt.slice(0, len));
          if (i >= 0) { mStart = i; mLen = len; break; }
        }
        return { normFull, matchStart: mStart, matchLen: mLen };
      }

      let { normFull, matchStart, matchLen } = tryMatch(naturalItems);
      let itemsToUse = naturalItems;
      if (matchStart < 0) {
        ({ normFull, matchStart, matchLen } = tryMatch(sortedItems));
        itemsToUse = sortedItems;
      }
      if (matchStart < 0) return; // genuine miss — excerpt not on this page
      const matchEnd = matchStart + matchLen;

      // ── Alpha-character counting: map normFull[matchStart..matchEnd] → items ─
      // CRITICAL: use case-insensitive /[a-z0-9]/gi so UPPERCASE spec text
      // contributes the same alpha-count as its lowercased normFull equivalent.
      const countAlpha = s => (s.match(/[a-z0-9]/gi) || []).length;

      let alphaBefore = 0;
      for (let i = 0; i < matchStart; i++) {
        if (/[a-z0-9]/i.test(normFull[i])) alphaBefore++;
      }
      let alphaIn = 0;
      for (let i = matchStart; i < matchEnd; i++) {
        if (/[a-z0-9]/i.test(normFull[i])) alphaIn++;
      }
      if (alphaIn === 0) return;

      let acc = 0;
      ctx.save();
      ctx.fillStyle = 'rgba(250, 210, 0, 0.45)';
      for (const item of itemsToUse) {
        const iAlpha = countAlpha(item.str);
        const iStart = acc;
        const iEnd   = acc + iAlpha;
        acc += iAlpha;

        if (iEnd <= alphaBefore || iStart >= alphaBefore + alphaIn) continue;
        if (!item.transform || !item.width) continue;

        const [, , , , e, f] = item.transform;
        const fontH = item.height || Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
        const [x1, y1] = applyMatrix([e, f + fontH], vp2.transform);
        const [x2, y2] = applyMatrix([e + item.width, f], vp2.transform);
        const rx = Math.min(x1, x2) * dpr2;
        const ry = Math.min(y1, y2) * dpr2 - 2;
        const rw = Math.abs(x2 - x1) * dpr2;
        const rh = Math.abs(y2 - y1) * dpr2 + 4;
        if (rw > 2 && rh > 2) ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }).catch(() => {});
  }, [highlight, storedRects, cssSize]);

  // Placeholder dimensions: estimate based on US Letter ratio (1:1.294)
  const estimatedH = containerWidth ? Math.round((containerWidth - 32) * 1.294) : 900;
  const placeholderW = containerWidth ? containerWidth - 32 : 600;

  return (
    <div style={{
      position: 'relative',
      width: cssSize ? cssSize.w : placeholderW,
      height: cssSize ? cssSize.h : estimatedH,
      margin: '0 auto',
      borderRadius: 3,
      overflow: 'hidden',
      boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    }}>
      {/* Gray placeholder shown until canvas is ready */}
      {!cssSize && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #1c1c20 0%, #18181b 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6,
        }}>
          {shouldRender && (
            <div style={{ width: 18, height: 18, border: '2px solid #30363d', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          )}
          <span style={{ fontSize: '0.65rem', color: '#484f58' }}>p.{pageNum}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: cssSize ? 'block' : 'none', maxWidth: '100%' }}
      />
      {/* Highlight overlay — drawn on top, pointer-events disabled */}
      <canvas
        ref={overlayRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          pointerEvents: 'none',
          display: cssSize ? 'block' : 'none',
          maxWidth: '100%',
        }}
      />
    </div>
  );
}

// ── Continuous scroll PDF viewer ───────────────────────────────────────────────
// All pages rendered in a vertical list. IntersectionObserver tracks the current
// visible page and triggers lazy rendering of nearby pages.
function PdfScrollViewer({ pdfDoc, currentPage, onPageChange, containerWidth, highlightPage, highlightText, highlightRects }) {
  const numPages = pdfDoc?.numPages || 0;
  const scrollRef = useRef(null);
  // Lazily expand this set as pages come into view
  const [renderedSet, setRenderedSet] = useState(() => new Set([1, 2, 3]));
  // Track last page we reported to parent, to distinguish external vs internal changes
  const lastReported = useRef(currentPage);
  // Suppress IO-driven page updates during a programmatic scroll
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef(null);

  // ── IntersectionObserver: report the most-visible page to the parent ──────
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || numPages === 0) return;

    const ratios = {};

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const p = parseInt(entry.target.dataset.page, 10);
        if (!isNaN(p)) ratios[p] = entry.intersectionRatio;
      });

      // Don't report during a programmatic scroll — it causes a fight
      if (isScrollingRef.current) return;

      let best = lastReported.current, bestRatio = -1;
      Object.entries(ratios).forEach(([p, r]) => {
        if (r > bestRatio) { bestRatio = r; best = parseInt(p, 10); }
      });

      if (bestRatio > 0.01 && best !== lastReported.current) {
        lastReported.current = best;
        onPageChange?.(best);

        // Pre-render neighbors
        setRenderedSet(prev => {
          const next = new Set(prev);
          for (let p = Math.max(1, best - 1); p <= Math.min(numPages, best + 4); p++) next.add(p);
          return next;
        });
      }
    }, { root: scrollEl, threshold: [0.01, 0.1, 0.3, 0.5, 0.75] });

    scrollEl.querySelectorAll('[data-page]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, pdfDoc, onPageChange]);

  // ── Scroll to page when currentPage changes externally (sidebar click, nav input) ──
  useEffect(() => {
    if (currentPage === lastReported.current) return; // our own update flowing back
    lastReported.current = currentPage;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Block IO feedback during the scroll so it can't fight us
    isScrollingRef.current = true;
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => { isScrollingRef.current = false; }, 700);

    const el = scrollEl.querySelector(`[data-page="${currentPage}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Ensure target page & neighbors are rendered
    setRenderedSet(prev => {
      const next = new Set(prev);
      for (let p = Math.max(1, currentPage - 1); p <= Math.min(numPages, currentPage + 3); p++) next.add(p);
      return next;
    });
    return () => clearTimeout(scrollTimerRef.current);
  }, [currentPage, numPages]);

  if (!pdfDoc || numPages === 0) return null;

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '20px 0 48px',
        background: '#09090b',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
        <div
          key={pageNum}
          data-page={pageNum}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 16px' }}
        >
          <PageCanvas
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            containerWidth={containerWidth}
            shouldRender={renderedSet.has(pageNum)}
            highlight={pageNum === highlightPage ? highlightText : null}
            storedRects={pageNum === highlightPage ? highlightRects : null}
          />
          <span style={{ fontSize: '0.62rem', color: '#333', userSelect: 'none' }}>{pageNum}</span>
        </div>
      ))}
    </div>
  );
}

// ── Scanner category label lookup (key → { label, short }) ───────────────────
const SCAN_CAT_META_MAP = Object.fromEntries(
  SCAN_CATEGORIES.map(c => [c.key, { label: c.label, short: c.short }])
);

// ── Scan Result Card ───────────────────────────────────────────────────────────
function ScanResultCard({ result, onJumpToPage }) {
  const [expanded, setExpanded] = useState(false);
  const cats = result?.categories || {};
  const foundKeys = Object.keys(cats).filter(k => cats[k]?.status === 'found');

  // All page numbers in result.categories and result.findings are already absolute
  // (converted at scan time). Use them directly.
  const headerPage = result.startPage;

  return (
    <div style={{
      background: '#13181f', border: '1px solid #21262d', borderRadius: 8, marginBottom: 8,
    }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e6edf3' }}>
            {result.sectionNumber}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>
            {result.sectionTitle}
          </span>
          {headerPage && onJumpToPage && (
            <button
              onClick={e => { e.stopPropagation(); onJumpToPage(headerPage); }}
              style={{
                fontSize: '0.62rem', color: '#388bfd', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}
            >
              View p.{headerPage}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {foundKeys.map(k => (
            <span key={k} style={{
              fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: CATEGORY_META[k]?.color + '22' || '#374151',
              color: CATEGORY_META[k]?.color || '#8b949e',
              border: `1px solid ${CATEGORY_META[k]?.color || '#374151'}40`,
            }}>
              {CATEGORY_META[k]?.short || k}
            </span>
          ))}
          {!!result.error && (
            <span style={{ fontSize: '0.7rem', color: '#f85149' }}>Error</span>
          )}
          <span style={{ fontSize: '0.72rem', color: '#8b949e', marginLeft: 4 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #21262d' }}>
          {!!result.error && (
            <p style={{ fontSize: '0.75rem', color: '#f85149', margin: '8px 0' }}>
              Scan failed: {result.error}
            </p>
          )}
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const cat = cats[key];
            if (!cat) return null;
            return (
              <div key={key} style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: meta.color + '20', color: meta.color, border: `1px solid ${meta.color}40`,
                  }}>
                    {meta.short}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#c9d1d9' }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: cat.status === 'found' ? '#3fb950' : '#6b7280' }}>
                    {cat.status === 'found' ? '✓ Found' : '— Not found'}
                  </span>
                </div>
                {cat.status === 'found' && Array.isArray(cat.items) && cat.items.slice(0, 2).map((item, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid #21262d',
                    borderRadius: 4, padding: '6px 8px', marginTop: 4,
                    fontSize: '0.73rem', color: '#8b949e', lineHeight: 1.55,
                  }}>
                    {item.manufacturer && (
                      <span style={{ fontWeight: 700, color: '#58a6ff', marginRight: 6 }}>
                        {item.manufacturer}
                      </span>
                    )}
                    {item.product && (
                      <span style={{ color: '#c9d1d9', marginRight: 6 }}>{item.product}</span>
                    )}
                    {item.value && (
                      <span style={{ color: '#34d399', marginRight: 6 }}>{item.value}</span>
                    )}
                    {item.excerpt && (
                      <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        {item.excerpt.length > 180 ? item.excerpt.slice(0, 180) + '…' : item.excerpt}
                      </span>
                    )}
                    {item.page && (
                      <button
                        onClick={() => onJumpToPage?.(item.page, item.excerpt)}
                        style={{
                          color: '#388bfd', background: 'none', border: 'none',
                          cursor: 'pointer', padding: 0, marginLeft: 8,
                          fontSize: '0.68rem', textDecoration: 'underline',
                        }}
                      >
                        → p.{item.page}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* ── Scanner findings (specScanner results) ───────────────── */}
          {(() => {
            const hits = Object.entries(result.findings || {}).filter(([, f]) => f?.found);
            if (!hits.length) return null;
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 700, color: '#8b949e',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                }}>
                  Scanner Flags
                </div>
                {hits.map(([key, f]) => {
                  const meta = SCAN_CAT_META_MAP[key];
                  const label = meta?.label ?? key;
                  const short = meta?.short ?? key.toUpperCase();
                  return (
                    <div key={key} style={{
                      marginTop: 5, padding: '6px 8px',
                      background: 'rgba(245,158,11,0.05)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            border: '1px solid rgba(245,158,11,0.3)',
                          }}>
                            {short}
                          </span>
                          <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#e6edf3' }}>
                            {label}
                          </span>
                        </div>
                        {f.page && (
                          <button
                            onClick={() => onJumpToPage?.(f.page, f.excerpt)}
                            style={{
                              fontSize: '0.68rem', color: '#388bfd', background: 'none',
                              border: 'none', cursor: 'pointer', padding: 0,
                              textDecoration: 'underline', whiteSpace: 'nowrap',
                            }}
                          >
                            → p.{f.page}
                          </button>
                        )}
                      </div>
                      {f.excerpt && (
                        <p style={{
                          fontSize: '0.7rem', color: '#8b949e', fontStyle: 'italic',
                          margin: '4px 0 0', lineHeight: 1.45,
                        }}>
                          "{f.excerpt.length > 220 ? f.excerpt.slice(0, 220) + '…' : f.excerpt}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── ChecklistTab ──────────────────────────────────────────────────────────────
// ── Grade helpers for verdict header (Task 3) ─────────────────────────────────
function computeGrade(riskScore, checklistResults) {
  if (!riskScore || !checklistResults.length) return null;
  const riskItems  = checklistResults.reduce((n, g) => n + g.items.filter(i => i.result?.status === 'risk').length, 0);
  const warnItems  = checklistResults.reduce((n, g) => n + g.items.filter(i => i.result?.status === 'warn' || i.result?.status === 'missing').length, 0);
  if (riskItems >= 4) return { grade: 'D', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
  if (riskItems >= 2) return { grade: 'C', color: '#f97316', bg: 'rgba(249,115,22,0.15)' };
  if (riskItems >= 1 || warnItems >= 3) return { grade: 'B', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  return { grade: 'A', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' };
}

function buildVerdictSentence(riskScore, checklistResults) {
  if (!riskScore) return '';
  const risks  = checklistResults.reduce((n, g) => n + g.items.filter(i => i.result?.status === 'risk').length, 0);
  const warns  = checklistResults.reduce((n, g) => n + g.items.filter(i => i.result?.status === 'warn').length, 0);
  const gcQ    = checklistResults.reduce((n, g) => n + g.items.filter(i =>
    i.result?.status === 'risk' && (i.id === 'delegated_design' || i.id === 'no_subs' || i.id === 'field_testing')
  ).length, 0);
  if (riskScore.level === 'Low') return 'Spec looks clean — proceed with standard bid assumptions.';
  const parts = [];
  if (risks > 0) parts.push(`${risks} thing${risks !== 1 ? 's' : ''} could cost you money`);
  if (warns > 0) parts.push(`${warns} ${warns !== 1 ? 'items' : 'item'} to verify`);
  const tail = gcQ > 0 ? ` ${gcQ} need a question to the GC before bid day.` : '';
  return `Bid with caution — ${parts.join(', ')}.${tail}`;
}

// ── ChecklistTab ──────────────────────────────────────────────────────────────
function ChecklistTab({ checklistResults, riskScore, onJumpToPage, neverBidHits = [] }) {
  if (!checklistResults.length) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
        <p style={{ fontSize: '0.8rem', color: '#484f58', textAlign: 'center' }}>
          Scan sections first to generate the risk checklist.
        </p>
      </div>
    );
  }

  const gradeInfo = computeGrade(riskScore, checklistResults);
  const verdict   = buildVerdictSentence(riskScore, checklistResults);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* ── Never-bid stop banner — the company's own hard NO, above everything.
             This outranks the grade: no point reading a risk report for scope
             the company does not bid. ── */}
      {neverBidHits.length > 0 && (
        <div style={{
          flexShrink: 0, padding: '12px 16px',
          background: 'rgba(239,68,68,0.15)',
          borderBottom: '2px solid #ef4444',
        }}>
          <div style={{
            fontSize: '0.8rem', fontWeight: 800, color: '#ef4444',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span>🛑</span> Your playbook says you don&rsquo;t bid this
          </div>
          {neverBidHits.map((h, i) => (
            <div
              key={`${h.phrase}-${h.sectionNumber}-${i}`}
              onClick={() => h.page && onJumpToPage?.(h.page)}
              style={{
                fontSize: '0.73rem', color: '#c9d1d9', marginTop: 5, lineHeight: 1.5,
                cursor: h.page ? 'pointer' : 'default',
              }}
            >
              <strong style={{ color: '#f85149' }}>{h.phrase}</strong>
              {' — found in '}
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{h.sectionNumber}</span>
              {h.sectionTitle ? ` ${h.sectionTitle}` : ''}
              {h.page ? <span style={{ color: '#58a6ff' }}> · p. {h.page}</span> : null}
            </div>
          ))}
        </div>
      )}

      {/* ── Verdict header (Task 3) ── */}
      {gradeInfo && (
        <div style={{
          flexShrink: 0, padding: '12px 16px',
          background: gradeInfo.bg,
          borderBottom: `1px solid ${gradeInfo.color}33`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0,
            background: gradeInfo.color + '22', border: `2px solid ${gradeInfo.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 900, color: gradeInfo.color, lineHeight: 1,
          }}>
            {gradeInfo.grade}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: gradeInfo.color, lineHeight: 1.3 }}>
              {riskScore?.level} Risk
            </div>
            <div style={{ fontSize: '0.73rem', color: '#c9d1d9', marginTop: 3, lineHeight: 1.5 }}>
              {verdict}
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: '0.62rem', color: '#484f58', padding: '4px 16px', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
        Every page link is verified — no link, no claim.
      </div>

      {/* Groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {checklistResults.map(group => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            {/* Group header */}
            <div style={{
              padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700,
              color: group.color, letterSpacing: '0.03em', textTransform: 'uppercase',
              background: group.color + '10', borderBottom: `1px solid ${group.color}20`,
            }}>
              {group.label}
            </div>

            {/* Items */}
            {group.items.map(item => {
              const r = item.result || {};
              const icon  = STATUS_ICON[r.status]  || '❓';
              const color = STATUS_COLOR[r.status] || '#8b949e';
              const canJump = r.page && onJumpToPage;

              return (
                <div key={item.id} style={{
                  padding: '9px 14px', borderBottom: '1px solid rgba(33,38,45,0.6)',
                  background: r.status === 'risk' ? 'rgba(239,68,68,0.04)' :
                              r.status === 'warn' ? 'rgba(245,158,11,0.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: '0.9rem', flexShrink: 0, lineHeight: 1.3 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color, lineHeight: 1.3 }}>
                        {item.label}
                      </div>
                      {/* Meaning-first: impact before text/excerpt (Task 3) */}
                      {['risk', 'warn'].includes(r.status) && item.impact && (
                        <div style={{
                          marginTop: 4, fontSize: '0.72rem', fontWeight: 500,
                          color: r.status === 'risk' ? '#fca5a5' : '#fcd34d',
                          lineHeight: 1.45,
                        }}>
                          {item.impact}
                        </div>
                      )}
                      {r.text && (
                        <div style={{ fontSize: '0.7rem', color: '#8b949e', marginTop: 3, lineHeight: 1.4 }}>
                          {r.text}
                        </div>
                      )}
                      {/* Citation */}
                      {(r.page || r.section) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {r.section && (
                            <span style={{
                              fontSize: '0.62rem', padding: '1px 5px', borderRadius: 3,
                              background: '#21262d', color: '#8b949e',
                            }}>
                              {r.section}
                            </span>
                          )}
                          {r.page && (
                            <button
                              onClick={() => canJump && onJumpToPage(r.page, r.highlight)}
                              style={{
                                fontSize: '0.62rem', color: '#388bfd', background: 'none',
                                border: 'none', cursor: canJump ? 'pointer' : 'default',
                                padding: 0, textDecoration: canJump ? 'underline' : 'none',
                              }}
                            >
                              → p.{r.page}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────
function SummaryCard({ scanResults, sections, riskScore, onJumpToPage }) {
  if (!Object.keys(scanResults).length) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <p style={{ fontSize: '0.8rem', color: '#484f58', textAlign: 'center' }}>
          Scan sections to generate the project spec summary.
        </p>
      </div>
    );
  }

  // Compile manufacturers across all scanned sections
  const manufacturers = [];
  Object.values(scanResults).forEach(r => {
    (r.categories?.basisOfDesign?.items || []).forEach(item => {
      if (item.manufacturer && !manufacturers.find(m => m.name === item.manufacturer)) {
        manufacturers.push({ name: item.manufacturer, product: item.product, page: item.page, section: r.sectionNumber });
      }
    });
  });

  // Finish — first found
  const finishHit = Object.values(scanResults).find(r =>
    r.findings?.finish?.found || r.categories?.finish?.status === 'found'
  );
  const finishText = finishHit?.findings?.finish?.excerpt
    || finishHit?.categories?.finish?.items?.[0]?.value
    || 'Not detected';
  const finishPage = finishHit?.findings?.finish?.page
    || finishHit?.categories?.finish?.items?.[0]?.page;

  // Performance — first found
  const perfHit = Object.values(scanResults).find(r =>
    r.findings?.performance?.found || r.categories?.performance?.status === 'found'
  );
  const perfText = perfHit?.findings?.performance?.excerpt?.slice(0, 120)
    || perfHit?.categories?.performance?.items?.[0]?.excerpt?.slice(0, 120)
    || 'Not detected';
  const perfPage = perfHit?.findings?.performance?.page
    || perfHit?.categories?.performance?.items?.[0]?.page;

  // Substitution stance
  const subHits = Object.values(scanResults).filter(r =>
    r.categories?.substitution?.status === 'found' || r.findings?.substitutions?.found
  );
  const allExcerpts = subHits.map(r =>
    [...(r.categories?.substitution?.items || []).map(i => i.excerpt || ''),
     r.findings?.substitutions?.excerpt || ''].join(' ')
  ).join(' ');
  const noSubs = /no\s+substitut|sole\s+source|proprietary|no\s+equal/i.test(allExcerpts);
  const orEqual = /approved\s+equal|or\s+equal|alternate\s+manufacturer/i.test(allExcerpts);
  const substanceStance = noSubs ? '🔴 NO SUBSTITUTIONS' : orEqual ? '🟡 Approved Equal Basis' : subHits.length ? '🟢 Substitutions Permitted' : '— Not Specified';

  // Special requirements  
  const specials = [];
  const ddHit = Object.values(scanResults).find(r => r.findings?.delegatedDesign?.found);
  if (ddHit) specials.push({ icon: '⚠️', label: 'Delegated Design required (PE stamp)', page: ddHit.findings.delegatedDesign.page, section: ddHit.sectionNumber });
  const mockHit = Object.values(scanResults).find(r => r.findings?.mockup?.found);
  if (mockHit) specials.push({ icon: '⚠️', label: 'Mock-up required', page: mockHit.findings.mockup.page, section: mockHit.sectionNumber });
  const testHit = Object.values(scanResults).find(r => r.findings?.testRequirements?.found);
  if (testHit) specials.push({ icon: '⚠️', label: 'Field testing required (AAMA/ASTM)', page: testHit.findings.testRequirements.page, section: testHit.sectionNumber });
  const qualHit = Object.values(scanResults).find(r => r.findings?.qualifications?.found);
  if (qualHit) specials.push({ icon: 'ℹ️', label: 'Installer qualifications required', page: qualHit.findings.qualifications.page, section: qualHit.sectionNumber });

  // Div 08 sections
  const div08Sections = sections.filter(s => s.sectionNumber.replace(/[\s.\-]/g, '').startsWith('08'));

  const riskBg    = riskScore?.level === 'High'   ? '#7f1d1d'
                  : riskScore?.level === 'Medium'  ? '#78350f'
                  : '#14532d';
  const riskColor = riskScore?.level === 'High'   ? '#fca5a5'
                  : riskScore?.level === 'Medium'  ? '#fcd34d'
                  : '#86efac';

  const SectionRow = ({ label, children }) => (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #21262d' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Risk banner */}
      {riskScore && (
        <div style={{ padding: '10px 14px', background: riskBg, flexShrink: 0 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: riskColor }}>
            {riskScore.level === 'High' ? '🔴' : riskScore.level === 'Medium' ? '⚠️' : '✅'}{' '}
            {riskScore.level} Risk
          </span>
          <span style={{ fontSize: '0.7rem', color: riskColor + 'bb', marginLeft: 8 }}>
            {riskScore.score} item{riskScore.score !== 1 ? 's' : ''} flagged
          </span>
        </div>
      )}

      {/* Glazing Scope */}
      <SectionRow label="Glazing Scope (Div 08)">
        {div08Sections.length === 0
          ? <span style={{ fontSize: '0.75rem', color: '#484f58' }}>No Division 08 sections detected</span>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {div08Sections.map(s => (
                <button
                  key={s.sectionNumber}
                  onClick={() => s.startPage && onJumpToPage?.(s.startPage)}
                  style={{
                    padding: '2px 7px', fontSize: '0.68rem', fontWeight: 600, borderRadius: 4,
                    background: '#1d3a6e', color: '#58a6ff', border: '1px solid #1e4080',
                    cursor: s.startPage ? 'pointer' : 'default',
                  }}
                >
                  {s.sectionNumber}
                </button>
              ))}
            </div>
        }
      </SectionRow>

      {/* Basis of Design */}
      <SectionRow label="Basis of Design">
        {manufacturers.length === 0
          ? <span style={{ fontSize: '0.75rem', color: '#484f58' }}>No manufacturers identified</span>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {manufacturers.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#58a6ff' }}>{m.name}</span>
                  {m.product && <span style={{ fontSize: '0.73rem', color: '#c9d1d9' }}>{m.product}</span>}
                  {m.page && (
                    <button onClick={() => m.page && onJumpToPage?.(m.page)}
                      style={{ fontSize: '0.62rem', color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                      p.{m.page}
                    </button>
                  )}
                </div>
              ))}
            </div>
        }
      </SectionRow>

      {/* Finish */}
      <SectionRow label="Finish Specification">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: '#c9d1d9', flex: 1, lineHeight: 1.45 }}>
            {finishText.length > 150 ? finishText.slice(0, 150) + '…' : finishText}
          </span>
          {finishPage && (
            <button onClick={() => onJumpToPage?.(finishPage)}
              style={{ fontSize: '0.62rem', color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', textDecoration: 'underline' }}>
              p.{finishPage}
            </button>
          )}
        </div>
      </SectionRow>

      {/* Performance */}
      <SectionRow label="Performance Requirements">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: '#c9d1d9', flex: 1, lineHeight: 1.45, fontStyle: perfText === 'Not detected' ? 'normal' : 'italic' }}>
            {perfText.length > 150 ? perfText.slice(0, 150) + '…' : perfText}
          </span>
          {perfPage && (
            <button onClick={() => onJumpToPage?.(perfPage)}
              style={{ fontSize: '0.62rem', color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', textDecoration: 'underline' }}>
              p.{perfPage}
            </button>
          )}
        </div>
      </SectionRow>

      {/* Substitution stance */}
      <SectionRow label="Substitution Stance">
        <span style={{
          fontSize: '0.78rem', fontWeight: 600,
          color: noSubs ? '#f87171' : orEqual ? '#fcd34d' : subHits.length ? '#4ade80' : '#6b7280',
        }}>
          {substanceStance}
        </span>
      </SectionRow>

      {/* Special requirements */}
      <SectionRow label="Special Requirements">
        {specials.length === 0
          ? <span style={{ fontSize: '0.75rem', color: '#3fb950' }}>✓ None detected</span>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {specials.map((sp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem' }}>{sp.icon}</span>
                  <span style={{ fontSize: '0.75rem', color: '#c9d1d9', flex: 1 }}>{sp.label}</span>
                  {sp.section && <span style={{ fontSize: '0.62rem', color: '#484f58', background: '#21262d', padding: '1px 4px', borderRadius: 3 }}>{sp.section}</span>}
                  {sp.page && (
                    <button onClick={() => onJumpToPage?.(sp.page)}
                      style={{ fontSize: '0.62rem', color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                      p.{sp.page}
                    </button>
                  )}
                </div>
              ))}
            </div>
        }
      </SectionRow>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SpecSorterPage({ project, sheets = [], onBack }) {
  // ── PDF state
  const [pdfBuffer, setPdfBuffer] = useState(null);        // Uint8Array
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeHighlight, setActiveHighlight] = useState(null); // { page, text, rects? }
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(600);

  // ── Sort state
  const [stage, setStage] = useState('sections'); // 'upload' | 'sections' | 'report'
  const [activeTab, setActiveTab] = useState('checklist'); // 'checklist' | 'summary' | 'readings'
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(null); // { page, total, sectionsFound }
  const [parseError, setParseError] = useState(null);
  const [parseNeedsOcr, setParseNeedsOcr] = useState(false);
  const [sections, setSections] = useState([]);            // from parseSpecSectionsV2

  // ── Company playbook (per company, loaded once) ────────────────────────────
  const [playbook, setPlaybook] = useState(null);
  useEffect(() => { loadPlaybook().then(setPlaybook).catch(() => {}); }, []);
  const playbookCats = useMemo(() => playbookCategories(playbook), [playbook]);
  const [sectionScope, setSectionScope] = useState({});    // { [sectionNumber]: true|false }
  const [selected, setSelected] = useState({});            // checkboxes for scanning
  const [filter, setFilter] = useState('scope');           // 'scope'|'review'|'all'

  // ── Scan state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanResults, setScanResults] = useState({});      // { [sectionNumber]: result }
  const [chatOpen, setChatOpen] = useState(false);
  const [aiEnhance, setAiEnhance] = useState(false);       // AI enhancement toggle
  const [hasAiKey, setHasAiKey] = useState(false);         // whether Anthropic key is saved
  const [aiScanStatus, setAiScanStatus] = useState('');    // per-section AI status text

  // ── Persist state
  const [saved, setSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // ── Measure viewer container width
  useEffect(() => {
    if (!viewerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w) setViewerWidth(w);
    });
    ro.observe(viewerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Check for Anthropic API key on mount
  useEffect(() => {
    window.electronAPI?.aiKeyCheck?.().then(res => {
      if (res?.hasKey) setHasAiKey(true);
    }).catch(() => {});
  }, []);

  // ── Load saved state for this project
  useEffect(() => {
    if (!project) return;
    const saved = loadSaved(project);
    if (!saved) return;
    if (saved.sections?.length) setSections(saved.sections);
    if (saved.sectionScope) setSectionScope(saved.sectionScope);
    if (saved.scanResults) setScanResults(saved.scanResults);
    if (saved.savedAt) setLastSavedAt(saved.savedAt);
    if (saved.pdfFileName) setPdfFileName(saved.pdfFileName);
  }, [project]);

  // ── Auto-load spec file from project sheets
  useEffect(() => {
    if (!project || !sheets.length) return;
    const specSheet = sheets.find(s =>
      (s.category || '').toLowerCase() === 'specifications' && s.path
    );
    if (!specSheet) return;
    loadFromFilePath(specSheet.path, specSheet.name || 'Specifications');
  }, [project, sheets]);

  // ── Load PDF buffer via Electron IPC
  async function loadFromFilePath(filePath, fileName) {
    if (!filePath) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      let buffer;
      if (window.electronAPI?.readPdfFile) {
        const result = await window.electronAPI.readPdfFile(filePath);
        if (!result?.ok) throw new Error(result?.error || 'Could not read file');
        buffer = result.buffer instanceof Uint8Array
          ? result.buffer
          : new Uint8Array(result.buffer);
      } else {
        throw new Error('No file-reading API available');
      }
      await openBuffer(buffer, fileName || filePath.split(/[\\/]/).pop());
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Load PDF buffer from a File drag/drop or file picker
  async function loadFromFile(file) {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const ab = await file.arrayBuffer();
      const buf = new Uint8Array(ab);
      await openBuffer(buf, file.name);
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Open a buffer — load pdfjs document + auto-parse
  async function openBuffer(buf, fileName) {
    setPdfBuffer(buf);
    setPdfFileName(fileName || 'spec.pdf');
    setCurrentPage(1);
    setSections([]);
    setScanResults({});
    setSectionScope({});

    const safeCopy = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const doc = await pdfjsLib.getDocument({
      data: safeCopy,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    setPdfDoc(doc);
    setNumPages(doc.numPages);

    // Auto-parse
    await runParse(buf);
  }

  // ── Run parseSpecSectionsV2
  async function runParse(buf) {
    const source = buf || pdfBuffer;
    if (!source) return;
    setParsing(true);
    setParseError(null);
    setParseNeedsOcr(false);
    setParseProgress(null);
    try {
      const result = await parseSpecSectionsV2(new Uint8Array(source));
      if (!Array.isArray(result)) {
        if (result?.needsOcr) {
          setParseNeedsOcr(true);
          setParseError('This PDF is a scanned document with no text layer — OCR is required before sections can be detected.');
        } else {
          setParseError(result?.error || 'Could not detect sections in this PDF.');
        }
        setSections([]);
      } else {
        // specSorterV2 classifies at DIVISION level — every Division 08 section
        // comes back as scope. That is wrong: hollow metal doors, overhead doors
        // and hardware are other subs' work. Re-classify by 4-digit FAMILY so
        // the estimator is never handed another trade's sections as their scope.
        const classified = result.map((s) => {
          const c = classifySection(s.sectionNumber);
          return {
            ...s,
            scopeBucket:       c.bucket,
            scopeLabel:        c.label,
            scopeReason:       c.reason,
            scopeDivision:     c.division,
            isScopeRelevant:   c.bucket === 'scope',
            isReviewRelevant:  c.bucket === 'review',
            isGlazingRelevant: c.bucket === 'scope' || c.bucket === 'review',
          };
        });
        setSections(classified);
        // Default scope: only true glazing families start in scope
        const scope = {};
        classified.forEach(s => {
          scope[s.sectionNumber] = s.scopeBucket === 'scope';
        });
        setSectionScope(scope);
        // Default-check scope families + review divisions for scanning
        const preCheck = {};
        classified.forEach(s => {
          preCheck[s.sectionNumber] = !!(s.isScopeRelevant || s.isReviewRelevant);
        });
        setSelected(preCheck);
        if (classified.length > 0) setStage('sections');
      }
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
      setParseProgress(null);
    }
  }

  // ── Persist to localStorage
  function handleSave() {
    const data = {
      pdfFileName,
      sections,
      sectionScope,
      scanResults,
      savedAt: new Date().toISOString(),
    };
    saveToStorage(project, data);
    setSaved(true);
    setLastSavedAt(data.savedAt);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Section scope toggle
  const toggleScope = (sectionNumber) => {
    setSectionScope(prev => ({ ...prev, [sectionNumber]: !prev[sectionNumber] }));
  };

  // ── Checkbox select
  const toggleSelect = (sectionNumber) => {
    setSelected(prev => ({ ...prev, [sectionNumber]: !prev[sectionNumber] }));
  };

  const selectAll = () => {
    const filtered = getFiltered();
    const allNumbers = filtered.map(s => s.sectionNumber);
    const allSelected = allNumbers.every(n => selected[n]);
    if (allSelected) {
      const next = { ...selected };
      allNumbers.forEach(n => { next[n] = false; });
      setSelected(next);
    } else {
      const next = { ...selected };
      allNumbers.forEach(n => { next[n] = true; });
      setSelected(next);
    }
  };

  // ── Filter sections
  function getFiltered() {
    return sections.filter(s => {
      if (filter === 'scope')  return s.isScopeRelevant;
      if (filter === 'review') return s.isReviewRelevant;
      if (filter === 'in')    return sectionScope[s.sectionNumber] !== false;
      if (filter === 'out')   return sectionScope[s.sectionNumber] === false;
      return true;
    });
  }

  // ── Scan selected sections
  async function handleScan() {
    const toScan = sections.filter(s => selected[s.sectionNumber]);
    if (!toScan.length || !pdfBuffer) return;
    setScanning(true);
    setScanProgress({ current: 0, total: toScan.length });
    setActiveTab('readings');

    // Build lookup: sectionNumber → absolute startPage in full PDF
    const sectionStartPages = {};
    toScan.forEach(s => { sectionStartPages[s.sectionNumber] = s.startPage; });

    // Extract PDF pages for each selected section
    let extracted = [];
    try {
      extracted = await extractSections(pdfBuffer, toScan.map(s => ({
        sectionNumber:  s.sectionNumber,
        sectionTitle:   s.sectionTitle,
        startPage:      s.startPage,
        endPage:        s.endPage,
      })));
    } catch (err) {
      console.error('extractSections failed:', err);
      setScanning(false);
      return;
    }

    // Scan each extracted buffer with both engines
    const newResults = { ...scanResults };
    for (let i = 0; i < extracted.length; i++) {
      const ex = extracted[i];
      setScanProgress({ current: i + 1, total: extracted.length });
      try {
        const [readerResult, scannerResult] = await Promise.all([
          scanSection(ex.pdfBuffer, {
            sectionNumber: ex.sectionNumber,
            sectionTitle:  ex.sectionTitle,
          }),
          scanSpecSection({
            sectionNumber: ex.sectionNumber,
            sectionTitle:  ex.sectionTitle,
            pdfBuffer:     ex.pdfBuffer,
          }, playbookCats),
        ]);

        // Convert all page numbers from sub-PDF-relative to absolute full-PDF pages.
        // sub-PDF page 1 = full PDF page startPage, page 2 = startPage+1, etc.
        const pgOffset = (sectionStartPages[ex.sectionNumber] || 1) - 1;
        const absP = p => (p != null ? pgOffset + p : null);

        // Patch reader categories
        const adjustedCategories = {};
        for (const [key, cat] of Object.entries(readerResult.categories || {})) {
          adjustedCategories[key] = {
            ...cat,
            items: (cat.items || []).map(item => ({ ...item, page: absP(item.page) })),
          };
        }

        // Patch scanner findings
        const adjustedFindings = {};
        for (const [key, f] of Object.entries(scannerResult?.findings || {})) {
          adjustedFindings[key] = f ? { ...f, page: absP(f.page) } : f;
        }

        // Extract page texts — needed for both cross-reference detection and AI enhancement
        const pageTexts = await extractPageTexts(ex.pdfBuffer);

        // Cross-reference detection (always runs — adjust page offsets to full-PDF coordinates)
        const crossRefs = detectCrossReferences(pageTexts).map(ref => ({
          ...ref,
          page: ref.page ? pgOffset + ref.page : null,
        }));

        // — AI Enhancement: fill gaps where regex found nothing —
        if (aiEnhance && hasAiKey) {
          try {
            setAiScanStatus(`✨ AI scanning ${ex.sectionNumber}…`);
            const aiResult = await aiEnhanceSection(pageTexts);
            if (aiResult.enhanced) {
              for (const [key, aiFinding] of Object.entries(aiResult.findings)) {
                // Only fill categories the regex engine missed
                if (!adjustedFindings[key]?.found && aiFinding.found) {
                  adjustedFindings[key] = {
                    ...aiFinding,
                    page: aiFinding.page ? pgOffset + aiFinding.page : null,
                  };
                }
              }
            }
          } catch (aiErr) {
            console.warn('AI enhance failed for', ex.sectionNumber, aiErr);
          }
          setAiScanStatus('');
        }

        newResults[ex.sectionNumber] = {
          ...readerResult,
          categories: adjustedCategories,
          startPage:  sectionStartPages[ex.sectionNumber],
          findings:   adjustedFindings,
          crossRefs,
          scannerOk:  scannerResult?.ok ?? false,
        };
      } catch (err) {
        newResults[ex.sectionNumber] = {
          sectionNumber: ex.sectionNumber,
          sectionTitle:  ex.sectionTitle,
          ok: false,
          error: err.message,
          categories: {},
          findings: {},
        };
      }
      setScanResults({ ...newResults });
    }
    setScanning(false);
  }

  // ── File picker
  const fileInputRef = useRef(null);
  function handlePickFile() {
    fileInputRef.current?.click();
  }
  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    e.target.value = '';
  }

  // ── Drag & drop
  function handleDragOver(e) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave()  { setIsDragging(false); }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      loadFromFile(file);
    }
  }

  // ── Page navigation
  const prevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(numPages, p + 1));

  // Jump to a page and optionally highlight an excerpt.
  // Phase 4: also look up stored pdfjs rects from scanResults so the overlay
  // can draw directly without re-searching the page text.
  function findStoredRects(page, text) {
    if (!text || !scanResults) return null;
    const clean = (s) => (s || '').replace(/^[\u2026.]+/, '').replace(/[\u2026.]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const normText = clean(text).slice(0, 40);
    if (normText.length < 8) return null;
    for (const result of Object.values(scanResults)) {
      for (const finding of Object.values(result.findings || {})) {
        if (!finding?.rects?.length || finding.page !== page) continue;
        const normExcerpt = clean(finding.excerpt || '').slice(0, 40);
        if (normExcerpt.startsWith(normText.slice(0, 20)) || normText.startsWith(normExcerpt.slice(0, 20))) {
          return finding.rects;
        }
      }
    }
    return null;
  }

  function handleJump(page, highlight = null) {
    setCurrentPage(page);
    if (!highlight) { setActiveHighlight(null); return; }
    const text = typeof highlight === 'string' ? highlight : null;
    if (!text) { setActiveHighlight(null); return; }
    const rects = findStoredRects(page, text);
    setActiveHighlight({ page, text, rects });
  }

  // ── Save selected sections as individual PDFs ─────────────────────────────
  const [savingSections, setSavingSections] = useState(false);
  const [saveSectionsMsg, setSaveSectionsMsg] = useState(null); // { ok, text }

  const [lastSaveFolder, setLastSaveFolder] = useState(null);

  /**
   * Save sections to disk as individual PDFs, organised into division folders
   * with a _sections.json manifest.
   *
   * @param {'selected'|'scope'} mode  'scope' = one-click "Save my scope":
   *        every glazing-family section plus the review divisions, no ticking.
   */
  async function handleSaveSections(mode = 'selected') {
    const toSave = mode === 'scope'
      ? sections.filter(s => s.isScopeRelevant || s.isReviewRelevant)
      : sections.filter(s => selected[s.sectionNumber]);
    if (!toSave.length || !pdfBuffer) return;

    // Default to <project folder>\Specs so the scope travels with the project;
    // fall back to a picker when there is no project root yet.
    // `project` is the project NAME string (App.jsx passes currentProject).
    const projectName = typeof project === 'string' ? project : (project?.name ?? null);
    let folderPath = lastSaveFolder
      || (projectName ? await window.electronAPI?.defaultScopeFolder?.(projectName) : null);
    if (!folderPath) {
      folderPath = await window.electronAPI?.selectFolder?.();
      if (!folderPath) return;
    }

    setSavingSections(true);
    setSaveSectionsMsg(null);
    try {
      const extracted = await extractSections(pdfBuffer, toSave.map(s => ({
        sectionNumber: s.sectionNumber,
        sectionTitle:  s.sectionTitle,
        startPage:     s.startPage,
        endPage:       s.endPage,
      })));

      const byNumber = new Map(sections.map(s => [s.sectionNumber, s]));
      const payload = extracted.map(ex => {
        const src = byNumber.get(ex.sectionNumber) || {};
        return {
          sectionNumber: ex.sectionNumber,
          sectionTitle:  ex.sectionTitle,
          buffer:        ex.pdfBuffer instanceof Uint8Array ? ex.pdfBuffer : new Uint8Array(ex.pdfBuffer),
          startPage:     src.startPage,
          endPage:       src.endPage,
          confidence:    src.confidence,
          scopeBucket:   src.scopeBucket,
        };
      });

      const result = await window.electronAPI?.saveSections?.(payload, folderPath, {
        divisionFolders: true,
        template: '{number} - {title}',
        manifest: {
          sourceFile:  pdfFileName || null,
          projectName: projectName || null,
          totalPages:  numPages || null,
          savedMode:   mode,
        },
      });
      if (!result?.ok) throw new Error(result?.error || 'Save failed');

      setLastSaveFolder(result.folderPath || folderPath);
      const n = result.savedPaths.length;
      setSaveSectionsMsg({
        ok: true,
        text: `✓ ${n} section${n !== 1 ? 's' : ''} saved to division folders`,
        folder: result.folderPath || folderPath,
      });
    } catch (err) {
      setSaveSectionsMsg({ ok: false, text: `⚠ ${err.message}` });
    } finally {
      setSavingSections(false);
      // Keep the success message up longer — it carries the Open folder action.
      setTimeout(() => setSaveSectionsMsg(null), 12000);
    }
  }

  // ── Derived
  // Never-bid scope the company has told us it will not price.
  const neverBidHits = useMemo(
    () => findNeverBidHits(playbook, sections, scanResults),
    [playbook, sections, scanResults],
  );
  const filteredSections = getFiltered();
  const scopeCount    = sections.filter(s => s.isScopeRelevant).length;
  const reviewCount   = sections.filter(s => s.isReviewRelevant).length;
  const inScopeCount  = sections.filter(s => sectionScope[s.sectionNumber] !== false).length;
  const outScopeCount = sections.length - inScopeCount;
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const div08Count    = scopeCount;
  const scannedCount  = Object.keys(scanResults).length;

  // ── Checklist + risk score (evaluated lazily once scan results exist)
  const checklistResults = useMemo(() => {
    if (!Object.keys(scanResults).length) return [];
    return CHECKLIST_GROUPS.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        result: item.evaluate(scanResults, sections),
      })),
    }));
  }, [scanResults, sections]);

  const riskScore = useMemo(
    () => checklistResults.length ? computeRiskScore(checklistResults) : null,
    [checklistResults],
  );

  const checklistRiskCount = useMemo(
    () => checklistResults.reduce(
      (n, g) => n + g.items.filter(i => ['risk', 'warn', 'missing'].includes(i.result?.status)).length,
      0,
    ),
    [checklistResults],
  );

  // ─────────────────────────── Render ──────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', color: '#e6edf3', overflow: 'hidden' }}>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', height: 50,
        background: '#161b22', borderBottom: '1px solid #21262d',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '0.82rem', padding: '4px 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ width: 1, height: 22, background: '#21262d' }} />
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e6edf3', display: 'flex', alignItems: 'center', gap: 6 }}>
          📋 <span>Spec Sorter</span>
        </span>
        {pdfFileName && (
          <>
            <div style={{ width: 1, height: 16, background: '#21262d' }} />
            <span style={{ fontSize: '0.75rem', color: '#8b949e', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pdfFileName}
            </span>
          </>
        )}

        {/* Status pills */}
        {sections.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
            <span style={pillStyle('#21262d', '#8b949e')}>{sections.length} sections</span>
            <span style={pillStyle('rgba(63,185,80,0.12)', '#3fb950')}>{scopeCount} Div 08</span>
            {reviewCount > 0 && <span style={pillStyle('rgba(245,158,11,0.1)', '#f59e0b')}>review: {reviewCount}</span>}
            {scannedCount > 0 && <span style={pillStyle('rgba(63,185,80,0.12)', '#3fb950')}>✓ {scannedCount} scanned</span>}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {lastSavedAt && (
          <span style={{ fontSize: '0.7rem', color: '#484f58' }}>
            Saved {new Date(lastSavedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={!sections.length}
          style={{
            padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700,
            background: saved ? '#1a7f37' : '#238636',
            border: 'none', borderRadius: 5, color: '#fff',
            cursor: sections.length ? 'pointer' : 'not-allowed',
            opacity: sections.length ? 1 : 0.4,
          }}
        >
          {saved ? '✓ Saved' : '💾 Save Progress'}
        </button>
        <button
          onClick={() => setChatOpen(o => !o)}
          title="Ask AI about this spec"
          style={{
            padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700,
            background: chatOpen ? '#1d3a6e' : 'rgba(88,166,255,0.1)',
            border: `1px solid ${chatOpen ? '#388bfd' : '#30363d'}`,
            borderRadius: 5, color: chatOpen ? '#58a6ff' : '#8b949e',
            cursor: 'pointer',
          }}
        >
          🤖 Spec Chat
        </button>
      </div>

      {/* ══ BODY: LEFT SIDEBAR + PDF VIEWER + RIGHT PANEL ════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── LEFT SIDEBAR: Section Navigator ─────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: '#161b22', borderRight: '1px solid #21262d', overflow: 'hidden',
        }}>
          {/* Sidebar header */}
          <div style={{
            flexShrink: 0, padding: '12px 14px 10px',
            borderBottom: '1px solid #21262d',
            background: '#161b22',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c9d1d9', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                Spec Sections
              </span>
              {sections.length > 0 && (
                <button
                  onClick={() => runParse()}
                  title="Re-parse sections from PDF"
                  style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4 }}
                >
                  ↻ Re-parse
                </button>
              )}
            </div>

            {/* Parse status */}
            {parsing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#8b949e', padding: '4px 0' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                Detecting sections…
              </div>
            )}
            {!parsing && parseError && (
              <div style={{ fontSize: '0.73rem', color: parseNeedsOcr ? '#f59e0b' : '#f85149', padding: '4px 0' }}>
                {parseNeedsOcr ? '🔍' : '⚠'} {parseError}
                {!parseNeedsOcr && (
                  <button onClick={() => runParse()} style={{ marginLeft: 6, ...btnStyle('#21262d'), fontSize: '0.68rem', color: '#8b949e', padding: '2px 6px' }}>Retry</button>
                )}
              </div>
            )}
            {!parsing && !parseError && sections.length === 0 && pdfDoc && (
              <div style={{ fontSize: '0.73rem', color: '#8b949e', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                No sections detected
                <button onClick={() => runParse()} style={btnStyle('#388bfd')}>Parse Now</button>
              </div>
            )}
            {!parsing && !parseError && sections.length === 0 && !pdfDoc && (
              <div style={{ fontSize: '0.73rem', color: '#484f58', padding: '4px 0' }}>
                Load a PDF to detect sections
              </div>
            )}

            {/* Scope summary cards — Task 3 */}
            {sections.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilter('scope')}
                  style={{
                    flex: 1, minWidth: 70, padding: '6px 8px', borderRadius: 6, textAlign: 'left',
                    background: filter === 'scope' ? 'rgba(56,139,253,0.15)' : '#0d1117',
                    border: `1px solid ${filter === 'scope' ? '#388bfd' : '#21262d'}`,
                    cursor: 'pointer', color: filter === 'scope' ? '#58a6ff' : '#c9d1d9',
                  }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{scopeCount}</div>
                  <div style={{ fontSize: '0.6rem', color: '#8b949e', marginTop: 2 }}>My scope · Div 08</div>
                </button>
                <button
                  onClick={() => setFilter('review')}
                  style={{
                    flex: 1, minWidth: 70, padding: '6px 8px', borderRadius: 6, textAlign: 'left',
                    background: filter === 'review' ? 'rgba(245,158,11,0.1)' : '#0d1117',
                    border: `1px solid ${filter === 'review' ? '#f59e0b' : '#21262d'}`,
                    cursor: 'pointer', color: filter === 'review' ? '#f59e0b' : '#c9d1d9',
                  }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{reviewCount}</div>
                  <div style={{ fontSize: '0.6rem', color: '#8b949e', marginTop: 2 }}>Worth reviewing</div>
                </button>
                <button
                  onClick={() => setFilter('all')}
                  style={{
                    flex: 1, minWidth: 55, padding: '6px 8px', borderRadius: 6, textAlign: 'left',
                    background: filter === 'all' ? 'rgba(139,148,158,0.1)' : '#0d1117',
                    border: `1px solid ${filter === 'all' ? '#8b949e' : '#21262d'}`,
                    cursor: 'pointer', color: '#8b949e',
                  }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{sections.length}</div>
                  <div style={{ fontSize: '0.6rem', color: '#484f58', marginTop: 2 }}>All</div>
                </button>
              </div>
            )}
          </div>

          {/* Section list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSections.length === 0 && sections.length > 0 && (
              <p style={{ fontSize: '0.73rem', color: '#484f58', textAlign: 'center', padding: '24px 16px' }}>
                No sections match this filter
              </p>
            )}
            {filteredSections.map(s => {
              const inScope = sectionScope[s.sectionNumber] !== false;
              const isSelected = !!selected[s.sectionNumber];
              const hasResult = !!scanResults[s.sectionNumber];
              const isDiv08 = s.isScopeRelevant;
              const isReview = s.isReviewRelevant;

              return (
                <div
                  key={s.sectionNumber}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 12px 8px 10px',
                    borderBottom: '1px solid rgba(33,38,45,0.6)',
                    background: isSelected ? 'rgba(56,139,253,0.07)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(s.sectionNumber)}
                    style={{ marginTop: 3, flexShrink: 0, accentColor: '#58a6ff', cursor: 'pointer' }}
                  />

                  {/* Main content — clickable to jump to page */}
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: s.startPage ? 'pointer' : 'default' }}
                    onClick={() => s.startPage && setCurrentPage(s.startPage)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: divColor(s.sectionNumber) + '1a',
                        color: divColor(s.sectionNumber),
                        border: `1px solid ${divColor(s.sectionNumber)}33`,
                        letterSpacing: '0.02em', whiteSpace: 'nowrap',
                      }}>
                        {s.sectionNumber}
                      </span>
                      {isDiv08 && <span style={{ fontSize: '0.6rem', color: '#58a6ff', fontWeight: 700 }}>MY SCOPE</span>}
                      {isReview && !isDiv08 && <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 600 }}>REVIEW</span>}
                      {/* A Division 08 section that is NOT ours looks like a bug
                          unless we say whose it is. */}
                      {s.scopeBucket === 'other' && s.scopeDivision === '08' && (
                        <span
                          title={s.scopeReason}
                          style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 600 }}
                        >
                          NOT YOUR TRADE
                        </span>
                      )}
                      {hasResult && <span style={{ fontSize: '0.6rem', color: '#3fb950', fontWeight: 600 }}>✓ scanned</span>}
                      {s.confidence === 'medium' && <span title="Medium confidence — verify boundary" style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 600, padding: '0 3px', borderRadius: 2, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>~</span>}
                      {s.confidence === 'low' && <span title="Low confidence — manually verify boundary" style={{ fontSize: '0.58rem', color: '#ef4444', fontWeight: 600, padding: '0 3px', borderRadius: 2, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>?</span>}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: '#c9d1d9', lineHeight: 1.35, wordBreak: 'break-word' }}>
                      {s.sectionTitle}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#484f58', marginTop: 2 }}>
                      {s.pageCount} pg{s.pageCount !== 1 ? 's' : ''} · p.{s.startPage}–{s.endPage}
                    </div>
                  </div>

                  {/* In/Out scope toggle */}
                  <button
                    onClick={() => toggleScope(s.sectionNumber)}
                    title={inScope ? 'In Scope — click to exclude' : 'Excluded — click to include'}
                    style={{
                      flexShrink: 0, padding: '2px 6px', fontSize: '0.6rem', fontWeight: 700,
                      borderRadius: 4, cursor: 'pointer', marginTop: 2,
                      background: inScope ? 'rgba(63,185,80,0.12)' : 'rgba(139,148,158,0.08)',
                      border: `1px solid ${inScope ? '#3fb95033' : '#30363d'}`,
                      color: inScope ? '#3fb950' : '#484f58',
                    }}
                  >
                    {inScope ? 'IN' : 'OUT'}
                  </button>
                </div>
              );
            })}
            {/* Extra space at bottom so last item isn't flush against action bar */}
            {filteredSections.length > 0 && <div style={{ height: 8 }} />}
          </div>

          {/* Sidebar action bar */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid #21262d',
            background: '#0d1117', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {sections.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={selectAll}
                  style={{ ...btnStyle('#21262d'), color: '#8b949e', fontSize: '0.7rem', padding: '4px 10px' }}
                >
                  {filteredSections.length > 0 && filteredSections.every(s => selected[s.sectionNumber]) ? '☐ Deselect All' : '☑ Select All'}
                </button>
                {selectedCount > 0 && (
                  <span style={{ fontSize: '0.7rem', color: '#8b949e', marginLeft: 2 }}>
                    {selectedCount} selected
                  </span>
                )}
              </div>
            )}

            {/* Save my scope — one click, no ticking: every glazing-family
                section plus the review divisions, into division folders. */}
            <button
              onClick={() => handleSaveSections('scope')}
              disabled={savingSections || !pdfBuffer || (scopeCount + reviewCount) === 0}
              title="Save every Division 08 section that is your work, plus the review divisions, organised into division folders"
              style={{
                ...btnStyle('#1f6f3f'),
                border: '1px solid #2ea043',
                opacity: (savingSections || !pdfBuffer || (scopeCount + reviewCount) === 0) ? 0.45 : 1,
                cursor: (savingSections || !pdfBuffer || (scopeCount + reviewCount) === 0) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem', padding: '6px 12px', marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {savingSections ? '⟳ Saving…' : `💾 Save my scope (${scopeCount + reviewCount})`}
            </button>

            {/* Save Sections button */}
            <button
              onClick={() => handleSaveSections('selected')}
              disabled={savingSections || !selectedCount || !pdfBuffer}
              title="Export selected sections as individual PDFs"
              style={{
                ...btnStyle('#1c4a7a'),
                border: '1px solid #2a5d9b',
                opacity: (savingSections || !selectedCount || !pdfBuffer) ? 0.45 : 1,
                cursor: (savingSections || !selectedCount || !pdfBuffer) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem', padding: '6px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {savingSections ? '⟳ Saving…' : `📁 Save Sections${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </button>

            {/* Save feedback */}
            {saveSectionsMsg && (
              <div style={{
                fontSize: '0.72rem', padding: '5px 8px', borderRadius: 4,
                background: saveSectionsMsg.ok ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                color: saveSectionsMsg.ok ? '#3fb950' : '#f85149',
                border: `1px solid ${saveSectionsMsg.ok ? '#3fb95033' : '#f8514933'}`,
              }}>
                <div>{saveSectionsMsg.text}</div>
                {saveSectionsMsg.folder && (
                  <button
                    onClick={() => window.electronAPI?.openPath?.(saveSectionsMsg.folder)}
                    style={{
                      marginTop: 5, background: 'transparent', border: '1px solid #3fb95055',
                      color: '#3fb950', borderRadius: 4, padding: '3px 8px',
                      fontSize: '0.68rem', cursor: 'pointer',
                    }}
                  >
                    Open folder
                  </button>
                )}
              </div>
            )}

            {/* Scan button */}
            {/* AI toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <button
                onClick={() => {
                  if (!hasAiKey) {
                    alert('No Anthropic API key found.\n\nAdd your key in Settings → AI to enable AI-enhanced scanning.');
                    return;
                  }
                  setAiEnhance(v => !v);
                }}
                title={hasAiKey ? 'AI fills findings that regex misses' : 'Add Anthropic API key in Settings → AI'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 8px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 600,
                  border: `1px solid ${aiEnhance && hasAiKey ? '#7c3aed' : '#30363d'}`,
                  background: aiEnhance && hasAiKey ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: aiEnhance && hasAiKey ? '#a78bfa' : hasAiKey ? '#8b949e' : '#484f58',
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: hasAiKey ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: '0.75rem' }}>✨</span>
                AI Enhance {aiEnhance && hasAiKey ? 'ON' : 'OFF'}
              </button>
              {aiScanStatus && (
                <span style={{ fontSize: '0.65rem', color: '#a78bfa', animation: 'pulse 1s infinite' }}>
                  {aiScanStatus}
                </span>
              )}
            </div>
            <button
              onClick={handleScan}
              disabled={scanning || !selectedCount || !pdfBuffer}
              style={{
                ...btnStyle('#238636'),
                opacity: (scanning || !selectedCount || !pdfBuffer) ? 0.45 : 1,
                cursor: (scanning || !selectedCount || !pdfBuffer) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem', padding: '7px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {scanning
                ? `🔬 Scanning ${scanProgress.current}/${scanProgress.total}…`
                : `🔬 Scan & Analyze${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </button>
          </div>
        </div>

        {/* ── CENTER: PDF Viewer ──────────────────────────────────────────── */}
        <div
          ref={viewerRef}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #21262d' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Upload drop zone */}
          {!pdfDoc && !pdfLoading && (
            <div
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: isDragging ? '2px dashed #58a6ff' : '2px dashed #30363d',
                margin: 32, borderRadius: 14, cursor: 'pointer',
                transition: 'all 0.2s',
                background: isDragging ? 'rgba(88,166,255,0.04)' : 'transparent',
              }}
              onClick={handlePickFile}
            >
              <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.6 }}>📄</div>
              <p style={{ fontSize: '1rem', color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
                Drop a spec PDF here
              </p>
              <p style={{ fontSize: '0.8rem', color: '#484f58', marginBottom: 24 }}>
                or click to browse · Sections are auto-detected on load
              </p>
              <button
                onClick={e => { e.stopPropagation(); handlePickFile(); }}
                style={{ padding: '9px 28px', background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Choose PDF
              </button>
            </div>
          )}

          {pdfLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.88rem', color: '#8b949e' }}>Loading PDF…</div>
              <div style={{ fontSize: '0.72rem', color: '#484f58' }}>Parsing sections will begin automatically</div>
            </div>
          )}

          {pdfError && !pdfLoading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ fontSize: 40, opacity: 0.5 }}>⚠️</div>
              <p style={{ color: '#f85149', fontSize: '0.88rem', maxWidth: 320, textAlign: 'center' }}>{pdfError}</p>
              <button onClick={handlePickFile} style={{ padding: '7px 20px', background: '#238636', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer', fontSize: '0.82rem' }}>
                Try Another File
              </button>
            </div>
          )}

          {pdfDoc && !pdfLoading && (
            <>
              <PdfScrollViewer
                pdfDoc={pdfDoc}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                containerWidth={viewerWidth}
                highlightPage={activeHighlight?.page}
                highlightText={activeHighlight?.text}
                highlightRects={activeHighlight?.rects || null}
              />
              {/* Page indicator / jump bar */}
              <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, height: 42, background: '#161b22', borderTop: '1px solid #21262d',
                fontSize: '0.8rem', color: '#8b949e',
              }}>
                <button onClick={prevPage} disabled={currentPage <= 1}
                  style={{ background: 'none', border: '1px solid #30363d', borderRadius: 5, color: '#8b949e', padding: '3px 10px', cursor: currentPage > 1 ? 'pointer' : 'not-allowed', opacity: currentPage > 1 ? 1 : 0.4 }}>
                  ‹
                </button>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  Pg
                  <input
                    type="number" min={1} max={numPages} value={currentPage}
                    onChange={e => {
                      const v = Math.min(numPages, Math.max(1, parseInt(e.target.value) || 1));
                      setCurrentPage(v);
                    }}
                    style={{ width: 46, textAlign: 'center', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#e6edf3', padding: '2px 4px', fontSize: '0.8rem' }}
                  />
                  <span style={{ color: '#484f58' }}>/ {numPages}</span>
                </span>
                <button onClick={nextPage} disabled={currentPage >= numPages}
                  style={{ background: 'none', border: '1px solid #30363d', borderRadius: 5, color: '#8b949e', padding: '3px 10px', cursor: currentPage < numPages ? 'pointer' : 'not-allowed', opacity: currentPage < numPages ? 1 : 0.4 }}>
                  ›
                </button>
                <div style={{ width: 1, height: 18, background: '#21262d', margin: '0 6px' }} />
                <button onClick={handlePickFile} style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline' }}>
                  Change PDF
                </button>
              </div>
            </>
          )}

          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileInputChange} />
        </div>

        {/* ── RIGHT PANEL: Analysis ──────────────────────────────────────── */}
        <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

          {/* Chat overlay */}
          {chatOpen && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
              <SpecChatPanel
                scanResults={scanResults}
                sections={sections}
                onJumpToPage={handleJump}
                onClose={() => setChatOpen(false)}
              />
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#161b22', flexShrink: 0 }}>
            {[
              { key: 'checklist', label: '✅ Risk Check', count: checklistRiskCount, countColor: checklistRiskCount > 0 ? '#f59e0b' : null },
              { key: 'summary',   label: '📋 Summary',   count: scannedCount > 0 ? null : null },
              { key: 'readings',  label: '🔬 Readings',  count: scannedCount || null },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1, padding: '9px 0', background: 'none', border: 'none',
                  borderBottom: activeTab === t.key ? '2px solid #58a6ff' : '2px solid transparent',
                  color: activeTab === t.key ? '#58a6ff' : '#8b949e',
                  fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span style={{ marginLeft: 4, fontSize: '0.65rem', color: t.countColor || '#484f58', fontWeight: 700 }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Empty state when no scan data */}
          {scannedCount === 0 && !scanning && activeTab !== 'checklist' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
              <div style={{ fontSize: 36, opacity: 0.35 }}>🔬</div>
              <p style={{ fontSize: '0.82rem', color: '#8b949e', textAlign: 'center', lineHeight: 1.5 }}>
                No readings yet
              </p>
              <p style={{ fontSize: '0.73rem', color: '#484f58', textAlign: 'center', lineHeight: 1.5 }}>
                Select sections in the left sidebar, then click <strong style={{ color: '#8b949e' }}>Scan &amp; Analyze</strong>.
              </p>
            </div>
          )}

          {/* ── Checklist tab ── */}
          {activeTab === 'checklist' && (
            <ChecklistTab
              checklistResults={checklistResults}
              riskScore={riskScore}
              onJumpToPage={handleJump}
              neverBidHits={neverBidHits}
            />
          )}

          {/* ── Summary tab ── */}
          {activeTab === 'summary' && scannedCount > 0 && (
            <SummaryCard
              scanResults={scanResults}
              sections={sections}
              riskScore={riskScore}
              onJumpToPage={handleJump}
            />
          )}

          {/* ── Readings tab ── */}
          {activeTab === 'readings' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {scanning && (
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #21262d', background: 'rgba(63,185,80,0.05)' }}>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', color: '#3fb950' }}>⟳</span>
                  <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>
                    Scanning section {scanProgress.current} of {scanProgress.total}…
                  </span>
                </div>
              )}
              {scannedCount > 0 && (
                <div style={{ flexShrink: 0, padding: '6px 14px', borderBottom: '1px solid #21262d' }}>
                  <span style={{ fontSize: '0.73rem', color: '#3fb950' }}>
                    ✓ {scannedCount} section{scannedCount !== 1 ? 's' : ''} scanned
                  </span>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {Object.values(scanResults)
                  .sort((a, b) => {
                    const a08 = a.sectionNumber?.replace(/[\s.\-]/g, '').startsWith('08') ? -1 : 0;
                    const b08 = b.sectionNumber?.replace(/[\s.\-]/g, '').startsWith('08') ? -1 : 0;
                    if (a08 !== b08) return a08 - b08;
                    return (a.sectionNumber || '').localeCompare(b.sectionNumber || '');
                  })
                  .map(result => (
                    <ScanResultCard key={result.sectionNumber} result={result} onJumpToPage={handleJump} />
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function btnStyle(bg) {
  return {
    padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700,
    background: bg, border: 'none', borderRadius: 5,
    color: '#fff', cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function pillStyle(bg, color) {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 10,
    background: bg, color, fontSize: '0.68rem', fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}
