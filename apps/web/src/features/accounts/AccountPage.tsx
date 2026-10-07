import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { queryKeys } from '@crm/api-client';
import {
  ERROR_CODES,
  LOGO_ASPECT,
  LOGO_SIZE,
  PERMISSIONS,
  SIGNIN_IMAGE_ASPECT,
  SIGNIN_IMAGE_SIZE,
  type Account,
  type AccountDetailResponse,
  type AccountFormData,
  type AccountLookups,
} from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card, CardDescription, CardTitle, Notice, Skeleton } from '@/components/ui/misc';
import { SwitchRow } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox, MultiSelectChips } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/overlays';
import { AddressFields } from '@/components/AddressFields';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { ImageCropUpload } from '@/components/ImageCropUpload';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge, type StatusKind } from '@/components/StatusBadge';
import { useUnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useApi } from '@/lib/api';
import { useFormatDate } from '@/lib/dates';
import { applyFieldErrors, errorMessage, isApiError } from '@/lib/errors';
import { useCan } from '@/lib/permissions';
import { LicensesTab } from '@/features/licenses/LicensesTab';
import { useAccountDetail } from './api';
import { ACCOUNT_FIELDS, toFormState, validateAccountForm, type AccountFieldName, type AccountFormState } from './accountForm';
import { PublishDialog } from './PublishDialog';

export type AccountTab = 'details' | 'licenses';
type Kind = 'new' | 'draft' | 'registered';
type Action = 'draft' | 'publish' | 'save';

function kindOf(account: Account | null): Kind {
  if (!account) return 'new';
  return account.registeredDate ? 'registered' : 'draft';
}

/** `/accounts/new` and `/accounts/$accountId` (tabs Details · Licenses). */
export function AccountPage({
  accountId,
  tab,
  onTabChange,
}: {
  accountId: number | 'new';
  tab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
}) {
  const { t } = useTranslation('accounts');
  const detail = useAccountDetail(accountId);

  if (detail.isPending) return <AccountSkeleton />;
  if (detail.error || !detail.data) {
    const notFound = isApiError(detail.error) && detail.error.status === 404;
    return (
      <>
        <PageHeader title={notFound ? t('detail.notFoundTitle') : t('common:errors.loadFailed')} />
        <Card>
          {notFound ? (
            <EmptyState
              title={t('detail.notFoundTitle')}
              description={t('detail.notFoundBody')}
              action={
                <Button asChild variant="secondary">
                  <Link to="/accounts">{t('shell:nav.accounts')}</Link>
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
  return <AccountEditor key={String(accountId)} response={detail.data} tab={tab} onTabChange={onTabChange} />;
}

function AccountSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-2 h-3 w-40" />
      <Skeleton className="mb-6 h-8 w-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="crm-card space-y-3 p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountEditor({
  response,
  tab,
  onTabChange,
}: {
  response: AccountDetailResponse;
  tab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
}) {
  const { t } = useTranslation('accounts');
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const formatDate = useFormatDate();
  const { account, lookups } = response;
  const kind = kindOf(account);
  const canEdit = useCan(PERMISSIONS.ACCOUNTS, kind === 'new' ? 'create' : 'update');
  const form = useForm<AccountFormState>({ defaultValues: toFormState(account) });
  const [pendingLogo, setPendingLogo] = React.useState<string | null>(null);
  const [pendingSignin, setPendingSignin] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<Action | null>(null);
  const [publishData, setPublishData] = React.useState<AccountFormData | null>(null);

  const dirty = form.formState.isDirty || !!pendingLogo || !!pendingSignin;
  const guard = useUnsavedChangesGuard(dirty && saving === null);

  const name = useWatch({ control: form.control, name: 'name' });
  const title = kind === 'new' ? t('detail.newTitle') : account?.name ?? '';

  // ---- validation -----------------------------------------------------------------------------

  const showErrors = (errors: Partial<Record<AccountFieldName, string>>) => {
    let first = true;
    for (const field of ACCOUNT_FIELDS) {
      const message = errors[field];
      if (!message) continue;
      form.setError(field, { type: 'validate', message }, { shouldFocus: first });
      first = false;
    }
    if (tab !== 'details') onTabChange('details');
    toast.error(t('common:errors.fixFields'));
  };

  // ---- persistence ------------------------------------------------------------------------------

  const commit = (saved: Account) => {
    qc.setQueryData<AccountDetailResponse>(queryKeys.accounts.detail(saved.id), { account: saved, lookups });
    void qc.invalidateQueries({ queryKey: ['accounts', 'list'] });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    form.reset(toFormState(saved));
  };

  const uploadPending = async (saved: Account): Promise<Account> => {
    let result = saved;
    let failed = false;
    if (pendingLogo) {
      try {
        const { url } = await api.accounts.uploadLogo(saved.id, pendingLogo);
        result = { ...result, logoUrl: url };
      } catch {
        failed = true;
      }
    }
    if (pendingSignin) {
      try {
        const { url } = await api.accounts.uploadSigninImage(saved.id, pendingSignin);
        result = { ...result, signinBackgroundImageUrl: url };
      } catch {
        failed = true;
      }
    }
    if (failed) toast.error(t('toast.imagesPendingFailed'));
    setPendingLogo(null);
    setPendingSignin(null);
    return result;
  };

  const save = async (action: Action, data: AccountFormData): Promise<void> => {
    setSaving(action);
    try {
      if (kind === 'new') {
        const { account: created } = await api.accounts.create(action === 'publish' ? 'publish' : 'draft', data);
        const saved = await uploadPending(created);
        commit(saved);
        toast.success(action === 'publish' ? t('toast.published', { name: saved.name }) : t('toast.draftCreated'));
        guard.allowNextNavigation();
        await navigate({ to: '/accounts/$accountId', params: { accountId: saved.id }, replace: true });
        return;
      }
      if (!account) return;
      if (kind === 'draft' && action === 'publish') {
        try {
          const { account: published } = await api.accounts.publish(account.id, data);
          commit(published);
          toast.success(t('toast.published', { name: published.name }));
        } catch (err) {
          if (isApiError(err) && err.code === ERROR_CODES.NOT_SUPPORTED) {
            // VMS can't publish an existing draft yet (V3): keep the user's edits as a draft.
            const { account: drafted } = await api.accounts.update(account.id, data);
            commit(drafted);
            toast.warning(t('toast.publishNotSupported'), { duration: 10_000 });
            return;
          }
          throw err;
        }
        return;
      }
      const { account: updated } = await api.accounts.update(account.id, data);
      commit(updated);
      toast.success(kind === 'draft' ? t('toast.draftSaved') : t('toast.saved'));
    } catch (err) {
      if (applyFieldErrors(err, form.setError, ACCOUNT_FIELDS)) {
        if (tab !== 'details') onTabChange('details');
        toast.error(t('common:errors.fixFields'));
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSaving(null);
    }
  };

  const run = (action: Action) =>
    form.handleSubmit(async (values) => {
      form.clearErrors();
      const result = validateAccountForm(values, action === 'draft' ? 'draft' : 'full', lookups);
      if (!result.ok) {
        showErrors(result.errors);
        return;
      }
      if (action === 'publish') {
        setPublishData(result.data);
        return;
      }
      await save(action, result.data);
    })();

  // ---- images -------------------------------------------------------------------------------------

  const uploadNow = (which: 'logo' | 'signin', label: string) => async (dataUrl: string) => {
    if (!account) return;
    try {
      const { url } =
        which === 'logo' ? await api.accounts.uploadLogo(account.id, dataUrl) : await api.accounts.uploadSigninImage(account.id, dataUrl);
      qc.setQueryData<AccountDetailResponse>(queryKeys.accounts.detail(account.id), (prev) =>
        prev?.account
          ? { ...prev, account: { ...prev.account, ...(which === 'logo' ? { logoUrl: url } : { signinBackgroundImageUrl: url }) } }
          : prev,
      );
      toast.success(t('toast.imageUploaded', { label }));
    } catch (err) {
      toast.error(t('toast.imageFailed', { label, message: errorMessage(err) }));
      throw err;
    }
  };

  // ---- render -------------------------------------------------------------------------------------

  const status: StatusKind = kind === 'new' ? 'new' : kind === 'draft' ? 'draft' : account?.status ?? 'active';
  const busy = saving !== null;
  const actions = !canEdit ? null : kind === 'registered' ? (
    <Button variant="primary" onClick={() => void run('save')} loading={saving === 'save'} disabled={busy}>
      {t('actions.saveChanges')}
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={() => void run('draft')} loading={saving === 'draft'} disabled={busy}>
        {kind === 'new' ? t('actions.saveAsDraft') : t('actions.saveDraft')}
      </Button>
      <Button variant="primary" onClick={() => void run('publish')} loading={saving === 'publish'} disabled={busy}>
        {t('actions.publish')}
      </Button>
    </>
  );

  const subtitle =
    kind === 'new' ? t('detail.newSubtitle') : kind === 'draft' ? t('detail.draftSubtitle') : account?.registeredDate
      ? account.registeredBy
        ? t('detail.registered', { date: formatDate(account.registeredDate), who: account.registeredBy })
        : t('detail.registeredNoBy', { date: formatDate(account.registeredDate) })
      : undefined;

  const frameworkNames = (publishData?.frameworkIds ?? [])
    .map((id) => lookups.frameworks.find((f) => f.value === id)?.label)
    .filter((x): x is string => !!x);
  const presetName = publishData?.labelVerticalId ? lookups.labelVerticals.find((v) => v.id === publishData.labelVerticalId)?.name : undefined;

  const licensesDisabled = kind === 'new';

  return (
    <FormProvider {...form}>
      <PageHeader
        title={title}
        crumbLabel={kind === 'new' ? t('detail.newTitle') : account?.name}
        badge={<StatusBadge status={status} />}
        subtitle={subtitle}
        actions={tab === 'details' ? actions : undefined}
        formActions={tab === 'details'}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          // The Licenses tab stays focusable while unavailable (so its tooltip can explain why); never activate it.
          if (v === 'licenses' && licensesDisabled) return;
          onTabChange(v === 'licenses' ? 'licenses' : 'details');
        }}
      >
        <TabsList aria-label={t('detail.tabs.label')}>
          <TabsTrigger value="details">{t('detail.tabs.details')}</TabsTrigger>
          {licensesDisabled ? (
            // aria-disabled, not `disabled`: a disabled button can't show a tooltip, and wrapping it in a
            // focusable <span> put an invalid child inside the tablist (axe aria-required-children).
            <Tooltip content={t('detail.tabs.licensesDisabled')}>
              <TabsTrigger value="licenses" aria-disabled="true" className="cursor-not-allowed opacity-50 hover:text-text-muted">
                {t('detail.tabs.licenses')}
              </TabsTrigger>
            </Tooltip>
          ) : (
            <TabsTrigger value="licenses">{t('detail.tabs.licenses')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" forceMount hidden={tab !== 'details'} className="outline-none">
          {kind !== 'registered' && (
            <Notice icon={<Info />} className="mb-3.5">
              <b>{t('detail.draftNoticeStrong')}</b> {t('detail.draftNoticeRest')}
            </Notice>
          )}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void run(kind === 'registered' ? 'save' : 'draft');
            }}
          >
            <fieldset disabled={!canEdit || busy} className="m-0 grid min-w-0 gap-4 border-0 p-0 lg:grid-cols-2">
              <CompanyCard lookups={lookups} kind={kind} />
              <AdministratorCard required={kind === 'registered'} />
              <Card>
                <CardTitle className="mb-4">{t('sections.address')}</CardTitle>
                <AddressFields countries={lookups.countries} states={lookups.states} withProvince required={kind === 'registered'} />
              </Card>
              <Card>
                <CardTitle className="mb-4">{t('sections.branding')}</CardTitle>
                <ImageCropUpload
                  label={t('fields.logo')}
                  aspect={LOGO_ASPECT}
                  output={LOGO_SIZE}
                  variant="logo"
                  value={kind === 'new' ? pendingLogo : account?.logoUrl}
                  pending={!!pendingLogo}
                  onApply={kind === 'new' ? setPendingLogo : uploadNow('logo', t('fields.logo'))}
                  onRemove={kind === 'new' ? () => setPendingLogo(null) : undefined}
                  hint={t('fields.logoHint', { w: LOGO_SIZE.width / 2, h: LOGO_SIZE.height / 2 })}
                  disabled={!canEdit}
                />
                <ImageCropUpload
                  className="mt-4"
                  label={t('fields.signinImage')}
                  aspect={SIGNIN_IMAGE_ASPECT}
                  output={SIGNIN_IMAGE_SIZE}
                  variant="wide"
                  value={kind === 'new' ? pendingSignin : account?.signinBackgroundImageUrl}
                  pending={!!pendingSignin}
                  onApply={kind === 'new' ? setPendingSignin : uploadNow('signin', t('fields.signinImage'))}
                  onRemove={kind === 'new' ? () => setPendingSignin(null) : undefined}
                  hint={t('fields.signinImageHint')}
                  disabled={!canEdit}
                />
              </Card>
            </fieldset>
            {/* Enter in a text field saves (draft for unpublished accounts). */}
            <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
          </form>
        </TabsContent>

        <TabsContent value="licenses" className="outline-none">
          {account && tab === 'licenses' && <LicensesTab accountId={account.id} accountName={account.name} />}
        </TabsContent>
      </Tabs>

      <PublishDialog
        open={publishData !== null}
        onOpenChange={(open) => !open && setPublishData(null)}
        name={name || account?.name || ''}
        email={publishData?.mainContactEmail ?? ''}
        frameworks={frameworkNames}
        labelPreset={presetName}
        onConfirm={async () => {
          if (publishData) await save('publish', publishData);
        }}
      />
      {guard.dialog}
    </FormProvider>
  );
}

// ---- sections ---------------------------------------------------------------------------------------

function useFieldError(name: AccountFieldName): string | undefined {
  const { formState } = useFormContextSafe();
  const e = formState.errors[name];
  return typeof e?.message === 'string' ? e.message : undefined;
}

const useFormContextSafe = () => useFormContext<AccountFormState>();

function CompanyCard({ lookups, kind }: { lookups: AccountLookups; kind: Kind }) {
  const { t } = useTranslation('accounts');
  const { register, control } = useFormContextSafe();
  const required = kind === 'registered';
  const nameError = useFieldError('name');
  const languageError = useFieldError('languageId');
  const tzError = useFieldError('timeZoneName');
  const timeZoneOptions = React.useMemo(() => lookups.timeZones.map((z) => ({ value: z.value, label: z.label })), [lookups.timeZones]);
  const frameworkOptions = React.useMemo(() => lookups.frameworks.map((f) => ({ value: String(f.value), label: f.label })), [lookups.frameworks]);

  return (
    <Card>
      <CardTitle className="mb-4">{t('sections.company')}</CardTitle>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label={t('fields.name')} required error={nameError} className="sm:col-span-2">
          {(p) => <Input {...p} {...register('name')} maxLength={100} autoComplete="organization" />}
        </Field>
        <Field label={t('fields.language')} required={required} error={languageError}>
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
        <Field label={t('fields.timeZone')} required={required} error={tzError}>
          {(p) => (
            <Controller
              control={control}
              name="timeZoneName"
              render={({ field }) => (
                <Combobox
                  {...p}
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? '')}
                  options={timeZoneOptions}
                  placeholder={t('fields.selectTimeZone')}
                  searchLabel={t('fields.searchTimeZones')}
                />
              )}
            />
          )}
        </Field>
        {lookups.labelVerticals.length > 0 && (
          <Field label={t('fields.labelPreset')} hint={kind === 'registered' ? t('fields.labelPresetLocked') : undefined}>
            {(p) => (
              <NativeSelect {...p} {...register('labelVerticalId')} disabled={kind === 'registered'}>
                <option value="">{t('common:select.none')}</option>
                {lookups.labelVerticals.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}
        <Field label={t('fields.frameworks')} hint={t('fields.frameworksHint')} className={lookups.labelVerticals.length > 0 ? '' : 'sm:col-span-2'}>
          {(p) => (
            <Controller
              control={control}
              name="frameworkIds"
              render={({ field }) => (
                <MultiSelectChips
                  {...p}
                  values={field.value.map(String)}
                  onChange={(vals) => field.onChange(vals.map(Number))}
                  options={frameworkOptions}
                  placeholder={t('fields.chooseFrameworks')}
                  searchLabel={t('fields.searchFrameworks')}
                />
              )}
            />
          )}
        </Field>
      </div>
      <div className="mt-2">
        <Controller
          control={control}
          name="requireMfa"
          render={({ field }) => (
            <SwitchRow
              id="account-require-mfa"
              label={t('fields.requireMfa')}
              description={t('fields.requireMfaHint')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <SwitchRow id="account-active" label={t('fields.active')} description={t('fields.activeHint')} checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>
    </Card>
  );
}

function AdministratorCard({ required }: { required: boolean }) {
  const { t } = useTranslation('accounts');
  const { register } = useFormContextSafe();
  const errors = {
    first: useFieldError('mainContactFirstName'),
    last: useFieldError('mainContactLastName'),
    email: useFieldError('mainContactEmail'),
    mobile: useFieldError('mainContactMobile'),
    phone: useFieldError('mainContactPhone'),
  };
  return (
    <Card>
      <CardTitle>{t('sections.administrator')}</CardTitle>
      <CardDescription className="mb-4">{t('sections.administratorHint')}</CardDescription>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label={t('fields.firstName')} required={required} error={errors.first}>
          {(p) => <Input {...p} {...register('mainContactFirstName')} maxLength={50} autoComplete="off" />}
        </Field>
        <Field label={t('fields.lastName')} required={required} error={errors.last}>
          {(p) => <Input {...p} {...register('mainContactLastName')} maxLength={50} autoComplete="off" />}
        </Field>
        <Field label={t('fields.email')} required={required} error={errors.email} hint={t('fields.emailHint')} className="sm:col-span-2">
          {(p) => <Input {...p} {...register('mainContactEmail')} type="email" inputMode="email" autoCapitalize="none" maxLength={100} autoComplete="off" />}
        </Field>
        <Field label={t('fields.mobile')} required={required} error={errors.mobile} hint={t('fields.phoneHint')}>
          {(p) => <Input {...p} {...register('mainContactMobile')} type="tel" inputMode="tel" maxLength={20} autoComplete="off" />}
        </Field>
        <Field label={t('fields.phone')} error={errors.phone}>
          {(p) => <Input {...p} {...register('mainContactPhone')} type="tel" inputMode="tel" maxLength={20} autoComplete="off" />}
        </Field>
      </div>
    </Card>
  );
}
