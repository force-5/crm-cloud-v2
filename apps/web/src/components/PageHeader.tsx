import type { ReactNode } from 'react';
import { Link, useMatches, type LinkProps } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Crumb = { key: string; to?: LinkProps['to'] };

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Breadcrumb trail after "CRM" (i18n keys). The last crumb can be overridden by the page. */
    crumbs?: Crumb[];
  }
}

/** "CRM / Accounts / Northstar" — generated from the deepest matched route's `staticData.crumbs`. */
export function Breadcrumbs({ currentLabel }: { currentLabel?: string }) {
  const { t } = useTranslation();
  const matches = useMatches();
  const crumbs = [...matches].reverse().find((m) => m.staticData?.crumbs)?.staticData.crumbs ?? [];
  const items = crumbs.map((c, i) => ({
    label: i === crumbs.length - 1 && currentLabel ? currentLabel : t(c.key),
    to: i === crumbs.length - 1 ? undefined : c.to,
  }));
  return (
    <nav aria-label={t('shell:breadcrumb')} className="mb-2 min-w-0 text-[12px] text-text-muted">
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-1 p-0">
        <li className="inline-flex items-center gap-1">
          <Link to="/" className="rounded-sm hover:text-text hover:underline">
            {t('brand.product')}
          </Link>
        </li>
        {items.map((c, i) => (
          <li key={i} className="inline-flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3 shrink-0 opacity-70" aria-hidden="true" />
            {c.to ? (
              <Link to={c.to} className="rounded-sm hover:text-text hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-[60vw] truncate sm:max-w-[40ch]">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Page title block (prototype .crumb + .pagehead). With `formActions`, the actions become a
 * sticky header bar on tablet/desktop and a full-width sticky bottom bar on phones.
 */
export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  crumbLabel,
  formActions = false,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  crumbLabel?: string;
  formActions?: boolean;
  meta?: ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          'mb-[22px]',
          formActions &&
            'md:sticky md:top-[68px] md:z-20 md:-mx-5 md:mb-4 md:bg-background/95 md:px-5 md:pb-3 md:pt-1 md:backdrop-blur lg:-mx-[30px] lg:px-[30px]',
        )}
      >
        <Breadcrumbs currentLabel={crumbLabel} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="m-0 break-words text-[24px] font-black leading-tight tracking-[-0.01em] text-text sm:text-[28px]">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle && <div className="mt-1 text-text-muted">{subtitle}</div>}
            {meta}
          </div>
          {actions && (
            <div
              className={cn(
                'flex flex-wrap gap-[9px] sm:shrink-0 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none',
                formActions &&
                  'safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none',
              )}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
