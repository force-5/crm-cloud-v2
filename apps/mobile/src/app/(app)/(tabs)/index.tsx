import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@crm/api-client';
import { PERMISSIONS, hasPermission, type AccountSummary, type StatusFilter } from '@crm/contracts';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  F5Mark,
  Screen,
  Skeleton,
  StatusBadge,
  Text,
  type IconName,
} from '@/components';
import { useCurrentUser, useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { api } from '@/lib/api';
import { formatDate, fullName, initials } from '@/lib/format';

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation(['dashboard', 'shell']);
  const user = useCurrentUser();
  const { session } = useSession();
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const canAccounts = hasPermission(user, PERMISSIONS.ACCOUNTS);

  const dashboard = useQuery({ queryKey: queryKeys.dashboard, queryFn: api.dashboard, enabled: canAccounts });
  const d = dashboard.data;
  const env = session?.environment;
  const showEnv = !!env && !/^prod/i.test(env);

  const openList = (status: StatusFilter) => router.push({ pathname: '/accounts', params: { status } });
  const kpiCols = width >= 700 ? 4 : 2;

  const kpis: Array<{ label: string; value: number | null | undefined; icon: IconName; status?: StatusFilter; color: string }> = [
    { label: t('kpi.total'), value: d?.total, icon: 'business-outline', status: 'all', color: colors.primary },
    { label: t('kpi.active'), value: d?.active, icon: 'checkmark-circle-outline', status: 'active', color: colors.success },
    { label: t('kpi.inactive'), value: d?.inactive, icon: 'pause-circle-outline', status: 'inactive', color: colors.neutralText },
  ];
  if (d && d.draft !== null) kpis.push({ label: t('kpi.draft'), value: d.draft, icon: 'create-outline', color: colors.warning });

  return (
    <Screen edges={['top']} refreshing={dashboard.isRefetching} onRefresh={canAccounts ? () => dashboard.refetch() : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <F5Mark size={38} />
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted" weight="bold" style={{ letterSpacing: 1 }}>
            {user.tenant.name.toUpperCase()}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {t('greeting', { name: user.firstName })}
          </Text>
        </View>
        {showEnv ? <Badge label={env!.toUpperCase()} tone="primary" /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('shell:nav.profile')} onPress={() => router.navigate('/profile')}>
          <Avatar uri={user.profileImageUrl} initials={initials(user.firstName, user.lastName)} size={38} />
        </Pressable>
      </View>

      {!canAccounts ? (
        <Card>
          <EmptyState
            icon="lock-closed-outline"
            title={t('noAccess.title')}
            message={t('noAccess.body')}
          />
        </Card>
      ) : dashboard.isError && !d ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {(d ? kpis : kpis.slice(0, 4)).map((k) => (
              <Card
                key={k.label}
                onPress={k.status ? () => openList(k.status!) : undefined}
                accessibilityLabel={t('kpi.value', { label: k.label, value: k.value ?? t('kpi.loading') })}
                style={{ flexBasis: `${100 / kpiCols - 4}%`, flexGrow: 1, gap: 6 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="small" tone="muted" weight="bold">
                    {k.label}
                  </Text>
                  <Ionicons name={k.icon} size={18} color={k.color} />
                </View>
                {k.value === undefined ? (
                  <Skeleton width={70} height={30} />
                ) : (
                  <Text variant="kpi">{(k.value ?? 0).toLocaleString()}</Text>
                )}
              </Card>
            ))}
          </View>

          <Card
            title={t('recent.title')}
            subtitle={t('recent.subtitle')}
            right={
              <Pressable accessibilityRole="link" onPress={() => openList('all')} hitSlop={8}>
                <Text variant="small" tone="primary" weight="bold">
                  {t('recent.viewAll')}
                </Text>
              </Pressable>
            }
            style={{ gap: 4 }}
          >
            {!d ? (
              <View style={{ gap: 14, paddingVertical: 6 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ gap: 6 }}>
                    <Skeleton width="60%" height={16} />
                    <Skeleton width="35%" height={12} />
                  </View>
                ))}
              </View>
            ) : d.recent.length === 0 ? (
              <EmptyState icon="business-outline" title={t('recent.emptyTitle')} message={t('recent.empty')} />
            ) : (
              d.recent.map((a, i) => (
                <RecentRow key={a.id} account={a} first={i === 0} onPress={() => router.push(`/accounts/${a.id}`)} />
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function RecentRow({ account, first, onPress }: { account: AccountSummary; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation(['common', 'shell']);
  const contact = fullName(account.mainContact.firstName, account.mainContact.lastName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.item', { name: account.name, status: t(`status.${account.status}`) })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="bold" numberOfLines={1}>
          {account.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[contact, formatDate(account.dateCreated)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <StatusBadge status={account.status} />
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}
