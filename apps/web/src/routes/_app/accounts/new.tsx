import { createFileRoute } from '@tanstack/react-router';
import { PERMISSIONS } from '@crm/contracts';
import { AccountPage } from '@/features/accounts/AccountPage';
import { RequirePermission } from '@/features/shell/RequirePermission';

export const Route = createFileRoute('/_app/accounts/new')({
  staticData: { crumbs: [{ key: 'shell:nav.accounts', to: '/accounts' }, { key: 'accounts:detail.newTitle' }] },
  component: function NewAccountRoute() {
    return (
      <RequirePermission permission={PERMISSIONS.ACCOUNTS} action="create">
        <AccountPage accountId="new" tab="details" onTabChange={() => undefined} />
      </RequirePermission>
    );
  },
});
