import { PERMISSIONS, hasPermission, type CurrentUser } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { isCrmUser, withCrmGrants } from '../src/auth/guard';

const crm = { allowedTenantIds: [1], allowedRoles: ['CRM_ADMIN', 'ROLE_ADMIN'], requiredPermission: undefined };

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 4,
  email: 'crmadmin@force5.com',
  firstName: 'CRM',
  lastName: 'Admin',
  locale: 'en-US',
  themeName: 'system',
  mfaEnabled: false,
  securityRoles: [],
  permissions: [],
  tenant: { id: 1, name: 'Force5 Inc.', requireMfa: false },
  ...over,
});

describe('D1 guard', () => {
  it('admits Force 5 users holding an allowed role', () => {
    expect(isCrmUser(user({ securityRoles: [{ code: 'CRM_ADMIN', name: 'CRM' }] }), crm)).toBe(true);
    expect(isCrmUser(user({ securityRoles: [{ code: 'ROLE_ADMIN', name: 'Admin' }] }), crm)).toBe(true);
  });

  it('rejects users without a CRM role, and other tenants even with one', () => {
    expect(isCrmUser(user(), crm)).toBe(false);
    expect(isCrmUser(user({ securityRoles: [{ code: 'ROLE_USER', name: 'User' }] }), crm)).toBe(false);
    const other = user({ securityRoles: [{ code: 'ROLE_ADMIN', name: 'Admin' }], tenant: { id: 3, name: 'Apex', requireMfa: false } });
    expect(isCrmUser(other, crm)).toBe(false);
  });

  it('optionally admits holders of a configured VMS permission', () => {
    const p = { code: 'MANAGE_ACCOUNT', read: true, create: false, update: false, delete: false, execute: false };
    expect(isCrmUser(user({ permissions: [p] }), crm)).toBe(false);
    expect(isCrmUser(user({ permissions: [p] }), { ...crm, requiredPermission: 'MANAGE_ACCOUNT' })).toBe(true);
  });

  it('grants the CRM permission codes the clients gate on, only to CRM users', () => {
    const granted = withCrmGrants(user({ securityRoles: [{ code: 'CRM_ADMIN', name: 'CRM' }] }), crm);
    for (const code of Object.values(PERMISSIONS)) expect(hasPermission(granted, code, 'delete')).toBe(true);
    expect(withCrmGrants(user(), crm).permissions).toEqual([]);
  });

  it('keeps a grant VMS already sent', () => {
    const own = { code: PERMISSIONS.PRODUCTS, read: true, create: false, update: false, delete: false, execute: false };
    const granted = withCrmGrants(user({ securityRoles: [{ code: 'ROLE_ADMIN', name: 'Admin' }], permissions: [own] }), crm);
    expect(hasPermission(granted, PERMISSIONS.PRODUCTS, 'delete')).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.ACCOUNTS, 'delete')).toBe(true);
  });
});
