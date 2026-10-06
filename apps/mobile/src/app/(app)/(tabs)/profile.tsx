import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

const MFA_OPTIONS = [
  { value: 'sms', label: 'Text message' },
  { value: 'totp', label: 'Authenticator app' },
] as const;

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
  const sessionUser = useCurrentUser();
  const { signOut, updateUser } = useSession();
  const { preference, setPreference } = useTheme();
  const toast = useToast();
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
      toast.success('Photo updated');
    } catch (err) {
      haptics.error();
      toast.error(errorMessage(err, 'Could not update your photo'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () =>
    Alert.alert('Remove your photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setPhotoBusy(true);
          try {
            await api.profile.removePhoto();
            syncUser({ profileImageUrl: undefined });
            toast.success('Photo removed');
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setPhotoBusy(false);
          }
        },
      },
    ]);

  const changeTheme = (t: ThemeName) => {
    setPreference(t); // applied instantly and cached on the device
    prefs.mutate({ themeName: t }, { onError: () => toast.error('Theme saved on this device only') });
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut('manual') },
    ]);

  return (
    <Screen
      edges={['top']}
      keyboard
      refreshing={profile.isRefetching}
      onRefresh={() => profile.refetch()}
    >
      <ScreenHeader title="Profile" />

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
          <Button title={user.profileImageUrl ? 'Change photo' : 'Add photo'} icon="camera-outline" size="sm" variant="secondary" loading={photoBusy} onPress={changePhoto} />
          {user.profileImageUrl ? (
            <Button title="Remove" size="sm" variant="ghost" disabled={photoBusy} onPress={removePhoto} />
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

      <Card title="Appearance" subtitle="Applies to this app on all your devices">
        <Segmented options={THEME_OPTIONS} value={preference} onChange={changeTheme} />
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" full onPress={confirmSignOut} />
      <Text variant="caption" tone="subtle" center>
        Force 5 CRM {Constants.expoConfig?.version ?? ''}
        {__DEV__ ? `\n${API_URL}` : ''}
      </Text>
    </Screen>
  );
}

function ProfileForm({ data, onSaved }: { data: ProfileResponse; onSaved: (r: ProfileResponse) => void }) {
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
      toast.success('Profile saved');
    } catch (err) {
      haptics.error();
      if (err instanceof ApiClientError && err.fieldErrors) {
        for (const [k, m] of Object.entries(err.fieldErrors)) setError(k as keyof ProfileFormValues, { message: m });
      } else toast.error(errorMessage(err, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  });

  return (
    <FormSection title="Your details">
      <FormText control={control} name="firstName" label="First name" required textContentType="givenName" maxLength={50} />
      <FormText control={control} name="lastName" label="Last name" required textContentType="familyName" maxLength={50} />
      <FormText control={control} name="mobilePhone" label="Mobile" keyboardType="phone-pad" textContentType="telephoneNumber" />
      <FormText control={control} name="address" label="Address" textContentType="fullStreetAddress" maxLength={200} />
      <FormText control={control} name="city" label="City" textContentType="addressCity" maxLength={100} />
      <FormSelect control={control} name="countryId" label="Country" options={options.countries} searchable />
      {rule.usesStates ? (
        <FormSelect control={control} name="stateId" label={rule.stateLabel} options={options.states} searchable />
      ) : null}
      <FormText control={control} name="postalCode" label={rule.postalLabel} helper={rule.postalHint} autoCapitalize="characters" maxLength={20} />
      <FormSelect control={control} name="languageId" label="Language" options={options.languages} />
      <FormSelect control={control} name="timeZoneName" label="Time zone" options={options.timeZones} searchable />
      <Button title="Save profile" full loading={saving} disabled={!formState.isDirty} onPress={save} />
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
  const toast = useToast();
  const locked = user.tenant.requireMfa;
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
      toast.error(errorMessage(err, 'Could not update two-factor settings'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chooseMethod = async (type: MfaType) => {
    if (type === 'sms' && !user.mobilePhone) {
      toast.error('Add a mobile number to your profile first');
      return;
    }
    if (type === 'totp') {
      try {
        setTotp(await api.profile.enrollTotp());
      } catch (err) {
        toast.error(errorMessage(err, 'Could not start authenticator setup'));
        return;
      }
    } else setTotp(null);
    await apply({ mfaEnabled: true, mfaType: type }, 'Two-factor method updated');
  };

  return (
    <Card title="Security" subtitle="Two-factor authentication" style={{ gap: 14 }}>
      {locked ? <Notice tone="info" icon="shield-checkmark-outline">Required by your organization</Notice> : null}
      <SwitchRow
        label="Two-factor authentication"
        description="Ask for a code when you sign in"
        value={enabled}
        disabled={locked || busy}
        onValueChange={(v) =>
          void apply(
            v ? { mfaEnabled: true, mfaType: user.mfaType ?? 'sms' } : { mfaEnabled: false },
            v ? 'Two-factor authentication on' : 'Two-factor authentication off',
          )
        }
      />
      {enabled ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">
            Method
          </Text>
          <Segmented options={MFA_OPTIONS} value={user.mfaType ?? 'sms'} onChange={(t) => void chooseMethod(t)} disabled={busy} />
          {(user.mfaType ?? 'sms') === 'sms' ? (
            <Text variant="small" tone="muted">
              {user.mobilePhone ? `Codes are texted to ${user.mobilePhone}.` : 'Add a mobile number to receive codes.'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {totp ? (
        <View style={{ gap: 8 }}>
          <Text variant="small">
            Add Force 5 CRM to your authenticator app, or enter this key manually:
          </Text>
          <Text selectable weight="black" style={{ letterSpacing: 2 }}>
            {totp.secret}
          </Text>
          <Button
            title="Open authenticator app"
            icon="key-outline"
            variant="secondary"
            onPress={() => Linking.openURL(totp.uri).catch(() => toast.error('No authenticator app found'))}
          />
        </View>
      ) : null}
      {busy ? <ActivityIndicator /> : null}
    </Card>
  );
}
