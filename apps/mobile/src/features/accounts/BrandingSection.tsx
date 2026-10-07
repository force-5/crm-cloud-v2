import { useState } from 'react';
import { Image, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@crm/api-client';
import {
  LOGO_ASPECT,
  LOGO_SIZE,
  SIGNIN_IMAGE_ASPECT,
  SIGNIN_IMAGE_SIZE,
  type AccountDetailResponse,
} from '@crm/contracts';
import { Button, Card, Text } from '@/components';
import { useTheme } from '@/providers/ThemeProvider';
import { useToast } from '@/providers/ToastProvider';
import { api, errorMessage } from '@/lib/api';
import { pickAndPrepareImage, type PickedImage } from '@/lib/images';
import { haptics } from '@/lib/haptics';

export type BrandingKind = 'logo' | 'signin';
export type PendingImages = Partial<Record<BrandingKind, PickedImage>>;

const SPEC = {
  logo: {
    titleKey: 'fields.logo',
    hintKey: 'fields.logoHint',
    aspect: LOGO_ASPECT,
    size: LOGO_SIZE,
    format: 'png' as const,
  },
  signin: {
    titleKey: 'fields.signinImage',
    hintKey: 'fields.signinImageHint',
    aspect: SIGNIN_IMAGE_ASPECT,
    size: SIGNIN_IMAGE_SIZE,
    format: 'jpeg' as const,
  },
} as const;

/**
 * Logo + sign-in image previews. Existing accounts upload immediately after the crop;
 * new accounts keep the processed image in `pending` until the first save returns an id.
 */
export function BrandingSection({
  accountId,
  logoUrl,
  signinUrl,
  canEdit,
  pending,
  onPending,
}: {
  accountId: number | null;
  logoUrl?: string;
  signinUrl?: string;
  canEdit: boolean;
  pending: PendingImages;
  onPending: (kind: BrandingKind, image: PickedImage) => void;
}) {
  const { t } = useTranslation(['accounts', 'common']);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<BrandingKind | null>(null);

  const replace = async (kind: BrandingKind) => {
    const spec = SPEC[kind];
    let image: PickedImage | null;
    try {
      image = await pickAndPrepareImage({ size: spec.size, format: spec.format });
    } catch (err) {
      toast.error(errorMessage(err, t('common:image.processFailed')));
      return;
    }
    if (!image) return;
    if (accountId === null) {
      onPending(kind, image);
      toast.info(t('toast.imageQueued', { label: t(spec.titleKey) }));
      return;
    }
    setBusy(kind);
    try {
      const { url } = await (kind === 'logo'
        ? api.accounts.uploadLogo(accountId, image.dataUrl)
        : api.accounts.uploadSigninImage(accountId, image.dataUrl));
      qc.setQueryData<AccountDetailResponse>(queryKeys.accounts.detail(accountId), (old) =>
        old?.account
          ? {
              ...old,
              account: { ...old.account, ...(kind === 'logo' ? { logoUrl: url } : { signinBackgroundImageUrl: url }) },
            }
          : old,
      );
      haptics.success();
      toast.success(t('toast.imageUploaded', { label: t(spec.titleKey) }));
    } catch (err) {
      haptics.error();
      toast.error(errorMessage(err, t('common:image.uploadFailed')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title={t('sections.branding')} subtitle={t('sections.brandingHint')} style={{ gap: 18 }}>
      <ImageSlot
        key={`logo:${pending.logo?.uri ?? logoUrl ?? ""}`}
        kind="logo"
        uri={pending.logo?.uri ?? logoUrl}
        isPending={!!pending.logo}
        canEdit={canEdit}
        busy={busy === 'logo'}
        onReplace={() => replace('logo')}
      />
      <ImageSlot
        key={`signin:${pending.signin?.uri ?? signinUrl ?? ""}`}
        kind="signin"
        uri={pending.signin?.uri ?? signinUrl}
        isPending={!!pending.signin}
        canEdit={canEdit}
        busy={busy === 'signin'}
        onReplace={() => replace('signin')}
      />
    </Card>
  );
}

function ImageSlot({
  kind,
  uri,
  isPending,
  canEdit,
  busy,
  onReplace,
}: {
  kind: BrandingKind;
  uri?: string;
  isPending: boolean;
  canEdit: boolean;
  busy: boolean;
  onReplace: () => void;
}) {
  const { t } = useTranslation(['accounts', 'common']);
  const { colors, radius } = useTheme();
  const spec = SPEC[kind];
  const [failed, setFailed] = useState(false);
  const show = !!uri && !failed;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text weight="bold">{t(spec.titleKey)}</Text>
          <Text variant="caption" tone="subtle">
            {isPending ? t('common:image.pending') : t(spec.hintKey, { w: spec.size.width, h: spec.size.height })}
          </Text>
        </View>
        {canEdit ? (
          <Button
            title={uri ? t('common:image.replace') : t('common:image.upload')}
            size="sm"
            variant="secondary"
            icon="image-outline"
            loading={busy}
            onPress={onReplace}
          />
        ) : null}
      </View>
      <View
        style={{
          width: '100%',
          aspectRatio: kind === 'logo' ? Math.max(spec.aspect, 2.4) : spec.aspect,
          borderRadius: radius.md,
          borderWidth: show ? 1 : 1.5,
          borderStyle: show ? 'solid' : 'dashed',
          borderColor: show ? colors.border : colors.borderStrong,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {show ? (
          <Image
            source={{ uri }}
            accessibilityLabel={t('common:image.preview', { label: t(spec.titleKey) })}
            onError={() => setFailed(true)}
            resizeMode={kind === 'logo' ? 'contain' : 'cover'}
            style={{ width: kind === 'logo' ? '80%' : '100%', height: kind === 'logo' ? '80%' : '100%' }}
          />
        ) : (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Ionicons name="image-outline" size={26} color={colors.textSubtle} />
            <Text variant="caption" tone="subtle">
              {t('common:image.none')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
