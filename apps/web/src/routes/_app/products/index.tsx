import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { listQuerySchema, PERMISSIONS, type ListQuery } from '@crm/contracts';
import { ProductsListPage } from '@/features/products/ProductsListPage';
import { RequirePermission } from '@/features/shell/RequirePermission';
import { LIST_DEFAULTS } from '@/lib/listSearch';

export const Route = createFileRoute('/_app/products/')({
  validateSearch: listQuerySchema,
  search: { middlewares: [stripSearchParams(LIST_DEFAULTS)] },
  staticData: { crumbs: [{ key: 'shell:nav.products' }] },
  component: function ProductsRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    const onSearchChange = (patch: Partial<ListQuery>, opts?: { replace?: boolean }) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: opts?.replace });
    return (
      <RequirePermission permission={PERMISSIONS.PRODUCTS}>
        <ProductsListPage search={search} onSearchChange={onSearchChange} />
      </RequirePermission>
    );
  },
});
