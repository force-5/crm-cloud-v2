import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { useStatusOptions } from '@/lib/filters';
import { useAddLicense, useAvailableProducts, useLicensesList, useUpdateLicense } from './hooks';

export function LicensesTab({ accountId }: { accountId: number }) {
  const { t } = useTranslation(['licenses', 'common']);
  const statusOptions = useStatusOptions();
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
    Alert.alert(
      t(activate ? 'confirm.activateTitle' : 'confirm.deactivateTitle', { name: l.productName }),
      t(activate ? 'confirm.activateBody' : 'confirm.deactivateBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t(activate ? 'common:actions.activate' : 'common:actions.deactivate'),
          style: activate ? 'default' : 'destructive',
          onPress: () => update.mutate({ license: l, body: { active: activate } }),
        },
      ],
    );
  };

  const actions: SheetAction[] = menuFor
    ? [
        { label: t('menu.editSeats'), icon: 'people-outline', onPress: () => setSeatsFor(menuFor) },
        menuFor.active
          ? { label: t('common:actions.deactivate'), icon: 'pause-circle-outline', destructive: true, onPress: () => toggle(menuFor) }
          : { label: t('common:actions.activate'), icon: 'play-circle-outline', onPress: () => toggle(menuFor) },
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
                <SearchBar value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} />
              </View>
              {canCreate ? <Button title={t('common:actions.add')} icon="add" onPress={() => setAdding(true)} /> : null}
            </View>
            <Segmented options={statusOptions} value={status} onChange={setStatus} />
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
                title={t('empty.title')}
                message={debounced ? t('common:empty.noResultsFor', { search: debounced }) : t('empty.statusBody')}
                actionLabel={canCreate ? t('add') : undefined}
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
  const { t } = useTranslation(['licenses', 'common']);
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
        {onMore ? <IconButton icon="ellipsis-horizontal" label={t('menu.label', { name: l.productName })} onPress={() => onMore(l)} /> : null}
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
            <Text tone="muted"> {t('seats.purchasedLabel')}</Text>
          </Text>
          <Text variant="small" tone={over ? 'danger' : 'muted'} weight={over ? 'bold' : 'regular'}>
            {t('seats.usage', { used: l.usedCount, available })}
          </Text>
        </View>
        <ProgressBar value={l.usedCount} max={purchased} danger={over} />
      </View>
    </Card>
  );
});

function AddLicenseSheet({ accountId, onClose }: { accountId: number; onClose: () => void }) {
  const { t } = useTranslation(['licenses', 'common']);
  const products = useAvailableProducts(accountId, true);
  const add = useAddLicense(accountId);
  const [productId, setProductId] = useState<number | null>(null);
  const [seats, setSeats] = useState(1);
  const selected = products.data?.find((p) => p.id === productId);
  const options = (products.data ?? []).map((p) => ({
    value: p.id,
    label: t('addDialog.productOption', { name: p.productName, type: p.licenseTypeDisplay }),
    description: p.description,
  }));

  return (
    <BottomSheet visible onClose={onClose} title={t('addDialog.title')} dismissable={!add.isPending}>
      {products.isPending ? (
        <ActivityIndicator />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : options.length === 0 ? (
        <Notice>{t('addDialog.noneAvailable')}</Notice>
      ) : (
        <>
          <SelectField<number>
            label={t('addDialog.product')}
            options={options}
            value={productId}
            onChange={setProductId}
            placeholder={t('addDialog.chooseProduct')}
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
          <Stepper label={t('addDialog.seats')} value={seats} onChange={setSeats} min={1} />
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('common:actions.cancel')} variant="secondary" flex onPress={onClose} disabled={add.isPending} />
        <Button
          title={t('addDialog.submit')}
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
  const { t } = useTranslation(['licenses', 'common']);
  const [seats, setSeats] = useState(Math.max(1, license.purchasedCount ?? 1));
  const belowUsed = seats < license.usedCount;
  return (
    <BottomSheet visible onClose={onClose} title={t('editSeats.title', { name: license.productName })} dismissable={!saving}>
      <Text tone="muted" variant="small">
        {t('seats.inUse', { count: license.usedCount })}
      </Text>
      <Stepper label={t('editSeats.label')} value={seats} onChange={setSeats} min={1} />
      {belowUsed ? (
        <Notice tone="warning">
          {t('editSeats.belowUsed', { used: license.usedCount })}
        </Notice>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('common:actions.cancel')} variant="secondary" flex onPress={onClose} disabled={saving} />
        <Button title={t('editSeats.save')} flex loading={saving} disabled={seats === license.purchasedCount} onPress={() => onSave(seats)} />
      </View>
    </BottomSheet>
  );
}
