import { createFileRoute } from '@tanstack/react-router';
import { PERMISSIONS } from '@crm/contracts';
import { ProductPage } from '@/features/products/ProductPage';
import { RequirePermission } from '@/features/shell/RequirePermission';

export const Route = createFileRoute('/_app/products/new')({
  staticData: { crumbs: [{ key: 'shell:nav.products', to: '/products' }, { key: 'products:detail.newTitle' }] },
  component: () => (
    <RequirePermission permission={PERMISSIONS.PRODUCTS} action="create">
      <ProductPage productId="new" />
    </RequirePermission>
  ),
});
