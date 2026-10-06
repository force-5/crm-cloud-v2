import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

export type TextVariant = 'body' | 'small' | 'caption' | 'label' | 'h2' | 'title' | 'h1' | 'display' | 'kpi';
export type TextTone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'success' | 'warning' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  weight?: 'regular' | 'bold' | 'black';
  tone?: TextTone;
  center?: boolean;
};

const SIZES: Record<TextVariant, { fontSize: number; lineHeight: number; weight: 'regular' | 'bold' | 'black' }> = {
  body: { fontSize: 15, lineHeight: 21, weight: 'regular' },
  small: { fontSize: 13, lineHeight: 18, weight: 'regular' },
  caption: { fontSize: 12, lineHeight: 16, weight: 'regular' },
  label: { fontSize: 13, lineHeight: 18, weight: 'bold' },
  h2: { fontSize: 17, lineHeight: 23, weight: 'bold' },
  title: { fontSize: 21, lineHeight: 27, weight: 'black' },
  h1: { fontSize: 28, lineHeight: 34, weight: 'black' },
  display: { fontSize: 30, lineHeight: 32, weight: 'regular' },
  kpi: { fontSize: 30, lineHeight: 36, weight: 'black' },
};

export function Text({ variant = 'body', weight, tone = 'default', center, style, ...rest }: TextProps) {
  const { colors, fonts } = useTheme();
  const spec = SIZES[variant];
  const w = weight ?? spec.weight;
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    inverse: colors.primaryText,
  }[tone];
  const base: TextStyle = {
    color,
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    fontFamily:
      variant === 'display' ? fonts.display : w === 'black' ? fonts.black : w === 'bold' ? fonts.bold : fonts.regular,
    letterSpacing: variant === 'display' ? 1 : undefined,
    textAlign: center ? 'center' : undefined,
  };
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={[base, style]} />;
}
