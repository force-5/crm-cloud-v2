import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, Power, PowerOff, SearchX } from 'lucide-react';
import { PERMISSIONS, type ListQuery, type Product } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/misc';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { DebouncedSearch, ListToolbar, PageSizeSelect, StatusSegmented } from '@/components/ListToolbar';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Can, useCan } from '@/lib/permissions';
import { richT } from '@/lib/richText';
import { useProductsList, useSetProductActive } from './api';

function ProductLink({ p }: { p: Product }) {
  return (
    <Link to="/products/$productId" params={{ productId: p.id }} className="font-black text-[#25364d] hover:text-primary-ink hover:underline dark:text-text">
      {p.name}
    </Link>
  );
}

function Description({ p }: { p: Product }) {
  const { t } = useTranslation('products');
  return p.description ? <span className="line-clamp-2 max-w-[340px] text-text-muted">{p.description}</span> : <Badge>{t('list.na')}</Badge>;
}

function ProductRowMenu({ product }: { product: Product }) {
  const { t } = useTranslation('products');
  const navigate = useNavigate();
  const canUpdate = useCan(PERMISSIONS.PRODUCTS, 'update');
  const setActive = useSetProductActive();
  const [confirm, setConfirm] = React.useState(false);
  const next = !product.active;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('common:actions.moreActions', { name: product.name })}>
            <MoreHorizontal className="!size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void navigate({ to: '/products/$productId', params: { productId: product.id } })}>
            <Pencil aria-hidden="true" />
            {t('common:actions.edit')}
          </DropdownMenuItem>
          {canUpdate && (
            <DropdownMenuItem destructive={product.active} onSelect={() => setConfirm(true)}>
              {product.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
              {product.active ? t('common:actions.deactivate') : t('common:actions.activate')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={richT(t, next ? 'confirm.activateTitle' : 'confirm.deactivateTitle', { name: <b>{product.name}</b> })}
        description={next ? t('confirm.activateBody') : t('confirm.deactivateBody')}
        confirmLabel={next ? t('common:actions.activate') : t('common:actions.deactivate')}
        destructive={!next}
        onConfirm={() => setActive.mutate({ product, active: next })}
      />
    </>
  );
}

export function ProductsListPage({
  search,
  onSearchChange,
}: {
  search: ListQuery;
  onSearchChange: (patch: Partial<ListQuery>, opts?: { replace?: boolean }) => void;
}) {
  const { t } = useTranslation('products');
  const navigate = useNavigate();
  const query = useProductsList(search);
  const sort = search.sort ? { sort: search.sort, dir: search.dir ?? 'asc' } : { sort: 'name', dir: 'asc' as const };

  const columns = React.useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { id: 'name', header: t('list.columns.name'), meta: { sortField: 'name' }, cell: ({ row }) => <ProductLink p={row.original} /> },
      { id: 'description', header: t('list.columns.description'), cell: ({ row }) => <Description p={row.original} /> },
      {
        id: 'code',
        header: t('list.columns.code'),
        meta: { sortField: 'productCode' },
        cell: ({ row }) => <code className="font-mono text-[12px]">{row.original.productCode}</code>,
      },
      { id: 'sku', header: t('list.columns.sku'), cell: ({ row }) => <code className="font-mono text-[12px]">{row.original.productSku}</code> },
      { id: 'category', header: t('list.columns.category'), cell: ({ row }) => row.original.category ?? '' },
      { id: 'status', header: t('list.columns.status'), meta: { sortField: 'active' }, cell: ({ row }) => <StatusBadge status={row.original.active ? 'active' : 'inactive'} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common:table.actions')}</span>,
        meta: { cellClassName: 'w-12 text-right' },
        cell: ({ row }) => <ProductRowMenu product={row.original} />,
      },
    ],
    [t],
  );

  const newButton = (
    <Can permission={PERMISSIONS.PRODUCTS} action="create">
      <Button asChild variant="primary">
        <Link to="/products/new">
          <Plus aria-hidden="true" />
          {t('newProduct')}
        </Link>
      </Button>
    </Can>
  );

  const filtered = !!search.search || search.status !== 'active';

  return (
    <>
      <PageHeader title={t('list.title')} subtitle={t('list.subtitle')} actions={newButton} />
      <Card>
        <ListToolbar
          left={
            <>
              <DebouncedSearch
                value={search.search}
                onChange={(v) => onSearchChange({ search: v, page: 1 }, { replace: true })}
                placeholder={t('list.searchPlaceholder')}
                label={t('list.searchLabel')}
              />
              <StatusSegmented value={search.status} onChange={(status) => onSearchChange({ status, page: 1 })} />
            </>
          }
          right={<PageSizeSelect value={search.size} onChange={(size) => onSearchChange({ size, page: 1 })} />}
        />
        <DataTable
          label={t('list.tableLabel')}
          columns={columns}
          data={query.data?.items}
          getRowId={(p) => String(p.id)}
          isLoading={query.isPending}
          isFetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={({ sort: s, dir }) => onSearchChange({ sort: s, dir, page: 1 })}
          page={query.data ? { page: query.data.page, size: query.data.size, total: query.data.total, totalPages: query.data.totalPages } : undefined}
          onPageChange={(page) => onSearchChange({ page })}
          onRowClick={(p) => void navigate({ to: '/products/$productId', params: { productId: p.id } })}
          empty={
            filtered ? (
              <EmptyState
                icon={<SearchX />}
                title={search.search ? t('list.emptyFiltered', { search: search.search }) : t('common:empty.noResults')}
                action={
                  <Button variant="secondary" onClick={() => onSearchChange({ search: undefined, status: 'active', page: 1 })}>
                    {t('common:actions.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState title={t('list.emptyTitle')} description={t('list.emptyBody')} action={newButton} />
            )
          }
          renderCard={(p) => (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ProductLink p={p} />
                  <StatusBadge status={p.active ? 'active' : 'inactive'} />
                </div>
                <div className="mt-1 text-[13px]">
                  <Description p={p} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-text-muted">
                  {p.productCode && <code className="font-mono">{p.productCode}</code>}
                  {p.productSku && <code className="font-mono">{p.productSku}</code>}
                  {p.category && <span>{p.category}</span>}
                </div>
              </div>
              <div className="-mr-2 -mt-2">
                <ProductRowMenu product={p} />
              </div>
            </div>
          )}
        />
      </Card>
    </>
  );
}
