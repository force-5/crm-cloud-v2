import { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components';
import { useTheme } from '@/providers/ThemeProvider';

/** Six visual boxes over one hidden input — keeps OS one-time-code autofill working. */
export function CodeInput({
  value,
  onChange,
  length = 6,
  error,
  autoFocus = true,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const { colors, radius, fonts } = useTheme();
  const { t } = useTranslation('auth');
  const ref = useRef<TextInput>(null);
  const digits = value.split('');

  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 56,
                aspectRatio: 0.82,
                borderRadius: radius.md,
                borderWidth: active ? 2 : 1,
                borderColor: error ? colors.danger : active ? colors.primary : colors.borderStrong,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: fonts.black, fontSize: 26, lineHeight: 32 }}>{digits[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => {
          const clean = t.replace(/\D/g, '').slice(0, length);
          onChange(clean);
          if (clean.length === length) onComplete?.(clean);
        }}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        accessibilityLabel={t('mfa.code')}
        caretHidden
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.015, color: 'transparent' }}
      />
    </Pressable>
  );
}
