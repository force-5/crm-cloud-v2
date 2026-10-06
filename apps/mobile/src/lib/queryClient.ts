import { AppState, Platform, type AppStateStatus } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { ApiClientError } from '@crm/api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry client errors (401/403/404/422…); retry network/5xx twice.
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Refetch stale queries when the app comes back to the foreground (TanStack RN recipe). */
export function setupFocusManager() {
  const onChange = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
