import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ---- Badge (prototype pill badges) ---------------------------------------------------------

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-black leading-none tracking-[0.01em]',
  {
    variants: {
      tone: {
        success: 'bg-success-soft text-success',
        neutral: 'bg-neutral-soft text-neutral-text',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
        primary: 'bg-primary-soft text-primary-soft-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ---- Card -------------------------------------------------------------------------------------

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('crm-card p-4 sm:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('m-0 text-base font-black text-text', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('m-0 mt-1 text-[12px] text-text-muted', className)} {...props} />;
}

// ---- Skeleton ---------------------------------------------------------------------------------

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('animate-shimmer rounded-md bg-surface-muted dark:bg-border', className)} {...props} />;
}

// ---- Progress ---------------------------------------------------------------------------------

export function Progress({
  value,
  max = 100,
  tone = 'info',
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'info' | 'danger' | 'primary';
  className?: string;
  label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : value > 0 ? 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, 0)}
      aria-valuenow={Math.max(0, Math.min(value, max))}
      className={cn('mt-1.5 h-1.5 w-full overflow-hidden rounded bg-surface-muted dark:bg-border', className)}
    >
      <span
        className={cn(
          'block h-full rounded transition-[width] duration-300',
          tone === 'danger' ? 'bg-danger' : tone === 'primary' ? 'bg-primary' : 'bg-[#4d77d8] dark:bg-info',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---- Notice (prototype orange banner) -------------------------------------------------------

export function Notice({
  className,
  tone = 'primary',
  icon,
  children,
  ...props
}: React.ComponentProps<'div'> & { tone?: 'primary' | 'info' | 'danger' | 'warning'; icon?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-[9px] border px-3.5 py-3 text-[13px] leading-normal',
        tone === 'primary' && 'border-[#fed7aa] bg-[#fff7ed] text-[#8a420f] dark:border-primary/30 dark:bg-primary-soft dark:text-primary-soft-text',
        tone === 'info' && 'border-info/25 bg-info-soft text-info',
        tone === 'danger' && 'border-danger/25 bg-danger-soft text-danger',
        tone === 'warning' && 'border-warning/25 bg-warning-soft text-warning',
        className,
      )}
      {...props}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---- Spinner ----------------------------------------------------------------------------------

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
