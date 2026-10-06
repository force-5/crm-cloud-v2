import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect } from 'expo-router';
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
      setError(parsed.error.issues[0]?.message ?? 'Enter the 6-digit code');
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
      setError(errorMessage(err, 'That code is not valid. Try again.'));
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
      toast.success('A new code is on its way');
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
      title="Verify it's you"
      subtitle={
        isSms
          ? `Enter the 6-digit code we texted to ${destination ?? 'your mobile phone'}.`
          : 'Enter the 6-digit code from your authenticator app.'
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
      <Button title="Verify" size="lg" full loading={verifying} disabled={code.length !== 6} onPress={() => verify()} />
      {isSms ? (
        <View style={{ alignItems: 'center' }}>
          {cooldown > 0 ? (
            <Text variant="small" tone="muted">
              Didn't get it? You can resend in {cooldown}s
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={resend} disabled={resending} hitSlop={8}>
              <Text variant="small" tone="primary" weight="bold">
                {resending ? 'Sending…' : 'Resend code'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </AuthShell>
  );
}
