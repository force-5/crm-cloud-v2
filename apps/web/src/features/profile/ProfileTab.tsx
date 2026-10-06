import * as React from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { profileFormSchema, type ProfileResponse } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Card } from '@/components/ui/misc';
import { AddressFields } from '@/components/AddressFields';
import { ImageCropUpload } from '@/components/ImageCropUpload';
import { useUnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useApi } from '@/lib/api';
import { applyFieldErrors, errorMessage } from '@/lib/errors';
import { applyLocale } from '@/lib/i18n';
import { fullName, initials } from '@/lib/utils';
import { usePatchUser } from './api';

type ProfileFormState = {
  firstName: string;
  lastName: string;
  mobilePhone: string;
  address: string;
  city: string;
  countryId: string;
  stateId: string;
  postalCode: string;
  languageId: string;
  timeZoneName: string;
};
const FIELDS = ['firstName', 'lastName', 'mobilePhone', 'address', 'city', 'countryId', 'stateId', 'postalCode', 'languageId', 'timeZoneName'] as const;

const s = (v: string | number | undefined) => (v === undefined ? '' : String(v));

function toState(user: ProfileResponse['user']): ProfileFormState {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    mobilePhone: s(user.mobilePhone),
    address: s(user.address),
    city: s(user.city),
    countryId: s(user.countryId),
    stateId: s(user.stateId),
    postalCode: s(user.postalCode),
    languageId: s(user.languageId),
    timeZoneName: s(user.timeZoneName),
  };
}

export function ProfileTab({ data }: { data: ProfileResponse }) {
  const { t } = useTranslation('profile');
  const api = useApi();
  const patchUser = usePatchUser();
  const { user, lookups } = data;
  const form = useForm<ProfileFormState>({ defaultValues: toState(user) });
  const { register, control, formState } = form;
  const [saving, setSaving] = React.useState(false);
  const guard = useUnsavedChangesGuard(formState.isDirty && !saving);
  const tzOptions = React.useMemo(() => lookups.timeZones.map((z) => ({ value: z.value, label: z.label })), [lookups.timeZones]);
  const err = (k: keyof ProfileFormState) => {
    const m = formState.errors[k]?.message;
    return typeof m === 'string' ? m : undefined;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed = profileFormSchema.safeParse(values);
    if (!parsed.success) {
      let first = true;
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (typeof k === 'string' && (FIELDS as readonly string[]).includes(k)) {
          form.setError(k as keyof ProfileFormState, { message: issue.message }, { shouldFocus: first });
          first = false;
        }
      }
      return;
    }
    setSaving(true);
    try {
      const res = await api.profile.update(parsed.data);
      patchUser(res.user);
      applyLocale(res.user.locale);
      form.reset(toState(res.user));
      toast.success(t('saved'));
    } catch (e) {
      if (applyFieldErrors(e, form.setError, FIELDS)) toast.error(t('common:errors.fixFields'));
      else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  });

  const uploadPhoto = async (dataUrl: string) => {
    try {
      const { profileImageUrl } = await api.profile.uploadPhoto(dataUrl);
      patchUser({ profileImageUrl });
      toast.success(t('photo.uploaded'));
    } catch (e) {
      toast.error(t('photo.failed', { message: errorMessage(e) }));
      throw e;
    }
  };
  const removePhoto = async () => {
    try {
      await api.profile.removePhoto();
      patchUser({ profileImageUrl: undefined });
      toast.success(t('photo.removed'));
    } catch (e) {
      toast.error(t('photo.failed', { message: errorMessage(e) }));
      throw e;
    }
  };

  return (
    <div className="grid gap-[18px] lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card className="text-center">
        <ImageCropUpload
          label={t('photo.label')}
          aspect={1}
          output={{ width: 400, height: 400 }}
          variant="avatar"
          value={user.profileImageUrl}
          fallback={initials(user.firstName, user.lastName)}
          onApply={uploadPhoto}
          onRemove={removePhoto}
          removeConfirm={{ title: t('photo.removeTitle'), body: t('photo.removeBody'), confirmLabel: t('photo.removeConfirm') }}
        />
        <b className="mt-3 block break-words text-text">{fullName(user.firstName, user.lastName)}</b>
        <div className="mt-3">
          <p className="m-0 mb-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-text-muted">{t('roles')}</p>
          <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
            {user.securityRoles.length === 0 && <li className="text-[12px] text-text-muted">{t('noRoles')}</li>}
            {user.securityRoles.map((r) => (
              <li key={r.code}>
                <Badge tone="neutral" title={r.code}>
                  {r.name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <FormProvider {...form}>
          <form noValidate onSubmit={(e) => void onSubmit(e)}>
            <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field label={t('fields.email')} hint={t('fields.emailHint')} className="sm:col-span-2">
                  {(p) => <Input {...p} value={user.email} readOnly type="email" />}
                </Field>
                <Field label={t('fields.firstName')} required error={err('firstName')}>
                  {(p) => <Input {...p} {...register('firstName')} maxLength={50} autoComplete="given-name" />}
                </Field>
                <Field label={t('fields.lastName')} required error={err('lastName')}>
                  {(p) => <Input {...p} {...register('lastName')} maxLength={50} autoComplete="family-name" />}
                </Field>
                <Field label={t('fields.mobilePhone')} error={err('mobilePhone')}>
                  {(p) => <Input {...p} {...register('mobilePhone')} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" />}
                </Field>
                <Field label={t('fields.language')} error={err('languageId')}>
                  {(p) => (
                    <NativeSelect {...p} {...register('languageId')}>
                      <option value="">{t('fields.selectLanguage')}</option>
                      {lookups.languages.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label={t('fields.timeZone')} error={err('timeZoneName')} className="sm:col-span-2">
                  {(p) => (
                    <Controller
                      control={control}
                      name="timeZoneName"
                      render={({ field }) => (
                        <Combobox
                          {...p}
                          value={field.value || undefined}
                          onChange={(v) => field.onChange(v ?? '')}
                          options={tzOptions}
                          placeholder={t('fields.selectTimeZone')}
                          searchLabel={t('fields.searchTimeZones')}
                        />
                      )}
                    />
                  )}
                </Field>
              </div>
              <div className="mt-3.5">
                <AddressFields countries={lookups.countries} states={lookups.states} />
              </div>
            </fieldset>
            <div className="mt-5 flex justify-end sm:justify-start">
              <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
                {t('save')}
              </Button>
            </div>
          </form>
        </FormProvider>
      </Card>
      {guard.dialog}
    </div>
  );
}
