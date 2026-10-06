import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { CurrentUser, LoginResult, MfaType, SessionInfo, TenantChoice } from '@crm/contracts';
import { api, setUnauthorizedHandler } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { DEFAULT_IDLE_TIMEOUT_MINUTES } from '@/lib/config';
import { useTheme } from './ThemeProvider';

export type SessionStatus = 'booting' | 'signedOut' | 'signedIn';
export type PendingLogin =
  | { kind: 'select-account'; accounts: TenantChoice[] }
  | { kind: 'mfa'; channel: MfaType; destination?: string };
/** Why the user landed on the login screen (shown as a banner there). */
export type SignOutReason = 'timeout' | 'manual';

type SessionContextValue = {
  status: SessionStatus;
  session: SessionInfo | null;
  user: CurrentUser | null;
  pending: PendingLogin | null;
  signOutReason: SignOutReason | null;
  clearSignOutReason: () => void;
  /** Applies a login / select-account / MFA result. Returns the step that comes next. */
  applyLoginResult: (result: LoginResult) => LoginResult['status'];
  signOut: (reason?: SignOutReason) => Promise<void>;
  updateUser: (patch: Partial<CurrentUser>) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setPreference } = useTheme();
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pending, setPending] = useState<PendingLogin | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const establish = useCallback(
    (s: SessionInfo) => {
      queryClient.clear();
      setSession(s);
      setPending(null);
      setSignOutReason(null);
      setStatus('signedIn');
      if (s.user.themeName) setPreference(s.user.themeName);
    },
    [setPreference],
  );

  /** Local sign-out: drop every cached query and go back to the login stack. */
  const endLocally = useCallback((reason: SignOutReason | null) => {
    statusRef.current = 'signedOut'; // ignore 401s from queries still in flight
    queryClient.clear();
    setSession(null);
    setPending(null);
    setSignOutReason(reason);
    setStatus('signedOut');
  }, []);

  // Bootstrap from the cookie the native cookie store kept from last time.
  useEffect(() => {
    let cancelled = false;
    api.auth
      .session()
      .then((s) => !cancelled && establish(s))
      .catch(() => !cancelled && setStatus('signedOut'));
    return () => {
      cancelled = true;
    };
  }, [establish]);

  // Any 401 while signed in → the BFF session is gone (idle expiry or revoked).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current === 'signedIn') endLocally('timeout');
    });
    return () => setUnauthorizedHandler(null);
  }, [endLocally]);

  // Idle timeout: if the app was in the background longer than the session's idle limit,
  // sign out when it comes back.
  const backgroundedAt = useRef<number | null>(null);
  const idleMinutes = session?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (next !== 'active') return;
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (statusRef.current !== 'signedIn' || since === null) return;
      if (Date.now() - since > idleMinutes * 60_000) {
        api.auth.logout().catch(() => undefined);
        endLocally('timeout');
      }
    });
    return () => sub.remove();
  }, [idleMinutes, endLocally]);

  const applyLoginResult = useCallback(
    (result: LoginResult): LoginResult['status'] => {
      if (result.status === 'ok') establish(result.session);
      else if (result.status === 'select-account') setPending({ kind: 'select-account', accounts: result.accounts });
      else setPending({ kind: 'mfa', channel: result.channel, destination: result.destination });
      return result.status;
    },
    [establish],
  );

  const signOut = useCallback(
    async (reason: SignOutReason = 'manual') => {
      try {
        await api.auth.logout();
      } catch {
        // Sign out locally regardless; an unreachable server's session will idle out.
      }
      endLocally(reason);
    },
    [endLocally],
  );

  const updateUser = useCallback((patch: Partial<CurrentUser>) => {
    setSession((s) => (s ? { ...s, user: { ...s.user, ...patch } } : s));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      pending,
      signOutReason,
      clearSignOutReason: () => setSignOutReason(null),
      applyLoginResult,
      signOut,
      updateUser,
    }),
    [status, session, pending, signOutReason, applyLoginResult, signOut, updateUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The signed-in user (only call inside the authenticated stack). */
export function useCurrentUser(): CurrentUser {
  const { user } = useSession();
  if (!user) throw new Error('No signed-in user');
  return user;
}
