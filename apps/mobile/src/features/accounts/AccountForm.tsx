import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import {
  PERMISSIONS,
  accountFormSchema,
  countryRule,
  hasPermission,
  validateAccountForPublish,
  type Account,
  type AccountDetailResponse,
  type AccountFormData,
  type AccountFormValues,
  type AccountLookups,
  type SaveMode,
} from '@crm/contracts';
import { ActionBar, Button, Centered, ConfirmSheet, Notice, Text } from '@/components';
import { FormMultiSelect, FormSection, FormSelect, FormSwitch, FormText } from '@/features/forms/fields';
import { BrandingSection, type PendingImages } from './BrandingSection';
import { useCurrentUser } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { haptics } from '@/lib/haptics';

type AccountState = 'new' | 'draft' | 'registered';

export function toAccountFormValues(a: Account | null): AccountFormValues {
  return {
    name: a?.name ?? '',
    languageId: a?.languageId,
    timeZoneName: a?.timeZoneName,
    labelVerticalId: a?.labelVerticalId ?? null,
    frameworkIds: a?.frameworkIds ?? [],
    requireMfa: a?.requireMfa ?? false,
    active: a?.active ?? true,
    mainContactFirstName: a?.mainContact.firstName ?? '',
    mainContactLastName: a?.mainContact.lastName ?? '',
    mainContactEmail: a?.mainContact.email ?? '',
    mainContactMobile: a?.mainContact.mobile ?? '',
    mainContactPhone: a?.mainContact.phone ?? '',
    countryId: a?.countryId,
    address: a?.address ?? '',
    city: a?.city ?? '',
    stateId: a?.stateId,
    postalCode: a?.postalCode ?? '',
  };
}

export function AccountForm({ account, lookups }: { account: Account | null; lookups: AccountLookups }) {
  const { t } = useTranslation(['accounts', 'common']);
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const toast = useToast();
  const user = useCurrentUser();
  const { spacing } = useTheme();

  const state: AccountState = !account ? 'new' : account.status === 'draft' ? 'draft' : 'registered';
  const canEdit = hasPermission(user, PERMISSIONS.ACCOUNTS, state === 'new' ? 'create' : 'update');
  const [editing, setEditing] = useState(state === 'new');
  const [saving, setSaving] = useState<SaveMode | 'update' | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<AccountFormData | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImages>({});
  const ro = !editing;

  const form = useForm<AccountFormValues, unknown, AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: toAccountFormValues(account),
    mode: 'onTouched',
  });
  const { control, handleSubmit, reset, setError, clearErrors, formState } = form;

  // Re-sync when the server copy changes while not editing (e.g. after a save or refetch).
  useEffect(() => {
    if (!editing) reset(toAccountFormValues(account));
  }, [account, editing, reset]);

  const countryId = useWatch({ control, name: 'countryId' }) as number | undefined;
  const countryCodeOf = useMemo(() => {
    const map = new Map(lookups.countries.map((c) => [c.value, c.code]));
    return (id: number | undefined) => (id === undefined ? undefined : map.get(Number(id)));
  }, [lookups.countries]);
  const rule = countryRule(countryCodeOf(countryId));

  // Warn before leaving with unsaved edits.
  const dirtyRef = useRef(false);
  dirtyRef.current = editing && (formState.isDirty || !!pendingImages.logo || !!pendingImages.signin) && saving === null;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        Alert.alert(t('common:unsaved.title'), t('common:unsaved.body'), [
          { text: t('common:actions.stay'), style: 'cancel' },
          { text: t('common:actions.discard'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, t],
  );

  const options = useMemo(
    () => ({
      languages: lookups.languages.map((o) => ({ value: o.value, label: o.label })),
      timeZones: lookups.timeZones.map((o) => ({ value: o.value, label: o.label })),
      countries: lookups.countries.map((o) => ({ value: o.value, label: o.label })),
      states: lookups.states.map((o) => ({ value: o.value, label: o.label })),
      frameworks: lookups.frameworks.map((o) => ({ value: o.value, label: o.label })),
      labels: lookups.labelVerticals.map((v) => ({ value: v.id, label: v.name, description: v.description })),
    }),
    [lookups],
  );

  const applyErrors = (errors: Record<string, string>) => {
    for (const [key, message] of Object.entries(errors)) {
      setError(key as Path<AccountFormValues>, { type: 'server', message });
    }
    const n = Object.keys(errors).length;
    if (n) {
      haptics.error();
      toast.error(t('common:errors.fixFieldsCount', { count: n }));
    }
  };

  const fullValidation = (data: AccountFormData) => {
    clearErrors();
    const errors = validateAccountForPublish(data, countryCodeOf);
    if (Object.keys(errors).length) {
      applyErrors(errors);
      return false;
    }
    return true;
  };

  const afterSave = async (saved: Account, message: string) => {
    const detail = qc.getQueryData<AccountDetailResponse>(queryKeys.accounts.detail(saved.id));
    qc.setQueryData<AccountDetailResponse>(queryKeys.accounts.detail(saved.id), {
      lookups: detail?.lookups ?? lookups,
      account: saved,
    });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.list({}) });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    haptics.success();
    toast.success(message);
  };

  const run = async (kind: SaveMode | 'update', fn: () => Promise<{ account: Account }>, message: string) => {
    setSaving(kind);
    try {
      const { account: saved } = await fn();
      if (state === 'new') {
        // Upload images picked before the account had an id.
        const failed: string[] = [];
        if (pendingImages.logo) {
          await api.accounts.uploadLogo(saved.id, pendingImages.logo.dataUrl).catch(() => failed.push('logo'));
        }
        if (pendingImages.signin) {
          await api.accounts
            .uploadSigninImage(saved.id, pendingImages.signin.dataUrl)
            .catch(() => failed.push('signin'));
        }
        setPendingImages({});
        if (failed.length) toast.error(t('toast.imagesPendingFailed'));
        dirtyRef.current = false;
        await afterSave(saved, message);
        void qc.invalidateQueries({ queryKey: queryKeys.accounts.detail(saved.id) });
        router.replace(`/accounts/${saved.id}`);
        return;
      }
      await afterSave(saved, message);
      setEditing(false);
      reset(toAccountFormValues(saved));
    } catch (err) {
      haptics.error();
      if (err instanceof ApiClientError && err.fieldErrors) applyErrors(err.fieldErrors);
      else toast.error(errorMessage(err, t('toast.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const saveDraft = handleSubmit((data) => {
    clearErrors();
    return run(
      'draft',
      () => (account ? api.accounts.update(account.id, data) : api.accounts.create('draft', data)),
      t('toast.draftSaved'),
    );
  }, onInvalid);

  const requestPublish = handleSubmit((data) => {
    if (fullValidation(data)) setConfirmPublish(data);
  }, onInvalid);

  const publish = async () => {
    const data = confirmPublish;
    if (!data) return;
    await run(
      'publish',
      () => (account ? api.accounts.publish(account.id, data) : api.accounts.create('publish', data)),
      t('toast.published', { name: data.name }),
    );
    setConfirmPublish(null);
  };

  const saveChanges = handleSubmit((data) => {
    if (!account || !fullValidation(data)) return;
    return run('update', () => api.accounts.update(account.id, data), t('toast.saved'));
  }, onInvalid);

  function onInvalid() {
    haptics.error();
    toast.error(t('common:errors.fixFields'));
  }

  const cancelEdit = () => {
    reset(toAccountFormValues(account));
    setPendingImages({});
    setEditing(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 48 }}>
        <Centered style={{ padding: spacing.lg, gap: spacing.lg }}>
          {state !== 'new' && canEdit && !editing ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text tone="muted" variant="small">
                {t('detail.viewing')}
              </Text>
              <Button title={t('common:actions.edit')} icon="create-outline" size="sm" variant="secondary" onPress={() => setEditing(true)} />
            </View>
          ) : null}
          {state === 'draft' && editing ? (
            <Notice tone="warning" icon="document-text-outline">
              {t('detail.draftNotice')}
            </Notice>
          ) : null}

          <FormSection title={t('sections.company')}>
            <FormText control={control} name="name" label={t('fields.name')} required readOnly={ro} maxLength={100} />
            <FormSelect control={control} name="languageId" label={t('fields.language')} options={options.languages} readOnly={ro} />
            <FormSelect
              control={control}
              name="timeZoneName"
              label={t('fields.timeZone')}
              options={options.timeZones}
              readOnly={ro}
              searchable
            />
            {options.labels.length ? (
              <FormSelect
                control={control}
                name="labelVerticalId"
                label={t('fields.labelPreset')}
                options={options.labels}
                noneLabel={t('common:select.none')}
                readOnly={ro || state === 'registered'}
                helper={state === 'registered' ? undefined : t('fields.labelPresetHint')}
              />
            ) : null}
            <FormMultiSelect
              control={control}
              name="frameworkIds"
              label={t('fields.frameworks')}
              options={options.frameworks}
              readOnly={ro}
              helper={t('fields.frameworksHint')}
            />
            <FormSwitch control={control} name="requireMfa" label={t('fields.requireMfa')} disabled={ro} />
            {state === 'registered' ? (
              <FormSwitch
                control={control}
                name="active"
                label={t('fields.active')}
                description={t('fields.activeHint')}
                disabled={ro}
              />
            ) : null}
          </FormSection>

          <FormSection title={t('sections.administrator')} subtitle={t('sections.administratorHint')}>
            <FormText control={control} name="mainContactFirstName" label={t('fields.firstName')} readOnly={ro} textContentType="givenName" autoComplete="given-name" maxLength={50} />
            <FormText control={control} name="mainContactLastName" label={t('fields.lastName')} readOnly={ro} textContentType="familyName" autoComplete="family-name" maxLength={50} />
            <FormText
              control={control}
              name="mainContactEmail"
              label={t('fields.email')}
              readOnly={ro}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              maxLength={100}
            />
            <FormText control={control} name="mainContactMobile" label={t('fields.mobile')} readOnly={ro} keyboardType="phone-pad" textContentType="telephoneNumber" helper={t('fields.mobileHint')} />
            <FormText control={control} name="mainContactPhone" label={t('fields.phone')} readOnly={ro} keyboardType="phone-pad" textContentType="telephoneNumber" />
          </FormSection>

          <FormSection title={t('sections.address')}>
            <FormSelect control={control} name="countryId" label={t('common:address.country')} options={options.countries} readOnly={ro} searchable />
            <FormText control={control} name="address" label={t('common:address.address')} readOnly={ro} textContentType="fullStreetAddress" maxLength={200} />
            <FormText control={control} name="city" label={t('common:address.city')} readOnly={ro} textContentType="addressCity" maxLength={100} />
            {rule.usesStates ? (
              <FormSelect control={control} name="stateId" label={rule.stateLabel} options={options.states} readOnly={ro} searchable />
            ) : null}
            <FormText
              control={control}
              name="postalCode"
              label={rule.postalLabel}
              readOnly={ro}
              helper={rule.postalHint}
              autoCapitalize="characters"
              textContentType="postalCode"
              maxLength={20}
            />
          </FormSection>

          <BrandingSection
            accountId={account?.id ?? null}
            logoUrl={account?.logoUrl}
            signinUrl={account?.signinBackgroundImageUrl}
            canEdit={canEdit && (state !== 'new' || editing)}
            pending={pendingImages}
            onPending={(kind, img) => setPendingImages((p) => ({ ...p, [kind]: img }))}
          />
        </Centered>
      </ScrollView>

      {editing && canEdit ? (
        <ActionBar>
          {state === 'new' ? (
            <>
              <Button title={t('actions.saveAsDraft')} variant="secondary" flex loading={saving === 'draft'} disabled={saving !== null} onPress={saveDraft} />
              <Button title={t('actions.publish')} icon="paper-plane-outline" flex loading={saving === 'publish'} disabled={saving !== null} onPress={requestPublish} />
            </>
          ) : state === 'draft' ? (
            <>
              <Button title={t('common:actions.cancel')} variant="ghost" onPress={cancelEdit} disabled={saving !== null} />
              <Button title={t('actions.saveDraft')} variant="secondary" flex loading={saving === 'draft'} disabled={saving !== null} onPress={saveDraft} />
              <Button title={t('actions.publish')} icon="paper-plane-outline" flex loading={saving === 'publish'} disabled={saving !== null} onPress={requestPublish} />
            </>
          ) : (
            <>
              <Button title={t('common:actions.cancel')} variant="secondary" flex onPress={cancelEdit} disabled={saving !== null} />
              <Button title={t('actions.saveChanges')} flex loading={saving === 'update'} onPress={saveChanges} />
            </>
          )}
        </ActionBar>
      ) : null}

      <ConfirmSheet
        visible={!!confirmPublish}
        title={t('publish.title', { name: confirmPublish?.name ?? '' })}
        confirmLabel={t('publish.confirm')}
        loading={saving === 'publish'}
        onCancel={() => setConfirmPublish(null)}
        onConfirm={publish}
        message={
          <View style={{ gap: 10 }}>
            <Text>
              <Trans
                t={t}
                i18nKey="publish.welcome"
                values={{ email: String(confirmPublish?.mainContactEmail ?? '') }}
                components={{ b: <Text weight="bold" /> }}
              />
            </Text>
            <Text tone="muted" variant="small">
              {t('publish.summary')}
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}
