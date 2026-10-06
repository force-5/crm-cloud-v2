import { createFileRoute, notFound, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { PERMISSIONS } from '@crm/contracts';
import { AccountPage } from '@/features/accounts/AccountPage';
import { RequirePermission } from '@/features/shell/RequirePermission';

const searchSchema = z.object({
  tab: z.enum(['details', 'licenses']).catch('details').default('details'),
});

export const Route = createFileRoute('/_app/accounts/$accountId')({
  params: {
    parse: ({ accountId }) => {
      const id = Number(accountId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { accountId: id };
    },
    stringify: ({ accountId }) => ({ accountId: String(accountId) }),
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'details' })] },
  staticData: { crumbs: [{ key: 'shell:nav.accounts', to: '/accounts' }, { key: 'accounts:detail.crumb' }] },
  component: function AccountRoute() {
    const { accountId } = Route.useParams();
    const { tab } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <RequirePermission permission={PERMISSIONS.ACCOUNTS}>
        <AccountPage accountId={accountId} tab={tab} onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })} />
      </RequirePermission>
    );
  },
});
