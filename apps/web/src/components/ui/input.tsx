import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const inputClass =
  'w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-text shadow-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25';

/** 16px text on phones prevents iOS zoom-on-focus; 44px tall tap target below md. */
const sizing = 'h-11 text-base md:h-10 md:text-[14px]';

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(inputClass, sizing, 'read-only:bg-surface-muted read-only:text-text-muted', className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'min-h-[96px] resize-y py-2.5 text-base md:text-[14px]', className)} {...props} />;
}

/**
 * Styled native <select>. Deliberately native: phones get the OS picker, and it is fully
 * accessible without extra ARIA. Use `Combobox` when the list needs searching.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(inputClass, sizing, 'appearance-none pr-9')} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
