/**
 * BFF route table (relative to `{BASE_PATH}/api`). Shared so the BFF, web and mobile
 * clients can never drift apart on a path.
 */
export const API = {
  health: '/health',
  auth: {
    csrf: '/auth/csrf',
    session: '/auth/session',
    login: '/auth/login',
    selectAccount: '/auth/select-account',
    mfaSend: '/auth/mfa/send',
    mfaVerify: '/auth/mfa/verify',
    keepalive: '/auth/keepalive',
    logout: '/auth/logout',
    passwordForgot: '/auth/password/forgot',
    passwordVerify: '/auth/password/verify',
    passwordReset: '/auth/password/reset',
  },
  dashboard: '/dashboard',
  lookups: { tenant: '/lookups/tenant', labelVerticals: '/lookups/label-verticals' },
  accounts: {
    list: '/accounts',
    create: '/accounts',
    new: '/accounts/new',
    detail: (id: number | string) => `/accounts/${id}`,
    publish: (id: number | string) => `/accounts/${id}/publish`,
    logo: (id: number | string) => `/accounts/${id}/logo`,
    signinImage: (id: number | string) => `/accounts/${id}/signin-image`,
    licenses: (id: number | string) => `/accounts/${id}/licenses`,
    availableLicenses: (id: number | string) => `/accounts/${id}/licenses/available`,
  },
  licenses: { detail: (id: number | string) => `/licenses/${id}` },
  products: {
    list: '/products',
    new: '/products/new',
    detail: (id: number | string) => `/products/${id}`,
  },
  profile: {
    root: '/profile',
    preferences: '/profile/preferences',
    photo: '/profile/photo',
    totp: '/profile/mfa/totp',
  },
} as const;

export const CSRF_HEADER = 'x-csrf-token';
