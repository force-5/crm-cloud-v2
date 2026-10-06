import { createFileRoute } from '@tanstack/react-router';
import { SelectAccountPage } from '@/features/auth/SelectAccountPage';

export const Route = createFileRoute('/login/select-account')({
  component: function SelectAccountRoute() {
    const { redirect } = Route.useSearch();
    return <SelectAccountPage redirect={redirect} />;
  },
});
