import { createFileRoute, redirect } from '@tanstack/react-router';
import { queryKeys } from '@crm/api-client';
import { isApiError } from '@/lib/errors';
import { AppShell } from '@/features/shell/AppShell';
import { NotFoundPage } from '@/components/StatusPages';

/** Authenticated layout: every child route requires a signed-in (and MFA-verified) session. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      const session = await context.queryClient.ensureQueryData({
        queryKey: queryKeys.session,
        queryFn: () => context.api.auth.session(),
        staleTime: Infinity,
      });
      return { session };
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
      }
      throw err;
    }
  },
  component: AppShell,
  notFoundComponent: NotFoundPage,
});
