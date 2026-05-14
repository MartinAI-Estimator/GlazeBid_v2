export const MISC_GROUPS = [
  {
    grp: 'Markerboards — Material',
    items: [
      { name: "2' × 3' Glass Markerboard",  price: 450,  unit: 'Ea.' },
      { name: "3' × 4' Glass Markerboard",  price: 560,  unit: 'Ea.' },
      { name: "4' × 4' Glass Markerboard",  price: 650,  unit: 'Ea.' },
      { name: "4' × 5' Glass Markerboard",  price: 835,  unit: 'Ea.' },
      { name: "4' × 6' Glass Markerboard",  price: 910,  unit: 'Ea.' },
      { name: "4' × 8' Glass Markerboard",  price: 1111, unit: 'Ea.' },
      { name: "4' × 10' Glass Markerboard", price: 1410, unit: 'Ea.' },
    ],
  },
  {
    grp: 'Markerboards — Install',
    items: [
      { name: "2'-3' Markerboard Install",   laborMult: 6,  unit: 'Ea.' },
      { name: "4' Markerboard Install",      price: 270,    unit: 'Ea.' },
      { name: "6'-10' Markerboard Install",  price: 360,    unit: 'Ea.' },
    ],
  },
  {
    grp: 'Sunshades',
    items: [
      { name: 'Horizontal Sunshades — Straight (no corner)', price: 170,      unit: 'LF'  },
      { name: 'Horizontal Sunshades — Straight (w/ corner)', price: 181,      unit: 'LF'  },
      { name: 'Sunshades Labor (Install & Fab)',              laborMult: 2,    unit: 'LF'  },
    ],
  },
  {
    grp: 'Transaction Windows',
    items: [
      { name: 'Manual Sliding Transaction Window',            price: 2040, unit: 'Ea.' },
      { name: 'Manual Sliding Trans. Window (Impact)',        price: 2190, unit: 'Ea.' },
      { name: 'Manual Sliding Trans. Window (BR Level 1)',    price: 3790, unit: 'Ea.' },
      { name: 'Add for Fully Automatic Electric',             price: 1200, unit: 'Ea.' },
      { name: 'Add Stainless Steel Shelf',                    price: 350,  unit: 'Ea.' },
      { name: 'Add Heated Air Curtain',                       price: 2800, unit: 'Ea.' },
      { name: 'Add Fly Fan Air Curtain',                      price: 1160, unit: 'Ea.' },
      { name: 'Drive-Thru Service Window Labor',              laborMult: 6, unit: 'Ea.' },
    ],
  },
  {
    grp: 'Ticket Windows',
    items: [
      { name: 'Standard Framed Ticket Window w/ Speaker & Tray (36"×36")', price: 1430, unit: 'Ea.' },
      { name: 'Framed BR Level 1 Ticket Window (36"×36")',                  price: 3340, unit: 'Ea.' },
      { name: 'Framed BR Level 3 Ticket Window (36"×36")',                  price: 4130, unit: 'Ea.' },
      { name: 'Goose Neck Intercom Add',                                    price: 1385, unit: 'Ea.' },
      { name: 'Ticket Window Labor',                                        laborMult: 5, unit: 'Ea.' },
    ],
  },
  {
    grp: 'Office / Slider Windows',
    items: [
      { name: 'Office Glass Slider Transaction Window (1/4" Glass)', price: 40, unit: 'SF' },
    ],
  },
  {
    grp: 'Wall Mirrors',
    items: [
      { name: 'Full Length Wall Mirrors', price: 16.7, unit: 'SF' },
    ],
  },
  {
    grp: 'Handrails',
    items: [
      { name: 'Straight Run All Glass Handrail',        price: 480,  unit: 'LF' },
      { name: 'Staircase or Raked All Glass Handrail',  price: 575,  unit: 'LF' },
      { name: 'Radius All Glass Handrail',              price: 2100, unit: 'LF' },
    ],
  },
  {
    grp: 'Insulated Metal Panels',
    items: [
      { name: '1" Insulated Panels (clear anodized both sides)',    price: 25,  unit: 'SF' },
      { name: '1" Insulated Panels (custom painted both sides)',    price: 48,  unit: 'SF' },
      { name: '1½" Fire Rated Panels (clear anodized both sides)', price: 40,  unit: 'SF' },
      { name: 'Cut Outs — 1" Panels',                               price: 30,  unit: 'SF' },
      { name: '2¾" Thick / Crystal Shoji Panels',                  price: 156, unit: 'SF' },
    ],
  },
  {
    grp: 'Operable Windows',
    items: [
      { name: 'Casement Window — Storefront Application',            price: 1066, unit: 'Ea.' },
      { name: 'Casement Window — Curtain Wall Application',          price: 1276, unit: 'Ea.' },
      { name: 'Vent/Hopper Window — SF (Cam Handle)',                price: 976,  unit: 'Ea.' },
      { name: 'Vent/Hopper Window — SF (Roto Operator)',            price: 884,  unit: 'Ea.' },
      { name: 'Vent/Hopper Window — CW (Cam Handle)',                price: 1226, unit: 'Ea.' },
      { name: 'Fixed Pre-Fabricated Window w/ Head & Jamb Receptors', price: 47, unit: 'SF'  },
      { name: 'Operable Window Labor',                               laborMult: 4, unit: 'Ea.' },
      { name: 'Fixed Window Install',                                laborMult: 6, unit: 'Ea.' },
    ],
  },
  {
    grp: 'All Glass Walls (Full System)',
    items: [
      { name: 'All Glass Walls 3/8" Glass — Material', price: 10,    unit: 'SF' },
      { name: 'All Glass Walls 1/2" Glass — Material', price: 13.5,  unit: 'SF' },
      { name: 'All Glass Walls 5/8" Glass — Material', price: 64.85, unit: 'SF' },
      { name: 'All Glass Walls 3/4" Glass — Material', price: 64.85, unit: 'SF' },
      { name: 'All Glass Walls 3/8" Glass — Labor',    price: 8.4,   unit: 'SF', isLabor: true },
      { name: 'All Glass Walls 1/2" Glass — Labor',    price: 8.4,   unit: 'SF', isLabor: true },
      { name: 'All Glass Walls 5/8" Glass — Labor',    price: 9.4,   unit: 'SF', isLabor: true },
      { name: 'All Glass Walls 3/4" Glass — Labor',    price: 9.4,   unit: 'SF', isLabor: true },
      { name: 'Butt-Joint Material',                   price: 10.07, unit: 'LF' },
    ],
  },
  {
    grp: 'Door Hardware Add-ons',
    items: [
      { name: 'Non-Thermal Mid Rails (up to 6") / Leaf',           price: 125,     unit: 'Ea.' },
      { name: 'Heavy Duty Mid Rails (up to 6") / Leaf',            price: 256,     unit: 'Ea.' },
      { name: 'Thermal Mid Rails (up to 6") / Leaf',               price: 512,     unit: 'Ea.' },
      { name: 'Electric Strike — Single Door (Non-Panic)',         price: 740,     unit: 'Ea.' },
      { name: 'Electric Strike — Single Door (Rim Panic)',         price: 740,     unit: 'Ea.' },
      { name: 'Paddle Exit Device',                                 price: 263,     unit: 'Ea.' },
      { name: 'Lever Handle Exit Device',                           price: 219,     unit: 'Ea.' },
      { name: 'Overhead Concealed Closer',                          price: 1247.52, unit: 'Ea.' },
      { name: 'Electric Power Transfer',                            price: 1462.46, unit: 'Ea.' },
      { name: 'Electric Latch Release',                             price: 586,     unit: 'Ea.' },
      { name: 'Cylinder Dogging — Rim',                            price: 125,     unit: 'Ea.' },
      { name: 'CVR Dogging — Inactive Only',                       price: 125,     unit: 'Ea.' },
      { name: 'CVR Dogging — Active & Inactive',                   price: 250,     unit: 'Ea.' },
      { name: 'Electric Rim Panic Release',                         price: 1158,    unit: 'Ea.' },
      { name: 'Electric CVR Panic Release — One Side',             price: 1748,    unit: 'Ea.' },
      { name: 'Electric CVR Panic Release — Both Sides',          price: 2363,    unit: 'Ea.' },
      { name: 'Blumcraft Glass Mounted Keyed Panic',                price: 3450,    unit: 'Ea.' },
      { name: 'Mag Lock, Bracket & Power Supply',                   price: 625,     unit: 'Ea.' },
      { name: 'Floor Closer',                                       price: 250,     unit: 'Ea.' },
    ],
  },
  {
    grp: 'Break Metal',
    items: [
      { name: 'Break Metal (Use BM Calculator — Enter $ Amount)', price: 1, unit: '$' },
    ],
  },
]
