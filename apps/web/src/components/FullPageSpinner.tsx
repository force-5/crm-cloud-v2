import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function FullPageSpinner() {
  const { t } = useTranslation('shell');
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
