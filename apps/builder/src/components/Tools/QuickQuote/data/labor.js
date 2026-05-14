// rate = multiplier applied to laborRate per unit
// flatPrice = fixed $ per unit (no labor rate)
export const LABOR_GROUPS = [
  {
    grp: 'Lite Installation',
    items: [
      { name: 'Narrow Lite Installed',            rate: 1.25, unit: 'SF'    },
      { name: 'Half Lite Installed',              rate: 1.25, unit: 'SF'    },
      { name: 'Full Lite Installed',              rate: 1.25, unit: 'SF'    },
      { name: 'Sidelite Installed',               rate: 1.75, unit: 'SF'    },
      { name: 'Lead Lined Installed',             rate: 1.75, unit: 'SF'    },
      { name: 'Fire Rated Narrow Lite Installed', rate: 1.75, unit: 'SF'    },
      { name: 'Fire Rated Half Lite Installed',   rate: 2.00, unit: 'SF'    },
      { name: 'Fire Rated Full Lite Installed',   rate: 2.25, unit: 'SF'    },
      { name: 'BM Install (120")',                rate: 1.25, unit: 'SF'    },
    ],
  },
  {
    grp: 'Demo / Reinstall',
    items: [
      { name: 'Demo of 1 Lite — SF (2 Person Crew)',              rate: 6,    unit: 'Lites' },
      { name: 'Demo of 1 Lite — CW (2 Person Crew)',              rate: 10,   unit: 'Lites' },
      { name: 'Reinstall of 1 Lite — SF (2 Person Crew)',         rate: 10,   unit: 'Lites' },
      { name: 'Reinstall of 1 Lite — CW (2 Person Crew)',         rate: 14,   unit: 'Lites' },
      { name: 'Demo of SF / CW Doors (2 Person Crew)',            rate: 2.75, unit: 'Ea.'   },
      { name: 'Demo of All Glass Doors (2 Person Crew)',          rate: 4,    unit: 'Ea.'   },
      { name: 'Demo of All Glass Sidelites (2 Person Crew)',      rate: 4,    unit: 'Ea.'   },
      { name: 'Install of Rim Panic on Existing Door Leaf',       rate: 4,    unit: 'Ea.'   },
      { name: 'Install of CVR Panic on Existing Door Leaf',       rate: 6,    unit: 'Ea.'   },
    ],
  },
  {
    grp: 'Field Labor & Per Diem',
    items: [
      { name: 'Travel Time',                             rate: 1,              unit: 'Hrs'    },
      { name: 'Per Diem / Person',                       flatPrice: 40,        unit: 'Person' },
      { name: 'Lodging (1 room — 2 person crew)',        flatPrice: 150,       unit: 'Nights' },
      { name: 'Daily Cleaning',                          rate: 1,              unit: 'Days'   },
      { name: 'Misc. Labor (enter total $ amount)',      flatPrice: 1,         unit: '$'      },
    ],
  },
  {
    grp: 'Equipment',
    items: [
      { name: "19' Electric Scissor Lift",            flatPrice: 731,  unit: 'Months' },
      { name: "26' Electric Scissor Lift",            flatPrice: 929,  unit: 'Months' },
      { name: "34' Articulating Boom Lift",           flatPrice: 2493, unit: 'Months' },
      { name: "45' Articulating Boom Lift",           flatPrice: 1849, unit: 'Months' },
      { name: "40' Straight Boom Lift",               flatPrice: 178,  unit: 'Months' },
      { name: "60' Articulating Boom Lift",           flatPrice: 3202, unit: 'Months' },
      { name: 'Standard Manipulator',                 flatPrice: 2500, unit: 'Months' },
      { name: 'Suspended Scaffold / Swing Stage',     flatPrice: 7500, unit: 'Months' },
    ],
  },
  {
    grp: 'Testing',
    items: [
      { name: 'AAMA 501.2 Water Test',               flatPrice: 3000, unit: 'Ea.' },
      { name: 'AAMA 502 Air & Water Chamber Test',   flatPrice: 3500, unit: 'Ea.' },
    ],
  },
]
