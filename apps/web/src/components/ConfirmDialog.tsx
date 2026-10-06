import * as React from 'react';
import { AlertDialog } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DialogFooter, modalContentClass, overlayClass } from '@/components/ui/overlays';
import { cn } from '@/lib/utils';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
  /** May return a promise; the dialog shows a spinner and closes when it resolves. Stays open on reject. */
  onConfirm: () => void | Promise<unknown>;
  onCancel?: () => void;
  className?: string;
};

/** Confirmation for destructive or impactful actions (bottom sheet on phones). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  className,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      setPending(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller surfaces the error (toast / inline); keep the dialog open so the user can retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          className={cn(modalContentClass, className)}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4 sm:px-[22px] sm:pt-[22px]">
            <AlertDialog.Title className="m-0 text-xl font-black leading-tight text-text">{title}</AlertDialog.Title>
            {description && (
              <AlertDialog.Description className="m-0 mt-2 leading-normal text-text-muted [&_b]:text-text [&_strong]:text-text">
                {description}
              </AlertDialog.Description>
            )}
            {children && <div className="mt-4">{children}</div>}
          </div>
          <DialogFooter>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending} onClick={onCancel}>
                {cancelLabel ?? t('actions.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={destructive ? 'destructive' : 'primary'} loading={pending} onClick={handleConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </DialogFooter>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
