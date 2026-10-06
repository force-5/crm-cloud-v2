import { createFileRoute, Outlet } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthLayout } from '@/features/auth/AuthLayout';

export const loginSearchSchema = z.object({
  /** Where to go after sign-in. Sanitised with `safeRedirect` before use (same-origin paths only). */
  redirect: z.string().max(2000).optional().catch(undefined),
  reason: z.enum(['timeout']).optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: () => (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  ),
});
