import type { ReactNode } from 'react';
import { hasPermission, type PermissionAction } from '@crm/contracts';
import { useCurrentUser } from './session';

export function useCan(permission: string, action: PermissionAction = 'read'): boolean {
  const user = useCurrentUser();
  return hasPermission(user, permission, action);
}

/** `<Can permission={PERMISSIONS.ACCOUNTS} action="update">…</Can>` */
export function Can({
  permission,
  action = 'read',
  children,
  fallback = null,
}: {
  permission: string;
  action?: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(permission, action) ? <>{children}</> : <>{fallback}</>;
}
