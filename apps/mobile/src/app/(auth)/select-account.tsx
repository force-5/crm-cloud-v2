import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { F5Mark, Notice, Text } from '@/components';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { api, errorMessage } from '@/lib/api';
import { haptics } from '@/lib/haptics';

export default function SelectAccountScreen() {
  const router = useRouter();
  const { pending, applyLoginResult } = useSession();
  const { colors, radius } = useTheme();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pending?.kind !== 'select-account') return <Redirect href="/login" />;

  const choose = async (tenantId: number) => {
    setBusyId(tenantId);
    setError(null);
    try {
      const next = applyLoginResult(await api.auth.selectAccount(tenantId));
      if (next === 'mfa') router.replace('/mfa');
      else if (next === 'ok') haptics.success();
    } catch (err) {
      haptics.error();
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AuthShell back title="Choose an account" subtitle="Your login has access to more than one account.">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ gap: 10 }}>
        {pending.accounts.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Sign in to ${t.name}`}
            disabled={busyId !== null}
            onPress={() => choose(t.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              opacity: busyId !== null && busyId !== t.id ? 0.5 : 1,
            })}
          >
            <F5Mark size={30} />
            <Text weight="bold" style={{ flex: 1 }}>
              {t.name}
            </Text>
            {busyId === t.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            )}
          </Pressable>
        ))}
      </View>
    </AuthShell>
  );
}
