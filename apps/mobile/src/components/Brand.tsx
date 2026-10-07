import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/providers/ThemeProvider';
import { Text } from './Text';

/** The orange rounded-square "F5" mark from the prototype sidebar. */
export function F5Mark({ size = 34 }: { size?: number }) {
  const { fonts } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        backgroundColor: '#f36b21',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#ffffff',
          fontFamily: fonts.display,
          fontSize: size * 0.62,
          lineHeight: size * 0.72,
          letterSpacing: 0.5,
          paddingTop: size * 0.06,
        }}
      >
        {t('brand.mark')}
      </Text>
    </View>
  );
}

/** Mark + "FORCE 5" (Bebas Neue) + "CRM" eyebrow. `onDark` for charcoal backgrounds. */
export function BrandLockup({ size = 'md', onDark }: { size?: 'md' | 'lg'; onDark?: boolean }) {
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const big = size === 'lg';
  return (
    <View
      accessible
      accessibilityLabel={t('appName')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: big ? 14 : 10 }}
    >
      <F5Mark size={big ? 52 : 34} />
      <View>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: big ? 38 : 26,
            lineHeight: big ? 38 : 26,
            letterSpacing: 1.5,
            color: onDark ? '#ffffff' : colors.text,
            paddingTop: 4,
          }}
        >
          {t('brand.name').toUpperCase()}
        </Text>
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: big ? 12 : 10,
            letterSpacing: 3,
            color: onDark ? '#9299a3' : colors.textSubtle,
          }}
        >
          {t('brand.product')}
        </Text>
      </View>
    </View>
  );
}
