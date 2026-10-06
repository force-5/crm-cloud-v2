import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '@/lib/router';
import { NotFoundPage, StandaloneStatus } from '@/components/StatusPages';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <StandaloneStatus>
      <NotFoundPage />
    </StandaloneStatus>
  ),
});
