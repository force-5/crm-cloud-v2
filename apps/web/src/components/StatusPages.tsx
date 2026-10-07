import * as React from 'react';
import type { ReactNode } from 'react';
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { reportError } from '@/lib/sentry';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Compass, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/Brand';

function StatusLayout({
  icon,
  code,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  code?: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="crm-card w-full max-w-[480px] px-6 py-9 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-text [&_svg]:size-6" aria-hidden="true">
          {icon}
        </div>
        {code && <p className="m-0 font-display text-[44px] leading-none tracking-[0.04em] text-primary-ink">{code}</p>}
        <h1 className="m-0 mt-1 text-[24px] font-black text-text">{title}</h1>
        <p className="m-0 mx-auto mt-2 max-w-sm text-text-muted">{body}</p>
        {children && <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">{children}</div>}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation('shell');
  return (
    <StatusLayout icon={<Compass />} code={t('notFound.code')} title={t('notFound.title')} body={t('notFound.body')}>
      <Button asChild variant="primary">
        <Link to="/">{t('common:actions.goHome')}</Link>
      </Button>
    </StatusLayout>
  );
}

export function ForbiddenPage() {
  const { t } = useTranslation('shell');
  return (
    <StatusLayout icon={<ShieldAlert />} title={t('forbidden.title')} body={t('forbidden.body')}>
      <Button asChild variant="secondary">
        <Link to="/">{t('common:actions.goHome')}</Link>
      </Button>
    </StatusLayout>
  );
}

/** Route error boundary page (never redirects — the old app looped here). */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation('shell');
  React.useEffect(() => reportError(error), [error]);
  const router = useRouter();
  const queryReset = useQueryErrorResetBoundary();
  const retry = () => {
    queryReset.reset();
    reset();
    void router.invalidate();
  };
  return (
    <StatusLayout icon={<TriangleAlert />} title={t('error.title')} body={t('error.body')}>
      <Button variant="primary" onClick={retry}>
        {t('common:actions.retry')}
      </Button>
      <Button asChild variant="secondary">
        <Link to="/">{t('common:actions.goHome')}</Link>
      </Button>
      {import.meta.env.DEV && error instanceof Error && (
        <details className="mt-4 w-full text-left text-[12px] text-text-muted">
          <summary>{t('error.details')}</summary>
          <pre className="whitespace-pre-wrap">{error.message}</pre>
        </details>
      )}
    </StatusLayout>
  );
}

/** Top-level fallback used outside the app shell (public pages). */
export function StandaloneStatus({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <BrandMark size="sm" />
      </div>
      {children}
    </div>
  );
}
