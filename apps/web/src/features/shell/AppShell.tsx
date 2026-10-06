import * as React from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { BrandMark } from '@/components/Brand';
import { overlayClass } from '@/components/ui/overlays';
import { applyLocale } from '@/lib/i18n';
import { useIsPhone, useMediaQuery } from '@/lib/media';
import { useSession } from '@/lib/session';
import { readStoredTheme, useTheme } from '@/lib/theme';
import { IdleTimer } from './IdleTimer';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';

function EnvironmentBadge({ environment }: { environment: string }) {
  const { t } = useTranslation('shell');
  if (!environment || /^prod(uction)?$/i.test(environment)) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border border-[#ffd4b6] bg-[#fff4e9] px-[9px] py-[5px] text-[11px] font-black uppercase tracking-[0.02em] text-[#ad4d12] dark:border-primary/30 dark:bg-primary-soft dark:text-primary-soft-text"
      title={t('environment', { env: environment })}
    >
      {environment}
    </span>
  );
}

/** Authenticated layout: charcoal sidebar (238px desktop, 78px icon rail on tablets, drawer on phones), 68px top bar. */
export function AppShell() {
  const { t } = useTranslation('shell');
  const session = useSession();
  const { setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPhone = useIsPhone();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Close the phone drawer after navigating.
  React.useEffect(() => setDrawerOpen(false), [pathname]);

  // Server-side preferences win once per sign-in: theme and locale follow the user across devices.
  const userId = session.user.id;
  React.useEffect(() => {
    const serverTheme = session.user.themeName;
    if (serverTheme && serverTheme !== readStoredTheme()) setTheme(serverTheme);
    applyLocale(session.user.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[78px_minmax(0,1fr)] lg:grid-cols-[238px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-surface px-4 py-3 font-bold text-text shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('skipToContent')}
      </a>

      {/* Tablet: icon rail. Desktop: full sidebar. */}
      {!isPhone && (
        <aside className="sticky top-0 hidden h-dvh md:block">
          <SidebarNav compact={!isDesktop} />
        </aside>
      )}

      {/* Phone: slide-in drawer. */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={overlayClass} />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] shadow-modal outline-none data-[state=open]:animate-slide-in-left"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">{t('nav.label')}</DialogPrimitive.Title>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <DialogPrimitive.Close
              className="absolute right-2 top-[18px] inline-flex size-11 items-center justify-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
              aria-label={t('nav.close')}
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 border-b border-border bg-surface px-3 sm:px-5 lg:px-[30px]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('nav.open')}
              aria-expanded={drawerOpen}
              className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <BrandMark size="sm" className="md:hidden" />
            <EnvironmentBadge environment={session.environment} />
          </div>
          <UserMenu />
        </header>

        <main id="main" tabIndex={-1} className="w-full max-w-[1550px] flex-1 px-4 pb-28 pt-5 outline-none sm:pb-12 md:px-5 lg:px-[30px] lg:pt-[26px]">
          <Outlet />
        </main>

        <footer className="px-4 pb-6 text-[12px] text-text-muted md:px-5 lg:hidden">{t('footer', { year: new Date().getFullYear() })}</footer>
      </div>

      <IdleTimer idleTimeoutMinutes={session.idleTimeoutMinutes} />
    </div>
  );
}
