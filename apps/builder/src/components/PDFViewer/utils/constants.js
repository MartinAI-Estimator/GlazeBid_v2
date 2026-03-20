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

export const API_ENDPOINTS = {
  GHOST_SUGGEST: 'http://127.0.0.1:8000/api/ghost/live-suggest',
  GHOST_ACCEPT: 'http://127.0.0.1:8000/api/ghost/accept',
  GHOST_REJECT: 'http://127.0.0.1:8000/api/ghost/reject'
};
