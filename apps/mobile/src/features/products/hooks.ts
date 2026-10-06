import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import type { StatusFilter } from '@crm/contracts';
import { api } from '@/lib/api';
import { PAGE_SIZE, nextPageParam } from '@/lib/paged';

export function useProductsList(search: string, status: StatusFilter) {
  const q = { search: search || undefined, status, size: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.products.list(q),
    queryFn: ({ pageParam }) => api.products.list({ ...q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useProductDetail(id: number | 'new') {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => (id === 'new' ? api.products.new() : api.products.get(id)),
  });
}
