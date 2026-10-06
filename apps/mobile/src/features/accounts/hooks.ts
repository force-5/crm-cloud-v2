import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import type { AccountDetailResponse, AccountSummary, StatusFilter } from '@crm/contracts';
import { api, errorMessage } from '@/lib/api';
import { PAGE_SIZE, nextPageParam, patchInfiniteItem, restoreSnapshot } from '@/lib/paged';
import { useToast } from '@/providers/ToastProvider';
import { haptics } from '@/lib/haptics';

export function useAccountsList(search: string, status: StatusFilter) {
  const q = { search: search || undefined, status, size: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.accounts.list(q),
    queryFn: ({ pageParam }) => api.accounts.list({ ...q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useAccountDetail(id: number | 'new') {
  return useQuery({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () => (id === 'new' ? api.accounts.new() : api.accounts.get(id)),
  });
}

/** Activate / deactivate with an optimistic list update and rollback on error. */
export function useSetAccountActive() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ account, active }: { account: Pick<AccountSummary, 'id' | 'name'>; active: boolean }) =>
      api.accounts.setActive(account.id, active),
    onMutate: async ({ account, active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.accounts.all });
      const listSnap = patchInfiniteItem<AccountSummary>(qc, queryKeys.accounts.list({}), account.id, {
        status: active ? 'active' : 'inactive',
      });
      const detailKey = queryKeys.accounts.detail(account.id);
      const detailPrev = qc.getQueryData<AccountDetailResponse>(detailKey);
      if (detailPrev?.account) {
        qc.setQueryData<AccountDetailResponse>(detailKey, {
          ...detailPrev,
          account: { ...detailPrev.account, active, status: active ? 'active' : 'inactive' },
        });
      }
      return { listSnap, detailKey, detailPrev };
    },
    onError: (err, _vars, ctx) => {
      restoreSnapshot(qc, ctx?.listSnap);
      if (ctx?.detailPrev) qc.setQueryData(ctx.detailKey, ctx.detailPrev);
      haptics.error();
      toast.error(errorMessage(err, 'Could not update the account'));
    },
    onSuccess: (_res, { account, active }) => {
      haptics.success();
      toast.success(`${account.name} ${active ? 'activated' : 'deactivated'}`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}
