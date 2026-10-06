import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { updateLicenseSchema, type TenantLicense } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/overlays';

/** Edit purchased seats (≥ 1). Going below the used count is allowed, with a warning (decision D6). */
export function EditSeatsPopover({
  license,
  open,
  onOpenChange,
  onSave,
  children,
}: {
  license: TenantLicense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (purchasedCount: number) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('licenses');
  const [value, setValue] = React.useState(String(license.purchasedCount ?? ''));
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setValue(String(license.purchasedCount ?? ''));
      setError(undefined);
    }
  }, [open, license.purchasedCount]);

  const n = Number(value);
  const belowUsed = value !== '' && Number.isFinite(n) && n >= 1 && n < license.usedCount;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateLicenseSchema.safeParse({ purchasedCount: value });
    if (!parsed.success || parsed.data.purchasedCount === undefined) {
      setError(parsed.success ? t('editSeats.label') : parsed.error.issues[0]?.message);
      return;
    }
    onSave(parsed.data.purchasedCount);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent align="end" className="w-[300px]" aria-label={t('editSeats.title')}>
        <form noValidate onSubmit={submit}>
          <p className="m-0 mb-2.5 font-black text-text">
            {t('editSeats.title')} <span className="font-normal text-text-muted">· {license.productName}</span>
          </p>
          <Field label={t('editSeats.label')} error={error}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} step={1} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />}
          </Field>
          {belowUsed && (
            <p className="m-0 mt-2.5 flex gap-1.5 rounded-md bg-warning-soft px-2.5 py-2 text-[12px] text-warning" role="status">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {t('editSeats.belowUsed', { used: license.usedCount })}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" type="submit" variant="primary">
              {t('editSeats.save')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
