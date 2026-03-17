/**
 *  FarmerCrate – Shared Design System v2 (Dark Green Brand)
 *  All screens import tokens from here.
 */

// ─── Palette ──────────────────────────────────────────────────────────────────
export const Colors = {
  // Brand greens
  primary: '#1B5E20',
  primaryDark: '#103A12',
  primaryMid: '#2E7D32',
  primaryLight: '#4CAF50',
  primarySoft: '#C8E6C9',
  primaryXSoft: '#E8F5E9',
  primaryGlow: '#A5D6A7',

  // Warm accent (amber)
  accent: '#FF8F00',
  accentLight: '#FFF8E1',
  accentMid: '#FFA000',

  // Semantic
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#E65100',
  warningLight: '#FFF3E0',
  error: '#B71C1C',
  errorLight: '#FFEBEE',
  info: '#01579B',
  infoLight: '#E3F2FD',

  // Surfaces
  background: '#F4F8F4',
  surfaceElevated: '#FAFFFE',
  card: '#FFFFFF',
  cardAlt: '#FAFFFE',
  overlay: 'rgba(0,0,0,0.48)',
  overlayLight: 'rgba(0,0,0,0.26)',

  // Glass
  glassBg: 'rgba(255,255,255,0.14)',
  glassBgStrong: 'rgba(255,255,255,0.26)',
  glassBorder: 'rgba(255,255,255,0.32)',
  glassBorderStrong: 'rgba(255,255,255,0.55)',
  glassDark: 'rgba(27,94,32,0.18)',
  glassWhite: 'rgba(255,255,255,0.10)',

  // Header blob decorations
  headerBlob1: 'rgba(255,255,255,0.10)',
  headerBlob2: 'rgba(255,255,255,0.06)',
  headerBlob3: 'rgba(0,0,0,0.08)',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#555555',
  textMuted: '#9E9E9E',
  textLight: '#BDBDBD',
  textOnDark: '#FFFFFF',
  textOnDarkSoft: 'rgba(255,255,255,0.78)',
  textOnDarkMuted: 'rgba(255,255,255,0.52)',

  // Borders
  border: '#E0EDE0',
  borderLight: '#EDF5ED',
  borderFocus: '#4CAF50',
  divider: '#F0F0F0',
  dividerDark: '#E0E0E0',

  // Tabs
  tabInactive: '#9E9E9E',
  tabActive: '#1B5E20',
  tabBg: '#FFFFFF',

  // Gradient arrays (LinearGradient colors prop)
  gradientHero: ['#1B5E20', '#2E7D32', '#43A047'],
  gradientHeroDark: ['#103A12', '#1B5E20', '#2E7D32'],
  gradientCard: ['#2E7D32', '#388E3C'],
  gradientLight: ['#E8F5E9', '#F4F8F4'],
  gradientWarm: ['#E65100', '#FF8F00'],
  gradientAmber: ['#F57F17', '#FFA000'],
  gradientBlue: ['#01579B', '#0288D1'],
  gradientPurple: ['#4A148C', '#7B1FA2'],
  gradientTeal: ['#004D40', '#00897B'],
  gradientRose: ['#880E4F', '#C2185B'],
  gradientCyan: ['#006064', '#00838F'],
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const Font = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 26,
  hero: 30,
  display: 38,
  weightLight: '300',
  weightRegular: '400',
  weightMedium: '500',
  weightSemiBold: '600',
  weightBold: '700',
  weightExtraBold: '800',
  weightBlack: '900',
  trackTight: -0.4,
  trackNormal: 0,
  trackWide: 0.3,
  trackXWide: 0.8,
  trackLoose: 1.4,
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 52,
};

// ─── Radii ────────────────────────────────────────────────────────────────────
export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  pill: 50,
  circle: 999,
};

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const Shadow = {
  xs: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 10,
    elevation: 6,
  },
  lg: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 14,
  },
  xl: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 24,
  },
  tabBar: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 24,
  },
};

// ─── Order status colours ──────────────────────────────────────────────────────
export const StatusColors = {
  PENDING:            '#E65100',
  PLACED:             '#1565C0',
  CONFIRMED:          '#1565C0',
  ASSIGNED:           '#6A1B9A',
  SHIPPED:            '#BF360C',
  IN_TRANSIT:         '#006064',
  RECEIVED:           '#00695C',
  OUT_FOR_DELIVERY:   '#E65100',
  DELIVERED:          '#2E7D32',
  COMPLETED:          '#1B5E20',
  CANCELLED:          '#B71C1C',
  PICKUP_IN_PROGRESS: '#4E342E',
  PICKED_UP:          '#00695C',
};

export const StatusBgColors = {
  PENDING:            '#FBE9E7',
  PLACED:             '#E3F2FD',
  CONFIRMED:          '#E3F2FD',
  ASSIGNED:           '#F3E5F5',
  SHIPPED:            '#FBE9E7',
  IN_TRANSIT:         '#E0F7FA',
  RECEIVED:           '#E0F2F1',
  OUT_FOR_DELIVERY:   '#FFF3E0',
  DELIVERED:          '#E8F5E9',
  COMPLETED:          '#E8F5E9',
  CANCELLED:          '#FFEBEE',
  PICKUP_IN_PROGRESS: '#EFEBE9',
  PICKED_UP:          '#E0F2F1',
};

export const StatusLabels = {
  PENDING:            'Pending',
  PLACED:             'Accepted',
  CONFIRMED:          'Confirmed',
  ASSIGNED:           'Assigned',
  SHIPPED:            'Picked Up',
  IN_TRANSIT:         'In Transit',
  RECEIVED:           'At Hub',
  OUT_FOR_DELIVERY:   'Out for Delivery',
  DELIVERED:          'Delivered',
  COMPLETED:          'Completed',
  CANCELLED:          'Cancelled',
  PICKUP_IN_PROGRESS: 'Pickup Progress',
  PICKED_UP:          'Picked Up',
};

// ─── Card gradient pairs for stat/metric cards ─────────────────────────────────
export const CardGradients = [
  ['#1B5E20', '#2E7D32'],
  ['#1565C0', '#1976D2'],
  ['#BF360C', '#E64A19'],
  ['#6A1B9A', '#8E24AA'],
  ['#004D40', '#00796B'],
  ['#E65100', '#EF6C00'],
  ['#F57F17', '#F9A825'],
  ['#880E4F', '#AD1457'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function shadowStyle(size = 'md') {
  return Shadow[size] || Shadow.md;
}

export function statusColor(status = '') {
  return StatusColors[(status || '').toUpperCase()] || '#757575';
}

export function statusBgColor(status = '') {
  return StatusBgColors[(status || '').toUpperCase()] || '#F5F5F5';
}

export function statusLabel(status = '') {
  return StatusLabels[(status || '').toUpperCase()] || (status || '').replace(/_/g, ' ');
}

/**
 * Returns a style object for an icon circle container.
 * Usage: <View style={iconCircleStyle(44, '#E8F5E9')} />
 */
export function iconCircleStyle(size = 44, bg = '#E8F5E9') {
  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg,
    justifyContent: 'center',
    alignItems: 'center',
  };
}
