import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { ProfilePage } from '@/features/profile/ProfilePage';

const searchSchema = z.object({
  tab: z.enum(['profile', 'security', 'appearance']).catch('profile').default('profile'),
});

export const Route = createFileRoute('/_app/profile')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'profile' })] },
  staticData: { crumbs: [{ key: 'shell:nav.profile' }] },
  component: function ProfileRoute() {
    const { tab } = Route.useSearch();
    const navigate = Route.useNavigate();
    return <ProfilePage tab={tab} onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })} />;
  },
});
