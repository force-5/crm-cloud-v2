import { createFileRoute, notFound } from '@tanstack/react-router';
import { PERMISSIONS } from '@crm/contracts';
import { ProductPage } from '@/features/products/ProductPage';
import { RequirePermission } from '@/features/shell/RequirePermission';

export const Route = createFileRoute('/_app/products/$productId')({
  params: {
    parse: ({ productId }) => {
      const id = Number(productId);
      if (!Number.isInteger(id) || id <= 0) throw notFound();
      return { productId: id };
    },
    stringify: ({ productId }) => ({ productId: String(productId) }),
  },
  staticData: { crumbs: [{ key: 'shell:nav.products', to: '/products' }, { key: 'products:detail.crumb' }] },
  component: function ProductRoute() {
    const { productId } = Route.useParams();
    return (
      <RequirePermission permission={PERMISSIONS.PRODUCTS}>
        <ProductPage productId={productId} />
      </RequirePermission>
    );
  },
});
