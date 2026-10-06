import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import type { AddLicenseRequest, StatusFilter, TenantLicense, UpdateLicenseRequest } from '@crm/contracts';
import { api, errorMessage } from '@/lib/api';
import { PAGE_SIZE, nextPageParam, patchInfiniteItem, restoreSnapshot } from '@/lib/paged';
import { useToast } from '@/providers/ToastProvider';
import { haptics } from '@/lib/haptics';

export function useLicensesList(accountId: number, search: string, status: StatusFilter) {
  const q = { search: search || undefined, status, size: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.licenses.list(accountId, q),
    queryFn: ({ pageParam }) => api.licenses.list(accountId, { ...q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useAvailableProducts(accountId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.licenses.available(accountId),
    queryFn: () => api.licenses.available(accountId),
    enabled,
  });
}

export function useAddLicense(accountId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: AddLicenseRequest) => api.licenses.add(accountId, body),
    onSuccess: ({ license }) => {
      haptics.success();
      toast.success(`${license.productName} added`);
    },
    onError: (err) => {
      haptics.error();
      toast.error(errorMessage(err, 'Could not add the license'));
    },
    // Both the list and the product options (the added product disappears from it).
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.licenses.all(accountId) }),
  });
}

/** Seat changes and activate/deactivate, optimistic with rollback. */
export function useUpdateLicense(accountId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ license, body }: { license: TenantLicense; body: UpdateLicenseRequest }) =>
      api.licenses.update(license.id, body),
    onMutate: async ({ license, body }) => {
      await qc.cancelQueries({ queryKey: queryKeys.licenses.all(accountId) });
      const patch: Partial<TenantLicense> = {};
      if (body.active !== undefined) patch.active = body.active;
      if (body.purchasedCount !== undefined) patch.purchasedCount = Number(body.purchasedCount);
      return { snap: patchInfiniteItem<TenantLicense>(qc, queryKeys.licenses.list(accountId, {}), license.id, patch) };
    },
    onError: (err, _v, ctx) => {
      restoreSnapshot(qc, ctx?.snap);
      haptics.error();
      toast.error(errorMessage(err, 'Could not update the license'));
    },
    onSuccess: (_r, { license, body }) => {
      haptics.success();
      if (body.active !== undefined) toast.success(`${license.productName} ${body.active ? 'activated' : 'deactivated'}`);
      else toast.success('Seats updated');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.licenses.all(accountId) }),
  });
}
