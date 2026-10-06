import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { listQuerySchema, PERMISSIONS, type ListQuery } from '@crm/contracts';
import { AccountsListPage } from '@/features/accounts/AccountsListPage';
import { RequirePermission } from '@/features/shell/RequirePermission';
import { LIST_DEFAULTS } from '@/lib/listSearch';

export const Route = createFileRoute('/_app/accounts/')({
  validateSearch: listQuerySchema,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  staticData: { crumbs: [{ key: 'shell:nav.accounts' }] },
  component: function AccountsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    const onSearchChange = (patch: Partial<ListQuery>, opts?: { replace?: boolean }) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: opts?.replace });
    return (
      <RequirePermission permission={PERMISSIONS.ACCOUNTS}>
        <AccountsListPage search={search} onSearchChange={onSearchChange} />
      </RequirePermission>
    );
  },
});
