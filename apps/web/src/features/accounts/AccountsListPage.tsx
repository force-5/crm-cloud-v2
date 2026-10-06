import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, SearchX } from 'lucide-react';
import { PERMISSIONS, type AccountSummary, type ListQuery } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/misc';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { DebouncedSearch, ListToolbar, PageSizeSelect, StatusSegmented } from '@/components/ListToolbar';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useFormatDate } from '@/lib/dates';
import { Can } from '@/lib/permissions';
import { fullName } from '@/lib/utils';
import { AccountRowMenu } from './AccountActions';
import { useAccountsList } from './api';

export const DEFAULT_ACCOUNT_SORT = { sort: 'name', dir: 'asc' } as const;

function Missing() {
  const { t } = useTranslation('accounts');
  return <span className="font-bold text-danger">{t('list.missing')}</span>;
}

function PhoneCell({ a }: { a: AccountSummary }) {
  const { t } = useTranslation('accounts');
  return (
    <div className="whitespace-nowrap text-[13px]">
      <div>
        <span className="text-text-muted">{t('list.officeShort')} </span>
        {a.mainContact.phone ? a.mainContact.phone : <Missing />}
      </div>
      {a.mainContact.mobile && (
        <div>
          <span className="text-text-muted">{t('list.mobileShort')} </span>
          {a.mainContact.mobile}
        </div>
      )}
    </div>
  );
}

function AccountLink({ a }: { a: AccountSummary }) {
  return (
    <Link
      to="/accounts/$accountId"
      params={{ accountId: a.id }}
      className="font-black text-[#25364d] hover:text-primary-ink hover:underline dark:text-text"
    >
      {a.name}
    </Link>
  );
}

function ContactCell({ a }: { a: AccountSummary }) {
  const name = fullName(a.mainContact.firstName, a.mainContact.lastName);
  return (
    <div className="min-w-0">
      {name && <b className="block text-text">{name}</b>}
      {a.mainContact.email && <span className="block break-all text-[12px] text-text-muted">{a.mainContact.email}</span>}
    </div>
  );
}

export function AccountsListPage({
  search,
  onSearchChange,
}: {
  search: ListQuery;
  onSearchChange: (patch: Partial<ListQuery>, opts?: { replace?: boolean }) => void;
}) {
  const { t } = useTranslation('accounts');
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const query = useAccountsList(search);
  const sort = search.sort ? { sort: search.sort, dir: search.dir ?? 'asc' } : DEFAULT_ACCOUNT_SORT;

  const columns = React.useMemo<ColumnDef<AccountSummary, unknown>[]>(
    () => [
      { id: 'name', header: t('list.columns.name'), meta: { sortField: 'name' }, cell: ({ row }) => <AccountLink a={row.original} /> },
      {
        id: 'contact',
        header: t('list.columns.contact'),
        meta: { sortField: 'mainContactLastName' },
        cell: ({ row }) => <ContactCell a={row.original} />,
      },
      { id: 'phone', header: t('list.columns.phone'), cell: ({ row }) => <PhoneCell a={row.original} /> },
      { id: 'city', header: t('list.columns.city'), meta: { sortField: 'city' }, cell: ({ row }) => row.original.city ?? '' },
      { id: 'state', header: t('list.columns.state'), cell: ({ row }) => row.original.state ?? '' },
      { id: 'country', header: t('list.columns.country'), cell: ({ row }) => row.original.country ?? '' },
      { id: 'language', header: t('list.columns.language'), cell: ({ row }) => row.original.language ?? '' },
      {
        id: 'created',
        header: t('list.columns.created'),
        meta: { sortField: 'dateCreated', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => formatDate(row.original.dateCreated),
      },
      { id: 'status', header: t('list.columns.status'), meta: { sortField: 'active' }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common:table.actions')}</span>,
        meta: { cellClassName: 'w-12 text-right' },
        cell: ({ row }) => <AccountRowMenu account={row.original} />,
      },
    ],
    [t, formatDate],
  );

  const filtered = !!search.search || search.status !== 'active';
  const empty = filtered ? (
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
    <EmptyState
      title={t('list.emptyTitle')}
      description={t('list.emptyBody')}
      action={
        <Can permission={PERMISSIONS.ACCOUNTS} action="create">
          <Button asChild variant="primary">
            <Link to="/accounts/new">
              <Plus aria-hidden="true" />
              {t('newAccount')}
            </Link>
          </Button>
        </Can>
      }
    />
  );

  return (
    <>
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        actions={
          <Can permission={PERMISSIONS.ACCOUNTS} action="create">
            <Button asChild variant="primary">
              <Link to="/accounts/new">
                <Plus aria-hidden="true" />
                {t('newAccount')}
              </Link>
            </Button>
          </Can>
        }
      />
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
          getRowId={(a) => String(a.id)}
          isLoading={query.isPending}
          isFetching={query.isPlaceholderData}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={sort}
          onSortChange={({ sort: s, dir }) => onSearchChange({ sort: s, dir, page: 1 })}
          page={query.data ? { page: query.data.page, size: query.data.size, total: query.data.total, totalPages: query.data.totalPages } : undefined}
          onPageChange={(page) => onSearchChange({ page })}
          onRowClick={(a) => void navigate({ to: '/accounts/$accountId', params: { accountId: a.id } })}
          empty={empty}
          renderCard={(a) => (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AccountLink a={a} />
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-1.5">
                  <ContactCell a={a} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-muted">
                  <PhoneCell a={a} />
                  {[a.city, a.state].filter(Boolean).join(', ') && <span>{[a.city, a.state].filter(Boolean).join(', ')}</span>}
                </div>
              </div>
              <div className="-mr-2 -mt-2">
                <AccountRowMenu account={a} />
              </div>
            </div>
          )}
        />
      </Card>
    </>
  );
}
