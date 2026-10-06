import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Plus } from 'lucide-react';
import { PERMISSIONS, type AccountSummary } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, Skeleton } from '@/components/ui/misc';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useFormatDate } from '@/lib/dates';
import { Can, useCan } from '@/lib/permissions';
import { fullName } from '@/lib/utils';
import { useDashboard } from '@/features/accounts/api';

function Metric({ label, value, hint, loading }: { label: string; value?: number; hint?: string; loading?: boolean }) {
  return (
    <div className="crm-card p-4 sm:p-[19px]">
      <dt className="font-bold text-text-muted">{label}</dt>
      <dd className="m-0">
        {loading ? (
          <>
            <Skeleton className="my-2.5 h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </>
        ) : (
          <>
            <span className="my-2 mb-1 block text-[30px] font-black leading-tight text-text">{value?.toLocaleString()}</span>
            {hint && <span className="block text-[12px] text-text-muted">{hint}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const canAccounts = useCan(PERMISSIONS.ACCOUNTS);
  const { data, isPending, error, refetch } = useDashboard();

  const columns = React.useMemo<ColumnDef<AccountSummary, unknown>[]>(
    () => [
      {
        id: 'account',
        header: t('recent.columns.account'),
        cell: ({ row }) => (
          <Link
            to="/accounts/$accountId"
            params={{ accountId: row.original.id }}
            className="font-black text-[#25364d] hover:text-primary-ink hover:underline dark:text-text"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'contact',
        header: t('recent.columns.contact'),
        cell: ({ row }) => (
          <div>
            <span className="block">{fullName(row.original.mainContact.firstName, row.original.mainContact.lastName)}</span>
            <span className="block text-[12px] text-text-muted">{row.original.mainContact.email}</span>
          </div>
        ),
      },
      { id: 'created', header: t('recent.columns.created'), meta: { cellClassName: 'whitespace-nowrap' }, cell: ({ row }) => formatDate(row.original.dateCreated) },
      { id: 'status', header: t('recent.columns.status'), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [t, formatDate],
  );

  const pct = data && data.total > 0 ? Math.round((data.active / data.total) * 1000) / 10 : 0;
  const showDraft = data ? data.draft !== null : false;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Can permission={PERMISSIONS.ACCOUNTS} action="create">
            <Button asChild variant="primary">
              <Link to="/accounts/new">
                <Plus aria-hidden="true" />
                {t('accounts:newAccount')}
              </Link>
            </Button>
          </Can>
        }
      />
      {error && !data ? (
        <Card>
          <ErrorState title={t('common:errors.loadFailed')} description={t('common:errors.generic')} onRetry={() => void refetch()} retryLabel={t('common:actions.retry')} />
        </Card>
      ) : (
        <>
          <dl aria-label={t('kpi.label')} className={`m-0 grid grid-cols-2 gap-3 sm:gap-[15px] ${showDraft ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <Metric label={t('kpi.total')} value={data?.total} hint={t('kpi.totalHint')} loading={isPending} />
            <Metric label={t('kpi.active')} value={data?.active} hint={t('kpi.activeHint', { pct })} loading={isPending} />
            <Metric label={t('kpi.inactive')} value={data?.inactive} hint={t('kpi.inactiveHint')} loading={isPending} />
            {showDraft && <Metric label={t('kpi.draft')} value={data?.draft ?? 0} hint={t('kpi.draftHint')} />}
          </dl>
          <Card className="mt-4">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <CardTitle>{t('recent.title')}</CardTitle>
              {canAccounts && (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/accounts">
                    {t('recent.viewAll')}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
            <DataTable
              label={t('recent.title')}
              columns={columns}
              data={data?.recent}
              getRowId={(a) => String(a.id)}
              isLoading={isPending}
              skeletonRows={5}
              onRowClick={(a) => void navigate({ to: '/accounts/$accountId', params: { accountId: a.id } })}
              empty={<EmptyState title={t('recent.empty')} />}
              renderCard={(a) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/accounts/$accountId"
                      params={{ accountId: a.id }}
                      className="font-black text-[#25364d] hover:text-primary-ink dark:text-text"
                    >
                      {a.name}
                    </Link>
                    <span className="block text-[12px] text-text-muted">
                      {[fullName(a.mainContact.firstName, a.mainContact.lastName), formatDate(a.dateCreated)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              )}
            />
          </Card>
        </>
      )}
    </>
  );
}
