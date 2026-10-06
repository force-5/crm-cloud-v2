import { createFileRoute } from '@tanstack/react-router';
import { MfaPage } from '@/features/auth/MfaPage';

export const Route = createFileRoute('/login/mfa')({
  component: function MfaRoute() {
    const { redirect } = Route.useSearch();
    return <MfaPage redirect={redirect} />;
  },
});
