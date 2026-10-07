import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { useStatusOptions } from '@/lib/filters';

export default function AccountsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common']);
  const statusOptions = useStatusOptions();
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
      t(activate ? 'confirm.activateTitle' : 'confirm.deactivateTitle', { name: a.name }),
      t(activate ? 'confirm.activateBody' : 'confirm.deactivateBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t(activate ? 'common:actions.activate' : 'common:actions.deactivate'),
          style: activate ? 'default' : 'destructive',
          onPress: () => setActive.mutate({ account: a, active: activate }),
        },
      ],
    );
  };

  const menuActions: SheetAction[] = menuFor
    ? [
        { label: canUpdate ? t('menu.openEdit') : t('menu.open'), icon: 'open-outline', onPress: () => open(menuFor) },
        ...(menuFor.mainContact.mobile
          ? [{
              label: t('common:contact.call', { phone: menuFor.mainContact.mobile }),
              icon: 'call-outline' as const,
              onPress: async () => {
                if (!(await callPhone(menuFor.mainContact.mobile!))) toast.error(t('common:errors.cantCall'));
              },
            }]
          : []),
        ...(menuFor.mainContact.email
          ? [{ label: t('common:contact.email', { email: menuFor.mainContact.email }), icon: 'mail-outline' as const, onPress: () => void sendEmail(menuFor.mainContact.email!) }]
          : []),
        ...(canUpdate && menuFor.status !== 'draft'
          ? [
              menuFor.status === 'active'
                ? { label: t('common:actions.deactivate'), icon: 'pause-circle-outline' as const, destructive: true, onPress: () => confirmToggle(menuFor) }
                : { label: t('common:actions.activate'), icon: 'play-circle-outline' as const, onPress: () => confirmToggle(menuFor) },
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
              title={t('list.title')}
              subtitle={total !== undefined ? t('list.count', { count: total }) : t('list.subtitle')}
            />
            <SearchBar value={search} onChangeText={setSearch} placeholder={t('list.searchPlaceholder')} />
            <Segmented options={statusOptions} value={status} onChange={setStatus} />
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
                title={debounced ? t('list.emptyFilteredTitle') : t('list.emptyTitle')}
                message={debounced ? t('list.emptyFiltered', { search: debounced }) : t('common:empty.tryOtherStatus')}
                actionLabel={canCreate && !debounced ? t('newAccount') : undefined}
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
              {t('common:table.end')}
            </Text>
          ) : null
        }
      />
      {canCreate ? <Fab label={t('newAccount')} onPress={() => router.push('/accounts/new')} /> : null}
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.name}
        actions={menuActions}
        onClose={() => setMenuFor(null)}
      />
    </SafeAreaView>
  );
}
