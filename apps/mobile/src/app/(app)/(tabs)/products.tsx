import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, hasPermission, type Product, type StatusFilter } from '@crm/contracts';
import {
  Badge,
  Card,
  Centered,
  EmptyState,
  ErrorState,
  Fab,
  ScreenHeader,
  SearchBar,
  Segmented,
  SkeletonList,
  StatusBadge,
  Text,
} from '@/components';
import { useProductsList } from '@/features/products/hooks';
import { useCurrentUser } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useDebounced } from '@/lib/useDebounced';
import { flattenPages, totalOf } from '@/lib/paged';
import { useStatusOptions } from '@/lib/filters';

export default function ProductsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common']);
  const statusOptions = useStatusOptions();
  const user = useCurrentUser();
  const { colors, spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const debounced = useDebounced(search.trim(), 300);
  const list = useProductsList(debounced, status);
  const items = useMemo(() => flattenPages(list.data), [list.data]);
  const total = totalOf(list.data);
  const canCreate = hasPermission(user, PERMISSIONS.PRODUCTS, 'create');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={list.isPending ? [] : items}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Centered style={{ paddingHorizontal: spacing.lg }}>
            <ProductCard product={item} onPress={() => router.push(`/products/${item.id}`)} />
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
                icon="cube-outline"
                title={debounced ? t('list.emptyFilteredTitle') : t('list.emptyTitle')}
                message={debounced ? t('list.emptyFiltered', { search: debounced }) : t('common:empty.tryOtherStatus')}
              />
            )}
          </Centered>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} /> : null
        }
      />
      {canCreate ? <Fab label={t('newProduct')} onPress={() => router.push('/products/new')} /> : null}
    </SafeAreaView>
  );
}

function ProductCard({ product: p, onPress }: { product: Product; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const { t } = useTranslation(['products', 'common']);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={t('common:a11y.item', { name: p.name, status: t(p.active ? 'common:status.active' : 'common:status.inactive') })}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text variant="h2" style={{ flex: 1 }} numberOfLines={2}>
          {p.name}
        </Text>
        <StatusBadge status={p.active ? 'active' : 'inactive'} />
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} style={{ marginTop: 2 }} />
      </View>
      {p.description ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {p.description}
        </Text>
      ) : (
        <Badge label={t('list.na')} />
      )}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {p.productCode ? (
          <Text variant="caption" tone="subtle" style={{ fontFamily: fonts.bold }}>
            {p.productCode}
            {p.productSku ? ` · ${p.productSku}` : ''}
          </Text>
        ) : null}
        {p.category ? (
          <Text variant="caption" tone="subtle">
            {p.category}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
