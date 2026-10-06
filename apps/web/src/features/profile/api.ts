import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@crm/api-client';
import type { CurrentUser, ProfileResponse } from '@crm/contracts';
import { useApi } from '@/lib/api';
import { useUpdateSessionUser } from '@/lib/session';

/** Profile always loads from the API (never from the cached session copy). */
export function useProfile() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => api.profile.get(), staleTime: 0, refetchOnWindowFocus: false });
}

/** Write a user change into both the profile query and the session (header avatar, timezone…). */
export function usePatchUser() {
  const qc = useQueryClient();
  const updateSession = useUpdateSessionUser();
  return (patch: Partial<CurrentUser>) => {
    qc.setQueryData<ProfileResponse>(queryKeys.profile, (prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev));
    updateSession(patch);
  };
}
