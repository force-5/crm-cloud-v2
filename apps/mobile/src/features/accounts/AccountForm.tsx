import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
        Alert.alert('Discard changes?', 'You have unsaved changes on this account.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
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
      toast.error(`Please fix ${n} field${n === 1 ? '' : 's'} to continue`);
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
            .catch(() => failed.push('sign-in image'));
        }
        setPendingImages({});
        if (failed.length) toast.error(`Account saved, but the ${failed.join(' and ')} failed to upload`);
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
      else toast.error(errorMessage(err, 'Could not save the account'));
    } finally {
      setSaving(null);
    }
  };

  const saveDraft = handleSubmit((data) => {
    clearErrors();
    return run(
      'draft',
      () => (account ? api.accounts.update(account.id, data) : api.accounts.create('draft', data)),
      'Draft saved',
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
      'Account published',
    );
    setConfirmPublish(null);
  };

  const saveChanges = handleSubmit((data) => {
    if (!account || !fullValidation(data)) return;
    return run('update', () => api.accounts.update(account.id, data), 'Changes saved');
  }, onInvalid);

  function onInvalid() {
    haptics.error();
    toast.error('Please check the highlighted fields');
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
                Viewing account details
              </Text>
              <Button title="Edit" icon="create-outline" size="sm" variant="secondary" onPress={() => setEditing(true)} />
            </View>
          ) : null}
          {state === 'draft' && editing ? (
            <Notice tone="warning" icon="document-text-outline">
              This account is a draft. Only the company name is needed to save it; publishing requires every
              required field.
            </Notice>
          ) : null}

          <FormSection title="Company">
            <FormText control={control} name="name" label="Company name" required readOnly={ro} maxLength={100} />
            <FormSelect control={control} name="languageId" label="Language" options={options.languages} readOnly={ro} />
            <FormSelect
              control={control}
              name="timeZoneName"
              label="Time zone"
              options={options.timeZones}
              readOnly={ro}
              searchable
            />
            {options.labels.length ? (
              <FormSelect
                control={control}
                name="labelVerticalId"
                label="Label preset"
                options={options.labels}
                noneLabel="None"
                readOnly={ro || state === 'registered'}
                helper={state === 'registered' ? undefined : 'Applied when the account is published'}
              />
            ) : null}
            <FormMultiSelect
              control={control}
              name="frameworkIds"
              label="Frameworks"
              options={options.frameworks}
              readOnly={ro}
              helper="Drives which kiosks and areas are created at publish"
            />
            <FormSwitch control={control} name="requireMfa" label="Require 2-factor authentication" disabled={ro} />
            {state === 'registered' ? (
              <FormSwitch
                control={control}
                name="active"
                label="Active"
                description="Inactive accounts can't sign in"
                disabled={ro}
              />
            ) : null}
          </FormSection>

          <FormSection title="Administrator" subtitle="The main contact. Their email becomes the admin login.">
            <FormText control={control} name="mainContactFirstName" label="First name" readOnly={ro} textContentType="givenName" autoComplete="given-name" maxLength={50} />
            <FormText control={control} name="mainContactLastName" label="Last name" readOnly={ro} textContentType="familyName" autoComplete="family-name" maxLength={50} />
            <FormText
              control={control}
              name="mainContactEmail"
              label="Email"
              readOnly={ro}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              maxLength={100}
            />
            <FormText control={control} name="mainContactMobile" label="Mobile" readOnly={ro} keyboardType="phone-pad" textContentType="telephoneNumber" helper="e.g. +1 555 123 4567" />
            <FormText control={control} name="mainContactPhone" label="Office phone" readOnly={ro} keyboardType="phone-pad" textContentType="telephoneNumber" />
          </FormSection>

          <FormSection title="Address">
            <FormSelect control={control} name="countryId" label="Country" options={options.countries} readOnly={ro} searchable />
            <FormText control={control} name="address" label="Address" readOnly={ro} textContentType="fullStreetAddress" maxLength={200} />
            <FormText control={control} name="city" label="City" readOnly={ro} textContentType="addressCity" maxLength={100} />
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
              <Button title="Save as draft" variant="secondary" flex loading={saving === 'draft'} disabled={saving !== null} onPress={saveDraft} />
              <Button title="Publish" icon="paper-plane-outline" flex loading={saving === 'publish'} disabled={saving !== null} onPress={requestPublish} />
            </>
          ) : state === 'draft' ? (
            <>
              <Button title="Cancel" variant="ghost" onPress={cancelEdit} disabled={saving !== null} />
              <Button title="Save draft" variant="secondary" flex loading={saving === 'draft'} disabled={saving !== null} onPress={saveDraft} />
              <Button title="Publish" icon="paper-plane-outline" flex loading={saving === 'publish'} disabled={saving !== null} onPress={requestPublish} />
            </>
          ) : (
            <>
              <Button title="Cancel" variant="secondary" flex onPress={cancelEdit} disabled={saving !== null} />
              <Button title="Save changes" flex loading={saving === 'update'} onPress={saveChanges} />
            </>
          )}
        </ActionBar>
      ) : null}

      <ConfirmSheet
        visible={!!confirmPublish}
        title="Publish this account?"
        confirmLabel="Publish"
        loading={saving === 'publish'}
        onCancel={() => setConfirmPublish(null)}
        onConfirm={publish}
        message={
          <View style={{ gap: 10 }}>
            <Text>
              The welcome email with login credentials will be sent to{' '}
              <Text weight="bold">{String(confirmPublish?.mainContactEmail ?? '')}</Text>.
            </Text>
            <Text tone="muted" variant="small">
              Publishing creates the administrator user, the facility with kiosks and areas for the selected
              frameworks, and the default KIOSK and ADMIN licenses. It can't be undone.
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}
