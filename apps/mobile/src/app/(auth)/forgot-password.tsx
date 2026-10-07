import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');
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
      toast.success(t('forgot.success'));
      router.replace('/login');
    });
  };

  const copy: Record<Step, { title: string; subtitle: string }> = {
    email: { title: t('forgot.title'), subtitle: t('forgot.emailLead') },
    code: { title: t('forgot.codeTitle'), subtitle: t('forgot.sentNotice', { email }) },
    password: { title: t('forgot.newPasswordTitle'), subtitle: t('forgot.newPasswordLead', { email }) },
  };

  return (
    <AuthShell back title={copy[step].title} subtitle={copy[step].subtitle}>
      <StepDots step={step} />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {step === 'email' ? (
        <>
          <TextField
            label={t('forgot.email')}
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
          <Button title={t('forgot.sendCode')} size="lg" full loading={busy} onPress={submitEmail} />
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <TextField
            label={t('forgot.code')}
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
          <Button title={t('forgot.verify')} size="lg" full loading={busy} onPress={submitCode} />
          <Button title={t('forgot.useDifferentEmail')} variant="ghost" onPress={() => setStep('email')} />
        </>
      ) : null}

      {step === 'password' ? (
        <>
          <TextField
            label={t('forgot.newPassword')}
            value={password}
            onChangeText={setPassword}
            error={fieldError.password}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
          />
          <View style={{ gap: 6 }} accessibilityLabel={t('forgot.rulesTitle')}>
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              const label = t(`forgot.rules.${rule.id}`, { defaultValue: rule.label });
              return (
                <View key={rule.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons
                    name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={ok ? colors.success : colors.textSubtle}
                  />
                  <Text variant="small" tone={ok ? 'success' : 'muted'} accessibilityLabel={t(ok ? 'forgot.ruleMet' : 'forgot.ruleUnmet', { rule: label })}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          <TextField
            label={t('forgot.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            error={fieldError.passwordConfirmation}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submitPassword}
          />
          <Button title={t('forgot.save')} size="lg" full loading={busy} onPress={submitPassword} />
        </>
      ) : null}
    </AuthShell>
  );
}

function StepDots({ step }: { step: Step }) {
  const { colors } = useTheme();
  const { t } = useTranslation('auth');
  const steps: Step[] = ['email', 'code', 'password'];
  const idx = steps.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={t('forgot.step', { n: idx + 1 })}>
      {steps.map((s, i) => (
        <View
          key={s}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= idx ? colors.primary : colors.border }}
        />
      ))}
    </View>
  );
}
