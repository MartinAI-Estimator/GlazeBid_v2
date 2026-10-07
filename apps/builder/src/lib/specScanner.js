/**
 * specScanner.js
 * Scans extracted spec section PDFs for key glazing-related information.
 * Each section gets a findings object keyed by category.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { buildSystemPrompt as buildIntelligencePrompt } from '../ai/specIntelligence';

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
 * Each finding returns { found, excerpt, page, matchCount, precision }.
 *
 * PRECISION TIERING (fix plan Phase 6)
 * Some patterns are decisive on their own — "AAMA 2605", "ASTM E283" appear in
 * a spec only when that requirement is real. Others fire on boilerplate that
 * exists in every document ever written: `color:` shows up in a paint schedule,
 * `NOA` is also a common abbreviation. Treating both tiers the same is what
 * made the report noisy enough to distrust.
 *
 * Optional per-category fields:
 *   lowPrecision  Array<RegExp>  patterns that may NOT stand alone
 *   requireNear   Array<RegExp>  corroborating context for the low-precision
 *                                tier; a low-precision hit is only accepted
 *                                when one of these appears within NEAR_WINDOW
 *                                characters, or the same pattern hits twice.
 */
const NEAR_WINDOW = 300;

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
      /acceptable\s+manufacturers?/i,
      /approved\s+(manufacturers?|equal|product)/i,
      /named\s+manufacturer/i,
      /comparable\s+products?/i,
      /manufacturers?\s*:/i,
      /\b(kawneer|oldcastle(?:\s+building\s+envelope)?|ykk[\s\-]?ap|wausau|tubelite|efco|arcadia|peerless|viracon|guardian\s+glass|cr\s?laurence|c\.r\.\s+laurence|thermovation|traco|vistawall|united\s+states\s+aluminum|usa[\s\-]?arch|vitro|pilkington|cardinal\s+(glass|industries)|ppg\s+(glass|industries)|graham\s+architectural|winco|nana\s*wall|pittco)\b/i,
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
      /high[\s\-]performance\s+(organic\s+)?coat/i,
    ],
    // `finish:` and `color:` appear in every schedule in the book — they only
    // mean a glazing finish requirement when aluminum/coating context is near.
    lowPrecision: [
      /\bfinish\s*:/i,
      /\bcolor\s*:/i,
    ],
    requireNear: [
      /alumin/i, /anodiz/i, /coat/i, /AAMA\s*2\d{3}/i, /kynar|pvdf/i,
      /frame|storefront|curtain\s*wall|mullion/i,
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
      /windborne\s+debris/i,
      /impact[\s\-]resistant\s+glaz/i,
      /large[\s\-]missile\s+impact/i,
      /FBC\s+section|florida\s+building\s+code/i,
    ],
    // Bare "NOA" is also just a word/abbreviation — require hurricane context.
    lowPrecision: [/\bNOA\b/],
    requireNear: [
      /miami|dade|florida|hurricane|impact|missile|windborne|HVHZ/i,
      /product\s+approval/i,
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
  // ─── Labor & Materials ──────────────────────────────────────────────────────
  {
    key: 'prevailingWage',
    label: 'Prevailing Wage / Davis-Bacon',
    short: 'PW',
    description: 'Prevailing wage, Davis-Bacon Act, union labor, or certified payroll requirements',
    patterns: [
      /prevailing\s+wage/i,
      /davis[\s\-]bacon/i,
      /certified\s+payroll/i,
      /\bunion\s+(labor|contractor|agreement|rate)\b/i,
      /collective\s+bargaining\s+agreement/i,
      /wage\s+(determination|rate|schedule).{0,30}(federal|state|county|city)/i,
      /department\s+of\s+labor.{0,30}wage/i,
    ],
  },
  {
    key: 'buyAmerica',
    label: 'Buy America / Domestic Content',
    short: 'BA',
    description: 'Buy America, BABA, or domestic-content material sourcing restrictions',
    patterns: [
      /buy\s+america/i,
      /\bBABA\b/,
      /build\s+america.{0,10}buy\s+america/i,
      /domestic\s+(end\s+)?product/i,
      /domestic\s+content\s+(requirement|provision)/i,
      /iron\s+and\s+steel.{0,30}(produced|melted|manufactured).{0,20}united\s+states/i,
      /\bmanufactured\s+in\s+the\s+u\.?s\.?a?\.?\b/i,
      /country\s+of\s+origin.{0,30}(certif|provid|document)/i,
    ],
  },
  {
    key: 'ocip',
    label: 'OCIP / CCIP / Wrap-Up Insurance',
    short: 'OCIP',
    description: 'Owner-controlled or contractor-controlled insurance program — may require deducting your own insurance cost from bid',
    patterns: [
      /\bOCIP\b/,
      /\bCCIP\b/,
      /wrap[\s\-]up\s+(insurance|program)/i,
      /owner[\s\-]controlled\s+insurance\s+program/i,
      /contractor[\s\-]controlled\s+insurance\s+program/i,
      /consolidated\s+insurance\s+program/i,
      /enrolled.{0,20}insurance\s+program/i,
      /\bCIP\b.{0,30}(insurance|program)/i,
    ],
  },
  // ─── Scope & Execution Gotchas ──────────────────────────────────────────────
  {
    key: 'perimeterSealants',
    label: 'Perimeter Sealants',
    short: 'SEAL',
    description: 'Perimeter caulk, weather seals, Division 07 joint sealants — scope boundary between glazier and others',
    patterns: [
      /perimeter\s+(sealant|caulk(?:ing)?)/i,
      /weather[\s\-]seal(?:ant)?\b/i,
      /\bSection\s+07[\s.\-]?9[12]/i,
      /joint\s+sealant.{0,50}(glazing|curtain[\s\-]?wall|storefront|window)/i,
      /silicone\s+(sealant|caulk).{0,50}(perimeter|around\s+(window|frame|opening))/i,
      /sealant.{0,30}(by|furnished|installed\s+by)\s+(glazier|glazing\s+contractor)/i,
      /backer\s+rod.{0,30}(perimeter|window|glazing|frame)/i,
    ],
  },
  {
    key: 'brakeMetalFlashing',
    label: 'Brake Metal / Flashing',
    short: 'FLASH',
    description: 'Brake-formed metal, sill flashings, or custom trim profiles in glazing scope',
    patterns: [
      /brake[\s\-]?metal/i,
      /break[\s\-]?metal/i,
      /\bsill\s+(flashing|pan|liner)\b/i,
      /custom[\s\-]?profile.{0,30}(aluminum|alum|metal|extrusion)/i,
      /formed\s+(metal|aluminum|sheet\s+metal)\s+(flashing|trim|sill)/i,
      /sheet\s+metal\s+(flashing|trim|sill).{0,30}(by|furnished|provided).{0,20}(glazier|glazing)/i,
      /field[\s\-]?formed\s+(flashing|sill|cap|trim)/i,
      /\b\d{1,2}[\s\-]?gauge\s+(aluminum|galvaniz|steel).{0,20}(flashing|trim|sill)/i,
    ],
  },
  {
    key: 'electrifiedHardware',
    label: 'Electrified Hardware / Auto-Operators',
    short: 'ELEC',
    description: 'Access control, auto operators, card readers, or electrified hardware in glazing scope',
    patterns: [
      /access\s+control.{0,50}(door|opening|glass|glazing|hardware)/i,
      /power\s+transfer\s+(device|hinge|loop)/i,
      /auto(?:matic)?\s+(door\s+)?operator/i,
      /automatic\s+(sliding|swing|revolving)\s+door/i,
      /\bcard\s+reader\b/i,
      /electrified\s+(hardware|lockset|strike|panic|exit\s+device)/i,
      /electric\s+(strike|latch|lock|release|bolt|magnet(?:ic\s+lock)?)/i,
      /conduit.{0,40}(glazier|glazing\s+contractor|by\s+others)/i,
      /\b(LCN|Dorma|ASSA\s+Abloy|Nabco|Stanley\s+Access|Besam)\b/i,
    ],
  },
  {
    key: 'glassUpgrades',
    label: 'Specialty / Upgraded Glass',
    short: 'SPEC',
    description: 'Bird-friendly frit, dynamic glazing, electrochromic, spandrel, or oversized lites',
    patterns: [
      /bird[\s\-]?(?:friendly|safe|deterrent|strike)/i,
      /\bfrit(?:ted)?\s+(glass|pattern|dot|ceramic)/i,
      /ceramic[\s\-]frit/i,
      /dynamic\s+glazing/i,
      /electrochromic/i,
      /thermochromic/i,
      /\bSageGlass\b|\bView\s+(?:Smart\s+)?Glass\b/i,
      /spandrel\s+(glass|panel|unit).{0,30}(painted|ceramic|opacified|opaque)/i,
      /oversized\s+(lite|glass\s+panel|vision\s+glass)/i,
    ],
  },
  {
    key: 'hoisting',
    label: 'Hoisting / Crane / Scaffolding',
    short: 'HOIST',
    description: 'Glazing contractor responsible for crane, scaffolding, or material hoisting',
    patterns: [
      /\bcrane\b.{0,60}(glazier|glazing\s+contractor|furnish|provide|by\s+sub)/i,
      /glazier.{0,60}\bcrane\b/i,
      /\bscaffold(?:ing)?\b.{0,60}(glazier|glazing\s+contractor|furnish|provide)/i,
      /glazier.{0,60}\bscaffold/i,
      /\bhoisting\b.{0,60}(glazier|glazing\s+contractor|furnish|provide)/i,
      /material\s+handling.{0,50}(glazier|glazing\s+contractor)/i,
      /\bmanlift\b|\bscissor\s+lift\b|\baerial\s+(lift|work\s+platform)\b/i,
      /tower\s+crane.{0,50}(furnish|provide|required\s+by)/i,
    ],
  },
  {
    key: 'protectionCleaning',
    label: 'Protection & Final Cleaning',
    short: 'CLEAN',
    description: 'Glazing contractor responsible for protection from subsequent trades and/or final glass cleaning',
    patterns: [
      /protect(?:ion)?\s+(from|against)\s+(subsequent|other|follow[\s\-]on)\s+trades?/i,
      /protect(?:ion)?.{0,40}(glass|glazing|window|frame).{0,40}(subsequent|during\s+construction)/i,
      /final\s+clean(?:ing)?.{0,40}(glazing|glass|window)/i,
      /clean(?:ing)?\s+at\s+(substantial\s+completion|closeout)/i,
      /glazing\s+contractor.{0,50}clean(?:ing)?/i,
      /remove.{0,30}(label|protective\s+(film|coating|tape)).{0,30}(glass|glazing|window)/i,
      /\bHF\s+clean|\bhydrofluoric|\bacid\s+(wash|clean)/i,
    ],
  },

  // ─── Division 00 / 01 / 02 — Contract & Bid Day ────────────────────────────
  {
    key: 'taxes',
    label: 'Tax Treatment',
    short: 'TAX',
    description: 'Sales/use tax status, tax-exempt owner, or contractor-pays-tax language',
    patterns: [
      /sales\s+tax/i,
      /use\s+tax/i,
      /tax[\s\-]?exempt/i,
      /taxes?\s+(included|excluded|paid\s+by)/i,
      /contractor.{0,30}responsible.{0,30}tax/i,
    ],
  },
  {
    key: 'bidForms',
    label: 'Bid / Proposal Forms',
    short: 'BID-FM',
    description: 'Bid form, bid bond form, or proposal form identification',
    patterns: [
      /bid\s+form/i,
      /form\s+of\s+proposal/i,
      /bid\s+bond\s+form/i,
      /proposal\s+form/i,
      /\bSection\s+00\s+41/i,
    ],
  },
  {
    key: 'substitutionForms',
    label: 'Substitution Request Form / Deadline',
    short: 'SUB-FM',
    description: 'Substitution request form required; pre-bid substitution deadline',
    patterns: [
      /substitution\s+request\s+form/i,
      /substitutions?.{0,40}(days?|deadline|prior\s+to\s+bid)/i,
      /\bSection\s+00\s+43/i,
      /substitution\s+approval\s+(request|form)/i,
    ],
  },
  {
    key: 'contractTerms',
    label: 'Contract Form',
    short: 'CONTRACT',
    description: 'Governing contract form (AIA A201, ConsensusDocs, custom)',
    patterns: [
      /AIA\s+(Document\s+)?A\d{3}/i,
      /ConsensusDocs/i,
      /general\s+conditions\s+of\s+the\s+contract/i,
      /\bA201\b/i,
      /standard\s+form\s+of\s+(agreement|subcontract)/i,
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

export async function extractPageTexts(pdfBuffer) {
  const pages = await extractPageTextsWithItems(pdfBuffer);
  return pages.map(({ page, text }) => ({ page, text }));
}

/**
 * Phase 4: extract page texts AND pdfjs item position data.
 * Returns [{page, text, items}] where items carry .str, .transform, .width, .height.
 */
export async function extractPageTextsWithItems(pdfBuffer) {
  const data = toSafeCopy(pdfBuffer);

  const doc = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageRecords = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((item) => typeof item.str === 'string' && item.str);
    const text = items.map((item) => item.str).join(' ');
    pageRecords.push({ page: p, text, items });
  }
  return pageRecords;
}

// ─── Category Scanning ────────────────────────────────────────────────────────

/**
 * Phase 4: map a character range in the joined item text back to pdfjs item rects.
 * items are in natural order (joined with single spaces), matching the text string.
 */
function findItemRects(items, charStart, charEnd) {
  const rects = [];
  let pos = 0;
  for (const item of items) {
    const len = item.str.length;
    const itemStart = pos;
    const itemEnd = pos + len;
    pos += len + 1; // +1 for the space separator
    if (itemEnd > charStart && itemStart < charEnd && item.transform && item.width) {
      const [, , , , x, y] = item.transform;
      const h = item.height || Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
      rects.push({ x, y, width: item.width, height: h });
    }
  }
  return rects;
}

/** Build the display excerpt + stored rects for one match. */
function buildHit(match, page, text, items, precision) {
  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + match[0].length + 160);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  const excerpt = (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
  return {
    page,
    precision,
    excerpt: excerpt.slice(0, 300),
    // Phase 4: capture item rects at scan time — never re-search at render time
    rects: items ? findItemRects(items, match.index, match.index + match[0].length) : null,
  };
}

/** All non-overlapping matches of one pattern in a page's text. */
function allMatches(pattern, text) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
    if (out.length > 50) break;                   // pathological-pattern guard
  }
  return out;
}

/**
 * Scan one category across a section's pages.
 *
 * High-precision patterns stand alone. Low-precision patterns are only accepted
 * with corroborating context nearby, or when the same pattern hits twice —
 * this is what stops `color:` and a bare `NOA` from generating a "finding".
 *
 * Returns every match (ranked high-precision first), not just the first hit,
 * so the UI can show how many times a requirement actually appears.
 */
function scanCategory(category, pageTexts) {
  const hits = [];

  for (const { page, text, items } of pageTexts) {
    for (const pattern of category.patterns || []) {
      for (const m of allMatches(pattern, text)) {
        hits.push(buildHit(m, page, text, items, 'high'));
      }
    }

    for (const pattern of category.lowPrecision || []) {
      const matches = allMatches(pattern, text);
      if (matches.length === 0) continue;
      for (const m of matches) {
        const from = Math.max(0, m.index - NEAR_WINDOW);
        const to   = Math.min(text.length, m.index + m[0].length + NEAR_WINDOW);
        const window = text.slice(from, to);
        const corroborated =
          (category.requireNear || []).some((re) => re.test(window)) ||
          matches.length >= 2; // repeated use is itself evidence
        if (corroborated) hits.push(buildHit(m, page, text, items, 'low'));
      }
    }
  }

  if (hits.length === 0) {
    return { found: false, excerpt: null, page: null, rects: null, matchCount: 0, precision: null, matches: [] };
  }

  // Rank: high-precision first, then earliest page — the best evidence leads.
  hits.sort((a, b) => (a.precision === b.precision ? a.page - b.page : a.precision === 'high' ? -1 : 1));
  const best = hits[0];
  return {
    found: true,
    excerpt: best.excerpt,
    page: best.page,
    rects: best.rects,
    precision: best.precision,
    matchCount: hits.length,
    matches: hits.slice(0, 10),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a single extracted spec section for all categories.
 * @param {{ sectionNumber: string, sectionTitle: string, pdfBuffer: Uint8Array }} section
 * @returns {Promise<{ sectionNumber, sectionTitle, ok, findings, error? }>}
 */
export async function scanSpecSection(section, extraCategories = []) {
  try {
    const pageTexts = await extractPageTextsWithItems(section.pdfBuffer);
    // Division 00/01 are procurement and general requirements. A warranty or
    // finish pattern matching there describes the CONTRACT, not the glazing
    // product — presenting it as a product risk sends the estimator chasing a
    // requirement that does not exist in their scope.
    const division = String(section.sectionNumber ?? '').replace(/\D/g, '').slice(0, 2);
    const isContractLevel = division === '00' || division === '01';

    const findings = {};
    // Baseline categories + any compiled company-playbook rules. Playbook rules
    // run through the SAME engine so they inherit precision tiering and the
    // verified-citation contract — a company rule gets no special trust.
    for (const cat of [...SCAN_CATEGORIES, ...extraCategories]) {
      const finding = scanCategory(cat, pageTexts);
      if (finding.found && isContractLevel) {
        finding.contractLevel = true;
        finding.scopeNote = `Found in Division ${division} — contract-level requirement, not a glazing product spec`;
      }
      if (finding.found && cat.isPlaybook) {
        finding.isPlaybook = true;
        finding.playbookLabel = cat.label;
        finding.severity = cat.playbookSeverity;
        finding.meaning = cat.playbookMeaning;
      }
      findings[cat.key] = finding;
    }
    return {
      sectionNumber: section.sectionNumber,
      sectionTitle: section.sectionTitle,
      ok: true,
      isContractLevel,
      findings,
    };
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

// ─── Cross-Reference Detection ────────────────────────────────────────────────

/** Risk metadata keyed by two-digit MasterFormat division number. */
const XREF_DIVISION_RISK = {
  '00': { level: 'info', label: 'Division 00 – Procurement & Contracting', note: 'Contract documents and bidding requirements' },
  '01': { level: 'warn', label: 'Division 01 – General Requirements',      note: 'May govern who pays for 3rd-party testing, mock-ups, or field QC' },
  '02': { level: 'info', label: 'Division 02 – Existing Conditions',        note: 'Substrate or existing condition requirements' },
  '03': { level: 'info', label: 'Division 03 – Concrete',                   note: 'Embeds, blockouts, or slab tolerances affecting glazing' },
  '04': { level: 'info', label: 'Division 04 – Masonry',                    note: 'Masonry openings or substrate attachment' },
  '05': { level: 'risk', label: 'Division 05 – Metals',                     note: 'Structural steel subframes or tube-steel reinforcement — verify who furnishes and installs' },
  '06': { level: 'info', label: 'Division 06 – Wood, Plastics & Composites', note: '' },
  '07': { level: 'risk', label: 'Division 07 – Thermal & Moisture Protection', note: 'Perimeter sealants, flashings, waterproofing — common scope gap between glazier and others' },
  '08': { level: 'info', label: 'Division 08 – Openings',                   note: 'Cross-reference within glazing sections' },
  '09': { level: 'info', label: 'Division 09 – Finishes',                   note: '' },
  '10': { level: 'info', label: 'Division 10 – Specialties',                note: '' },
  '26': { level: 'risk', label: 'Division 26 – Electrical',                 note: 'Wiring for auto-operators, powered hardware, or exit devices — verify scope boundary' },
  '27': { level: 'warn', label: 'Division 27 – Communications',             note: 'Low-voltage wiring that may interface with glazing hardware' },
  '28': { level: 'risk', label: 'Division 28 – Electronic Safety & Security', note: 'Access control, card readers, security hardware — who furnishes, installs, and programs?' },
};

/**
 * Scan page texts for MasterFormat cross-references (e.g. "Section 07 92 00", "Division 05").
 * Returns one entry per unique division/section encountered, sorted risk-first.
 *
 * @param {Array<{page: number, text: string}>} pageTexts
 * @returns {Array<{ raw, division, key, label, note, riskLevel, context, page }>}
 */
export function detectCrossReferences(pageTexts) {
  // Matches "Section 07 92 00", "Div. 05", "Division 07", optionally preceded by "See / Refer to / per"
  const XREF_RE = /\b(?:(?:see|refer(?:ring)?\s+to|per|as\s+specified\s+in|in\s+accordance\s+with|per\s+requirements\s+of)\s+)?(?:Section|Div(?:ision)?\.?)\s*(\d{2}(?:[\s.\-]\d{2}(?:[\s.\-]\d{2})?)?)\b/gi;

  const dedupMap = new Map(); // key → entry (keep first occurrence, but upgrade risk level)

  for (const { page, text } of pageTexts) {
    let match;
    XREF_RE.lastIndex = 0;
    while ((match = XREF_RE.exec(text)) !== null) {
      const rawNum = match[1].trim();                      // "07 92 00", "07", etc.
      const normalized = rawNum.replace(/[\s.\-]/g, '');   // "079200", "07"
      const division = normalized.slice(0, 2);

      const start = Math.max(0, match.index - 60);
      const end   = Math.min(text.length, match.index + match[0].length + 100);
      const ctx   = ((start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')).slice(0, 220);

      const risk = XREF_DIVISION_RISK[division] || { level: 'info', label: `Division ${division}`, note: '' };

      if (!dedupMap.has(normalized)) {
        dedupMap.set(normalized, {
          raw:       rawNum,
          division,
          key:       normalized,
          label:     risk.label,
          note:      risk.note,
          riskLevel: risk.level,
          context:   ctx,
          page,
        });
      } else if (risk.level === 'risk' && dedupMap.get(normalized).riskLevel !== 'risk') {
        // Upgrade risk level and freshen context if a riskier occurrence is found
        dedupMap.set(normalized, { ...dedupMap.get(normalized), riskLevel: 'risk', context: ctx, page });
      }
    }
  }

  const ORDER = { risk: 0, warn: 1, info: 2 };
  return [...dedupMap.values()].sort((a, b) => (ORDER[a.riskLevel] ?? 3) - (ORDER[b.riskLevel] ?? 3));
}

// ─── AI-Powered Enhancement ───────────────────────────────────────────────────

// Maps AI-returned keys → internal findings keys (where names differ)
const AI_KEY_MAP = {
  noSubstitutions: 'substitutions',
};

/**
 * Use Claude (via Electron ai:chat IPC) to extract spec findings that regex may miss.
 * Fills gaps — only adds findings for categories the regex scanner did NOT already find.
 *
 * Phase 5: Every AI-returned excerpt is verified verbatim in the page texts before
 * accepting. Unverified excerpts are discarded (not displayed). Page numbers are
 * derived from where verification found the text, never from the model.
 *
 * @param {Array<{page: number, text: string}>} pageTexts  — already extracted page texts
 * @returns {Promise<{ enhanced: boolean, findings: Object, error?: string }>}
 */
export async function aiEnhanceSection(pageTexts) {
  if (typeof window === 'undefined' || !window.electronAPI?.aiChat) {
    return { enhanced: false, findings: {} };
  }

  // Build page-separated text. Send full pages (not truncated) — model needs
  // to see complete context for accurate verbatim quotes.
  let combined = '';
  for (const { page, text } of pageTexts) {
    const chunk = `\n--- PAGE ${page} ---\n${text}`;
    if (combined.length + chunk.length > 12000) break;
    combined += chunk;
  }

  const systemPrompt = buildIntelligencePrompt({ mode: 'scan' });

  const userMsg =
    'Analyze this spec text. Return ONLY a JSON object where each key contains:\n' +
    '{ "found": boolean, "excerpt": "EXACT verbatim characters from the spec text, <= 120 chars", "page": integer_page_number_or_null }\n\n' +
    'IMPORTANT: excerpt must be copied character-for-character from the text above. Do NOT paraphrase.\n\n' +
    'Keys to extract:\n' +
    '  basisOfDesign      — named manufacturer as basis of design\n' +
    '  noSubstitutions    — no-substitution / sole-source / proprietary language\n' +
    '  delegatedDesign    — engineering delegated to contractor / PE stamp required\n' +
    '  finish             — surface finish or coating (anodized, PVDF, Kynar, paint)\n' +
    '  aamaClass          — AAMA 2603/2604/2605 finish performance class\n' +
    '  performance        — DP, U-value, SHGC, air/water infiltration values\n' +
    '  warranty           — warranty period or terms\n' +
    '  mockup             — full-size mock-up or prototype panel required\n' +
    '  testRequirements   — field testing required (AAMA/ASTM/water test)\n' +
    '  fireRating         — fire-rated or fire-protective glazing assembly\n' +
    '  blastResistance    — blast-resistant glazing (GSA/UFC 4-010)\n' +
    '  impactResistance   — hurricane/HVHZ/impact-resistant glazing\n' +
    '  leedRequirements   — LEED certification or sustainability docs required\n' +
    '  liquidatedDamages  — liquidated damages clause with daily rate\n' +
    '  retainage          — retainage percentage stated\n' +
    '  bondRequirements   — performance or payment bond required\n\n' +
    `SPEC TEXT:\n${combined}\n\nReturn ONLY the JSON object.`;

  try {
    const result = await window.electronAPI.aiChat({
      systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    });
    if (!result.ok) return { enhanced: false, findings: {}, error: result.error };

    // Extract JSON from response (Claude may wrap in prose)
    const raw = result.text.trim();
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s < 0 || e < 0) return { enhanced: false, findings: {} };
    const parsed = JSON.parse(raw.slice(s, e + 1));

    // Phase 5: Normalize helper — strip punctuation, collapse whitespace
    const normalizeExcerpt = (str) =>
      (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Phase 5: Verify each AI excerpt exists verbatim in the actual page texts.
    // Page number comes from where we found it, not from the model.
    const verifyExcerpt = (excerpt) => {
      if (!excerpt || typeof excerpt !== 'string' || excerpt.length < 8) return null;
      const normExcerpt = normalizeExcerpt(excerpt).slice(0, 80);
      for (const { page: pg, text } of pageTexts) {
        if (normalizeExcerpt(text).includes(normExcerpt)) {
          return pg; // verified — return the page where we found it
        }
      }
      return null; // not found verbatim — discard
    };

    // Normalize and remap keys
    const findings = {};
    for (const [aiKey, val] of Object.entries(parsed)) {
      if (!val || typeof val !== 'object' || !val.found) continue;
      const mappedKey = AI_KEY_MAP[aiKey] || aiKey;
      const excerpt = typeof val.excerpt === 'string' ? val.excerpt.slice(0, 120) : null;

      // Phase 5: Verify the excerpt. Discarded if not found verbatim.
      const verifiedPage = excerpt ? verifyExcerpt(excerpt) : null;
      if (!verifiedPage) continue; // reject hallucinated or paraphrased findings

      findings[mappedKey] = {
        found:       true,
        excerpt,
        page:        verifiedPage,
        aiAssisted:  true,
        aiVerified:  true,
      };
    }
    return { enhanced: true, findings };
  } catch (err) {
    return { enhanced: false, findings: {}, error: err?.message || String(err) };
  }
}
