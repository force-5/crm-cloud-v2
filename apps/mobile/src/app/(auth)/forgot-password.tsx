import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ERROR_CODES,
  PASSWORD_RULES,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyRecoveryCodeSchema,
} from '@crm/contracts';
import { Button, Notice, Text, TextField } from '@/components';
import { AuthShell } from '@/features/auth/AuthShell';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { api, errorMessage, isApiError } from '@/lib/api';
import { haptics } from '@/lib/haptics';

type Step = 'email' | 'code' | 'password';

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  email: { title: 'Reset password', subtitle: "Enter your email and we'll send you a recovery code." },
  code: { title: 'Check your email', subtitle: '' },
  password: { title: 'Choose a new password', subtitle: 'Make it strong — you will use it to sign in.' },
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<Partial<Record<'email' | 'code' | 'password' | 'passwordConfirmation', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      haptics.error();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setFieldError({ email: parsed.error.issues[0]?.message });
    setFieldError({});
    void run(async () => {
      try {
        await api.auth.forgotPassword(parsed.data.email);
      } catch (err) {
        // Never reveal whether the email exists — only surface connectivity/rate-limit problems.
        if (isApiError(err, ERROR_CODES.SERVICE_UNAVAILABLE) || isApiError(err, ERROR_CODES.RATE_LIMITED)) throw err;
      }
      setEmail(parsed.data.email);
      setStep('code');
    });
  };

  const submitCode = () => {
    const parsed = verifyRecoveryCodeSchema.safeParse({ email, code });
    if (!parsed.success) return setFieldError({ code: parsed.error.issues[0]?.message });
    setFieldError({});
    void run(async () => {
      await api.auth.verifyRecoveryCode(parsed.data.email, parsed.data.code);
      setStep('password');
    });
  };

  const submitPassword = () => {
    const parsed = resetPasswordSchema.safeParse({ email, code, password, passwordConfirmation: confirm });
    if (!parsed.success) {
      const errs: typeof fieldError = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof fieldError;
        errs[key] ??= issue.message;
      }
      return setFieldError(errs);
    }
    setFieldError({});
    void run(async () => {
      await api.auth.resetPassword(parsed.data);
      haptics.success();
      toast.success('Password updated. Sign in with your new password.');
      router.replace('/login');
    });
  };

  const copy = STEP_COPY[step];
  const subtitle =
    step === 'code'
      ? `If an account exists for ${email}, we've sent a recovery code to it. Enter the code below.`
      : copy.subtitle;

  return (
    <AuthShell back title={copy.title} subtitle={subtitle}>
      <StepDots step={step} />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {step === 'email' ? (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldError.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            returnKeyType="send"
            onSubmitEditing={submitEmail}
            autoFocus
          />
          <Button title="Send recovery code" size="lg" full loading={busy} onPress={submitEmail} />
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <TextField
            label="Recovery code"
            value={code}
            onChangeText={setCode}
            error={fieldError.code}
            autoCapitalize="characters"
            autoCorrect={false}
            textContentType="oneTimeCode"
            returnKeyType="next"
            onSubmitEditing={submitCode}
            autoFocus
          />
          <Button title="Verify code" size="lg" full loading={busy} onPress={submitCode} />
          <Button title="Use a different email" variant="ghost" onPress={() => setStep('email')} />
        </>
      ) : null}

      {step === 'password' ? (
        <>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            error={fieldError.password}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
          />
          <View style={{ gap: 6 }} accessibilityLabel="Password requirements">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <View key={rule.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons
                    name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={ok ? colors.success : colors.textSubtle}
                  />
                  <Text variant="small" tone={ok ? 'success' : 'muted'} accessibilityLabel={`${rule.label}: ${ok ? 'met' : 'not met'}`}>
                    {rule.label}
                  </Text>
                </View>
              );
            })}
          </View>
          <TextField
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            error={fieldError.passwordConfirmation}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submitPassword}
          />
          <Button title="Update password" size="lg" full loading={busy} onPress={submitPassword} />
        </>
      ) : null}
    </AuthShell>
  );
}

function StepDots({ step }: { step: Step }) {
  const { colors } = useTheme();
  const steps: Step[] = ['email', 'code', 'password'];
  const idx = steps.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${idx + 1} of 3`}>
      {steps.map((s, i) => (
        <View
          key={s}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= idx ? colors.primary : colors.border }}
        />
      ))}
    </View>
  );
}
