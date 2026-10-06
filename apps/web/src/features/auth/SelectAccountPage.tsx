import { Link, Navigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { Notice } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { AuthHeading } from './AuthLayout';
import { loginErrorMessage, useHandleLoginResult, usePendingLogin } from './useLoginFlow';

export function SelectAccountPage({ redirect }: { redirect?: string }) {
  const { t } = useTranslation('auth');
  const api = useApi();
  const pending = usePendingLogin();
  const handleResult = useHandleLoginResult(redirect);
  const choose = useMutation({
    mutationFn: (tenantId: number) => api.auth.selectAccount(tenantId),
    onSuccess: handleResult,
  });

  if (pending?.step !== 'select-account') {
    // Refreshed or deep-linked: the pending sign-in lives only in memory, so start over.
    return <Navigate to="/login" search={{ redirect }} replace />;
  }

  return (
    <>
      <AuthHeading title={t('selectAccount.title')} lead={t('selectAccount.lead')} />
      {choose.isError && (
        <Notice tone="danger" icon={<AlertCircle />} className="mb-4" role="alert">
          {loginErrorMessage(choose.error)}
        </Notice>
      )}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {pending.accounts.map((a) => {
          const busy = choose.isPending && choose.variables === a.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                disabled={choose.isPending}
                onClick={() => choose.mutate(a.id)}
                aria-label={t('selectAccount.choose', { name: a.name })}
                className="flex min-h-14 w-full items-center gap-3 rounded-[10px] border border-border-strong bg-surface px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:opacity-60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-text-muted" aria-hidden="true">
                  <Building2 className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-text">{a.name}</span>
                {busy ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-4 text-text-muted" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 text-center">
        <Link to="/login" search={{ redirect }} className="text-[13px] font-bold text-text-muted hover:text-primary-ink hover:underline">
          {t('selectAccount.useDifferent')}
        </Link>
      </div>
    </>
  );
}
