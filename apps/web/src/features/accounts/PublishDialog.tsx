import { useTranslation } from 'react-i18next';
import { CheckCircle2, Mail } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Notice } from '@/components/ui/misc';
import { richT } from '@/lib/richText';

/** Publishing is heavy and irreversible: summarise what VMS provisions and who gets emailed. */
export function PublishDialog({
  open,
  onOpenChange,
  name,
  email,
  frameworks,
  labelPreset,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  email: string;
  frameworks: string[];
  labelPreset?: string;
  onConfirm: () => Promise<unknown>;
}) {
  const { t } = useTranslation('accounts');
  const items = [
    t('publish.items.admin', { email }),
    t('publish.items.facility'),
    frameworks.length ? t('publish.items.frameworks', { list: frameworks.join(', ') }) : t('publish.items.noFrameworks'),
    t('publish.items.licenses'),
    labelPreset ? t('publish.items.flows', { preset: labelPreset }) : t('publish.items.flowsNoPreset'),
    t('publish.items.audit'),
  ];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={richT(t, 'publish.title', { name: <span className="break-words">{name}</span> })}
      description={t('publish.body')}
      confirmLabel={t('publish.confirm')}
      onConfirm={onConfirm}
    >
      <p className="m-0 mb-2 text-[13px] font-bold text-text">{t('publish.willCreate')}</p>
      <ul className="m-0 mb-4 list-none space-y-1.5 p-0">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] text-text-muted">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
      <Notice icon={<Mail />}>
        <b>{t('publish.welcomeStrong')}</b> {t('publish.welcomeRest', { email })}
      </Notice>
    </ConfirmDialog>
  );
}
