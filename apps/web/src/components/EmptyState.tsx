import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)} role="status">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-muted text-text-muted [&_svg]:size-6" aria-hidden="true">
        {icon ?? <Inbox />}
      </div>
      <p className="m-0 font-black text-text">{title}</p>
      {description && <p className="m-0 mt-1 max-w-md text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline error panel with a retry action. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center" role="alert">
      <p className="m-0 font-black text-text">{title}</p>
      {description && <p className="m-0 mt-1 max-w-md text-text-muted">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 font-bold hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring md:min-h-10"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
