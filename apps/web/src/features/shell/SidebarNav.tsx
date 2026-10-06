import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Building2, LayoutDashboard, Package, type LucideIcon } from 'lucide-react';
import { PERMISSIONS, hasPermission } from '@crm/contracts';
import { BrandMark, BrandWordmark } from '@/components/Brand';
import { Tooltip } from '@/components/ui/overlays';
import { useCurrentUser } from '@/lib/session';
import { cn } from '@/lib/utils';

type NavItem = {
  to: '/' | '/accounts' | '/products';
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, exact: true },
  { to: '/accounts', labelKey: 'nav.accounts', icon: Building2, permission: PERMISSIONS.ACCOUNTS },
  { to: '/products', labelKey: 'nav.products', icon: Package, permission: PERMISSIONS.PRODUCTS },
];

/**
 * Dark charcoal sidebar contents (prototype .side). `compact` = icon rail (tablet); labels stay
 * available to screen readers and as tooltips.
 */
export function SidebarNav({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation('shell');
  const user = useCurrentUser();
  const items = NAV.filter((i) => !i.permission || hasPermission(user, i.permission, 'read'));

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-sidebar to-sidebar-end px-3.5 py-[22px] text-[#d6dae0]">
      <Link
        to="/"
        onClick={onNavigate}
        className={cn('mb-[26px] flex items-center gap-[11px] rounded-md px-2.5 focus-visible:ring-3 focus-visible:ring-focus-ring', compact && 'justify-center px-0')}
        aria-label={t('common:brand.home')}
      >
        <BrandMark />
        {!compact && <BrandWordmark tone="light" />}
      </Link>
      <nav aria-label={t('nav.label')}>
        <ul className="m-0 list-none p-0">
          {items.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            const link = (
              <Link
                to={item.to}
                onClick={onNavigate}
                activeOptions={{ exact: item.exact ?? false }}
                aria-label={compact ? label : undefined}
                className={cn(
                  'my-[3px] flex min-h-11 items-center gap-3 rounded-[9px] px-3 font-bold text-sidebar-text no-underline transition-colors hover:bg-[#242b34] hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring data-[status=active]:bg-[#242b34] data-[status=active]:text-white data-[status=active]:shadow-[inset_3px_0_0_var(--primary)] dark:hover:bg-sidebar-active dark:data-[status=active]:bg-sidebar-active',
                  compact && 'justify-center px-0',
                )}
              >
                <Icon className="size-[19px] shrink-0" aria-hidden="true" />
                {!compact && <span>{label}</span>}
              </Link>
            );
            return <li key={item.to}>{compact ? <Tooltip content={label} side="right">{link}</Tooltip> : link}</li>;
          })}
        </ul>
      </nav>
      {!compact && <p className="m-0 mt-auto px-0.5 text-[12px] text-[#8b939e]">{t('footer', { year: new Date().getFullYear() })}</p>}
    </div>
  );
}
