import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { addLicenseSchema } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { LicenseTypeBadge } from '@/components/StatusBadge';
import { errorMessage, isApiError } from '@/lib/errors';
import { useAddLicense, useAvailableProducts } from './api';

export function AddLicenseDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  accountName: string;
}) {
  const { t } = useTranslation('licenses');
  const products = useAvailableProducts(accountId, open);
  const add = useAddLicense(accountId);
  const [productId, setProductId] = React.useState<string | undefined>();
  const [seats, setSeats] = React.useState('25');
  const [errors, setErrors] = React.useState<{ productLicenseId?: string; purchasedCount?: string }>({});
  const formId = React.useId();

  React.useEffect(() => {
    if (open) {
      setProductId(undefined);
      setSeats('25');
      setErrors({});
      add.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = React.useMemo(
    () => (products.data ?? []).map((p) => ({ value: String(p.id), label: `${p.productName} (${p.licenseTypeDisplay})`, description: p.productCode })),
    [products.data],
  );
  const selected = products.data?.find((p) => String(p.id) === productId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = addLicenseSchema.safeParse({ productLicenseId: productId ? Number(productId) : undefined, purchasedCount: seats });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if ((k === 'productLicenseId' || k === 'purchasedCount') && !next[k]) next[k] = k === 'productLicenseId' ? t('addDialog.chooseProduct') : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await add.mutateAsync(parsed.data);
      toast.success(t('toast.added', { name: selected?.productName ?? '' }));
      onOpenChange(false);
    } catch (err) {
      if (isApiError(err) && err.fieldErrors) {
        setErrors({ productLicenseId: err.fieldErrors.productLicenseId, purchasedCount: err.fieldErrors.purchasedCount ?? err.fieldErrors.purchasedLicenseCount });
      }
      toast.error(errorMessage(err));
    }
  };

  const none = products.isSuccess && products.data.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent
        title={t('addDialog.title')}
        description={t('addDialog.description', { name: accountName })}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={add.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={add.isPending} disabled={none}>
              {t('addDialog.submit')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
          {products.isPending ? (
            <p className="m-0 flex items-center gap-2 text-text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t('addDialog.loading')}
            </p>
          ) : products.isError ? (
            <p className="m-0 font-bold text-danger" role="alert">
              {errorMessage(products.error)}
            </p>
          ) : none ? (
            <p className="m-0 text-text-muted">{t('addDialog.noneAvailable')}</p>
          ) : (
            <Field label={t('addDialog.product')} required error={errors.productLicenseId}>
              {(p) => (
                <Combobox
                  {...p}
                  value={productId}
                  onChange={setProductId}
                  options={options}
                  placeholder={t('addDialog.chooseProduct')}
                  searchLabel={t('addDialog.searchProducts')}
                />
              )}
            </Field>
          )}
          {selected && (
            <section aria-label={t('addDialog.details')} className="rounded-[10px] border border-border bg-surface-muted/50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-text">{selected.productName}</b>
                <LicenseTypeBadge type={selected.licenseType} label={selected.licenseTypeDisplay} />
              </div>
              {selected.description && <p className="m-0 mt-1 text-[13px] text-text-muted">{selected.description}</p>}
              <dl className="m-0 mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-text-muted">{t('addDialog.code')}</dt>
                <dd className="m-0 font-mono">{selected.productCode || '—'}</dd>
                <dt className="text-text-muted">{t('addDialog.sku')}</dt>
                <dd className="m-0 font-mono">{selected.productSku || '—'}</dd>
                <dt className="text-text-muted">{t('addDialog.category')}</dt>
                <dd className="m-0">{selected.category || '—'}</dd>
              </dl>
            </section>
          )}
          <Field label={t('addDialog.seats')} required error={errors.purchasedCount}>
            {(p) => (
              <Input {...p} type="number" inputMode="numeric" min={1} step={1} value={seats} onChange={(e) => setSeats(e.target.value)} className="sm:max-w-[180px]" />
            )}
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
