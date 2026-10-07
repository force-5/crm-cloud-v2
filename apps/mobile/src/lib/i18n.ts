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

/**
 * i18n (plan §9) — mirrors apps/web/src/lib/i18n.ts: English only for now, one JSON
 * namespace per feature, same namespace names and (where the UI concept is shared) the
 * same keys as the web app. Pure JS, so it works in Expo Go.
 */
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
  interpolation: { escapeValue: false }, // React Native doesn't render HTML
  returnNull: false,
  initAsync: false,
  showSupportNotice: false,
});

export default i18n;
