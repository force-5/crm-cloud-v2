import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // Visual track 40×22 (prototype .toggle); the ::before pseudo extends the hit area to 44px.
        'peer relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full bg-[#9aa2ad] transition-colors before:absolute before:-inset-x-1 before:-inset-y-[11px] before:content-[""] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:bg-primary dark:bg-border-strong dark:data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] translate-x-[2px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}

/** Prototype ".switch" row: title + description on the left, toggle on the right. */
export function SwitchRow({
  label,
  description,
  id,
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label: React.ReactNode;
  description?: React.ReactNode;
  id: string;
}) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 py-2', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer font-bold text-text">
          {label}
        </label>
        {description && (
          <span id={descId} className="block text-[12px] text-text-muted">
            {description}
          </span>
        )}
      </div>
      <Switch id={id} aria-describedby={descId} {...props} />
    </div>
  );
}
