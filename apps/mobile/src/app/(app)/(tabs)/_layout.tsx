import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, hasPermission } from '@crm/contracts';
import { useTheme } from '@/providers/ThemeProvider';
import { useSession } from '@/providers/SessionProvider';

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  const { t } = useTranslation('shell');
  const { user } = useSession();
  const canAccounts = hasPermission(user, PERMISSIONS.ACCOUNTS);
  const canProducts = hasPermission(user, PERMISSIONS.PRODUCTS);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: t('nav.accounts'),
          href: canAccounts ? undefined : null,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: t('nav.products'),
          href: canProducts ? undefined : null,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
