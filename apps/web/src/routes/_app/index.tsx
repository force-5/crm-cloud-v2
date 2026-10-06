import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

export const Route = createFileRoute('/_app/')({
  staticData: { crumbs: [{ key: 'shell:nav.dashboard' }] },
  component: DashboardPage,
});
