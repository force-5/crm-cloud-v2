import type { ReactNode } from 'react';
import type { PermissionAction } from '@crm/contracts';
import { ForbiddenPage } from '@/components/StatusPages';
import { Can } from '@/lib/permissions';

/** Page-level permission gate: renders a "No access" page instead of the screen. */
export function RequirePermission({
  permission,
  action = 'read',
  children,
}: {
  permission: string;
  action?: PermissionAction;
  children: ReactNode;
}) {
  return (
    <Can permission={permission} action={action} fallback={<ForbiddenPage />}>
      {children}
    </Can>
  );
}
