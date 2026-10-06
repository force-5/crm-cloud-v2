import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { queryKeys } from '@crm/api-client';
import type { AddLicenseRequest, ListQuery, Page, TenantLicense } from '@crm/contracts';
import { useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export function useLicensesList(accountId: number, q: Partial<ListQuery>) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.licenses.list(accountId, q),
    queryFn: () => api.licenses.list(accountId, q),
    placeholderData: keepPreviousData,
  });
}

export function useAvailableProducts(accountId: number, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.licenses.available(accountId),
    queryFn: () => api.licenses.available(accountId),
    enabled,
    staleTime: 0,
  });
}

export function useAddLicense(accountId: number) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddLicenseRequest) => api.licenses.add(accountId, body),
    onSettled: () => {
      // Both the table and the product picker change after an add.
      void qc.invalidateQueries({ queryKey: queryKeys.licenses.all(accountId) });
    },
  });
}

type Snapshot = [readonly unknown[], Page<TenantLicense> | undefined][];

/** PATCH seats or active. Optimistic in every cached list page; rolls back on error. */
export function useUpdateLicense(accountId: number) {
  const api = useApi();
  const qc = useQueryClient();
  const { t } = useTranslation('licenses');
  return useMutation({
    mutationFn: ({ license, patch }: { license: TenantLicense; patch: { purchasedCount?: number; active?: boolean } }) =>
      api.licenses.update(license.id, patch),
    onMutate: async ({ license, patch }) => {
      const key = [...queryKeys.licenses.all(accountId), 'list'];
      await qc.cancelQueries({ queryKey: key });
      const snapshot: Snapshot = qc.getQueriesData<Page<TenantLicense>>({ queryKey: key });
      qc.setQueriesData<Page<TenantLicense>>({ queryKey: key }, (page) =>
        page ? { ...page, items: page.items.map((l) => (l.id === license.id ? { ...l, ...patch } : l)) } : page,
      );
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshot.forEach(([k, data]) => qc.setQueryData(k, data));
      toast.error(errorMessage(err));
    },
    onSuccess: (_res, { license, patch }) => {
      if (patch.active !== undefined) {
        toast.success(patch.active ? t('toast.activated', { name: license.productName }) : t('toast.deactivated', { name: license.productName }));
      } else {
        toast.success(t('editSeats.saved', { name: license.productName }));
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.licenses.all(accountId) }),
  });
}
