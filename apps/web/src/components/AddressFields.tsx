import * as React from 'react';
import { useFormContext, useWatch, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { countryRule, type Option } from '@crm/contracts';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';

type AddressShape = {
  countryId?: unknown;
  address?: unknown;
  city?: unknown;
  stateId?: unknown;
  provinceOrRegion?: unknown;
  postalCode?: unknown;
};

export function countryCodeLookup(countries: readonly Option[]) {
  return (countryId: unknown): string | undefined => {
    const id = Number(countryId);
    if (!countryId || Number.isNaN(id)) return undefined;
    return countries.find((c) => c.value === id)?.code;
  };
}

/**
 * Country-driven address block. The country picks the behaviour from the client-side rules
 * table (`countryRule`): State select for countries that use states (US), otherwise a free-text
 * province/region (when `withProvince`), plus the postal label/format hint.
 * Must be rendered inside a react-hook-form `FormProvider`.
 */
export function AddressFields({
  countries,
  states,
  withProvince = false,
  required = false,
  disabled = false,
}: {
  countries: readonly Option[];
  states: readonly Option[];
  withProvince?: boolean;
  /** Show required markers (publish / registered rules). */
  required?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<AddressShape & FieldValues>();
  const countryId = useWatch<AddressShape & FieldValues>({ name: 'countryId' });
  const code = countryCodeLookup(countries)(countryId);
  const rule = countryRule(code);
  const prevUsesStates = React.useRef(rule.usesStates);

  // Switching to a country without states clears a stale state selection (and vice versa).
  React.useEffect(() => {
    if (prevUsesStates.current !== rule.usesStates) {
      if (!rule.usesStates && getValues('stateId')) setValue('stateId', '', { shouldDirty: true });
      if (rule.usesStates && withProvince && getValues('provinceOrRegion')) {
        setValue('provinceOrRegion', '', { shouldDirty: true });
      }
      prevUsesStates.current = rule.usesStates;
    }
  }, [rule.usesStates, withProvince, getValues, setValue]);

  const err = (name: keyof AddressShape) => {
    const e = errors[name];
    return typeof e?.message === 'string' ? e.message : undefined;
  };

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      <Field label={t('address.country')} required={required} error={err('countryId')} className="sm:col-span-2">
        {(p) => (
          <NativeSelect {...p} {...register('countryId')} disabled={disabled} autoComplete="country">
            <option value="">{t('address.selectCountry')}</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field label={t('address.address')} required={required} error={err('address')} className="sm:col-span-2">
        {(p) => <Input {...p} {...register('address')} disabled={disabled} autoComplete="street-address" maxLength={200} />}
      </Field>
      <Field label={t('address.city')} required={required} error={err('city')}>
        {(p) => <Input {...p} {...register('city')} disabled={disabled} autoComplete="address-level2" maxLength={100} />}
      </Field>
      {rule.usesStates ? (
        <Field label={rule.stateLabel} required={required} error={err('stateId')}>
          {(p) => (
            <NativeSelect {...p} {...register('stateId')} disabled={disabled} autoComplete="address-level1">
              <option value="">{t('address.select', { label: rule.stateLabel.toLowerCase() })}</option>
              {states.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ) : withProvince ? (
        <Field label={rule.stateLabel} error={err('provinceOrRegion')}>
          {(p) => <Input {...p} {...register('provinceOrRegion')} disabled={disabled} autoComplete="address-level1" maxLength={100} />}
        </Field>
      ) : null}
      <Field label={rule.postalLabel} required={required} error={err('postalCode')} hint={rule.postalHint}>
        {(p) => <Input {...p} {...register('postalCode')} disabled={disabled} autoComplete="postal-code" maxLength={20} />}
      </Field>
    </div>
  );
}
