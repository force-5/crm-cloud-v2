import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import {
  countryRule,
  profileFormSchema,
  type CurrentUser,
  type MfaType,
  type PreferencesRequest,
  type ProfileFormData,
  type ProfileFormValues,
  type ProfileResponse,
  type ThemeName,
  type TotpEnrollment,
} from '@crm/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  Notice,
  Screen,
  ScreenHeader,
  Segmented,
  SwitchRow,
  Text,
} from '@/components';
import { FormSection, FormSelect, FormText } from '@/features/forms/fields';
import { useCurrentUser, useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { fullName, initials } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { pickAndPrepareImage } from '@/lib/images';

/**
 * Authenticator apps stay off until VMS change V4: VMS doesn't verify TOTP codes yet, so enabling it would
 * make MFA accept any code. The BFF refuses it too (security review L6). Flip together with the web app.
 */
const TOTP_ENABLED = false;

const THEME_VALUES = ['light', 'dark', 'system'] as const satisfies ReadonlyArray<ThemeName>;

function toValues(u: CurrentUser): ProfileFormValues {
  return {
    firstName: u.firstName,
    lastName: u.lastName,
    mobilePhone: u.mobilePhone ?? '',
    address: u.address ?? '',
    city: u.city ?? '',
    countryId: u.countryId,
    stateId: u.stateId,
    postalCode: u.postalCode ?? '',
    languageId: u.languageId,
    timeZoneName: u.timeZoneName,
  };
}

export default function ProfileScreen() {
  const { t } = useTranslation(['profile', 'shell', 'common']);
  const sessionUser = useCurrentUser();
  const { signOut, updateUser } = useSession();
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const themeOptions = useMemo(() => THEME_VALUES.map((value) => ({ value, label: t(`shell:theme.${value}`) })), [t]);
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  // Show values from the API (plan §6.6), falling back to the session copy while loading.
  const user = profile.data?.user ?? sessionUser;

  const syncUser = (u: Partial<CurrentUser>) => {
    updateUser(u);
    qc.setQueryData<ProfileResponse>(queryKeys.profile, (old) => (old ? { ...old, user: { ...old.user, ...u } } : old));
  };

  const prefs = useMutation({
    mutationFn: (body: PreferencesRequest) => api.profile.preferences(body),
    onSuccess: ({ user: u }) => syncUser(u),
  });

  const [photoBusy, setPhotoBusy] = useState(false);
  const changePhoto = async () => {
    try {
      const img = await pickAndPrepareImage({ size: { width: 512, height: 512 }, format: 'jpeg' });
      if (!img) return;
      setPhotoBusy(true);
      const { profileImageUrl } = await api.profile.uploadPhoto(img.dataUrl);
      syncUser({ profileImageUrl });
      haptics.success();
      toast.success(t('photo.uploaded'));
    } catch (err) {
      haptics.error();
      toast.error(errorMessage(err, t('photo.failed')));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () =>
    Alert.alert(t('photo.removeTitle'), t('photo.removeBody'), [
      { text: t('common:actions.cancel'), style: 'cancel' },
      {
        text: t('common:actions.remove'),
        style: 'destructive',
        onPress: async () => {
          setPhotoBusy(true);
          try {
            await api.profile.removePhoto();
            syncUser({ profileImageUrl: undefined });
            toast.success(t('photo.removed'));
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setPhotoBusy(false);
          }
        },
      },
    ]);

  const changeTheme = (theme: ThemeName) => {
    setPreference(theme); // applied instantly and cached on the device
    prefs.mutate({ themeName: theme }, { onError: () => toast.error(t('shell:theme.saveFailed')) });
  };

  const confirmSignOut = () =>
    Alert.alert(t('shell:signOut.title'), undefined, [
      { text: t('common:actions.cancel'), style: 'cancel' },
      { text: t('shell:signOut.confirm'), style: 'destructive', onPress: () => void signOut('manual') },
    ]);

  return (
    <Screen
      edges={['top']}
      keyboard
      refreshing={profile.isRefetching}
      onRefresh={() => profile.refetch()}
    >
      <ScreenHeader title={t('title')} />

      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Avatar uri={user.profileImageUrl} initials={initials(user.firstName, user.lastName)} size={88} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="title">{fullName(user.firstName, user.lastName)}</Text>
          <Text tone="muted">{user.email}</Text>
          <Text variant="caption" tone="subtle">
            {user.tenant.name}
          </Text>
        </View>
        {user.securityRoles.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {user.securityRoles.map((r) => (
              <Badge key={r.code} label={r.name} tone="primary" />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={user.profileImageUrl ? t('photo.change') : t('photo.add')} icon="camera-outline" size="sm" variant="secondary" loading={photoBusy} onPress={changePhoto} />
          {user.profileImageUrl ? (
            <Button title={t('common:actions.remove')} size="sm" variant="ghost" disabled={photoBusy} onPress={removePhoto} />
          ) : null}
        </View>
      </Card>

      {profile.isPending ? (
        <ActivityIndicator />
      ) : profile.isError ? (
        <Card>
          <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        </Card>
      ) : (
        <ProfileForm data={profile.data} onSaved={(r) => {
          qc.setQueryData(queryKeys.profile, r);
          updateUser(r.user);
        }} />
      )}

      <SecurityCard user={user} onChange={(body) => prefs.mutateAsync(body)} />

      <Card title={t('appearance.title')} subtitle={t('appearance.hint')}>
        <Segmented options={themeOptions} value={preference} onChange={changeTheme} />
      </Card>

      <Button title={t('shell:signOut.confirm')} variant="danger" icon="log-out-outline" full onPress={confirmSignOut} />
      <Text variant="caption" tone="subtle" center>
        {t('shell:version', { version: Constants.expoConfig?.version ?? '' })}
        {__DEV__ ? `\n${API_URL}` : ''}
      </Text>
    </Screen>
  );
}

function ProfileForm({ data, onSaved }: { data: ProfileResponse; onSaved: (r: ProfileResponse) => void }) {
  const { t } = useTranslation(['profile', 'shell', 'common']);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { control, handleSubmit, reset, setError, formState } = useForm<ProfileFormValues, unknown, ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toValues(data.user),
    mode: 'onTouched',
  });
  useEffect(() => reset(toValues(data.user)), [data.user, reset]);

  const lk = data.lookups;
  const options = useMemo(
    () => ({
      languages: lk.languages.map((o) => ({ value: o.value, label: o.label })),
      timeZones: lk.timeZones.map((o) => ({ value: o.value, label: o.label })),
      countries: lk.countries.map((o) => ({ value: o.value, label: o.label })),
      states: lk.states.map((o) => ({ value: o.value, label: o.label })),
    }),
    [lk],
  );
  const countryId = useWatch({ control, name: 'countryId' }) as number | undefined;
  const rule = countryRule(lk.countries.find((c) => c.value === Number(countryId))?.code);

  const save = handleSubmit(async (values) => {
    setSaving(true);
    try {
      const r = await api.profile.update(values);
      onSaved(r);
      haptics.success();
      toast.success(t('saved'));
    } catch (err) {
      haptics.error();
      if (err instanceof ApiClientError && err.fieldErrors) {
        for (const [k, m] of Object.entries(err.fieldErrors)) setError(k as keyof ProfileFormValues, { message: m });
      } else toast.error(errorMessage(err, t('saveFailed')));
    } finally {
      setSaving(false);
    }
  });

  return (
    <FormSection title={t('details')}>
      <FormText control={control} name="firstName" label={t('fields.firstName')} required textContentType="givenName" maxLength={50} />
      <FormText control={control} name="lastName" label={t('fields.lastName')} required textContentType="familyName" maxLength={50} />
      <FormText control={control} name="mobilePhone" label={t('fields.mobilePhone')} keyboardType="phone-pad" textContentType="telephoneNumber" />
      <FormText control={control} name="address" label={t('common:address.address')} textContentType="fullStreetAddress" maxLength={200} />
      <FormText control={control} name="city" label={t('common:address.city')} textContentType="addressCity" maxLength={100} />
      <FormSelect control={control} name="countryId" label={t('common:address.country')} options={options.countries} searchable />
      {rule.usesStates ? (
        <FormSelect control={control} name="stateId" label={rule.stateLabel} options={options.states} searchable />
      ) : null}
      <FormText control={control} name="postalCode" label={rule.postalLabel} helper={rule.postalHint} autoCapitalize="characters" maxLength={20} />
      <FormSelect control={control} name="languageId" label={t('fields.language')} options={options.languages} />
      <FormSelect control={control} name="timeZoneName" label={t('fields.timeZone')} options={options.timeZones} searchable />
      <Button title={t('save')} full loading={saving} disabled={!formState.isDirty} onPress={save} />
    </FormSection>
  );
}

function SecurityCard({
  user,
  onChange,
}: {
  user: CurrentUser;
  onChange: (body: PreferencesRequest) => Promise<unknown>;
}) {
  const { t } = useTranslation(['profile', 'shell', 'common']);
  const toast = useToast();
  const locked = user.tenant.requireMfa;
  const mfaOptions = useMemo(
    () =>
      [
        { value: 'sms', label: t('security.smsShort') },
        { value: 'totp', label: t('security.totpShort'), disabled: !TOTP_ENABLED },
      ] as const satisfies ReadonlyArray<{ value: MfaType; label: string; disabled?: boolean }>,
    [t],
  );
  const enabled = locked || user.mfaEnabled;
  const [busy, setBusy] = useState(false);
  const [totp, setTotp] = useState<TotpEnrollment | null>(null);

  const apply = async (body: PreferencesRequest, message: string) => {
    setBusy(true);
    try {
      await onChange(body);
      haptics.success();
      toast.success(message);
      return true;
    } catch (err) {
      haptics.error();
      toast.error(errorMessage(err, t('security.updateFailed')));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chooseMethod = async (type: MfaType) => {
    if (type === 'sms' && !user.mobilePhone) {
      toast.error(t('security.smsNeedsPhone'));
      return;
    }
    if (type === 'totp') {
      if (!TOTP_ENABLED) return;
      try {
        setTotp(await api.profile.enrollTotp());
      } catch (err) {
        toast.error(errorMessage(err, t('security.totpStartFailed')));
        return;
      }
    } else setTotp(null);
    await apply({ mfaEnabled: true, mfaType: type }, t('security.methodSaved'));
  };

  return (
    <Card title={t('security.title')} subtitle={t('security.mfaTitle')} style={{ gap: 14 }}>
      {locked ? <Notice tone="info" icon="shield-checkmark-outline">{t('security.required')}</Notice> : null}
      <SwitchRow
        label={t('security.mfaEnable')}
        description={t('security.mfaHint')}
        value={enabled}
        disabled={locked || busy}
        onValueChange={(v) =>
          void apply(
            v ? { mfaEnabled: true, mfaType: user.mfaType ?? 'sms' } : { mfaEnabled: false },
            v ? t('security.enabled') : t('security.disabled'),
          )
        }
      />
      {enabled ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">
            {t('security.method')}
          </Text>
          <Segmented options={mfaOptions} value={user.mfaType ?? 'sms'} onChange={(t) => void chooseMethod(t)} disabled={busy} />
          {!TOTP_ENABLED ? (
            <Text variant="small" tone="muted">
              {t('security.totpUnavailable')}
            </Text>
          ) : null}
          {(user.mfaType ?? 'sms') === 'sms' ? (
            <Text variant="small" tone="muted">
              {user.mobilePhone ? t('security.smsTo', { phone: user.mobilePhone }) : t('security.smsNoPhone')}
            </Text>
          ) : null}
        </View>
      ) : null}
      {totp ? (
        <View style={{ gap: 8 }}>
          <Text variant="small">
            {t('security.totpManual')}
          </Text>
          <Text selectable weight="black" style={{ letterSpacing: 2 }}>
            {totp.secret}
          </Text>
          <Button
            title={t('security.totpOpen')}
            icon="key-outline"
            variant="secondary"
            onPress={() => Linking.openURL(totp.uri).catch(() => toast.error(t('security.totpNoApp')))}
          />
        </View>
      ) : null}
      {busy ? <ActivityIndicator /> : null}
    </Card>
  );
}
