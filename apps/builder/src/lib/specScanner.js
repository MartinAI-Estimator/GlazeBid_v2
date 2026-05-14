/**
 * specScanner.js
 * Scans extracted spec section PDFs for key glazing-related information.
 * Each section gets a findings object keyed by category.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Polyfill ReadableStream async iteration for Electron 29
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

/**
 * Scan categories with regex patterns.
 * Each finding returns { found, excerpt, page }.
 */
export const SCAN_CATEGORIES = [
  {
    key: 'warranty',
    label: 'Warranty',
    short: 'WTY',
    description: 'Warranty terms and duration',
    patterns: [/warrant[yi]/i, /guaranty/i],
  },
  {
    key: 'basisOfDesign',
    label: 'Basis of Design',
    short: 'BOD',
    description: 'Named manufacturer or basis-of-design product',
    patterns: [
      /basis[\s\-]+of[\s\-]+design/i,
      /\b(kawneer|oldcastle(?:\s+building\s+envelope)?|ykk[\s\-]?ap|wausau|tubelite|efco|arcadia|peerless|viracon|guardian\s+glass|cr\s?laurence|c\.r\.\s+laurence|thermovation|traco|vistawall|united\s+states\s+aluminum|usa[\s\-]?arch)\b/i,
    ],
  },
  {
    key: 'delegatedDesign',
    label: 'Delegated Design',
    short: 'DEL',
    description: 'Engineering delegated to contractor or specialty engineer',
    patterns: [
      /delegated[\s\-]+design/i,
      /specialty\s+engineer/i,
      /contractor.{0,20}engineer/i,
      /signed\s+and\s+sealed/i,
      /performance[\s\-]+design/i,
      /engineer[\s\-]+of[\s\-]+record/i,
    ],
  },
  {
    key: 'testRequirements',
    label: 'Test Requirements',
    short: 'TST',
    description: 'Field testing, ASTM tests, or special inspection',
    patterns: [
      /field\s+(test|quality\s+control|observation)/i,
      /ASTM\s+E\d+/i,
      /special\s+inspection/i,
      /air\s+(infiltration|leakage)\s+test/i,
      /water\s+penetration\s+test/i,
    ],
  },
  {
    key: 'finish',
    label: 'Finish',
    short: 'FIN',
    description: 'Surface finish or coating specification',
    patterns: [
      /anodiz/i,
      /PVDF|Kynar|fluoropolymer/i,
      /powder[\s\-]coat/i,
      /\bfinish\s*:/i,
      /\bcolor\s*:/i,
      /high[\s\-]performance\s+(organic\s+)?coat/i,
    ],
  },
  {
    key: 'performance',
    label: 'Performance',
    short: 'PRF',
    description: 'Structural, thermal, air/water performance values',
    patterns: [
      /design[\s\-]+pressure/i,
      /\bDP[\s\-]*:/,
      /U[\s\-]?(factor|value)/i,
      /\bSHGC\b/i,
      /solar\s+heat\s+gain/i,
      /air\s+(infiltration|leakage)/i,
      /water\s+penetration/i,
      /\d+\s*psf\b/i,
    ],
  },
  {
    key: 'submittals',
    label: 'Submittals',
    short: 'SBMT',
    description: 'Shop drawings, product data, engineering calcs',
    patterns: [
      /shop\s+drawings/i,
      /engineering\s+(calculations|calcs)/i,
      /stamped.{0,20}(drawing|engineer|calculation)/i,
      /product\s+data/i,
    ],
  },
  {
    key: 'mockup',
    label: 'Mock-Up',
    short: 'MKP',
    description: 'Full-size or test mock-up requirements',
    patterns: [
      /mock[\s\-]?up/i,
      /prototype\s+panel/i,
    ],
  },
  {
    key: 'substitutions',
    label: 'Substitutions',
    short: 'SUBS',
    description: '"No substitutions" or approved equal language',
    patterns: [
      /no\s+substitution/i,
      /substitution\s+not\s+(accept|permit|allow)/i,
      /approved\s+equal/i,
      /or\s+approved\s+equal/i,
    ],
  },
  {
    key: 'qualifications',
    label: 'Qualifications',
    short: 'QLF',
    description: 'Installer certification or qualification requirements',
    patterns: [
      /certif(ied|ication)\s+installer/i,
      /manufacturer.{0,20}approv(ed|al)/i,
      /\binstaller\s+qualification/i,
      /trained\s+installer/i,
      /\bfenestration\s+installer/i,
    ],
  },

  // ── Extended glazing-specific categories ────────────────────────────────────

  {
    key: 'warrantyDuration',
    label: 'Warranty Duration',
    short: 'WTY-DUR',
    description: 'Explicit warranty period length (10yr, 20yr, lifetime, etc.)',
    patterns: [
      /\b(10|fifteen|20|25|lifetime)\s*[-\s]?year\s+warrant/i,
      /warrant.{0,30}(10|15|20|25)\s+year/i,
      /\b(10|15|20|25)[\s\-]?yr\b/i,
    ],
  },
  {
    key: 'aamaClass',
    label: 'AAMA Finish Class',
    short: 'AAMA',
    description: 'AAMA 2603 / 2604 / 2605 finish performance class',
    patterns: [
      /AAMA\s+260[345]/i,
      /\b260[345]\b/,
      /high[\s\-]?performance\s+(organic|fluoropolymer|PVDF)/i,
      /Kynar\s+500/i,
      /\bclass\s+(I|II|III)\s+(anodize|anodized)/i,
    ],
  },
  {
    key: 'fireRating',
    label: 'Fire-Rated Glazing',
    short: 'FIRE',
    description: 'Fire-rated or fire-protective glazing assembly',
    patterns: [
      /fire[\s\-]?rated/i,
      /fire[\s\-]?protective/i,
      /fire[\s\-]?resistive/i,
      /\b(45|60|90|120)[\s\-]?minute\s+(fire|rated)/i,
      /NFPA\s+80/i,
      /UL\s+10[ABC]/i,
      /CE\s+Center/i,
    ],
  },
  {
    key: 'impactResistance',
    label: 'Impact / Hurricane Glazing',
    short: 'IMP',
    description: 'Hurricane, windborne debris, or HVHZ impact requirements',
    patterns: [
      /\bhigh\s+velocity\s+hurricane\s+zone\b/i,
      /\bHVHZ\b/,
      /Miami[\s\-]Dade\s+(NOA|product\s+approval)/i,
      /\bNOA\b/,
      /windborne\s+debris/i,
      /impact[\s\-]resistant\s+glaz/i,
      /large[\s\-]missile\s+impact/i,
      /FBC\s+section|florida\s+building\s+code/i,
    ],
  },
  {
    key: 'blastResistance',
    label: 'Blast Resistance',
    short: 'BLAST',
    description: 'Blast-resistant, GSA or UFC 4-010 requirements',
    patterns: [
      /blast[\s\-]?resistant/i,
      /blast[\s\-]?(hazard|mitigation|protection)/i,
      /\bGSA\s+(security|threat|blast)/i,
      /UFC\s+4[\s\-]010/i,
      /anti[\s\-]?(shatter|shard|fragment)/i,
      /\bsecurity\s+glazing\b/i,
    ],
  },
  {
    key: 'acousticRequirements',
    label: 'Acoustic Requirements',
    short: 'ACOU',
    description: 'STC rating, acoustic glazing, or sound transmission class',
    patterns: [
      /\bSTC[\s\-]?\d*/i,
      /sound\s+transmission\s+class/i,
      /acoustic(al)?\s+glaz/i,
      /noise\s+reduction\s+(coefficient|rating)/i,
      /\bOITC\b/i,
      /sound\s+(control|attenuation|isolation)/i,
    ],
  },
  {
    key: 'preInstallMeeting',
    label: 'Pre-Installation Conference',
    short: 'PRE-MTG',
    description: 'Required pre-installation meeting or coordination conference',
    patterns: [
      /pre[\s\-]?install(ation)?\s+(meeting|conference)/i,
      /pre[\s\-]?construction\s+(meeting|conference)/i,
      /coordination\s+(meeting|conference).{0,40}glaz/i,
      /convene\s+a\s+meeting/i,
    ],
  },

  // ── Contract & General Conditions categories ────────────────────────────────

  {
    key: 'liquidatedDamages',
    label: 'Liquidated Damages',
    short: 'LD',
    description: 'Liquidated damages clause — daily penalty for late completion',
    patterns: [
      /liquidated\s+damages/i,
      /\$[\d,]+\s+(per|a)\s+(calendar\s+)?day/i,
      /daily\s+(penalty|charge|assessment|rate).{0,30}delay/i,
      /delay\s+damages/i,
      /\bL\.?D\.?\s*(rate|amount|\$)/i,
    ],
  },
  {
    key: 'retainage',
    label: 'Retainage',
    short: 'RET',
    description: 'Retainage percentage withheld from progress payments',
    patterns: [
      /retainage/i,
      /retent(ion)?\s+of\s+\d+\s*%/i,
      /\bwithhold\s+(ten|five|\d+)\s*(percent|%)/i,
      /\b(10|5|15)\s*%\s*(retainage|retention)/i,
      /progress\s+payment.{0,40}(retain|withhold)/i,
    ],
  },
  {
    key: 'bondRequirements',
    label: 'Bond Requirements',
    short: 'BOND',
    description: 'Performance bond, payment bond, or bid bond required',
    patterns: [
      /performance\s+bond/i,
      /payment\s+bond/i,
      /\bbid\s+bond\b/i,
      /labor\s+and\s+material\s+(payment\s+)?bond/i,
      /surety\s+bond/i,
      /bonding\s+requirement/i,
    ],
  },
  {
    key: 'insuranceRequirements',
    label: 'Insurance Requirements',
    short: 'INS',
    description: 'Insurance limits — umbrella, GL, excess liability',
    patterns: [
      /umbrella.{0,30}(limit|\$[\d,]+\s*million)/i,
      /excess\s+liability/i,
      /\$[\d,]+\s*million.{0,20}(aggregate|occurrence|limit)/i,
      /commercial\s+general\s+liability/i,
      /additional\s+insured/i,
      /certificate\s+of\s+insurance/i,
    ],
  },
  {
    key: 'payWhenPaid',
    label: 'Pay-When-Paid / Pay-If-Paid',
    short: 'PAY',
    description: 'Conditional payment clause — GC only pays sub after receiving payment from owner',
    patterns: [
      /pay[\s\-]?if[\s\-]?paid/i,
      /pay[\s\-]?when[\s\-]?paid/i,
      /receipt\s+of\s+payment\s+(from|by)\s+(owner|developer)/i,
      /condition\s+precedent.{0,40}payment/i,
      /subcontractor.{0,40}paid\s+only\s+(if|when)/i,
    ],
  },
  {
    key: 'workingHours',
    label: 'Working Hours Restrictions',
    short: 'HRS',
    description: 'Restricted working hours — building occupancy, noise ordinance, downtown',
    patterns: [
      /working\s+hours.{0,40}(restrict|limit|prohibit|allow)/i,
      /work\s+(shall\s+)?(not\s+)?be\s+performed.{0,30}(between|after|before)\s+\d/i,
      /noise\s+ordinance/i,
      /no\s+work\s+(on\s+)?(weekend|Saturday|Sunday|holiday)/i,
      /occupied\s+building.{0,40}(hour|restrict|schedul)/i,
      /work\s+hours?\s+(are|shall\s+be).{0,20}\d{1,2}:\d{2}/i,
    ],
  },
  {
    key: 'leedRequirements',
    label: 'LEED / Sustainability',
    short: 'LEED',
    description: 'LEED certification, recycled content, or sustainability documentation',
    patterns: [
      /\bLEED\b/i,
      /recycled\s+content/i,
      /regional\s+(material|product)/i,
      /environmental\s+product\s+declaration/i,
      /\bEPD\b/,
      /health\s+product\s+declaration/i,
      /\bHPD\b/,
      /sustainability\s+(certification|goal|requirement)/i,
    ],
  },
  {
    key: 'ownerFurnished',
    label: 'Owner-Furnished Items / Allowances',
    short: 'OFE',
    description: 'Owner-furnished materials, cash allowances, or owner-supplied items affecting scope',
    patterns: [
      /owner[\s\-]furnished/i,
      /owner[\s\-]provided/i,
      /cash\s+allowance/i,
      /\bNIC\b/,
      /not\s+in\s+contract/i,
      /allowance\s+(of\s+\$[\d,]+|for\s+(hardware|glass|glazing))/i,
      /owner\s+will\s+(supply|provide|furnish)/i,
    ],
  },
  {
    key: 'phasing',
    label: 'Phasing / Occupied Building',
    short: 'PHASE',
    description: 'Phased construction schedule or occupied building restrictions',
    patterns: [
      /phased?\s+(construction|work|schedule|completion)/i,
      /occupied\s+(building|space|floor|tenant)/i,
      /building\s+(remain|stay).{0,20}occupied/i,
      /tenant\s+(occupanc|in[\s\-]?place)/i,
      /maintain\s+(occupancy|access|egress)/i,
      /sequence\s+of\s+work/i,
    ],
  },
  {
    key: 'closeout',
    label: 'Close-out / O&M Manuals',
    short: 'CLSOUT',
    description: 'Project close-out, as-built drawings, O&M manuals, training',
    patterns: [
      /close[\s\-]?out\s+(document|submittal|requirement)/i,
      /operation\s+(and|&)\s+maintenance\s+(manual|data)/i,
      /\bO\s*&\s*M\s+(manual|data)\b/i,
      /as[\s\-]built\s+(drawing|record|document)/i,
      /record\s+drawing/i,
      /substantial\s+completion.{0,60}(manual|as[\s\-]built|training)/i,
      /maintenance\s+(instruction|data)\s+for\s+(glazing|window|curtain)/i,
    ],
  },
];

// ─── Text Extraction ──────────────────────────────────────────────────────────

function toSafeCopy(pdfBuffer) {
  if (pdfBuffer instanceof Uint8Array) {
    return new Uint8Array(
      pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    );
  }
  return new Uint8Array(pdfBuffer.slice(0));
}

async function extractPageTexts(pdfBuffer) {
  const data = toSafeCopy(pdfBuffer);

  const doc = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageTexts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((item) => typeof item.str === 'string')
      .map((item) => item.str)
      .join(' ');
    pageTexts.push({ page: p, text });
  }
  return pageTexts;
}

// ─── Category Scanning ────────────────────────────────────────────────────────

function scanCategory(category, pageTexts) {
  for (const { page, text } of pageTexts) {
    for (const pattern of category.patterns) {
      const match = pattern.exec(text);
      if (match) {
        const start = Math.max(0, match.index - 55);
        const end = Math.min(text.length, match.index + match[0].length + 110);
        const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
        const excerpt = (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
        return { found: true, excerpt: excerpt.slice(0, 220), page };
      }
    }
  }
  return { found: false, excerpt: null, page: null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a single extracted spec section for all categories.
 * @param {{ sectionNumber: string, sectionTitle: string, pdfBuffer: Uint8Array }} section
 * @returns {Promise<{ sectionNumber, sectionTitle, ok, findings, error? }>}
 */
export async function scanSpecSection(section) {
  try {
    const pageTexts = await extractPageTexts(section.pdfBuffer);
    const findings = {};
    for (const cat of SCAN_CATEGORIES) {
      findings[cat.key] = scanCategory(cat, pageTexts);
    }
    return { sectionNumber: section.sectionNumber, sectionTitle: section.sectionTitle, ok: true, findings };
  } catch (err) {
    return {
      sectionNumber: section.sectionNumber,
      sectionTitle: section.sectionTitle,
      ok: false,
      error: err?.message || String(err),
      findings: {},
    };
  }
}

/**
 * Scan all extracted sections sequentially.
 * @param {Array<{ sectionNumber, sectionTitle, pdfBuffer }>} sections
 * @returns {Promise<Array>}
 */
export async function scanAllSections(sections) {
  const results = [];
  for (const section of sections) {
    results.push(await scanSpecSection(section));
  }
  return results;
}
