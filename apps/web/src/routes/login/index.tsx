import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from '@/features/auth/LoginPage';

export const Route = createFileRoute('/login/')({
  component: function LoginRoute() {
    const { redirect, reason } = Route.useSearch();
    return <LoginPage redirect={redirect} reason={reason} />;
  },
});
