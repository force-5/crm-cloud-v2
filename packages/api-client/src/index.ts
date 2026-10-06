import {
  API,
  type Account,
  type AccountDetailResponse,
  type AccountFormValues,
  type AccountSummary,
  type AddLicenseRequest,
  type AssignableProduct,
  type CurrentUser,
  type DashboardSummary,
  type ListQuery,
  type LoginRequest,
  type LoginResult,
  type MfaVerifyRequest,
  type Page,
  type PreferencesRequest,
  type Product,
  type ProductDetailResponse,
  type ProductFormValues,
  type ProfileFormValues,
  type ProfileResponse,
  type ResetPasswordRequest,
  type SaveMode,
  type SessionInfo,
  type TenantLicense,
  type TotpEnrollment,
  type UpdateLicenseRequest,
} from '@crm/contracts';
import { HttpClient, type ApiClientOptions } from './client';

export { ApiClientError, HttpClient, type ApiClientOptions } from './client';

/** Typed BFF API. One instance per app. */
export function createApi(opts: ApiClientOptions) {
  const http = new HttpClient(opts);

  const rememberCsrf = <T extends { status?: string; session?: SessionInfo } | SessionInfo>(r: T): T => {
    const session = 'csrfToken' in r ? (r as SessionInfo) : (r as { session?: SessionInfo }).session;
    if (session?.csrfToken) http.setCsrfToken(session.csrfToken);
    return r;
  };

  return {
    http,
    auth: {
      session: () => http.get<SessionInfo>(API.auth.session).then(rememberCsrf),
      login: (body: LoginRequest) => http.post<LoginResult>(API.auth.login, body).then(rememberCsrf),
      selectAccount: (tenantId: number) =>
        http.post<LoginResult>(API.auth.selectAccount, { tenantId }).then(rememberCsrf),
      sendMfa: () => http.post<{ sent: true; destination?: string }>(API.auth.mfaSend),
      verifyMfa: (body: MfaVerifyRequest) => http.post<LoginResult>(API.auth.mfaVerify, body).then(rememberCsrf),
      keepalive: () => http.post<{ ok: true }>(API.auth.keepalive),
      logout: async () => {
        await http.post<void>(API.auth.logout);
        http.setCsrfToken(null);
      },
      forgotPassword: (email: string) => http.post<{ ok: true }>(API.auth.passwordForgot, { email }),
      verifyRecoveryCode: (email: string, code: string) =>
        http.post<{ ok: true }>(API.auth.passwordVerify, { email, code }),
      resetPassword: (body: ResetPasswordRequest) => http.post<{ ok: true }>(API.auth.passwordReset, body),
    },
    dashboard: () => http.get<DashboardSummary>(API.dashboard),
    accounts: {
      list: (q: Partial<ListQuery>) => http.get<Page<AccountSummary>>(API.accounts.list, q),
      new: () => http.get<AccountDetailResponse>(API.accounts.new),
      get: (id: number) => http.get<AccountDetailResponse>(API.accounts.detail(id)),
      create: (mode: SaveMode, account: AccountFormValues) =>
        http.post<{ account: Account }>(API.accounts.create, { mode, account }),
      update: (id: number, account: AccountFormValues) =>
        http.put<{ account: Account }>(API.accounts.detail(id), { account }),
      publish: (id: number, account: AccountFormValues) =>
        http.post<{ account: Account }>(API.accounts.publish(id), { account }),
      setActive: (id: number, active: boolean) =>
        http.patch<{ account: AccountSummary }>(API.accounts.detail(id), { active }),
      uploadLogo: (id: number, dataUrl: string) => http.put<{ url: string }>(API.accounts.logo(id), { dataUrl }),
      uploadSigninImage: (id: number, dataUrl: string) =>
        http.put<{ url: string }>(API.accounts.signinImage(id), { dataUrl }),
    },
    licenses: {
      list: (accountId: number, q: Partial<ListQuery>) =>
        http.get<Page<TenantLicense>>(API.accounts.licenses(accountId), q),
      available: (accountId: number) => http.get<AssignableProduct[]>(API.accounts.availableLicenses(accountId)),
      add: (accountId: number, body: AddLicenseRequest) =>
        http.post<{ license: TenantLicense }>(API.accounts.licenses(accountId), body),
      update: (id: number, body: UpdateLicenseRequest) =>
        http.patch<{ license: TenantLicense }>(API.licenses.detail(id), body),
    },
    products: {
      list: (q: Partial<ListQuery>) => http.get<Page<Product>>(API.products.list, q),
      new: () => http.get<ProductDetailResponse>(API.products.new),
      get: (id: number) => http.get<ProductDetailResponse>(API.products.detail(id)),
      create: (body: ProductFormValues) => http.post<{ product: Product }>(API.products.list, body),
      update: (id: number, body: ProductFormValues) => http.put<{ product: Product }>(API.products.detail(id), body),
      setActive: (id: number, active: boolean) =>
        http.patch<{ product: Product }>(API.products.detail(id), { active }),
      delete: (id: number) => http.delete<{ deleted: true }>(API.products.detail(id)),
    },
    profile: {
      get: () => http.get<ProfileResponse>(API.profile.root),
      update: (body: ProfileFormValues) => http.put<ProfileResponse>(API.profile.root, body),
      preferences: (body: PreferencesRequest) => http.patch<{ user: CurrentUser }>(API.profile.preferences, body),
      uploadPhoto: (dataUrl: string) => http.put<{ profileImageUrl: string }>(API.profile.photo, { dataUrl }),
      removePhoto: () => http.delete<void>(API.profile.photo),
      enrollTotp: () => http.post<TotpEnrollment>(API.profile.totp),
    },
  };
}

export type CrmApi = ReturnType<typeof createApi>;

/** TanStack Query keys, shared so web and mobile invalidate identically. */
export const queryKeys = {
  session: ['session'] as const,
  dashboard: ['dashboard'] as const,
  accounts: {
    all: ['accounts'] as const,
    list: (q: Partial<ListQuery>) => ['accounts', 'list', q] as const,
    detail: (id: number | 'new') => ['accounts', 'detail', id] as const,
  },
  licenses: {
    all: (accountId: number) => ['licenses', accountId] as const,
    list: (accountId: number, q: Partial<ListQuery>) => ['licenses', accountId, 'list', q] as const,
    available: (accountId: number) => ['licenses', accountId, 'available'] as const,
  },
  products: {
    all: ['products'] as const,
    list: (q: Partial<ListQuery>) => ['products', 'list', q] as const,
    detail: (id: number | 'new') => ['products', 'detail', id] as const,
  },
  profile: ['profile'] as const,
};
