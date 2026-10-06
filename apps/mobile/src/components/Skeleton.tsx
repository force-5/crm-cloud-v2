import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

export function Skeleton({
  width = '100%',
  height = 14,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius: r } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius ?? r.sm, backgroundColor: colors.surfaceMuted, opacity: pulse }, style]}
    />
  );
}

/** Placeholder shaped like a list card. */
export function SkeletonCard() {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width="55%" height={18} />
        <Skeleton width={56} height={20} radius={999} />
      </View>
      <Skeleton width="40%" />
      <Skeleton width="70%" />
      <Skeleton width="30%" height={12} />
    </View>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
