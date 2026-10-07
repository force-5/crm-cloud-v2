import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { mfaVerifySchema } from '@crm/contracts';
import { Button, Notice, Text } from '@/components';
import { AuthShell } from '@/features/auth/AuthShell';
import { CodeInput } from '@/features/auth/CodeInput';
import { useSession } from '@/providers/SessionProvider';
import { useToast } from '@/providers/ToastProvider';
import { api, errorMessage } from '@/lib/api';
import { haptics } from '@/lib/haptics';

const RESEND_COOLDOWN_SECONDS = 30;

export default function MfaScreen() {
  const { t } = useTranslation('auth');
  const { pending, applyLoginResult } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [destination, setDestination] = useState(pending?.kind === 'mfa' ? pending.destination : undefined);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (pending?.kind !== 'mfa') return <Redirect href="/login" />;
  const isSms = pending.channel === 'sms';

  const verify = async (passcode = code) => {
    const parsed = mfaVerifySchema.safeParse({ passcode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('mfa.enterCode'));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await api.auth.verifyMfa(parsed.data);
      if (applyLoginResult(result) === 'ok') haptics.success();
    } catch (err) {
      haptics.error();
      setCode('');
      setError(errorMessage(err, t('mfa.invalid')));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const r = await api.auth.sendMfa();
      if (r.destination) setDestination(r.destination);
      toast.success(t('mfa.resent'));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      back
      title={t('mfa.title')}
      subtitle={
        isSms
          ? destination
            ? t('mfa.leadSms', { destination })
            : t('mfa.leadSmsNoDest')
          : t('mfa.leadTotp')
      }
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        error={!!error}
        onComplete={(c) => void verify(c)}
      />
      <Button title={t('mfa.submit')} size="lg" full loading={verifying} disabled={code.length !== 6} onPress={() => verify()} />
      {isSms ? (
        <View style={{ alignItems: 'center' }}>
          {cooldown > 0 ? (
            <Text variant="small" tone="muted">
              {t('mfa.resendIn', { seconds: cooldown })}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={resend} disabled={resending} hitSlop={8}>
              <Text variant="small" tone="primary" weight="bold">
                {resending ? t('mfa.sending') : t('mfa.resend')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </AuthShell>
  );
}
