import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import { ERROR_CODES, type LoginResult, type MfaType, type TenantChoice } from '@crm/contracts';
import i18n from '@/lib/i18n';
import { isApiError } from '@/lib/errors';
import { safeRedirect } from '@/lib/utils';

/** In-memory state carried between the login steps (never persisted; the password stays in the BFF). */
export type PendingLogin =
  | { step: 'select-account'; accounts: TenantChoice[] }
  | { step: 'mfa'; channel: MfaType; destination?: string };

const PENDING_KEY = ['auth', 'pending'] as const;

export function usePendingLogin(): PendingLogin | undefined {
  return useQuery<PendingLogin>({ queryKey: PENDING_KEY, enabled: false, staleTime: Infinity, gcTime: Infinity }).data;
}

/** Routes the user to the next step for any `LoginResult` (login, account choice, MFA). */
export function useHandleLoginResult(redirect: string | undefined) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setPending = useCallback((value: PendingLogin) => qc.setQueryData(PENDING_KEY, () => value), [qc]);
  return useCallback(
    async (result: LoginResult) => {
      const search = { redirect };
      switch (result.status) {
        case 'ok': {
          qc.setQueryData(queryKeys.session, result.session);
          const target = safeRedirect(redirect);
          await navigate({ href: target, replace: true });
          // Only after leaving the step page (it redirects to /login when this is missing).
          qc.removeQueries({ queryKey: PENDING_KEY });
          return;
        }
        case 'select-account':
          setPending({ step: 'select-account', accounts: result.accounts });
          await navigate({ to: '/login/select-account', search });
          return;
        case 'mfa':
          setPending({ step: 'mfa', channel: result.channel, destination: result.destination });
          await navigate({ to: '/login/mfa', search });
          return;
      }
    },
    [qc, navigate, redirect, setPending],
  );
}

/** Maps sign-in errors to the copy the login screens show. */
export function loginErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case ERROR_CODES.INVALID_CREDENTIALS:
        return i18n.t('auth:login.invalid');
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return err.status === 0 ? i18n.t('common:errors.network') : i18n.t('auth:login.unavailable');
      case ERROR_CODES.FORBIDDEN:
        return i18n.t('auth:login.forbidden');
      case ERROR_CODES.RATE_LIMITED:
        return i18n.t('auth:login.rateLimited');
      case ERROR_CODES.UNAUTHENTICATED:
        return i18n.t('auth:login.invalid');
    }
    if (err.status >= 500) return i18n.t('auth:login.unavailable');
    return err.message || i18n.t('common:errors.generic');
  }
  return i18n.t('common:errors.generic');
}
