import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/api';

/** Ends the BFF session, drops every cached query and returns to /login. */
export function useSignOut(): (reason?: 'timeout') => Promise<void> {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (reason) => {
      try {
        await api.auth.logout();
      } catch {
        // The session may already be gone; signing out locally is still correct.
      }
      await navigate({ to: '/login', search: reason ? { reason } : {}, replace: true });
      qc.clear();
    },
    [api, qc, navigate],
  );
}
