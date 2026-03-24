export const ZOOM_CONFIG = {
  MIN_SCALE: 0.1,        // 10%
  MAX_SCALE: 32.0,       // 3200% (Deep Zoom)
  ZOOM_DELTA: 0.25,      // Smooth steps
  WHEEL_SENSITIVITY: 0.001
};

export const SNAP_CONFIG = {
  SNAP_DISTANCE: 15,     // Pixels (Magnet strength)
  MIN_VECTOR_LENGTH: 5   // Ignore tiny dust specks
};

import { API_BASE } from '../../../apiClient';

export const API_ENDPOINTS = {
  GHOST_SUGGEST: `${API_BASE}/api/ghost/live-suggest`,
  GHOST_ACCEPT: `${API_BASE}/api/ghost/accept`,
  GHOST_REJECT: `${API_BASE}/api/ghost/reject`
};
