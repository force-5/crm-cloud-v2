import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { statusTone } from '@crm/tokens';
import {
  PERMISSIONS,
  availableSeats,
  hasPermission,
  type StatusFilter,
  type TenantLicense,
} from '@crm/contracts';
import {
  ActionSheet,
  Badge,
  BottomSheet,
  Button,
  Card,
  Centered,
  EmptyState,
  ErrorState,
  IconButton,
  Notice,
  ProgressBar,
  SearchBar,
  Segmented,
  SelectField,
  SkeletonList,
  StatusBadge,
  Stepper,
  Text,
  type SheetAction,
} from '@/components';
import { useCurrentUser } from '@/providers/SessionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useDebounced } from '@/lib/useDebounced';
import { flattenPages } from '@/lib/paged';
import { STATUS_OPTIONS } from '@/lib/filters';
import { useAddLicense, useAvailableProducts, useLicensesList, useUpdateLicense } from './hooks';

export function LicensesTab({ accountId }: { accountId: number }) {
  const user = useCurrentUser();
  const { colors, spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const debounced = useDebounced(search.trim(), 300);
  const list = useLicensesList(accountId, debounced, status);
  const items = useMemo(() => flattenPages(list.data), [list.data]);
  const update = useUpdateLicense(accountId);
  const [menuFor, setMenuFor] = useState<TenantLicense | null>(null);
  const [seatsFor, setSeatsFor] = useState<TenantLicense | null>(null);
  const [adding, setAdding] = useState(false);

  const canCreate = hasPermission(user, PERMISSIONS.LICENSES, 'create');
  const canUpdate = hasPermission(user, PERMISSIONS.LICENSES, 'update');

  const toggle = (l: TenantLicense) => {
    const activate = !l.active;
    Alert.alert(`${activate ? 'Activate' : 'Deactivate'} ${l.productName}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: activate ? 'Activate' : 'Deactivate',
        style: activate ? 'default' : 'destructive',
        onPress: () => update.mutate({ license: l, body: { active: activate } }),
      },
    ]);
  };

  const actions: SheetAction[] = menuFor
    ? [
        { label: 'Edit seats', icon: 'people-outline', onPress: () => setSeatsFor(menuFor) },
        menuFor.active
          ? { label: 'Deactivate', icon: 'pause-circle-outline', destructive: true, onPress: () => toggle(menuFor) }
          : { label: 'Activate', icon: 'play-circle-outline', onPress: () => toggle(menuFor) },
      ]
    : [];

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={list.isPending ? [] : items}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item }) => (
          <Centered style={{ paddingHorizontal: spacing.lg }}>
            <LicenseCard license={item} onMore={canUpdate ? setMenuFor : undefined} />
          </Centered>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 48 }}
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
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SearchBar value={search} onChangeText={setSearch} placeholder="Search licenses" />
              </View>
              {canCreate ? <Button title="Add" icon="add" onPress={() => setAdding(true)} /> : null}
            </View>
            <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </Centered>
        }
        ListEmptyComponent={
          <Centered style={{ paddingHorizontal: spacing.lg }}>
            {list.isPending ? (
              <SkeletonList count={3} />
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <EmptyState
                icon="key-outline"
                title="No licenses"
                message={debounced ? `Nothing matches "${debounced}".` : 'No product licenses with this status.'}
                actionLabel={canCreate ? 'Add license' : undefined}
                onAction={() => setAdding(true)}
              />
            )}
          </Centered>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} /> : null
        }
      />
      <ActionSheet visible={!!menuFor} title={menuFor?.productName} actions={actions} onClose={() => setMenuFor(null)} />
      {adding ? <AddLicenseSheet accountId={accountId} onClose={() => setAdding(false)} /> : null}
      {seatsFor ? (
        <EditSeatsSheet
          license={seatsFor}
          saving={update.isPending}
          onClose={() => setSeatsFor(null)}
          onSave={(n) =>
            update.mutate({ license: seatsFor, body: { purchasedCount: n } }, { onSuccess: () => setSeatsFor(null) })
          }
        />
      ) : null}
    </View>
  );
}

const LicenseCard = memo(function LicenseCard({
  license: l,
  onMore,
}: {
  license: TenantLicense;
  onMore?: (l: TenantLicense) => void;
}) {
  const { fonts } = useTheme();
  const purchased = l.purchasedCount ?? 0;
  const available = availableSeats(l);
  const over = available < 0;
  const codes = [l.productCode, l.productSku].filter(Boolean).join(' · ');
  return (
    <Card onLongPress={onMore ? () => onMore(l) : undefined} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="h2">{l.productName}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Badge label={l.licenseTypeDisplay} tone={statusTone[l.licenseType] ?? 'neutral'} />
            <StatusBadge status={l.active ? 'active' : 'inactive'} />
          </View>
        </View>
        {onMore ? <IconButton icon="ellipsis-horizontal" label={`Actions for ${l.productName}`} onPress={() => onMore(l)} /> : null}
      </View>
      {l.description ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {l.description}
        </Text>
      ) : null}
      {codes || l.category ? (
        <Text variant="caption" tone="subtle" style={{ fontFamily: codes ? fonts.bold : undefined }}>
          {[codes, l.category].filter(Boolean).join('  ·  ')}
        </Text>
      ) : null}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text>
            <Text weight="black">{l.purchasedCount ?? '—'}</Text>
            <Text tone="muted"> purchased</Text>
          </Text>
          <Text variant="small" tone={over ? 'danger' : 'muted'} weight={over ? 'bold' : 'regular'}>
            {l.usedCount} used · {available} available
          </Text>
        </View>
        <ProgressBar value={l.usedCount} max={purchased} danger={over} />
      </View>
    </Card>
  );
});

function AddLicenseSheet({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const products = useAvailableProducts(accountId, true);
  const add = useAddLicense(accountId);
  const [productId, setProductId] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const selected = products.data?.find((p) => p.id === productId);
  const options = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.productName} (${p.licenseTypeDisplay})`,
    description: p.description,
  }));

  return (
    <BottomSheet visible onClose={onClose} title="Add license" dismissable={!add.isPending}>
      {products.isPending ? (
        <ActivityIndicator />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : options.length === 0 ? (
        <Notice>Every product is already assigned to this account.</Notice>
      ) : (
        <>
          <SelectField<number>
            label="Product"
            options={options}
            value={productId}
            onChange={setProductId}
            placeholder="Choose a product"
            searchable
          />
          {selected ? (
            <View style={{ gap: 4 }}>
              <Badge label={selected.licenseTypeDisplay} tone={statusTone[selected.licenseType] ?? 'neutral'} />
              {selected.description ? (
                <Text variant="small" tone="muted">
                  {selected.description}
                </Text>
              ) : null}
              <Text variant="caption" tone="subtle">
                {[selected.productCode, selected.productSku, selected.category].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          <Stepper label="Seats" value={seats} onChange={setSeats} min={1} />
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" flex onPress={onClose} disabled={add.isPending} />
        <Button
          title="Add license"
          flex
          disabled={!productId}
          loading={add.isPending}
          onPress={() =>
            productId && add.mutate({ productLicenseId: productId, purchasedCount: seats }, { onSuccess: onClose })
          }
        />
      </View>
    </BottomSheet>
  );
}

function EditSeatsSheet({
  license,
  saving,
  onClose,
  onSave,
}: {
  license: TenantLicense;
  saving: boolean;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const [seats, setSeats] = useState(Math.max(1, license.purchasedCount ?? 1));
  const belowUsed = seats < license.usedCount;
  return (
    <BottomSheet visible onClose={onClose} title={`Seats · ${license.productName}`} dismissable={!saving}>
      <Text tone="muted" variant="small">
        {license.usedCount} seat{license.usedCount === 1 ? ' is' : 's are'} in use.
      </Text>
      <Stepper label="Purchased seats" value={seats} onChange={setSeats} min={1} />
      {belowUsed ? (
        <Notice tone="warning">
          {`This is fewer than the ${license.usedCount} seats in use. The account will be over-allocated.`}
        </Notice>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" flex onPress={onClose} disabled={saving} />
        <Button title="Save seats" flex loading={saving} disabled={seats === license.purchasedCount} onPress={() => onSave(seats)} />
      </View>
    </BottomSheet>
  );
}
