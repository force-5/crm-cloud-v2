import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AccountSummary } from '@crm/contracts';
import { Card, IconButton, StatusBadge, Text, type IconName } from '@/components';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { callPhone, sendEmail } from '@/lib/contact';
import { cityState, formatDate, fullName } from '@/lib/format';

type Props = {
  account: AccountSummary;
  onPress: (account: AccountSummary) => void;
  onMore?: (account: AccountSummary) => void;
};

export const AccountCard = memo(function AccountCard({ account, onPress, onMore }: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const c = account.mainContact;
  const contactName = fullName(c.firstName, c.lastName);
  const location = cityState(account.city, account.state);

  const call = async (phone: string) => {
    if (!(await callPhone(phone))) toast.error("This device can't place calls");
  };
  const email = async (address: string) => {
    if (!(await sendEmail(address))) toast.error('No email app is set up');
  };

  return (
    <Card
      onPress={() => onPress(account)}
      onLongPress={onMore ? () => onMore(account) : undefined}
      accessibilityLabel={`${account.name}, ${account.status}`}
      style={{ gap: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h2" numberOfLines={2}>
            {account.name}
          </Text>
          <StatusBadge status={account.status} />
        </View>
        {onMore ? (
          <IconButton icon="ellipsis-horizontal" label={`Actions for ${account.name}`} onPress={() => onMore(account)} />
        ) : null}
      </View>

      {contactName || c.email ? (
        <View style={{ gap: 2 }}>
          {contactName ? <Text weight="bold">{contactName}</Text> : null}
          {c.email ? (
            <ContactLink icon="mail-outline" label={c.email} onPress={() => email(c.email!)} a11y={`Email ${c.email}`} />
          ) : null}
        </View>
      ) : (
        <Text variant="small" tone="subtle">
          No main contact yet
        </Text>
      )}

      {c.mobile || c.phone ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 }}>
          {c.mobile ? (
            <ContactLink icon="phone-portrait-outline" label={c.mobile} onPress={() => call(c.mobile!)} a11y={`Call mobile ${c.mobile}`} />
          ) : null}
          {c.phone ? (
            <ContactLink icon="call-outline" label={c.phone} onPress={() => call(c.phone!)} a11y={`Call office ${c.phone}`} />
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          {location ? <Ionicons name="location-outline" size={14} color={colors.textSubtle} /> : null}
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {location || account.country || ''}
          </Text>
        </View>
        <Text variant="caption" tone="subtle">
          Created {formatDate(account.dateCreated)}
        </Text>
      </View>
    </Card>
  );
});

function ContactLink({ icon, label, onPress, a11y }: { icon: IconName; label: string; onPress: () => void; a11y: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={a11y}
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1, paddingVertical: 2 })}
    >
      <Ionicons name={icon} size={15} color={colors.primary} />
      <Text variant="small" tone="primary" weight="bold" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
