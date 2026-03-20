/**
 * GlazeBid AIQ Design System
 * Consistent styling tokens across the application
 */

export const colors = {
  // Brand Colors
  primary: '#007BFF',        // GlazeBid Electric Blue
  primaryDark: '#0056b3',    // Hover state
  primaryLight: '#3d9bff',   // Active/Selected
  
  secondary: '#001F3F',      // GlazeBid Dark Navy
  secondaryLight: '#002952',
  
  // Backgrounds
  bgDeep: '#0b0e11',         // Main background
  bgPanel: '#001F3F',        // Sidebar/Header
  bgCard: '#1c2128',         // Cards/Elevated
  bgElevated: '#252526',     // Modal backgrounds
  bgHover: '#2d333b',        // Hover states
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#9ea7b3',
  textMuted: '#6b7280',
  textDisabled: '#4b5563',
  
  // Borders
  borderSubtle: '#2d333b',
  borderActive: '#007BFF',
  
  // Status Colors
  success: '#4ade80',
  successBg: 'rgba(74, 222, 128, 0.1)',
  
  warning: '#fbbf24',
  warningBg: 'rgba(251, 191, 36, 0.1)',
  
  error: '#ef4444',
  errorBg: 'rgba(239, 68, 68, 0.1)',
  
  info: '#60a5fa',
  infoBg: 'rgba(96, 165, 250, 0.1)',
  
  // Glazing System Colors (for markups)
  storefront: '#FF8C00',      // Orange
  curtainWall: '#00FF00',     // Green
  punched: '#00BFFF',         // Sky Blue
  allGlass: '#FF00FF',        // Magenta
  hardware: '#FFD700',        // Gold
  excluded: '#808080',        // Gray
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
};

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
};

export const typography = {
  fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monoFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  
  sizes: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    xxl: '24px',
    xxxl: '32px',
  },
  
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.3)',
  glow: '0 0 20px rgba(0, 123, 255, 0.3)',
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
};

export const transitions = {
  fast: '0.15s ease',
  normal: '0.25s ease',
  slow: '0.35s ease',
  bounce: '0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
};

export const zIndex = {
  dropdown: 100,
  modal: 200,
  tooltip: 300,
  toast: 400,
  overlay: 500,
};

// Common button styles
export const buttonStyles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.lg}`,
    borderRadius: borderRadius.md,
    border: 'none',
    cursor: 'pointer',
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    transition: transitions.normal,
  },
  
  primary: {
    backgroundColor: colors.primary,
    color: colors.textPrimary,
  },
  
  secondary: {
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    color: colors.textSecondary,
  },
  
  danger: {
    backgroundColor: colors.error,
    color: colors.textPrimary,
  },
  
  ghost: {
    backgroundColor: 'transparent',
    color: colors.textSecondary,
  },
  
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

// Common card styles
export const cardStyles = {
  base: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.borderSubtle}`,
    padding: spacing.lg,
  },
  
  elevated: {
    boxShadow: shadows.md,
  },
  
  interactive: {
    cursor: 'pointer',
    transition: transitions.normal,
  },
};

// Common input styles
export const inputStyles = {
  base: {
    backgroundColor: colors.bgDeep,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: borderRadius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    outline: 'none',
    transition: transitions.fast,
  },
  
  focus: {
    borderColor: colors.primary,
    boxShadow: `0 0 0 2px ${colors.primary}33`,
  },
};

export default {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  transitions,
  zIndex,
  buttonStyles,
  cardStyles,
  inputStyles,
};
