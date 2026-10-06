import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-bold transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring focus-visible:border-primary disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border-primary-solid bg-primary-solid text-white shadow-sm hover:border-primary-solid-hover hover:bg-primary-solid-hover dark:text-primary-text',
        secondary: 'border-border-strong bg-surface text-text hover:bg-surface-muted',
        dark: 'border-[#222a34] bg-[#222a34] text-white hover:bg-[#2c3643] dark:border-border-strong dark:bg-surface-muted',
        danger: 'border-danger/35 bg-surface text-danger hover:border-danger/60 hover:bg-danger-soft',
        destructive: 'border-danger bg-danger text-white hover:brightness-95 dark:text-[#1a0505]',
        ghost: 'border-transparent bg-transparent text-text hover:bg-surface-muted',
        link: 'border-transparent bg-transparent font-bold text-primary-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-[13px]',
        md: 'h-11 px-3.5 md:h-10',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'size-11 p-0 md:size-9',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 md:h-auto' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
