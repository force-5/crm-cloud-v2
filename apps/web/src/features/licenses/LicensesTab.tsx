import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Power, PowerOff, SearchX, Users } from 'lucide-react';
import { availableSeats, PERMISSIONS, type StatusFilter, type TenantLicense } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Card, Progress } from '@/components/ui/misc';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/overlays';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { DebouncedSearch, ListToolbar, StatusSegmented } from '@/components/ListToolbar';
import { LicenseTypeBadge, StatusBadge } from '@/components/StatusBadge';
import { Can, useCan } from '@/lib/permissions';
import { richT } from '@/lib/richText';
import { cn } from '@/lib/utils';
import { AddLicenseDialog } from './AddLicenseDialog';
import { useLicensesList, useUpdateLicense } from './api';
import { EditSeatsPopover } from './EditSeatsPopover';

const PAGE_SIZE = 20;

export function SeatsCell({ license }: { license: TenantLicense }) {
  const { t } = useTranslation('licenses');
  const purchased = license.purchasedCount ?? 0;
  const available = availableSeats(license);
  const over = available < 0;
  return (
    <div className="min-w-[150px]">
      <div className="whitespace-nowrap">
        {license.purchasedCount === null ? (
          <span className="text-text-muted">{t('seats.notSet')}</span>
        ) : (
          <>
            <b className="text-text">{purchased}</b> <span>{t('seats.purchasedLabel')}</span>
          </>
        )}
      </div>
      <div className={cn('whitespace-nowrap text-[12px]', over ? 'font-bold text-danger' : 'text-text-muted')}>
        {t('seats.usage', { used: license.usedCount, available })}
      </div>
      <Progress
        value={license.usedCount}
        max={purchased}
        tone={over ? 'danger' : 'info'}
        label={t('seats.progress', { used: license.usedCount, purchased })}
      />
      {over && <span className="sr-only">{t('seats.overAllocated', { count: -available })}</span>}
    </div>
  );
}

function LicenseActions({ license, accountId }: { license: TenantLicense; accountId: number }) {
  const { t } = useTranslation('licenses');
  const update = useUpdateLicense(accountId);
  const canUpdate = useCan(PERMISSIONS.LICENSES, 'update');
  const [seatsOpen, setSeatsOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  // The menu returns focus to its trigger on close, which would immediately dismiss the popover.
  const openingSeats = React.useRef(false);
  const next = !license.active;
  if (!canUpdate) return null;
  return (
    <>
      <EditSeatsPopover
        license={license}
        open={seatsOpen}
        onOpenChange={setSeatsOpen}
        onSave={(purchasedCount) => update.mutate({ license, patch: { purchasedCount } })}
      >
        <span className="inline-flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('menu.label', { name: license.productName })}>
                <MoreHorizontal className="!size-5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => {
                if (openingSeats.current) {
                  e.preventDefault();
                  openingSeats.current = false;
                  setSeatsOpen(true);
                }
              }}
            >
              <DropdownMenuItem onSelect={() => (openingSeats.current = true)}>
                <Users aria-hidden="true" />
                {t('menu.editSeats')}
              </DropdownMenuItem>
              <DropdownMenuItem destructive={license.active} onSelect={() => setConfirm(true)}>
                {license.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                {license.active ? t('common:actions.deactivate') : t('common:actions.activate')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </EditSeatsPopover>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={richT(t, next ? 'confirm.activateTitle' : 'confirm.deactivateTitle', { name: <b>{license.productName}</b> })}
        description={next ? t('confirm.activateBody') : t('confirm.deactivateBody')}
        confirmLabel={next ? t('common:actions.activate') : t('common:actions.deactivate')}
        destructive={!next}
        onConfirm={() => update.mutate({ license, patch: { active: next } })}
      />
    </>
  );
}

/** Licenses tab on an account (§6.4). */
export function LicensesTab({ accountId, accountName }: { accountId: number; accountName: string }) {
  const { t } = useTranslation('licenses');
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<StatusFilter>('active');
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ sort: string; dir: 'asc' | 'desc' }>({ sort: 'productName', dir: 'asc' });
  const [adding, setAdding] = React.useState(false);
  const query = useLicensesList(accountId, { search, status, page, size: PAGE_SIZE, sort: sort.sort, dir: sort.dir });

  const columns = React.useMemo<ColumnDef<TenantLicense, unknown>[]>(
    () => [
      { id: 'product', header: t('columns.product'), meta: { sortField: 'productName' }, cell: ({ row }) => <b className="text-text">{row.original.productName}</b> },
      {
        id: 'description',
        header: t('columns.description'),
        cell: ({ row }) =>
          row.original.description ? (
            <Tooltip content={row.original.description}>
              <span tabIndex={0} className="block max-w-[220px] truncate rounded-sm text-text-muted">
                {row.original.description}
              </span>
            </Tooltip>
          ) : null,
      },
      { id: 'type', header: t('columns.type'), cell: ({ row }) => <LicenseTypeBadge type={row.original.licenseType} label={row.original.licenseTypeDisplay} /> },
      {
        id: 'code',
        header: t('columns.codeSku'),
        cell: ({ row }) => (
          <code className="whitespace-nowrap font-mono text-[12px]">{[row.original.productCode, row.original.productSku].filter(Boolean).join(' / ')}</code>
        ),
      },
      { id: 'category', header: t('columns.category'), cell: ({ row }) => row.original.category ?? '' },
      { id: 'seats', header: t('columns.seats'), cell: ({ row }) => <SeatsCell license={row.original} /> },
      { id: 'status', header: t('columns.status'), cell: ({ row }) => <StatusBadge status={row.original.active ? 'active' : 'inactive'} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common:table.actions')}</span>,
        meta: { cellClassName: 'w-12 text-right' },
        cell: ({ row }) => <LicenseActions license={row.original} accountId={accountId} />,
      },
    ],
    [t, accountId],
  );

  const filtered = !!search || status !== 'active';

  return (
    <Card>
      <ListToolbar
        left={
          <>
            <DebouncedSearch
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t('searchPlaceholder')}
              label={t('searchLabel')}
            />
            <StatusSegmented
              value={status}
              onChange={(s) => {
                setStatus(s);
                setPage(1);
              }}
            />
          </>
        }
        right={
          <Can permission={PERMISSIONS.LICENSES} action="create">
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t('add')}
            </Button>
          </Can>
        }
      />
      <DataTable
        label={t('tableLabel', { name: accountName })}
        columns={columns}
        data={query.data?.items}
        getRowId={(l) => String(l.id)}
        isLoading={query.isPending}
        isFetching={query.isPlaceholderData}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        page={query.data ? { page: query.data.page, size: query.data.size, total: query.data.total, totalPages: query.data.totalPages } : undefined}
        onPageChange={setPage}
        empty={
          filtered ? (
            <EmptyState
              icon={<SearchX />}
              title={t('empty.filtered')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch(undefined);
                    setStatus('active');
                    setPage(1);
                  }}
                >
                  {t('common:actions.clearFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState title={t('empty.title')} description={t('empty.body', { name: accountName })} />
          )
        }
        renderCard={(l) => (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-text">{l.productName}</b>
                <LicenseTypeBadge type={l.licenseType} label={l.licenseTypeDisplay} />
                <StatusBadge status={l.active ? 'active' : 'inactive'} />
              </div>
              {(l.productCode || l.productSku) && (
                <code className="mt-1 block font-mono text-[12px] text-text-muted">{[l.productCode, l.productSku].filter(Boolean).join(' / ')}</code>
              )}
              <div className="mt-2">
                <SeatsCell license={l} />
              </div>
            </div>
            <div className="-mr-2 -mt-2">
              <LicenseActions license={l} accountId={accountId} />
            </div>
          </div>
        )}
      />
      <AddLicenseDialog open={adding} onOpenChange={setAdding} accountId={accountId} accountName={accountName} />
    </Card>
  );
}
