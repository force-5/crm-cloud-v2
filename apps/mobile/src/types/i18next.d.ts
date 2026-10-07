import 'i18next';
import type { resources } from '@/lib/i18n';

// Typed keys: `t('accounts:list.title')` is checked against the English JSON at typecheck time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['en'];
  }
}
