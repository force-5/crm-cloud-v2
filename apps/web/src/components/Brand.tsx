import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Orange rounded "F5" square (prototype .mark). */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[9px] bg-primary font-black leading-none text-white dark:text-primary-text',
        size === 'sm' && 'size-8 text-[16px]',
        size === 'md' && 'size-[34px] text-[18px]',
        size === 'lg' && 'size-11 rounded-[10px] text-[22px]',
        className,
      )}
    >
      {t('brand.mark')}
    </span>
  );
}

/** "FORCE 5" wordmark (Bebas Neue) over a letter-spaced "CRM" caption. */
export function BrandWordmark({ tone = 'light', large = false }: { tone?: 'light' | 'dark'; large?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-col leading-none">
      <span
        className={cn(
          'font-display uppercase tracking-[0.04em]',
          large ? 'text-[30px]' : 'text-[24px]',
          tone === 'light' ? 'text-white' : 'text-text',
        )}
      >
        {t('brand.name')}
      </span>
      <span className={cn('mt-0.5 text-[10px] font-bold tracking-[2px]', tone === 'light' ? 'text-[#9299a3]' : 'text-text-muted')}>
        {t('brand.product')}
      </span>
    </span>
  );
}
