import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES, loginRequestSchema, type LoginRequest } from '@crm/contracts';
import { Button, Notice, Text, TextField } from '@/components';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSession } from '@/providers/SessionProvider';
import { api, errorMessage, isApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const { applyLoginResult, signOutReason, clearSignOutReason } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    clearSignOutReason();
    try {
      const result = await api.auth.login(values);
      const next = applyLoginResult(result);
      if (next === 'ok') haptics.success();
      else if (next === 'select-account') router.push('/select-account');
      else router.push('/mfa');
    } catch (err) {
      haptics.error();
      setFormError(
        isApiError(err, ERROR_CODES.INVALID_CREDENTIALS) ? t('login.invalid') : errorMessage(err),
      );
    }
  });

  return (
    <AuthShell title={t('login.title')} subtitle={t('login.lead')}>
      {signOutReason === 'timeout' ? (
        <Notice tone="warning" icon="time-outline">
          {t('login.timeout')}
        </Notice>
      ) : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('login.email')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            placeholder={t('login.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            maxLength={50}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={passwordRef}
            label={t('login.password')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            secure
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />
      <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push('/forgot-password')}
        >
          <Text tone="primary" weight="bold" variant="small">
            {t('login.forgot')}
          </Text>
        </Pressable>
      </View>
      <Button title={t('login.submit')} size="lg" full loading={isSubmitting} onPress={onSubmit} />
    </AuthShell>
  );
}
