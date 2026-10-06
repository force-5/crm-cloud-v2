import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { Page } from '@crm/contracts';

export const PAGE_SIZE = 20;

export function nextPageParam<T>(last: Page<T>): number | undefined {
  return last.page < last.totalPages ? last.page + 1 : undefined;
}

export function flattenPages<T>(data: InfiniteData<Page<T>> | undefined): T[] {
  return data?.pages.flatMap((p) => p.items) ?? [];
}

export function totalOf<T>(data: InfiniteData<Page<T>> | undefined): number | undefined {
  return data?.pages[0]?.total;
}

type Snapshot = Array<[QueryKey, unknown]>;

/**
 * Optimistically patch one item (by id) in every cached infinite list matching `filterKey`
 * (TanStack partial key matching: `['accounts','list',{}]` matches every accounts list).
 * Returns a snapshot for rollback.
 */
export function patchInfiniteItem<T extends { id: number }>(
  qc: QueryClient,
  filterKey: QueryKey,
  id: number,
  patch: Partial<T>,
): Snapshot {
  const snapshot = qc.getQueriesData({ queryKey: filterKey });
  qc.setQueriesData<InfiniteData<Page<T>>>({ queryKey: filterKey }, (old) =>
    old && Array.isArray(old.pages)
      ? {
          ...old,
          pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
        }
      : old,
  );
  return snapshot;
}

export function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}
