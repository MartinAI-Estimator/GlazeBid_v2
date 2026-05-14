/**
 * useEquipmentRatesStore — Equipment rental rate catalog (Zustand + localStorage)
 * Seeded from Warren Bid Sheet.xlsm — updated 11/1/25
 *
 * Each item: { id, category, name, weekRate, monthRate, pdRate }
 *   weekRate  — cost per week  (null if not applicable)
 *   monthRate — cost per month (null if not applicable)
 *   pdRate    — flat pickup/drop-off charge (null for most items)
 */

import { create } from 'zustand';

const STORAGE_KEY = 'glazebid:equipmentRates';

const DEFAULT_EQUIPMENT_RATES = [
  // ── Electric Scissor Lifts ─────────────────────────────────────────────────
  { id: 'es-1', category: 'Electric Scissor Lifts', name: "19' Lift",                                    weekRate: 278,  monthRate: 458,   pdRate: null },
  { id: 'es-2', category: 'Electric Scissor Lifts', name: "24' - 26' Lift x 30\"-36\" Width",            weekRate: 380,  monthRate: 660,   pdRate: null },
  { id: 'es-3', category: 'Electric Scissor Lifts', name: "30' - 35' Lift x 46\" x 48\" Width",          weekRate: 652,  monthRate: 980,   pdRate: null },
  { id: 'es-4', category: 'Electric Scissor Lifts', name: "30' - 35' Lift 4WD",                          weekRate: 710,  monthRate: 1393,  pdRate: null },
  { id: 'es-t', category: 'Electric Scissor Lifts', name: 'Transportation Per Pick Up / Drop Off',        weekRate: null, monthRate: null,  pdRate: 310  },

  // ── Boom Lifts ─────────────────────────────────────────────────────────────
  { id: 'bl-0', category: 'Boom Lifts', name: 'Glazier Pkg. For Boom (add if a boom is selected)',        weekRate: 85,   monthRate: 210,   pdRate: null },
  { id: 'bl-1', category: 'Boom Lifts', name: "37' - 44' Telescopic",                                     weekRate: 956,  monthRate: 1981,  pdRate: null },
  { id: 'bl-2', category: 'Boom Lifts', name: "60' - 64' Telescopic",                                     weekRate: 1261, monthRate: 2451,  pdRate: null },
  { id: 'bl-3', category: 'Boom Lifts', name: "65' - 70' Telescopic",                                     weekRate: 1305, monthRate: 2506,  pdRate: null },
  { id: 'bl-4', category: 'Boom Lifts', name: "76' - 80' Telescopic",                                     weekRate: 1890, monthRate: 4010,  pdRate: null },
  { id: 'bl-5', category: 'Boom Lifts', name: "120' Telescopic",                                          weekRate: 3228, monthRate: 7818,  pdRate: null },
  { id: 'bl-6', category: 'Boom Lifts', name: "125' Telescopic w/ Jib",                                   weekRate: 3319, monthRate: 8076,  pdRate: null },
  { id: 'bl-7', category: 'Boom Lifts', name: "135' Telescopic w/ Jib",                                   weekRate: 3789, monthRate: 9362,  pdRate: null },
  { id: 'bl-t', category: 'Boom Lifts', name: 'Transportation Per Pick Up / Drop Off',                    weekRate: null, monthRate: null,  pdRate: 310  },

  // ── Telehandlers (Forklift & Lull) ─────────────────────────────────────────
  { id: 'th-1', category: 'Telehandlers (Forklift & Lull)', name: 'Warehouse Forklift 5k',               weekRate: 753,  monthRate: 1518,  pdRate: null },
  { id: 'th-2', category: 'Telehandlers (Forklift & Lull)', name: "5K 16' - 20' Forklift",               weekRate: 1000, monthRate: 2031,  pdRate: null },
  { id: 'th-3', category: 'Telehandlers (Forklift & Lull)', name: "7K 38' - 44' Forklift",               weekRate: 1156, monthRate: 2510,  pdRate: null },
  { id: 'th-4', category: 'Telehandlers (Forklift & Lull)', name: "6K 40' - 49' Forklift",               weekRate: 1115, monthRate: 2333,  pdRate: null },
  { id: 'th-5', category: 'Telehandlers (Forklift & Lull)', name: "8K 40' - 49' Forklift",               weekRate: 1334, monthRate: 2616,  pdRate: null },
  { id: 'th-6', category: 'Telehandlers (Forklift & Lull)', name: "10K 50' - 62' Forklift",              weekRate: 1540, monthRate: 3704,  pdRate: null },
  { id: 'th-t', category: 'Telehandlers (Forklift & Lull)', name: 'Transportation Per Pick Up / Drop Off', weekRate: null, monthRate: null, pdRate: 310  },

  // ── Manipulators ───────────────────────────────────────────────────────────
  { id: 'mn-1', category: 'Manipulators', name: 'Lift / Forklift Manipulator (1,500 lbs)',               weekRate: 260,  monthRate: 675,   pdRate: null },
  { id: 'mn-2', category: 'Manipulators', name: 'Smartlift Manipulator (1,300lbs)',                       weekRate: 2000, monthRate: 4500,  pdRate: null },
  { id: 'mn-t', category: 'Manipulators', name: 'Transportation Per Pick Up / Drop Off',                  weekRate: null, monthRate: null,  pdRate: 310  },

  // ── Crane ──────────────────────────────────────────────────────────────────
  { id: 'cr-1', category: 'Crane', name: "15 Ton 60' w/ 22' Jib",                                        weekRate: 2145, monthRate: 5060,  pdRate: null },
  { id: 'cr-2', category: 'Crane', name: "21 Ton 90' Boom w/ 25' - 45' Jib",                             weekRate: 2299, monthRate: 6248,  pdRate: null },
  { id: 'cr-3', category: 'Crane', name: "33 Ton 127' Boom w/ 30' Jib",                                  weekRate: 2860, monthRate: 8580,  pdRate: null },
  { id: 'cr-4', category: 'Crane', name: 'Operator (add if a crane is selected)',                         weekRate: 3400, monthRate: 13600, pdRate: null },

  // ── Swing Stage ────────────────────────────────────────────────────────────
  { id: 'ss-1', category: 'Swing Stage', name: "32' (16+16) Swing Stage",                                 weekRate: null, monthRate: 5060,  pdRate: null },
];

const CATEGORY_ORDER = [
  'Electric Scissor Lifts',
  'Boom Lifts',
  'Telehandlers (Forklift & Lull)',
  'Manipulators',
  'Crane',
  'Swing Stage',
];

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

function saveToStorage(rates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch { /* ignore */ }
}

const useEquipmentRatesStore = create((set, get) => ({
  rates: loadFromStorage() ?? DEFAULT_EQUIPMENT_RATES,
  categoryOrder: CATEGORY_ORDER,

  /** Update a single field on one rate item */
  updateRate: (id, field, value) => {
    const rates = get().rates.map(r =>
      r.id === id ? { ...r, [field]: value === '' ? null : Number(value) || null } : r
    );
    saveToStorage(rates);
    set({ rates });
  },

  /** Update the display name of a rate item */
  updateName: (id, name) => {
    const rates = get().rates.map(r => r.id === id ? { ...r, name } : r);
    saveToStorage(rates);
    set({ rates });
  },

  /** Reset all rates back to the seeded defaults */
  resetToDefaults: () => {
    saveToStorage(DEFAULT_EQUIPMENT_RATES);
    set({ rates: DEFAULT_EQUIPMENT_RATES });
  },

  /** Look up a rate item by id */
  getRateById: (id) => get().rates.find(r => r.id === id),

  /** Get all items in a given category */
  getByCategory: (category) => get().rates.filter(r => r.category === category),

  /** Get the rates grouped by category in display order */
  getGrouped: () => {
    const { rates, categoryOrder } = get();
    return categoryOrder.map(cat => ({
      category: cat,
      items: rates.filter(r => r.category === cat),
    }));
  },
}));

export default useEquipmentRatesStore;
export { CATEGORY_ORDER, DEFAULT_EQUIPMENT_RATES };
