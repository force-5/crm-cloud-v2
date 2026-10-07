/**
 * Force 5 CRM design tokens — derived from force5-crm-prototype.html (orange + charcoal),
 * extended with a dark theme. Web consumes these as CSS variables (apps/web/src/styles.css
 * mirrors them); mobile consumes them directly.
 */

export const brand = {
  orange: '#f36b21',
  orangeHover: '#e05d15',
  orangeSoft: '#ff8a3d',
  charcoal: '#17202a',
  sidebar: '#151a21',
  sidebarEnd: '#11151b',
} as const;

export type ColorScheme = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  primarySoftText: string;
  focusRing: string;
  sidebar: string;
  sidebarText: string;
  sidebarActive: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  neutralSoft: string;
  neutralText: string;
  overlay: string;
};

export const light: ColorScheme = {
  background: '#f5f7fa',
  surface: '#ffffff',
  surfaceMuted: '#f1f3f6',
  border: '#e7e9ee',
  borderStrong: '#d7dbe2',
  text: '#17202a',
  textMuted: '#5f6673', // ≥5.2:1 on every light surface (WCAG AA); was #6b7280
  textSubtle: '#8a919b',
  primary: brand.orange,
  primaryText: '#ffffff',
  primarySoft: '#fff4e9',
  primarySoftText: '#ad4d12',
  focusRing: 'rgba(243,107,33,0.35)',
  sidebar: brand.sidebar,
  sidebarText: '#aeb5bf',
  sidebarActive: '#242b34',
  success: '#16724e',
  successSoft: '#e8f6ef',
  warning: '#9a5a08',
  warningSoft: '#fff2dd',
  danger: '#b83232',
  dangerSoft: '#fdeaea',
  info: '#345fc0',
  infoSoft: '#e9efff',
  neutralSoft: '#f4f4f5',
  neutralText: '#656b73',
  overlay: 'rgba(11,16,24,0.66)',
};

export const dark: ColorScheme = {
  background: '#0f141a',
  surface: '#171d25',
  surfaceMuted: '#1e252e',
  border: '#272f3a',
  borderStrong: '#343d4a',
  text: '#e8ebef',
  textMuted: '#9aa3ae',
  textSubtle: '#7a838e',
  primary: brand.orangeSoft,
  primaryText: '#1a0d04',
  primarySoft: '#3a2213',
  primarySoftText: '#ffb07a',
  focusRing: 'rgba(255,138,61,0.45)',
  sidebar: '#0b0f14',
  sidebarText: '#9aa3ae',
  sidebarActive: '#1e252e',
  success: '#5fd3a0',
  successSoft: '#123326',
  warning: '#f2b45a',
  warningSoft: '#3a2a10',
  danger: '#ff8080',
  dangerSoft: '#3d1717',
  info: '#8fb0ff',
  infoSoft: '#18264a',
  neutralSoft: '#252b33',
  neutralText: '#aab1ba',
  overlay: 'rgba(0,0,0,0.7)',
};

export const radius = { sm: 6, md: 8, lg: 12, xl: 14, full: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const fonts = { body: 'Lato', display: 'Bebas Neue' } as const;

/** Badge tone per account / license / product status, shared by web and mobile. */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
export const statusTone: Record<string, Tone> = {
  active: 'success',
  inactive: 'neutral',
  draft: 'warning',
  new: 'warning',
  SUBSCRIPTION: 'primary',
  PERPETUAL: 'success',
  TRIAL: 'warning',
  USAGE_BASED: 'info',
};

export function toneColors(scheme: ColorScheme, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: scheme.successSoft, fg: scheme.success };
    case 'warning':
      return { bg: scheme.warningSoft, fg: scheme.warning };
    case 'danger':
      return { bg: scheme.dangerSoft, fg: scheme.danger };
    case 'info':
      return { bg: scheme.infoSoft, fg: scheme.info };
    case 'primary':
      return { bg: scheme.primarySoft, fg: scheme.primarySoftText };
    default:
      return { bg: scheme.neutralSoft, fg: scheme.neutralText };
  }
}

export const CDN = {
  loginBackground: 'https://cdn.force5-dev.com/f5/assets/f5-login-bg.png',
  logoDark: 'https://cdn.force5-dev.com/f5/assets/f5-logo-dark.png',
} as const;
