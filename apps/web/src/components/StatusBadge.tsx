import { useTranslation } from 'react-i18next';
import { statusTone } from '@crm/tokens';
import { Badge, type BadgeTone } from '@/components/ui/misc';

export type StatusKind = 'active' | 'inactive' | 'draft' | 'new';

/** Pill badge for account / license / product status (prototype .badge.active/.inactive/.draft). */
export function StatusBadge({ status, className }: { status: StatusKind; className?: string }) {
  const { t } = useTranslation();
  const tone = (statusTone[status] ?? 'neutral') as BadgeTone;
  return (
    <Badge tone={tone} className={className}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** License type badge: SUBSCRIPTION=primary, PERPETUAL=success, TRIAL=warning, USAGE_BASED=info. */
export function LicenseTypeBadge({ type, label }: { type: string; label: string }) {
  const tone = (statusTone[type] ?? 'neutral') as BadgeTone;
  return <Badge tone={tone}>{label}</Badge>;
}
