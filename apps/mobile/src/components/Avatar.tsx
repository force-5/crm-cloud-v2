import { useState } from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { Text } from './Text';

export function Avatar({ uri, initials, size = 40 }: { uri?: string | null; initials: string; size?: number }) {
  const { colors, fonts } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: colors.sidebarActive,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showImage ? (
        <Image source={{ uri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : (
        <Text style={{ color: '#ffffff', fontFamily: fonts.black, fontSize: size * 0.38 }}>{initials}</Text>
      )}
    </View>
  );
}
