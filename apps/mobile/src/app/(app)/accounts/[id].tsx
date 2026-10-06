import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Centered, ErrorState, Segmented, StatusBadge, Text } from '@/components';
import { AccountForm } from '@/features/accounts/AccountForm';
import { useAccountDetail } from '@/features/accounts/hooks';
import { LicensesTab } from '@/features/licenses/LicensesTab';
import { useTheme } from '@/providers/ThemeProvider';
import { formatDate } from '@/lib/format';

type Tab = 'details' | 'licenses';

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const id: number | 'new' = isNew ? 'new' : Number(params.id);
  const { colors, spacing } = useTheme();
  const [tab, setTabState] = useState<Tab>('details');
  const [licensesOpened, setLicensesOpened] = useState(false);
  const setTab = (t: Tab) => {
    if (t === 'licenses') setLicensesOpened(true);
    setTabState(t);
  };
  const validId = isNew || Number.isFinite(id);
  const detail = useAccountDetail(validId ? id : 'new');
  const account = detail.data?.account ?? null;

  const title = isNew ? 'New account' : (account?.name ?? 'Account');

  if (!validId) {
    return <ErrorState error={new Error('That account link is not valid.')} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: isNew ? 'New account' : 'Account' }} />
      <View style={{ backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
        <Centered style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text variant="title" style={{ flexShrink: 1 }} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            {isNew ? <Badge label="New" tone="warning" /> : account ? <StatusBadge status={account.status} /> : null}
          </View>
          {account?.registeredDate ? (
            <Text variant="small" tone="muted">
              Registered {formatDate(account.registeredDate)}
              {account.registeredBy ? ` by ${account.registeredBy}` : ''}
            </Text>
          ) : account ? (
            <Text variant="small" tone="muted">
              Not published yet · created {formatDate(account.audit.dateCreated ?? account.dateCreated)}
            </Text>
          ) : null}
          <Segmented<Tab>
            options={[
              { value: 'details', label: 'Details' },
              { value: 'licenses', label: 'Licenses', disabled: isNew },
            ]}
            value={tab}
            onChange={setTab}
          />
        </Centered>
      </View>

      {detail.isPending ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <>
          {/* Both panes stay mounted so switching segments never discards in-progress edits. */}
          <View style={{ flex: 1, display: tab === 'details' ? 'flex' : 'none' }}>
            <AccountForm key={account?.id ?? 'new'} account={account} lookups={detail.data.lookups} />
          </View>
          {account && licensesOpened ? (
            <View style={{ flex: 1, display: tab === 'licenses' ? 'flex' : 'none' }}>
              <LicensesTab accountId={account.id} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
