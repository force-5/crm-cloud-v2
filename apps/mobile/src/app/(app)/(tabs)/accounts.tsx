import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PERMISSIONS, hasPermission, statusFilterSchema, type AccountSummary, type StatusFilter } from '@crm/contracts';
import {
  ActionSheet,
  Centered,
  EmptyState,
  ErrorState,
  Fab,
  ScreenHeader,
  SearchBar,
  Segmented,
  SkeletonList,
  Text,
  type SheetAction,
} from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountCard } from '@/features/accounts/AccountCard';
import { useAccountsList, useSetAccountActive } from '@/features/accounts/hooks';
import { useCurrentUser } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { useDebounced } from '@/lib/useDebounced';
import { flattenPages, totalOf } from '@/lib/paged';
import { callPhone, sendEmail } from '@/lib/contact';
import { plural } from '@/lib/format';
import { STATUS_OPTIONS } from '@/lib/filters';

export default function AccountsScreen() {
  const router = useRouter();
  const user = useCurrentUser();
  const toast = useToast();
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ status?: string }>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>(() => statusFilterSchema.catch('active').parse(params.status));
  const debounced = useDebounced(search.trim(), 300);
  const [menuFor, setMenuFor] = useState<AccountSummary | null>(null);

  // Dashboard KPI taps deep-link a status filter.
  useEffect(() => {
    if (params.status) setStatus(statusFilterSchema.catch('active').parse(params.status));
  }, [params.status]);

  const list = useAccountsList(debounced, status);
  const items = useMemo(() => flattenPages(list.data), [list.data]);
  const total = totalOf(list.data);
  const setActive = useSetAccountActive();
  const canCreate = hasPermission(user, PERMISSIONS.ACCOUNTS, 'create');
  const canUpdate = hasPermission(user, PERMISSIONS.ACCOUNTS, 'update');

  const open = useCallback((a: AccountSummary) => router.push(`/accounts/${a.id}`), [router]);
  const showMenu = useCallback((a: AccountSummary) => setMenuFor(a), []);

  const confirmToggle = (a: AccountSummary) => {
    const activate = a.status !== 'active';
    Alert.alert(
      `${activate ? 'Activate' : 'Deactivate'} account ${a.name}?`,
      activate
        ? 'Users of this account will be able to sign in again.'
        : 'Users of this account will no longer be able to sign in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activate ? 'Activate' : 'Deactivate',
          style: activate ? 'default' : 'destructive',
          onPress: () => setActive.mutate({ account: a, active: activate }),
        },
      ],
    );
  };

  const menuActions: SheetAction[] = menuFor
    ? [
        { label: canUpdate ? 'Open / edit' : 'Open', icon: 'open-outline', onPress: () => open(menuFor) },
        ...(menuFor.mainContact.mobile
          ? [{
              label: `Call ${menuFor.mainContact.mobile}`,
              icon: 'call-outline' as const,
              onPress: async () => {
                if (!(await callPhone(menuFor.mainContact.mobile!))) toast.error("This device can't place calls");
              },
            }]
          : []),
        ...(menuFor.mainContact.email
          ? [{ label: `Email ${menuFor.mainContact.email}`, icon: 'mail-outline' as const, onPress: () => void sendEmail(menuFor.mainContact.email!) }]
          : []),
        ...(canUpdate && menuFor.status !== 'draft'
          ? [
              menuFor.status === 'active'
                ? { label: 'Deactivate', icon: 'pause-circle-outline' as const, destructive: true, onPress: () => confirmToggle(menuFor) }
                : { label: 'Activate', icon: 'play-circle-outline' as const, onPress: () => confirmToggle(menuFor) },
            ]
          : []),
      ]
    : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={list.isPending ? [] : items}
        keyExtractor={(a) => String(a.id)}
        renderItem={({ item }) => (
          <Centered style={{ paddingHorizontal: spacing.lg }}>
            <AccountCard account={item} onPress={open} onMore={showMenu} />
          </Centered>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 110 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => list.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <Centered style={{ padding: spacing.lg, gap: spacing.md }}>
            <ScreenHeader
              title="Accounts"
              subtitle={total !== undefined ? plural(total, 'account') : 'Customer accounts'}
            />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search accounts" />
            <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </Centered>
        }
        ListEmptyComponent={
          <Centered style={{ paddingHorizontal: spacing.lg }}>
            {list.isPending ? (
              <SkeletonList />
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <EmptyState
                icon="business-outline"
                title={debounced ? 'No matching accounts' : 'No accounts here'}
                message={debounced ? `Nothing matches "${debounced}".` : 'Try a different status filter.'}
                actionLabel={canCreate && !debounced ? 'New account' : undefined}
                onAction={() => router.push('/accounts/new')}
              />
            )}
          </Centered>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
          ) : items.length > 0 && !list.hasNextPage ? (
            <Text variant="caption" tone="subtle" center style={{ marginTop: spacing.lg }}>
              That's everything
            </Text>
          ) : null
        }
      />
      {canCreate ? <Fab label="New account" onPress={() => router.push('/accounts/new')} /> : null}
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.name}
        actions={menuActions}
        onClose={() => setMenuFor(null)}
      />
    </SafeAreaView>
  );
}
