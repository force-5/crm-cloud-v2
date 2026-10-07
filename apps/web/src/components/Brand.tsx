import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Orange rounded "F5" square (prototype .mark). The glyphs are drawn as SVG so the mark is a logo image,
 * which WCAG exempts from text contrast; as styled HTML text, white on brand orange (3.0:1) failed axe.
 * Decorative: the "FORCE 5" wordmark beside it carries the name.
 */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-[9px] bg-primary text-white dark:text-primary-text',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-[34px]',
        size === 'lg' && 'size-11 rounded-[10px]',
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="size-full" focusable="false">
        <text x="50" y="54" textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize="52" fontWeight="900">
          {t('brand.mark')}
        </text>
      </svg>
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
