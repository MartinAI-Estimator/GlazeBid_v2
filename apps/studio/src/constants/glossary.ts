/**
 * glossary.ts — glazing terms shown on hover (GlossaryText) for estimators who
 * are new to the trade.  Keep each definition to what an entry-level estimator
 * needs to price the work; Binswanger practice is noted where it differs.
 */
export type GlossaryEntry = { term: string; aliases?: string[]; def: string };

export const GLOSSARY: GlossaryEntry[] = [
  // ── Systems ───────────────────────────────────────────────────────────────
  { term: 'Storefront', aliases: ['SF', 'Ext Storefront', 'Int Storefront'], def: 'Aluminum framing for glass, usually ground-floor openings set between the floor and the structure above. Frames are assembled screw-spline or shear-block and are typically 4-1/2" or 6" deep. Kawneer Trifab and Tubelite 14000 are the common systems.' },
  { term: 'Curtain wall', aliases: ['CW', 'Ext Curtain Wall', 'Int Curtain Wall'], def: 'Non-load-bearing aluminum framing hung off the building structure. It can run past floor lines, has deeper mullions (about 6"–7-1/2"), and holds the glass with pressure plates and covers. It is stick-built or unitized; Kawneer 1600 is a common system.' },
  { term: 'Window wall', aliases: ['Ext WW'], def: 'Framing that sits slab to slab, with each floor its own frame; slab-edge covers hide the floor line. In the Binswanger ToolBox, "Ext WW" means window wall.' },
  { term: 'All-glass entrance', aliases: ['All Glass Walls', 'All Glass Doors', 'Herculite', 'frameless'], def: 'Frameless tempered-glass doors and walls (usually 1/2" or 3/4") held by patch fittings, rails or channels. There is no aluminum frame around the glass.' },
  { term: 'Translucent panel', aliases: ['Translucent Panels', 'Kalwall'], def: 'Insulated fiberglass sandwich panels (Kalwall, CPI) that let light through but are not see-through. They are often only called out by an arrow note on the elevations.' },
  { term: 'Transaction window', aliases: ['Transaction Windows', 'pass-thru window', 'service window'], def: 'Pass-through or drive-up window units. They may be bullet-resistant (UL 752 levels).' },
  { term: 'Pass-thru', def: 'An item GlazeBid carries in the bid but a hired sub supplies and installs, such as automatic sliders and unit skylights.' },
  { term: 'Glazing only', aliases: ['Glazing Only', 'vision lite', 'HM lite'], def: 'Glass in someone else\'s frame, such as a vision lite in a hollow-metal or wood door or frame. We carry the glass only, including fire-rated lites.' },
  { term: 'Fire-rated glazing', aliases: ['Fire Rated Glazing', 'fire-rated'], def: 'Glass tested for a fire rating. Fire-protective glass (e.g. ceramic) blocks flame and smoke; fire-resistive glass also blocks radiant heat. Ratings run 20–120 minutes, and the frame must carry the rating too.' },
  { term: 'Sun control', aliases: ['Sun Control', 'sunshade'], def: 'Outriggers and blades attached to the framing to shade the glass. They are ours when they are integral to the storefront or curtain wall system.' },
  { term: 'Mirror', aliases: ['Mirrors', 'Bobrick'], def: 'Ours when frameless and/or not marked Bobrick. Bobrick framed toilet mirrors are Division 10 (toilet accessories).' },
  { term: 'Glass handrail', aliases: ['Glass Handrail', 'guardrail'], def: 'Glass infill or structural glass guard at stairs and balconies. The railing system itself may be Division 05.' },

  // ── Framing parts ─────────────────────────────────────────────────────────
  { term: 'Mullion', aliases: ['mull'], def: 'A vertical framing member between lites. Horizontal members are called horizontals or transom bars.' },
  { term: 'Head', def: 'Top member of a frame. Also the name of the detail that shows the top of the frame.' },
  { term: 'Jamb', def: 'Side member of a frame, at the wall. Also the name of the detail that shows it.' },
  { term: 'Sill', def: 'Bottom member of a frame. Also the name of the detail that shows it.' },
  { term: 'Lite', aliases: ['lites'], def: 'One pane of glass, or one glazed opening in a frame.' },
  { term: 'Sidelite', aliases: ['sidelight'], def: 'A glazed panel beside a door.' },
  { term: 'Transom', def: 'A glazed panel above a door, or the horizontal bar under it.' },
  { term: 'DLO', aliases: ['daylight opening'], def: 'Daylight opening: the glass you can see inside the frame. Glass size = DLO plus the bite (storefront DLO + 3/4", captured curtain wall DLO + 1"). Glass is quoted on block size, rounded up to the next even inch.' },
  { term: 'Bite', def: 'How far the glass edge sits inside the frame pocket.' },
  { term: 'Stile', aliases: ['narrow stile', 'medium stile', 'wide stile'], def: 'Vertical edge members of a door. Kawneer 190 is narrow, 350 is medium and 500 is wide stile.' },
  { term: 'Rail', def: 'Horizontal members of a door (top, mid and bottom rail).' },
  { term: 'Thermal break', aliases: ['thermally broken', 'Isolock'], def: 'An insulating strip that separates the outside aluminum from the inside aluminum so the frame doesn\'t conduct cold (e.g. Kawneer Isolock). The "T" in 451T means thermal.' },
  { term: 'Center-glazed', aliases: ['center-plane', 'front-glazed', 'back-glazed'], def: 'Where the glass sits in the frame depth: center, front (outside) or back (inside).' },
  { term: 'Screw spline', def: 'Storefront joinery where the verticals run full height and the horizontals are screwed into splines on the vertical faces.' },
  { term: 'Shear block', def: 'Storefront joinery where the horizontals clip onto blocks fastened to the verticals.' },
  { term: 'Pressure plate', aliases: ['cover cap'], def: 'Curtain wall extrusion screwed over the glass edge to clamp it, then hidden by a snap-on cover.' },
  { term: 'SSG', aliases: ['structural silicone', 'structural-sealant-glazed'], def: 'Structural silicone glazing: glass bonded to the frame with structural silicone and no outside cap. It needs SSG caulk joints.' },
  { term: 'Snap-in filler', def: 'Filler that closes an open-back door-jamb pocket. The glazier picks it up, even when the vendor quotes the door and frame.' },
  { term: 'Subsill', aliases: ['sill receptor', 'receptor'], def: 'An extrusion under (or around) the frame that receives it and handles water and movement.' },

  // ── Series ────────────────────────────────────────────────────────────────
  { term: '451T', aliases: ['Trifab 451T', 'TRI-FAB 451T', 'VG 451T', 'VG451-T'], def: 'Kawneer Trifab VG 451T: 2" × 4-1/2" thermally broken, center-glazed storefront, for 1" insulated glass. The everyday exterior storefront.' },
  { term: 'Trifab 450', aliases: ['TRI-FAB 450', 'TRIFAB 450'], def: 'Kawneer Trifab 450: 1-3/4" × 4-1/2" non-thermal storefront, typically interior with 1/4" glass.' },
  { term: '1600 Wall', aliases: ['1600 Wall System'], def: 'Kawneer 1600 Wall System: the standard captured curtain wall.' },
  { term: 'Kawneer 350', aliases: ['350 entrance', '350-T', '350T', 'Insulpour', 'MODEL 350'], def: 'Kawneer 350 medium-stile entrance door. 350T / Insulpour is the thermally broken version.' },
  { term: 'Tubelite 14000', aliases: ['E14000', 'T14000'], def: 'Tubelite 14000 series storefront, Tubelite\'s everyday 4-1/2" storefront.' },

  // ── Glass ─────────────────────────────────────────────────────────────────
  { term: 'IGU', aliases: ['insulated glass', 'insulating glass', 'insulated glazing', '1" insulated'], def: 'Insulated glass unit: two lites with a sealed air or argon space. Typical 1" = 1/4" glass + 1/2" space + 1/4" glass.' },
  { term: 'Low-E', aliases: ['low-e', 'Solarban', 'SunGuard'], def: 'A thin metallic coating that cuts heat transfer, usually on surface #2 of an IGU. Named by product (Solarban 60/70, SunGuard SN 68…).' },
  { term: 'Surface #2', aliases: ['#2 surface', '#3 surface'], def: 'Glass surfaces are numbered from the outside in: #1 is outside, #2 and #3 face the airspace, and #4 is inside.' },
  { term: 'Tempered', aliases: ['TEMP', 'TEMP.', 'fully tempered'], def: 'Heat-treated safety glass, about 4× stronger than annealed. It breaks into small pieces and can\'t be cut after tempering. It is required at doors and near floors (hazardous locations). Company standard: all 1/4" clear tempered.' },
  { term: 'Heat-strengthened', def: 'About 2× stronger than annealed. It is not safety glass on its own.' },
  { term: 'Laminated', def: 'Two or more plies bonded with an interlayer (PVB, SGP) that holds the pieces together when it breaks. Used for safety, security and sound.' },
  { term: 'Annealed', aliases: ['float glass'], def: 'Plain float glass, not heat-treated.' },
  { term: 'Spandrel', def: 'Opaque glass (ceramic frit or opacifier) that hides structure between floors.' },
  { term: 'Frit', aliases: ['ceramic frit'], def: 'Ceramic enamel fired onto glass, as a solid color or a pattern (spandrel, bird-safe, shading).' },
  { term: 'Heat soak', aliases: ['heat-soaked'], def: 'A test oven cycle that weeds out tempered lites likely to break spontaneously (nickel sulfide). It adds cost and lead time.' },
  { term: 'Low-iron', aliases: ['Starphire', 'Optiwhite', 'Acuity'], def: 'Extra-clear glass without the green edge tint of standard clear.' },
  { term: 'Back-painted glass', def: 'Glass painted on the back face as a wall finish. In our scope.' },
  { term: 'U-factor', def: 'How much heat passes through the assembly; lower is better.' },
  { term: 'SHGC', def: 'Solar heat gain coefficient: share of the sun\'s heat that gets through; lower blocks more.' },
  { term: 'Bullet-resistant', aliases: ['UL 752', 'ballistic'], def: 'Glass and framing rated to UL 752 levels (1–8). Specialty pricing.' },

  // ── Metal & finish ───────────────────────────────────────────────────────
  { term: 'Break metal', aliases: ['Break Metal', 'brake metal'], def: 'Formed aluminum sheet bent on a brake: flashing, trim, panning, column covers. It is ours whenever a detail shows it touching our system.' },
  { term: 'Sill flashing', def: 'A break-metal pan under the storefront sill, with end dams, that carries water out. It is always ours when shown; masons never pick it up.' },
  { term: 'End dam', def: 'The turned-up end of a sill flashing that keeps water from running off the ends into the wall.' },
  { term: 'Anodized', aliases: ['anodic', 'clear anodized', 'dark bronze anodized'], def: 'An electrochemical finish grown into the aluminum. Class I is 0.7 mil or thicker; Class II is 0.4–0.7 mil. Kawneer #14 is clear Class I and #17 is clear Class II.' },
  { term: 'PVDF', aliases: ['Kynar', 'fluoropolymer', 'AAMA 2605'], def: 'A high-performance painted finish (70% PVDF resin, AAMA 2605). It is the premium painted finish and costs more than anodized in most colors.' },
  { term: 'AAMA 2604', def: 'A mid-grade painted-finish standard (between 2603 and 2605).' },

  // ── Doors & hardware ─────────────────────────────────────────────────────
  { term: 'Hardware set', aliases: ['hardware sets', 'HW set'], def: 'The hardware for one door: hinges or pivots, closer, lock or panic device, pulls, threshold, weatherstrip. Storefront door hardware is included by default.' },
  { term: 'Panic device', aliases: ['exit device', 'panic'], def: 'A push bar that unlatches the door for egress (rim, concealed vertical rod…).' },
  { term: 'Offset pivot', aliases: ['pivots'], def: 'Top, intermediate and bottom pivots the door swings on, the usual hanging for storefront doors.' },
  { term: 'Continuous hinge', def: 'A full-height hinge, used on heavy-use doors.' },
  { term: 'Closer', aliases: ['surface closer', 'overhead concealed closer', 'OHCC'], def: 'Closes the door. Surface-mounted or concealed in the head (OHCC).' },
  { term: 'Threshold', def: 'The plate at the bottom of the door opening.' },
  { term: 'Automatic slider', aliases: ['auto slider', 'automatic entrance', 'auto door'], def: 'Power-operated sliding door package (Stanley, Horton, ASSA ABLOY…). A pass-thru item.' },

  // ── Documents ─────────────────────────────────────────────────────────────
  { term: 'Elevation', def: 'A drawing looking straight at a wall or frame. Shows the frame sizes and the lite layout.' },
  { term: 'Detail', aliases: ['detail bubble'], def: 'A blown-up section cut through a frame edge (head, jamb, sill). Shows the frame, break metal and flashing. A bubble like 9/A3.9 means detail 9 on sheet A3.9.' },
  { term: 'Schedule', aliases: ['door schedule', 'window schedule'], def: 'A table of marks (door or frame types) with sizes, materials, details and hardware sets.' },
  { term: 'Keynote', def: 'A numbered note on a sheet whose text is in a legend. Arrow notes often name materials nothing else does.' },
  { term: 'Basis of design', aliases: ['basis-of-design'], def: 'The product the architect designed around. Others may be allowed as "equal".' },
  { term: 'Or equal', aliases: ['approved equal', 'or approved equal'], def: 'The spec allows a comparable product. We price Kawneer / Tubelite as the equal and say so in the scope letter.' },
  { term: 'Substitution request', def: 'A formal request to use a product the spec doesn\'t list. Needed before bid when the spec is closed to equals.' },
  { term: 'Delegated design', def: 'The spec makes the glazing contractor hire an engineer for stamped calcs and shop drawings. Carry the engineering cost.' },
  { term: 'Alternate', aliases: ['add alternate', 'deduct alternate', 'ALT'], def: 'A priced option the owner may add or deduct. Tagged in the takeoff and priced separately from the base bid.' },
  { term: 'Addendum', aliases: ['addenda'], def: 'A change to the bid documents issued before bid day. Acknowledge every one on the bid form.' },
  { term: 'RFI', def: 'Request for information: a written question to the architect when the documents conflict or are missing information.' },
  { term: 'Scope letter', aliases: ['exclusions', 'qualifications'], def: 'What the bid includes and excludes and the assumptions it was priced on.' },
  { term: 'Thus', def: 'In the Qty Text Boxes, "Thus" means the quantity of that type.' },
  { term: 'Polylength', def: 'A Bluebeam / Studio measurement along several connected segments, in linear feet.' },
];

// term / alias → entry (case-insensitive)
const INDEX = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) for (const k of [e.term, ...(e.aliases ?? [])]) INDEX.set(k.toLowerCase(), e);

export function lookup(term: string): GlossaryEntry | undefined {
  return INDEX.get(term.toLowerCase());
}

// Short all-caps codes (SF, CW, BR …) only match in capitals; words match any case.
const keys = [...INDEX.keys()].sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SHORT = new Set(GLOSSARY.flatMap(e => [e.term, ...(e.aliases ?? [])]).filter(k => /^[A-Z0-9#.\- ]{1,4}$/.test(k)).map(k => k.toLowerCase()));
export const TERM_RX = new RegExp(`(?<![A-Za-z0-9])(${keys.map(esc).join('|')})(?![A-Za-z0-9])`, 'gi');

/** Split text into plain runs and glossary terms. */
export function splitTerms(text: string): { text: string; entry?: GlossaryEntry }[] {
  const out: { text: string; entry?: GlossaryEntry }[] = [];
  let last = 0;
  const seen = new Set<GlossaryEntry>();
  for (const m of text.matchAll(TERM_RX)) {
    const k = m[0].toLowerCase();
    const e = INDEX.get(k);
    if (!e || m.index === undefined) continue;
    if (SHORT.has(k) && m[0] !== m[0].toUpperCase()) continue;   // "sf" in a word-ish context — skip
    if (seen.has(e)) continue;                                    // underline a term once per text
    seen.add(e);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], entry: e });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
