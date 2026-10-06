import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES, loginRequestSchema, type LoginRequest } from '@crm/contracts';
import { Button, Notice, Text, TextField } from '@/components';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSession } from '@/providers/SessionProvider';
import { api, errorMessage, isApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';

export default function LoginScreen() {
  const router = useRouter();
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
        isApiError(err, ERROR_CODES.INVALID_CREDENTIALS) ? 'Incorrect email or password.' : errorMessage(err),
      );
    }
  });

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage Force 5 customer accounts.">
      {signOutReason === 'timeout' ? (
        <Notice tone="warning" icon="time-outline">
          You were signed out for inactivity. Please sign in again.
        </Notice>
      ) : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            placeholder="you@force5.com"
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
            label="Password"
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
            Forgot password?
          </Text>
        </Pressable>
      </View>
      <Button title="Sign in" size="lg" full loading={isSubmitting} onPress={onSubmit} />
    </AuthShell>
  );
}
