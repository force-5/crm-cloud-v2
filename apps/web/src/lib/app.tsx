import type { RouterHistory } from '@tanstack/react-router';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { CrmApi } from '@crm/api-client';
import { Toaster } from 'sonner';
import { ApiContext, API_BASE_URL, createAppApi } from './api';
import { createQueryClient } from './query';
import { createAppRouter, isPublicPath, type AppRouter } from './router';
import { ThemeProvider, useTheme } from './theme';
import { TooltipProvider } from '@/components/ui/overlays';

export type AppInstance = { router: AppRouter; queryClient: QueryClient; api: CrmApi };

/**
 * Wires the API client, query cache and router together. Any 401 from the BFF clears the
 * cache and sends the user to /login?redirect=<where they were>.
 */
export function createAppInstance(opts: { baseUrl?: string; history?: RouterHistory } = {}): AppInstance {
  const queryClient = createQueryClient();
  // Assigned once below; declared first because onUnauthorized (passed to the API client) closes over it.
  // eslint-disable-next-line prefer-const
  let router: AppRouter | undefined;

  const onUnauthorized = () => {
    if (!router) return;
    const loc = router.state.location;
    if (isPublicPath(loc.pathname)) return;
    void router
      .navigate({ to: '/login', search: { redirect: loc.href }, replace: true })
      .finally(() => queryClient.clear());
  };

  const api = createAppApi(onUnauthorized, opts.baseUrl ?? API_BASE_URL);
  router = createAppRouter({ queryClient, api }, opts.history);
  return { router, queryClient, api };
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolved}
      closeButton
      toastOptions={{
        classNames: {
          // Prototype .toast: dark charcoal pill bottom-right.
          toast: '!bg-toast !text-toast-text !border-transparent !rounded-[9px] !shadow-pop !font-sans',
          description: '!text-toast-text/80',
          closeButton: '!bg-toast !text-toast-text !border-white/20',
          success: '[&_[data-icon]]:!text-[#5fd3a0]',
          error: '[&_[data-icon]]:!text-[#ff8080]',
        },
      }}
    />
  );
}

export function AppProviders({ app }: { app: AppInstance }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={app.queryClient}>
        <ApiContext.Provider value={app.api}>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={app.router} />
            <ThemedToaster />
          </TooltipProvider>
        </ApiContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
