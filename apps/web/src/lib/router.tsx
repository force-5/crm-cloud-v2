import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { CrmApi } from '@crm/api-client';
import { routeTree } from '@/routeTree.gen';
import { NotFoundPage, RouteErrorPage } from '@/components/StatusPages';
import { FullPageSpinner } from '@/components/FullPageSpinner';

export type RouterContext = { queryClient: QueryClient; api: CrmApi };

export const BASE_PATH = '/crm';

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    basepath: BASE_PATH,
    defaultPreload: 'intent',
    // Data freshness is TanStack Query's job; the router always asks it.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: RouteErrorPage,
    defaultPendingComponent: FullPageSpinner,
    defaultPendingMs: 400,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}

/** Public (unauthenticated) paths, relative to the base path. */
export function isPublicPath(pathname: string): boolean {
  return /^\/(login|forgot-password)(\/|$)/.test(pathname);
}
