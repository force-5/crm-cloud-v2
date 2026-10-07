import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import {
  PERMISSIONS,
  hasPermission,
  productFormSchema,
  type Product,
  type ProductDetailResponse,
  type ProductFormData,
  type ProductFormValues,
} from '@crm/contracts';
import { ActionBar, Button, ConfirmSheet, ErrorState, Screen, Text } from '@/components';
import { FormSection, FormSelect, FormSwitch, FormText } from '@/features/forms/fields';
import { useProductDetail } from '@/features/products/hooks';
import { useCurrentUser } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { haptics } from '@/lib/haptics';

function toValues(p: Product | null): ProductFormValues {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    productCode: p?.productCode ?? '',
    productSku: p?.productSku ?? '',
    productVersion: p?.productVersion ?? '',
    productCategoryId: p?.productCategoryId,
    active: p?.active ?? true,
  };
}

export default function ProductDetailScreen() {
  const { t } = useTranslation(['products', 'common']);
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const id: number | 'new' = isNew ? 'new' : Number(params.id);
  const detail = useProductDetail(id);
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: isNew ? t('detail.newTitle') : (detail.data?.product?.name ?? t('detail.crumb')) }} />
      {detail.isPending ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <ProductForm key={detail.data.product?.id ?? 'new'} data={detail.data} />
      )}
    </>
  );
}

function ProductForm({ data }: { data: ProductDetailResponse }) {
  const { t } = useTranslation(['products', 'common']);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const user = useCurrentUser();
  const product = data.product;
  const isNew = !product;
  const canEdit = hasPermission(user, PERMISSIONS.PRODUCTS, isNew ? 'create' : 'update');
  const canDelete = !isNew && hasPermission(user, PERMISSIONS.PRODUCTS, 'delete');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { control, handleSubmit, reset, setError, formState } = useForm<ProductFormValues, unknown, ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: toValues(product),
    mode: 'onTouched',
  });
  useEffect(() => reset(toValues(product)), [product, reset]);

  const categories = useMemo(() => data.categories.map((c) => ({ value: c.value, label: c.label })), [data.categories]);
  const ro = !canEdit;

  const save = handleSubmit(
    async (values) => {
      setSaving(true);
      try {
        const { product: saved } = await (product ? api.products.update(product.id, values) : api.products.create(values));
        qc.setQueryData<ProductDetailResponse>(queryKeys.products.detail(saved.id), { ...data, product: saved });
        void qc.invalidateQueries({ queryKey: queryKeys.products.list({}) });
        haptics.success();
        toast.success(isNew ? t('toast.created', { name: saved.name }) : t('toast.saved'));
        if (isNew) router.replace(`/products/${saved.id}`);
        else reset(toValues(saved));
      } catch (err) {
        haptics.error();
        if (err instanceof ApiClientError && err.fieldErrors) {
          for (const [k, m] of Object.entries(err.fieldErrors)) setError(k as keyof ProductFormValues, { message: m });
          toast.error(t('common:errors.fixFields'));
        } else toast.error(errorMessage(err, t('toast.saveFailed')));
      } finally {
        setSaving(false);
      }
    },
    () => {
      haptics.error();
      toast.error(t('common:errors.fixFields'));
    },
  );

  const doDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await api.products.delete(product.id);
      qc.removeQueries({ queryKey: queryKeys.products.detail(product.id) });
      void qc.invalidateQueries({ queryKey: queryKeys.products.list({}) });
      haptics.success();
      toast.success(t('toast.deleted', { name: product.name }));
      setConfirmDelete(false);
      router.back();
    } catch (err) {
      haptics.error();
      toast.error(errorMessage(err, t('toast.deleteFailed')));
    } finally {
      setDeleting(false);
    }
  };

  const audit = product?.audit;
  const auditLine = (kind: 'created' | 'updated', who?: string | null, date?: string | null) => {
    if (who && date) return t(`audit.${kind}`, { who, date: formatDateTime(date) });
    if (date) return t(`audit.${kind}NoBy`, { date: formatDateTime(date) });
    if (who) return t(`audit.${kind}NoDate`, { who });
    return t('audit.createdBare');
  };

  return (
    <Screen
      keyboard
      footer={
        canEdit ? (
          <ActionBar>
            <Button
              title={isNew ? t('actions.create') : t('common:actions.saveChanges')}
              flex
              loading={saving}
              disabled={!isNew && !formState.isDirty}
              onPress={save}
            />
          </ActionBar>
        ) : undefined
      }
    >
      <FormSection title={t('detail.section')}>
        <FormText control={control} name="name" label={t('fields.name')} required readOnly={ro} maxLength={100} />
        <FormText control={control} name="description" label={t('fields.description')} readOnly={ro} multiline maxLength={500} />
        <FormText control={control} name="productCode" label={t('fields.code')} required readOnly={ro} autoCapitalize="characters" maxLength={50} />
        <FormText control={control} name="productSku" label={t('fields.sku')} readOnly={ro} autoCapitalize="characters" maxLength={50} />
        <FormText control={control} name="productVersion" label={t('fields.version')} readOnly={ro} maxLength={20} />
        <FormSelect control={control} name="productCategoryId" label={t('fields.category')} options={categories} readOnly={ro} />
        <FormSwitch control={control} name="active" label={t('fields.active')} description={t('fields.activeHint')} disabled={ro} />
      </FormSection>

      {audit && (audit.createdBy || audit.dateCreated || audit.updatedBy || audit.lastUpdated) ? (
        <View style={{ gap: 2, paddingHorizontal: 4 }}>
          <Text variant="caption" tone="subtle">
            {auditLine('created', audit.createdBy, audit.dateCreated)}
          </Text>
          {audit.updatedBy || audit.lastUpdated ? (
            <Text variant="caption" tone="subtle">
              {auditLine('updated', audit.updatedBy, audit.lastUpdated)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {canDelete ? (
        <Button title={t('actions.delete')} variant="danger" icon="trash-outline" full onPress={() => setConfirmDelete(true)} />
      ) : null}

      <ConfirmSheet
        visible={confirmDelete}
        destructive
        title={t('confirm.deleteTitle')}
        message={t('confirm.deleteBody', { name: product?.name ?? '' })}
        confirmLabel={t('confirm.deleteConfirm')}
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </Screen>
  );
}
