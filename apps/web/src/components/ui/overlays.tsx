import * as React from 'react';
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// ---- shared modal surface ---------------------------------------------------------------------

export const overlayClass = 'fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out';

/**
 * Phones (< 640px): a bottom sheet pinned to the viewport bottom, full width, scrollable.
 * Larger: the prototype's centered 520px modal with 14px radius.
 */
export const modalContentClass =
  'fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface text-text shadow-modal outline-none ' +
  'inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-slide-up ' +
  'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px] sm:data-[state=open]:animate-zoom-in';

// ---- Dialog -----------------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose = false,
  footer,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cn(modalContentClass, className)}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-[22px] sm:pt-[22px]">
          <div className="min-w-0">
            <DialogPrimitive.Title className="m-0 text-xl font-black leading-tight text-text">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="m-0 mt-2 leading-normal text-text-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          {!hideClose && (
            <DialogPrimitive.Close
              className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring md:size-9"
              aria-label={t('actions.close')}
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-[22px]">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Buttons stack full-width on phones (primary on top), right-aligned row on larger screens. */
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'safe-bottom flex flex-col-reverse gap-2 border-t border-border px-5 pt-3 sm:flex-row sm:justify-end sm:border-0 sm:px-[22px] sm:pb-[22px] sm:pt-1 [&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}

// ---- Popover ----------------------------------------------------------------------------------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 max-w-[calc(100vw-24px)] animate-fade-in rounded-[11px] border border-border bg-popover p-3 text-popover-foreground shadow-pop outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ---- Tooltip ----------------------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[min(320px,calc(100vw-24px))] animate-fade-in rounded-md bg-toast px-2.5 py-1.5 text-[12px] leading-snug text-toast-text shadow-pop"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-toast" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
