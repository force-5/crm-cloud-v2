import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { queryKeys } from '@crm/api-client';
import { PERMISSIONS, productFormSchema, type Product, type ProductDetailResponse } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/misc';
import { SwitchRow } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useUnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useApi } from '@/lib/api';
import { useFormatDate } from '@/lib/dates';
import { applyFieldErrors, errorMessage, isApiError } from '@/lib/errors';
import { useCan } from '@/lib/permissions';
import { richT } from '@/lib/richText';
import { useProductDetail } from './api';

type ProductFormState = {
  name: string;
  description: string;
  productCode: string;
  productSku: string;
  productVersion: string;
  productCategoryId: string;
  active: boolean;
};
const PRODUCT_FIELDS = ['name', 'description', 'productCode', 'productSku', 'productVersion', 'productCategoryId', 'active'] as const;

function toState(p: Product | null): ProductFormState {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    productCode: p?.productCode ?? '',
    productSku: p?.productSku ?? '',
    productVersion: p?.productVersion ?? '',
    productCategoryId: p?.productCategoryId !== undefined ? String(p.productCategoryId) : '',
    active: p?.active ?? true,
  };
}

export function ProductPage({ productId }: { productId: number | 'new' }) {
  const { t } = useTranslation('products');
  const detail = useProductDetail(productId);
  if (detail.isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-2 h-3 w-40" />
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="crm-card max-w-[850px] space-y-3 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-24" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    );
  }
  if (detail.error || !detail.data) {
    const notFound = isApiError(detail.error) && detail.error.status === 404;
    return (
      <>
        <PageHeader title={notFound ? t('detail.notFoundTitle') : t('common:errors.loadFailed')} />
        <Card className="max-w-[850px]">
          {notFound ? (
            <EmptyState
              title={t('detail.notFoundTitle')}
              description={t('detail.notFoundBody')}
              action={
                <Button asChild variant="secondary">
                  <Link to="/products">{t('shell:nav.products')}</Link>
                </Button>
              }
            />
          ) : (
            <ErrorState title={t('common:errors.loadFailed')} description={errorMessage(detail.error)} onRetry={() => void detail.refetch()} retryLabel={t('common:actions.retry')} />
          )}
        </Card>
      </>
    );
  }
  return <ProductEditor key={String(productId)} response={detail.data} />;
}

function ProductEditor({ response }: { response: ProductDetailResponse }) {
  const { t } = useTranslation('products');
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const { product, categories } = response;
  const isNew = !product;
  const canSave = useCan(PERMISSIONS.PRODUCTS, isNew ? 'create' : 'update');
  const canDelete = useCan(PERMISSIONS.PRODUCTS, 'delete');
  const form = useForm<ProductFormState>({ defaultValues: toState(product) });
  const { register, control, formState } = form;
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const guard = useUnsavedChangesGuard(formState.isDirty && !saving);

  const err = (k: keyof ProductFormState) => {
    const m = formState.errors[k]?.message;
    return typeof m === 'string' ? m : undefined;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed = productFormSchema.safeParse(values);
    if (!parsed.success) {
      let first = true;
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (typeof k === 'string' && (PRODUCT_FIELDS as readonly string[]).includes(k)) {
          form.setError(k as keyof ProductFormState, { message: issue.message }, { shouldFocus: first });
          first = false;
        }
      }
      return;
    }
    setSaving(true);
    try {
      const { product: saved } = isNew ? await api.products.create(parsed.data) : await api.products.update(product.id, parsed.data);
      qc.setQueryData<ProductDetailResponse>(queryKeys.products.detail(saved.id), { product: saved, categories });
      void qc.invalidateQueries({ queryKey: ['products', 'list'] });
      form.reset(toState(saved));
      toast.success(isNew ? t('toast.created', { name: saved.name }) : t('toast.saved'));
      if (isNew) {
        guard.allowNextNavigation();
        await navigate({ to: '/products/$productId', params: { productId: saved.id }, replace: true });
      }
    } catch (e) {
      if (applyFieldErrors(e, form.setError, PRODUCT_FIELDS)) toast.error(t('common:errors.fixFields'));
      else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  });

  const remove = async () => {
    if (!product) return;
    try {
      await api.products.delete(product.id);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
    qc.removeQueries({ queryKey: queryKeys.products.detail(product.id) });
    void qc.invalidateQueries({ queryKey: ['products', 'list'] });
    toast.success(t('toast.deleted', { name: product.name }));
    guard.allowNextNavigation();
    await navigate({ to: '/products' });
  };

  const audit = product?.audit;
  const auditParts = [
    audit?.dateCreated &&
      (audit.createdBy
        ? t('audit.created', { who: audit.createdBy, date: formatDate(audit.dateCreated) })
        : t('audit.createdNoBy', { date: formatDate(audit.dateCreated) })),
    audit?.lastUpdated &&
      (audit.updatedBy
        ? t('audit.updated', { who: audit.updatedBy, date: formatDate(audit.lastUpdated) })
        : t('audit.updatedNoBy', { date: formatDate(audit.lastUpdated) })),
  ].filter(Boolean);

  const actions = (
    <>
      {!isNew && canDelete && (
        <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
          <Trash2 aria-hidden="true" />
          {t('actions.delete')}
        </Button>
      )}
      {canSave && (
        <Button variant="primary" onClick={() => void onSubmit()} loading={saving}>
          {isNew ? t('actions.create') : t('common:actions.saveChanges')}
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={isNew ? t('detail.newTitle') : product.name}
        crumbLabel={isNew ? t('detail.newTitle') : product.name}
        badge={<StatusBadge status={isNew ? 'new' : product.active ? 'active' : 'inactive'} />}
        subtitle={t('detail.subtitle')}
        actions={actions}
        formActions
      />
      <form noValidate onSubmit={(e) => void onSubmit(e)}>
        <fieldset disabled={!canSave || saving} className="m-0 min-w-0 border-0 p-0">
          <Card className="max-w-[850px]">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label={t('fields.name')} required error={err('name')} className="sm:col-span-2">
                {(p) => <Input {...p} {...register('name')} maxLength={100} />}
              </Field>
              <Field label={t('fields.description')} error={err('description')} className="sm:col-span-2">
                {(p) => <Textarea {...p} {...register('description')} maxLength={500} rows={3} />}
              </Field>
              <Field label={t('fields.code')} required error={err('productCode')}>
                {(p) => <Input {...p} {...register('productCode')} maxLength={50} className="font-mono" autoCapitalize="characters" />}
              </Field>
              <Field label={t('fields.sku')} error={err('productSku')}>
                {(p) => <Input {...p} {...register('productSku')} maxLength={50} className="font-mono" />}
              </Field>
              <Field label={t('fields.version')} error={err('productVersion')}>
                {(p) => <Input {...p} {...register('productVersion')} maxLength={20} />}
              </Field>
              <Field label={t('fields.category')} error={err('productCategoryId')}>
                {(p) => (
                  <NativeSelect {...p} {...register('productCategoryId')}>
                    <option value="">{t('fields.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <SwitchRow id="product-active" className="mt-2" label={t('fields.active')} description={t('fields.activeHint')} checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            {auditParts.length > 0 && (
              <p className="m-0 mt-2 border-t border-border pt-3.5 text-[12px] text-text-muted">{auditParts.join(' · ')}</p>
            )}
          </Card>
        </fieldset>
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
      {product && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t('confirm.deleteTitle')}
          description={richT(t, 'confirm.deleteBody', { name: <b>{product.name}</b> })}
          confirmLabel={t('confirm.deleteConfirm')}
          destructive
          onConfirm={remove}
        />
      )}
      {guard.dialog}
    </>
  );
}
