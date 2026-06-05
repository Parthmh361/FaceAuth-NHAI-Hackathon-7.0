/**
 * NHAI FaceAuth — design system tokens.
 * Single source of truth for colors, spacing, radius and typography so every
 * screen and component stays visually consistent.
 */

export const colors = {
  bg: '#0B0E14',
  surface: '#141925',
  surfaceAlt: '#1C2230',
  border: '#2A3242',
  primary: '#4F8CFF',
  primaryDark: '#3A6FD8',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  text: '#FFFFFF',
  textMuted: '#8A93A6',
  textFaint: '#5A6275',
  accent: '#FFD60A',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '500' as const, color: colors.text },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textFaint },
};
