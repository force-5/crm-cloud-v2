import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';
import { SearchBar } from './TextField';
import { Button } from './Button';
import { MAX_CONTENT_WIDTH } from './Screen';

export type SelectOption<V extends string | number> = { value: V; label: string; description?: string };

type CommonProps<V extends string | number> = {
  label: string;
  options: readonly SelectOption<V>[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  /** Show a search box (defaults to on for long lists). */
  searchable?: boolean;
  helper?: string;
};

type SingleProps<V extends string | number> = CommonProps<V> & {
  multiple?: false;
  value: V | null | undefined;
  onChange: (value: V | null) => void;
  /** Adds a "None" row that clears the value. */
  noneLabel?: string;
};

type MultiProps<V extends string | number> = CommonProps<V> & {
  multiple: true;
  value: readonly V[];
  onChange: (value: V[]) => void;
};

/** A form field that opens a full-screen, searchable picker (single or multi-select). */
export function SelectField<V extends string | number>(props: SingleProps<V> | MultiProps<V>) {
  const { colors, radius } = useTheme();
  const { label, options, placeholder = 'Select…', error, required, readOnly, disabled, helper } = props;
  const [open, setOpen] = useState(false);

  const display = useMemo(() => {
    if (props.multiple) {
      const labels = options.filter((o) => props.value.includes(o.value)).map((o) => o.label);
      return labels.length ? labels.join(', ') : '';
    }
    return options.find((o) => o.value === props.value)?.label ?? '';
  }, [options, props.value, props.multiple]);

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" style={{ color: colors.textMuted }}>
        {label}
        {required && !readOnly ? <Text tone="danger"> *</Text> : null}
      </Text>
      {readOnly ? (
        <Text tone={display ? 'default' : 'subtle'} style={{ paddingVertical: 2 }}>
          {display || '—'}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display || 'not set'}`}
          accessibilityHint="Opens a list to choose from"
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={{
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
          }}
        >
          <Text style={{ flex: 1 }} tone={display ? 'default' : 'subtle'} numberOfLines={2}>
            {display || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Pressable>
      )}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : helper && !readOnly ? (
        <Text variant="caption" tone="subtle">
          {helper}
        </Text>
      ) : null}
      {open ? <PickerModal {...props} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

function PickerModal<V extends string | number>(props: (SingleProps<V> | MultiProps<V>) & { onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const { options, label, onClose } = props;
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<V[]>(props.multiple ? [...props.value] : []);
  const searchable = props.searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
  }, [options, query]);

  const rows: SelectOption<V | '__none__'>[] =
    !props.multiple && props.noneLabel && !query
      ? [{ value: '__none__', label: props.noneLabel }, ...filtered]
      : [...filtered];

  const isSelected = (v: V | '__none__') =>
    props.multiple
      ? draft.includes(v as V)
      : v === '__none__'
        ? props.value === null || props.value === undefined
        : props.value === v;

  const choose = (v: V | '__none__') => {
    haptics.tap();
    if (props.multiple) {
      const val = v as V;
      setDraft((d) => (d.includes(val) ? d.filter((x) => x !== val) : [...d, val]));
      return;
    }
    props.onChange(v === '__none__' ? null : (v as V));
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              gap: spacing.md,
            }}
          >
            <Button title="Cancel" variant="ghost" size="sm" onPress={onClose} />
            <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </Text>
            {props.multiple ? (
              <Button
                title="Done"
                variant="ghost"
                size="sm"
                onPress={() => {
                  props.onChange(draft);
                  onClose();
                }}
              />
            ) : (
              <View style={{ width: 64 }} />
            )}
          </View>
          {searchable ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              <SearchBar value={query} onChangeText={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
            </View>
          ) : null}
          {props.multiple && draft.length ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
              <Text variant="small" tone="muted">
                {draft.length} selected
              </Text>
              <Pressable onPress={() => setDraft([])} hitSlop={8}>
                <Text variant="small" tone="primary" weight="bold">
                  Clear
                </Text>
              </Pressable>
            </View>
          ) : null}
          <FlatList
            data={rows}
            keyExtractor={(o) => String(o.value)}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <Text tone="muted" center style={{ padding: 24 }}>
                No matches
              </Text>
            }
            renderItem={({ item }) => {
              const selected = isSelected(item.value);
              return (
                <Pressable
                  accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: selected, selected }}
                  onPress={() => choose(item.value)}
                  android_ripple={{ color: colors.surfaceMuted }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 50,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: 10,
                    backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text weight={selected ? 'bold' : 'regular'} tone={item.value === '__none__' ? 'muted' : 'default'}>
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text variant="small" tone="muted" numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  {props.multiple ? (
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selected ? colors.primary : colors.textSubtle}
                    />
                  ) : selected ? (
                    <Ionicons name="checkmark" size={22} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
