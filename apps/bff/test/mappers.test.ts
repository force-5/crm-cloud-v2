import { listQuerySchema } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { maskDestination } from '../src/routes/auth';
import { totpSecretFromUri } from '../src/routes/profile';
import { mapVmsError } from '../src/vms/client';
import { activeParam, isoDate, pagingQuery, toPage } from '../src/vms/common';
import { mapTenantLicense, vmsTenantLicenseSchema } from '../src/vms/licenses';
import { PRODUCT_SORT } from '../src/vms/products';
import { ACCOUNT_SORT, accountStatus, mapAccount, mapAccountLookups, vmsTenantSchema } from '../src/vms/tenants';
import { mapCurrentUser, vmsAuthUserSchema } from '../src/vms/users';

const q = (o: Record<string, unknown>) => listQuerySchema.parse(o);

describe('paging / sorting / status', () => {
  it('converts 1-based UI pages to 0-based VMS pages and back', () => {
    expect(pagingQuery(q({ page: 3, size: 10 }), ACCOUNT_SORT)).toMatchObject({ page: 2, size: 10 });
    const page = toPage({ content: [1, 2], page: { number: 2, size: 10, totalElements: 22, totalPages: 3 } }, (x) => x * 10);
    expect(page).toEqual({ items: [10, 20], page: 3, size: 10, total: 22, totalPages: 3 });
  });

  it('maps status active|inactive|all to active=true|false|omitted', () => {
    expect(activeParam('active')).toBe(true);
    expect(activeParam('inactive')).toBe(false);
    expect(activeParam('all')).toBeUndefined();
    expect(pagingQuery(q({ status: 'all' }), ACCOUNT_SORT).active).toBeUndefined();
    // default status filter is Active
    expect(pagingQuery(q({}), ACCOUNT_SORT).active).toBe(true);
  });

  it('maps sort + dir to sort=field,dir; mainContact sorts by last then first name', () => {
    expect(pagingQuery(q({ sort: 'mainContact', dir: 'desc' }), ACCOUNT_SORT).sort).toEqual([
      'mainContactLastName,desc',
      'mainContactFirstName,desc',
    ]);
    expect(pagingQuery(q({ sort: 'city' }), ACCOUNT_SORT).sort).toEqual(['city,asc']);
    expect(pagingQuery(q({ sort: 'bogus; drop table' }), ACCOUNT_SORT).sort).toEqual(['name,asc']);
  });

  it('products always add name as a secondary sort', () => {
    expect(pagingQuery(q({ sort: 'productCode', dir: 'desc' }), PRODUCT_SORT).sort).toEqual(['productCode,desc', 'name,asc']);
    expect(pagingQuery(q({ sort: 'name', dir: 'desc' }), PRODUCT_SORT).sort).toEqual(['name,desc']);
  });

  it('normalizes VMS dates', () => {
    expect(isoDate('2026-09-18T14:05:00.000+00:00')).toBe('2026-09-18T14:05:00.000Z');
    expect(isoDate(null)).toBeUndefined();
  });
});

const vmsTenant = {
  id: 9,
  name: 'Acme',
  city: 'Atlanta',
  state: { id: 11, code: 'GA', description: 'Georgia' },
  country: { id: 1, code: 'US', description: 'United States' },
  language: { id: 1, code: 'en', description: 'English' },
  mainContactFirstName: 'Sarah',
  mainContactLastName: null,
  mainContactEmail: 'sarah@acme.example',
  active: true,
  requireMfa: true,
  registeredDate: '2026-09-18T14:05:00.000+00:00',
  dateCreated: '2026-09-18T14:00:00Z',
  frameworkIds: [1, 2],
  labelVerticalId: null,
  // secrets VMS really returns:
  defaultPassword: 'Welcome-123',
  registrationCode: 'RC-1',
  registrationUrl: 'https://x/accountSetup/start/OQ==',
  registrationQrCode: 'data:image/png;base64,AAA',
  clearPassword: 'hunter2',
};

describe('tenant mapping', () => {
  it('strips secrets and nulls', () => {
    const a = mapAccount(vmsTenantSchema.parse(vmsTenant));
    const json = JSON.stringify(a);
    for (const secret of ['defaultPassword', 'registrationCode', 'registrationUrl', 'registrationQrCode', 'clearPassword', 'Welcome-123', 'hunter2']) {
      expect(json).not.toContain(secret);
    }
    expect(a).toMatchObject({
      id: 9,
      status: 'active',
      state: 'Georgia',
      country: 'United States',
      language: 'English',
      languageId: 1,
      countryId: 1,
      stateId: 11,
      requireMfa: true,
      frameworkIds: [1, 2],
      registeredDate: '2026-09-18T14:05:00.000Z',
      mainContact: { firstName: 'Sarah', email: 'sarah@acme.example' },
    });
    expect('lastName' in a.mainContact && a.mainContact.lastName === null).toBe(false);
  });

  it('derives status: draft when registeredDate is null, else active/inactive', () => {
    expect(accountStatus({ registeredDate: null, active: true })).toBe('draft');
    expect(accountStatus({ registeredDate: null, active: false })).toBe('draft');
    expect(accountStatus({ registeredDate: '2026-01-01', active: true })).toBe('active');
    expect(accountStatus({ registeredDate: '2026-01-01', active: false })).toBe('inactive');
  });

  it('maps supportingLists to AccountLookups options', () => {
    const lookups = mapAccountLookups(
      {
        supportedLanguages: [{ id: 1, code: 'en', description: 'English' }],
        supportedTimeZones: [{ zoneId: 'America/Chicago', description: '(UTC-06:00) Central' }],
        country: [{ id: 1, code: 'US', description: 'United States' }],
        states: [{ id: 11, code: 'GA', description: 'Georgia' }],
        framework: [{ value: '2', text: 'Contractor' }],
      },
      [{ id: 1, name: 'Construction' }],
    );
    expect(lookups).toEqual({
      languages: [{ value: 1, label: 'English', code: 'en' }],
      timeZones: [{ value: 'America/Chicago', label: '(UTC-06:00) Central' }],
      countries: [{ value: 1, label: 'United States', code: 'US' }],
      states: [{ value: 11, label: 'Georgia', code: 'GA' }],
      frameworks: [{ value: 2, label: 'Contractor' }],
      labelVerticals: [{ id: 1, name: 'Construction' }],
    });
  });
});

describe('license mapping', () => {
  it('licenseCount → purchasedCount, registeredLicenseCount → usedCount', () => {
    const l = mapTenantLicense(
      vmsTenantLicenseSchema.parse({
        id: 4,
        productName: 'Kiosk',
        licenseType: 'SUBSCRIPTION',
        licenseTypeDisplay: 'Subscription',
        licenseCount: 10,
        registeredLicenseCount: 14,
        active: true,
        category: null,
      }),
    );
    expect(l).toEqual({
      id: 4,
      productName: 'Kiosk',
      licenseType: 'SUBSCRIPTION',
      licenseTypeDisplay: 'Subscription',
      purchasedCount: 10,
      usedCount: 14,
      active: true,
      description: undefined,
      productCode: undefined,
      productSku: undefined,
      category: undefined,
    });
  });

  it('keeps a null licenseCount (non-subscription) as null', () => {
    const l = mapTenantLicense(vmsTenantLicenseSchema.parse({ id: 1, licenseCount: null, registeredLicenseCount: 2 }));
    expect(l.purchasedCount).toBeNull();
    expect(l.usedCount).toBe(2);
  });
});

describe('user mapping', () => {
  it('maps AuthUserDto → CurrentUser (themeMode fallback, topt → totp, permissions)', () => {
    const u = mapCurrentUser(
      vmsAuthUserSchema.parse({
        id: 5,
        email: 'a@force5.com',
        firstName: 'A',
        lastName: 'B',
        themeMode: 'dark',
        mfaEnabled: true,
        mfaType: 'topt',
        language: { id: 2, code: 'es', description: 'Spanish' },
        country: { id: 4, code: 'MX', description: 'Mexico' },
        securityRoles: [{ code: 'ROLE_ADMIN', name: 'Administrator' }],
        securityPermissions: [{ code: 'MANAGE_ACCOUNT', hasRead: true, hasUpdate: true }],
        tenant: { id: 1, name: 'Force 5', requireMfa: false, defaultPassword: 'nope' },
      }),
    );
    expect(u).toMatchObject({
      themeName: 'dark',
      mfaType: 'totp',
      locale: 'es-MX',
      securityRoles: [{ code: 'ROLE_ADMIN', name: 'Administrator' }],
      permissions: [{ code: 'MANAGE_ACCOUNT', read: true, create: false, update: true, delete: false, execute: false }],
      tenant: { id: 1, name: 'Force 5', requireMfa: false },
    });
    expect(JSON.stringify(u)).not.toContain('nope');
  });

  it('defaults an unknown/"null" theme to system', () => {
    const u = mapCurrentUser(vmsAuthUserSchema.parse({ id: 1, email: 'x@y.z', themeName: 'null' }));
    expect(u.themeName).toBe('system');
  });

  it('drops the codeless duplicate roles real VMS emits', () => {
    // Shape observed from local vmsServer `POST authenticate` (2026-10-06).
    const u = mapCurrentUser(
      vmsAuthUserSchema.parse({
        id: 4,
        email: 'crmadmin@force5.com',
        roles: [
          { code: null, name: 'CRM Admin', shortDisplay: null },
          { code: 'CRM_ADMIN', name: 'CRM Admin', shortDisplay: null },
        ],
        securityRoles: [],
        securityPermissions: [],
      }),
    );
    expect(u.securityRoles).toEqual([{ code: 'CRM_ADMIN', name: 'CRM Admin' }]);
  });

  it('reads the nested role code that signedInUser returns, skipping inactive roles', () => {
    // Shape observed from local vmsServer `GET signedInUser` (2026-10-06).
    const u = mapCurrentUser(
      vmsAuthUserSchema.parse({
        id: 4,
        email: 'crmadmin@force5.com',
        roles: [
          { id: 313, name: 'CRM Admin', active: true, securityRole: { id: 8, code: 'CRM_ADMIN', name: 'CRM Admin' } },
          { id: 2, name: null, active: false, securityRole: { id: 2, code: 'ROLE_ADMIN', name: 'Administrator' } },
        ],
      }),
    );
    expect(u.securityRoles).toEqual([{ code: 'CRM_ADMIN', name: 'CRM Admin' }]);
  });
});

describe('errors and helpers', () => {
  it('maps VMS 400 field errors into the envelope', () => {
    const e = mapVmsError(400, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      errors: [{ field: 'name', message: 'must not be blank' }, { field: null, message: 'global' }],
    });
    expect(e.statusCode).toBe(400);
    expect(e.toBody()).toEqual({
      error: { code: 'VALIDATION', message: 'Please correct the highlighted fields.', fieldErrors: { name: 'must not be blank' } },
    });
    expect(mapVmsError(500, {}).toBody().error.code).toBe('INTERNAL');
    expect(mapVmsError(404, { message: 'No tenant' }).toBody().error.code).toBe('NOT_FOUND');
  });

  it('masks MFA destinations and parses the TOTP secret', () => {
    expect(maskDestination('+14045550199', 'sms')).toBe('•••-•••-0199');
    expect(maskDestination('avery@force5.com', 'totp')).toBe('a•••@force5.com');
    expect(totpSecretFromUri('otpauth://totp/Force%205%20Inc:a%40b.c?secret=JBSWY3DPEHPK3PXP&issuer=Force%205')).toBe(
      'JBSWY3DPEHPK3PXP',
    );
  });
});
