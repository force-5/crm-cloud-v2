import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { queryKeys } from '@crm/api-client';
import type { ListQuery, Page, Product, ProductDetailResponse } from '@crm/contracts';
import { useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export function useProductsList(q: ListQuery) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.products.list(q), queryFn: () => api.products.list(q), placeholderData: keepPreviousData });
}

export function useProductDetail(id: number | 'new') {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => (id === 'new' ? api.products.new() : api.products.get(id)),
    staleTime: Infinity,
  });
}

type Snapshot = [readonly unknown[], Page<Product> | undefined][];

export function useSetProductActive() {
  const api = useApi();
  const qc = useQueryClient();
  const { t } = useTranslation('products');
  return useMutation({
    mutationFn: ({ product, active }: { product: Product; active: boolean }) => api.products.setActive(product.id, active),
    onMutate: async ({ product, active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.products.all });
      const lists: Snapshot = qc.getQueriesData<Page<Product>>({ queryKey: ['products', 'list'] });
      const detail = qc.getQueryData<ProductDetailResponse>(queryKeys.products.detail(product.id));
      qc.setQueriesData<Page<Product>>({ queryKey: ['products', 'list'] }, (page) =>
        page ? { ...page, items: page.items.map((p) => (p.id === product.id ? { ...p, active } : p)) } : page,
      );
      return { lists, detail };
    },
    onError: (err, _v, ctx) => {
      ctx?.lists.forEach(([k, d]) => qc.setQueryData(k, d));
      toast.error(errorMessage(err));
    },
    onSuccess: (res, { product, active }) => {
      qc.setQueryData<ProductDetailResponse>(queryKeys.products.detail(product.id), (prev) => (prev ? { ...prev, product: res.product } : prev));
      toast.success(active ? t('toast.activated', { name: product.name }) : t('toast.deactivated', { name: product.name }));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['products', 'list'] }),
  });
}
