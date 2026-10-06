import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
  /** View mode: show the value as text instead of an input. */
  readOnly?: boolean;
  /** Password field with a show/hide toggle. */
  secure?: boolean;
  left?: ReactNode;
  right?: ReactNode;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, helper, required, readOnly, secure, left, right, value, multiline, ...rest },
  ref,
) {
  const { colors, radius, fonts } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" style={{ color: colors.textMuted }}>
          {label}
          {required && !readOnly ? <Text tone="danger"> *</Text> : null}
        </Text>
      ) : null}
      {readOnly ? (
        <Text selectable style={{ paddingVertical: 2 }} tone={value ? 'default' : 'subtle'}>
          {value || '—'}
        </Text>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            borderWidth: 1,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.borderStrong,
            borderRadius: radius.md,
            backgroundColor: rest.editable === false ? colors.surfaceMuted : colors.surface,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          {left}
          <TextInput
            {...rest}
            ref={ref}
            value={value}
            multiline={multiline}
            placeholderTextColor={colors.textSubtle}
            secureTextEntry={secure ? hidden : undefined}
            autoCapitalize={secure ? 'none' : rest.autoCapitalize}
            autoCorrect={secure ? false : rest.autoCorrect}
            accessibilityLabel={label}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            style={{
              flex: 1,
              minHeight: multiline ? 96 : 46,
              paddingVertical: multiline ? 12 : 10,
              color: colors.text,
              fontFamily: fonts.regular,
              fontSize: 16,
              textAlignVertical: multiline ? 'top' : 'center',
            }}
          />
          {secure ? (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            >
              <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {right}
        </View>
      )}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper && !readOnly ? (
        <Text variant="caption" tone="subtle">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const { colors, radius, fonts } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: 12,
      }}
    >
      <Ionicons name="search" size={18} color={colors.textSubtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel={placeholder}
        style={{ flex: 1, height: 44, color: colors.text, fontFamily: fonts.regular, fontSize: 16 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}
