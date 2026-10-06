import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { queryKeys } from '@crm/api-client';
import type { AccountDetailResponse, AccountSummary, ListQuery, Page } from '@crm/contracts';
import { useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export function useDashboard() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.dashboard() });
}

export function useAccountsList(q: ListQuery) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.accounts.list(q),
    queryFn: () => api.accounts.list(q),
    placeholderData: keepPreviousData,
  });
}

export function useAccountDetail(id: number | 'new') {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () => (id === 'new' ? api.accounts.new() : api.accounts.get(id)),
    // A form must never be silently replaced by a background refetch.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

type ListSnapshot = [readonly unknown[], Page<AccountSummary> | undefined][];

/** Activate / deactivate with an optimistic badge flip, rollback on error, and a toast. */
export function useSetAccountActive() {
  const api = useApi();
  const qc = useQueryClient();
  const { t } = useTranslation('accounts');
  return useMutation({
    mutationFn: ({ account, active }: { account: Pick<AccountSummary, 'id' | 'name'>; active: boolean }) =>
      api.accounts.setActive(account.id, active),
    onMutate: async ({ account, active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.accounts.all });
      const lists: ListSnapshot = qc.getQueriesData<Page<AccountSummary>>({ queryKey: ['accounts', 'list'] });
      const detail = qc.getQueryData<AccountDetailResponse>(queryKeys.accounts.detail(account.id));
      const status = active ? 'active' : 'inactive';
      qc.setQueriesData<Page<AccountSummary>>({ queryKey: ['accounts', 'list'] }, (page) =>
        page
          ? { ...page, items: page.items.map((a) => (a.id === account.id && a.status !== 'draft' ? { ...a, status } : a)) }
          : page,
      );
      if (detail?.account) {
        qc.setQueryData<AccountDetailResponse>(queryKeys.accounts.detail(account.id), {
          ...detail,
          account: { ...detail.account, active, status: detail.account.status === 'draft' ? 'draft' : status },
        });
      }
      return { lists, detail };
    },
    onError: (err, { account }, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.detail) qc.setQueryData(queryKeys.accounts.detail(account.id), ctx.detail);
      toast.error(errorMessage(err));
    },
    onSuccess: (_res, { account, active }) => {
      toast.success(active ? t('toast.activated', { name: account.name }) : t('toast.deactivated', { name: account.name }));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['accounts', 'list'] });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}
