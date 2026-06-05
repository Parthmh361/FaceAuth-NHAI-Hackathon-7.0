/**
 * NHAI FaceAuth — design system tokens.
 * Single source of truth for colors, spacing, radius and typography so every
 * screen and component stays visually consistent.
 */

export const colors = {
  bg: '#F4F6FA',        // app background (light)
  surface: '#FFFFFF',   // cards / surfaces
  surfaceAlt: '#EDF1F7',// inputs / subtle fills
  border: '#D8DEE9',    // hairlines / outlines
  primary: '#2563EB',   // brand blue
  primaryDark: '#1D4ED8',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  text: '#101725',      // near-black headings/body
  textMuted: '#5A6679', // secondary text
  textFaint: '#97A1B2', // captions / placeholders
  accent: '#0D9488',    // teal accent (challenge / liveness)
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
