import * as React from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ConfirmDialog';

/**
 * Warns before leaving a page with unsaved changes: an in-app confirm for router navigation
 * (path changes only — switching tabs via the query string is allowed) and the browser's
 * native prompt on reload/close (beforeunload).
 *
 * Returns `allowNextNavigation()` to call right before a programmatic navigation that follows
 * a successful save.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const bypass = React.useRef(false);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (bypass.current) {
        bypass.current = false;
        return false;
      }
      return dirtyRef.current && current.pathname !== next.pathname;
    },
    enableBeforeUnload: () => dirtyRef.current && !bypass.current,
    withResolver: true,
  });

  const allowNextNavigation = React.useCallback(() => {
    bypass.current = true;
  }, []);

  const dialog = <UnsavedDialog blocker={blocker} />;
  return { dialog, allowNextNavigation };
}

function UnsavedDialog({
  blocker,
}: {
  blocker: { status: 'blocked' | 'idle'; proceed?: () => void; reset?: () => void };
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title={t('unsaved.title')}
      description={t('unsaved.body')}
      confirmLabel={t('actions.leave')}
      cancelLabel={t('actions.stay')}
      destructive
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
