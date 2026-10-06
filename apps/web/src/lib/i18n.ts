import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from '@/locales/en/common.json';
import auth from '@/locales/en/auth.json';
import shell from '@/locales/en/shell.json';
import dashboard from '@/locales/en/dashboard.json';
import accounts from '@/locales/en/accounts.json';
import licenses from '@/locales/en/licenses.json';
import products from '@/locales/en/products.json';
import profile from '@/locales/en/profile.json';

export const resources = {
  en: { common, auth, shell, dashboard, accounts, licenses, products, profile },
} as const;

export const namespaces = Object.keys(resources.en) as (keyof (typeof resources)['en'])[];

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  ns: namespaces,
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React escapes output
  returnNull: false,
  initAsync: false,
  showSupportNotice: false,
});

/** Apply the user's locale (only English ships today; other locales fall back to en). */
export function applyLocale(locale: string | undefined): void {
  const lang = (locale ?? 'en').split(/[-_]/)[0] || 'en';
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export default i18n;
