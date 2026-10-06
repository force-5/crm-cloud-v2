import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ErrorState } from '@/components/EmptyState';
import { useIsPhone } from '@/lib/media';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Server sort field; makes the header a sort button. */
    sortField?: string;
    headerClassName?: string;
    cellClassName?: string;
  }
}

export type SortState = { sort?: string; dir?: 'asc' | 'desc' };

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  getRowId: (row: T) => string;
  /** Accessible name of the table. */
  label: string;
  isLoading?: boolean;
  /** Background refetch (e.g. new page) — dims the current rows. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: SortState;
  /** Sort defaults applied when a header is clicked for the first time. */
  onSortChange?: (next: Required<SortState>) => void;
  page?: { page: number; size: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
  empty?: React.ReactNode;
  /** Phone layout: each row rendered as a card. */
  renderCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
};

const INTERACTIVE = 'a,button,input,select,textarea,label,[role="menuitem"],[role="checkbox"],[data-no-row-click]';

/**
 * Server-driven table (paging/sorting happen in the BFF). Desktop/tablet: a table that scrolls
 * horizontally inside its card. Phones (< 768px): a stacked card list via `renderCard`.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  label,
  isLoading,
  isFetching,
  error,
  onRetry,
  sort,
  onSortChange,
  page,
  onPageChange,
  empty,
  renderCard,
  onRowClick,
  skeletonRows = 6,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const handleRowClick = (e: React.MouseEvent, row: T) => {
    if (!onRowClick) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    onRowClick(row);
  };

  const showSkeleton = isLoading && !data;
  const rows = table.getRowModel().rows;
  const isEmpty = !showSkeleton && !error && rows.length === 0;

  if (error && !data) {
    return <ErrorState title={t('errors.loadFailed')} description={t('errors.generic')} onRetry={onRetry} retryLabel={t('actions.retry')} />;
  }

  const body =
    isPhone && renderCard ? (
      <ul aria-label={label} aria-busy={isFetching || showSkeleton || undefined} className={cn('m-0 flex list-none flex-col gap-2.5 p-0 transition-opacity', isFetching && !showSkeleton && 'opacity-60')}>
        {showSkeleton
          ? Array.from({ length: Math.min(skeletonRows, 4) }, (_, i) => (
              <li key={i} className="rounded-[10px] border border-border p-3.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <Skeleton className="mt-3 h-5 w-16 rounded-full" />
              </li>
            ))
          : rows.map((row) => (
              <li
                key={row.id}
                onClick={(e) => handleRowClick(e, row.original)}
                className={cn('rounded-[10px] border border-border bg-surface p-3.5', onRowClick && 'cursor-pointer active:bg-surface-muted')}
              >
                {renderCard(row.original)}
              </li>
            ))}
      </ul>
    ) : (
      <div className="-mx-4 overflow-x-auto overscroll-x-contain sm:-mx-5" role="region" aria-label={label} tabIndex={0}>
        <table
          className={cn('w-full min-w-[720px] border-collapse text-left transition-opacity', isFetching && !showSkeleton && 'opacity-60')}
          aria-busy={isFetching || showSkeleton || undefined}
        >
          <caption className="sr-only">{label}</caption>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header, i) => {
                  const meta = header.column.columnDef.meta;
                  const field = meta?.sortField;
                  const active = !!field && sort?.sort === field;
                  const dir = active ? sort?.dir ?? 'asc' : undefined;
                  const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : field ? 'none' : undefined}
                      className={cn(
                        'whitespace-nowrap border-b border-border px-[9px] py-2.5 text-[11px] font-black uppercase tracking-[0.05em] text-text-muted',
                        i === 0 && 'pl-4 sm:pl-5',
                        i === hg.headers.length - 1 && 'pr-4 sm:pr-5',
                        meta?.headerClassName,
                      )}
                    >
                      {field && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange({ sort: field, dir: active && dir === 'asc' ? 'desc' : 'asc' })}
                          className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 uppercase hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
                        >
                          {content}
                          {active ? (
                            dir === 'desc' ? (
                              <ArrowDown className="size-3.5 text-primary-ink" aria-hidden="true" />
                            ) : (
                              <ArrowUp className="size-3.5 text-primary-ink" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: skeletonRows }, (_, r) => (
                  <tr key={r}>
                    {columns.map((_, c) => (
                      <td key={c} className={cn('border-b border-[#eef0f3] px-[9px] py-[13px] dark:border-border', c === 0 && 'pl-4 sm:pl-5')}>
                        <Skeleton className={cn('h-4', c === 0 ? 'w-40' : 'w-20')} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={(e) => handleRowClick(e, row.original)}
                    className={cn('group transition-colors hover:bg-[#fafbfc] dark:hover:bg-surface-muted/50', onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell, i, all) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'border-b border-[#eef0f3] px-[9px] py-[13px] align-middle group-last:border-b-0 dark:border-border',
                          i === 0 && 'pl-4 sm:pl-5',
                          i === all.length - 1 && 'pr-4 sm:pr-5',
                          cell.column.columnDef.meta?.cellClassName,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div>
      {isEmpty ? empty : body}
      {page && onPageChange && !isEmpty && !showSkeleton && (
        <Pager page={page} onPageChange={onPageChange} />
      )}
    </div>
  );
}

function Pager({
  page,
  onPageChange,
}: {
  page: { page: number; size: number; total: number; totalPages: number };
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const from = page.total === 0 ? 0 : (page.page - 1) * page.size + 1;
  const to = Math.min(page.page * page.size, page.total);
  const pages = Math.max(page.totalPages, 1);
  return (
    <nav aria-label={t('table.pagination')} className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-[13px] text-text-muted">
      <span aria-live="polite">{t('table.showing', { from, to, total: page.total })}</span>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">{t('table.page', { page: page.page, pages })}</span>
        <Button size="icon" variant="secondary" aria-label={t('table.previous')} disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button size="icon" variant="secondary" aria-label={t('table.next')} disabled={page.page >= pages} onClick={() => onPageChange(page.page + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
