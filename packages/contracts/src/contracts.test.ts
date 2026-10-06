import { describe, expect, it } from 'vitest';
import {
  accountFormSchema,
  addLicenseSchema,
  availableSeats,
  countryRule,
  hasPermission,
  listQuerySchema,
  resetPasswordSchema,
  validateAccountForPublish,
} from './index';

const codes: Record<number, string> = { 1: 'US', 2: 'CA', 3: 'DE' };
const codeOf = (id: number | undefined) => (id === undefined ? undefined : codes[id]);

const complete = {
  name: 'Blue Ridge Power',
  languageId: 1,
  timeZoneName: 'America/New_York',
  mainContactFirstName: 'Megan',
  mainContactLastName: 'Harris',
  mainContactEmail: 'megan@blueridgepower.example',
  mainContactMobile: '+1 404 555 0123',
  countryId: 1,
  address: '1 Main St',
  city: 'Marietta',
  stateId: 10,
  postalCode: '30060',
};

describe('account form', () => {
  it('accepts a draft with only a company name, turning empty strings into undefined', () => {
    const data = accountFormSchema.parse({ name: 'Acme', mainContactEmail: '', countryId: '' });
    expect(data.mainContactEmail).toBeUndefined();
    expect(data.countryId).toBeUndefined();
    expect(data.frameworkIds).toEqual([]);
  });

  it('still validates the format of filled-in draft fields', () => {
    expect(accountFormSchema.safeParse({ name: 'Acme', mainContactEmail: 'nope' }).success).toBe(false);
    expect(accountFormSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('requires every publish field', () => {
    const errors = validateAccountForPublish(accountFormSchema.parse({ name: 'Acme' }), codeOf);
    expect(Object.keys(errors).sort()).toEqual(
      [
        'address',
        'city',
        'countryId',
        'languageId',
        'mainContactEmail',
        'mainContactFirstName',
        'mainContactLastName',
        'mainContactMobile',
        'postalCode',
        'timeZoneName',
      ].sort(),
    );
  });

  it('passes a complete US account and checks ZIP format and state', () => {
    expect(validateAccountForPublish(accountFormSchema.parse(complete), codeOf)).toEqual({});
    const bad = validateAccountForPublish(
      accountFormSchema.parse({ ...complete, postalCode: '3006', stateId: undefined }),
      codeOf,
    );
    expect(bad.postalCode).toMatch(/zip/i);
    expect(bad.stateId).toBe('State is required');
  });

  it('does not require a state outside state-based countries', () => {
    const errors = validateAccountForPublish(
      accountFormSchema.parse({ ...complete, countryId: 3, stateId: undefined, postalCode: '10115' }),
      codeOf,
    );
    expect(errors).toEqual({});
    expect(countryRule('CA').usesStates).toBe(false);
  });
});

describe('list query', () => {
  it('falls back to safe defaults for junk URL params', () => {
    expect(listQuerySchema.parse({ page: '-3', size: '999', status: 'weird' })).toMatchObject({
      page: 1,
      size: 20,
      status: 'active',
    });
    expect(listQuerySchema.parse({ page: '3', size: '50', status: 'all' })).toMatchObject({
      page: 3,
      size: 50,
      status: 'all',
    });
  });
});

describe('licenses', () => {
  it('computes available seats, negative when over-allocated', () => {
    expect(availableSeats({ purchasedCount: 25, usedCount: 14 })).toBe(11);
    expect(availableSeats({ purchasedCount: 5, usedCount: 7 })).toBe(-2);
    expect(availableSeats({ purchasedCount: null, usedCount: 0 })).toBe(0);
  });

  it('requires at least one whole seat', () => {
    expect(addLicenseSchema.safeParse({ productLicenseId: 4, purchasedCount: '0' }).success).toBe(false);
    expect(addLicenseSchema.safeParse({ productLicenseId: 4, purchasedCount: '2.5' }).success).toBe(false);
    expect(addLicenseSchema.parse({ productLicenseId: 4, purchasedCount: '3' }).purchasedCount).toBe(3);
  });
});

describe('auth', () => {
  it('checks permission actions', () => {
    const user = {
      permissions: [{ code: 'MANAGE_ACCOUNT', read: true, create: true, update: false, delete: false, execute: false }],
    };
    expect(hasPermission(user, 'MANAGE_ACCOUNT', 'create')).toBe(true);
    expect(hasPermission(user, 'MANAGE_ACCOUNT', 'update')).toBe(false);
    expect(hasPermission(null, 'MANAGE_ACCOUNT')).toBe(false);
  });

  it('enforces the password policy and confirmation', () => {
    const base = { email: 'a@force5.com', code: '654321' };
    expect(resetPasswordSchema.safeParse({ ...base, password: 'weak', passwordConfirmation: 'weak' }).success).toBe(
      false,
    );
    const mismatch = resetPasswordSchema.safeParse({ ...base, password: 'Str0ng!pass', passwordConfirmation: 'x' });
    expect(mismatch.success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, password: 'Str0ng!pass', passwordConfirmation: 'Str0ng!pass' }).success,
    ).toBe(true);
  });
});
