import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import type { CurrentUser, SessionInfo } from '@crm/contracts';
import { useApi } from './api';

/** The signed-in session. Only valid under the authenticated `_app` layout (its guard preloads it). */
export function useSession(): SessionInfo {
  const api = useApi();
  const { data } = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.auth.session(),
    staleTime: Infinity,
    retry: false,
  });
  // Keep rendering the last known session while signing out (the cache is cleared mid-navigation).
  const last = useRef<SessionInfo | undefined>(undefined);
  if (data) last.current = data;
  const session = data ?? last.current;
  if (!session) throw new Error('useSession used outside an authenticated route');
  return session;
}

export function useCurrentUser(): CurrentUser {
  return useSession().user;
}

/** Patch the cached session user in place (photo, theme, profile edits) — no refetch. */
export function useUpdateSessionUser(): (patch: Partial<CurrentUser>) => void {
  const qc = useQueryClient();
  return (patch) =>
    qc.setQueryData<SessionInfo>(queryKeys.session, (s) => (s ? { ...s, user: { ...s.user, ...patch } } : s));
}
