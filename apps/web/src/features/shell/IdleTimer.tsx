import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSignOut } from './useSignOut';

export const WARNING_MS = 5 * 60_000;
/** While the user is active, ping the BFF at most this often so the server session tracks real activity. */
const KEEPALIVE_EVERY_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Tracks real activity (pointer, keyboard, scroll, tab visibility). At idle − 5 min it shows
 * "You'll be signed out in 5:00" with a live countdown; on expiry it logs out to
 * /login?reason=timeout.
 */
export function IdleTimer({ idleTimeoutMinutes }: { idleTimeoutMinutes: number }) {
  const { t } = useTranslation('shell');
  const api = useApi();
  const signOut = useSignOut();
  const timeoutMs = Math.max(idleTimeoutMinutes, 6) * 60_000;
  const lastActivity = React.useRef(Date.now());
  const lastKeepalive = React.useRef(Date.now());
  const warningRef = React.useRef(false);
  const signingOut = React.useRef(false);
  const [remaining, setRemaining] = React.useState<number | null>(null);

  const keepalive = React.useCallback(async () => {
    lastKeepalive.current = Date.now();
    await api.auth.keepalive();
  }, [api]);

  React.useEffect(() => {
    const onActivity = () => {
      if (warningRef.current) return; // While warning, only the explicit button counts.
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastKeepalive.current > KEEPALIVE_EVERY_MS) void keepalive().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const tick = () => {
      if (signingOut.current) return;
      const left = timeoutMs - (Date.now() - lastActivity.current);
      if (left <= 0) {
        signingOut.current = true;
        warningRef.current = false;
        setRemaining(null);
        void signOut('timeout');
      } else if (left <= WARNING_MS) {
        warningRef.current = true;
        setRemaining(left);
      } else if (warningRef.current) {
        warningRef.current = false;
        setRemaining(null);
      }
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(tick, 1000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [timeoutMs, keepalive, signOut]);

  const stay = async () => {
    try {
      await keepalive();
      lastActivity.current = Date.now();
      warningRef.current = false;
      setRemaining(null);
    } catch {
      toast.error(t('idle.keepaliveFailed'));
      throw new Error('keepalive failed');
    }
  };

  return (
    <ConfirmDialog
      open={remaining !== null}
      onOpenChange={(open) => {
        // Escape / overlay = "stay signed in" is too implicit; ignore and keep the dialog up.
        if (!open && remaining !== null) return;
      }}
      title={t("idle.title", { time: formatCountdown(remaining ?? 0) })}
      description={t('idle.body')}
      confirmLabel={t('idle.stay')}
      cancelLabel={t('idle.signOut')}
      onConfirm={stay}
      onCancel={() => {
        signingOut.current = true;
        warningRef.current = false;
        setRemaining(null);
        void signOut();
      }}
    />
  );
}
