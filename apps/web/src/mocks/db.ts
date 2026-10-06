import type {
  Account,
  AccountLookups,
  AssignableProduct,
  CurrentUser,
  Option,
  Product,
  ProfileLookups,
  SessionInfo,
  TenantLicense,
} from '@crm/contracts';

/** In-memory fixture database for MSW (tests + optional browser mock mode). */

export const COUNTRIES: Option[] = [
  { value: 1, label: 'United States', code: 'US' },
  { value: 2, label: 'Canada', code: 'CA' },
  { value: 3, label: 'United Kingdom', code: 'GB' },
];
export const STATES: Option[] = [
  { value: 10, label: 'Georgia', code: 'GA' },
  { value: 11, label: 'Texas', code: 'TX' },
  { value: 12, label: 'Illinois', code: 'IL' },
  { value: 13, label: 'Colorado', code: 'CO' },
];
export const LANGUAGES: Option[] = [
  { value: 1, label: 'English', code: 'en' },
  { value: 2, label: 'Spanish', code: 'es' },
];
export const TIME_ZONES = [
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time — New York' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time — Chicago' },
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time — Denver' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time — Los Angeles' },
  { value: 'Europe/London', label: '(UTC+00:00) London' },
];

export const ACCOUNT_LOOKUPS: AccountLookups = {
  languages: LANGUAGES,
  timeZones: TIME_ZONES,
  countries: COUNTRIES,
  states: STATES,
  frameworks: [
    { value: 1, label: 'Visitor' },
    { value: 2, label: 'Contractor' },
    { value: 3, label: 'Employee' },
  ],
  labelVerticals: [
    { id: 1, name: 'Construction', description: 'Construction sites' },
    { id: 2, name: 'Energy', description: 'Utilities and energy' },
  ],
};

export const PROFILE_LOOKUPS: ProfileLookups = {
  languages: LANGUAGES,
  timeZones: TIME_ZONES,
  countries: COUNTRIES,
  states: STATES,
};

const all = { read: true, create: true, update: true, delete: true, execute: true };

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 7,
    email: 'chuck@force5.example',
    firstName: 'Chuck',
    lastName: 'Cavaness',
    mobilePhone: '+1 770 555 0199',
    city: 'Dawsonville',
    countryId: 1,
    stateId: 10,
    postalCode: '30534',
    languageId: 1,
    timeZoneName: 'America/New_York',
    locale: 'en-US',
    themeName: 'system',
    mfaEnabled: false,
    mfaType: 'sms',
    securityRoles: [{ code: 'ROLE_ADMIN', name: 'Force 5 Admin' }],
    permissions: [
      { code: 'MANAGE_ACCOUNT', ...all },
      { code: 'MANAGE_PRODUCT', ...all },
      { code: 'MANAGE_LICENSE', ...all },
    ],
    tenant: { id: 1, name: 'Force 5', requireMfa: false, timeZoneName: 'America/New_York' },
    ...overrides,
  };
}

function account(
  id: number,
  name: string,
  contact: [string, string, string, string | undefined, string | undefined],
  place: { city?: string; stateId?: number; countryId?: number },
  dateCreated: string,
  state: 'draft' | 'active' | 'inactive',
): Account {
  const [firstName, lastName, email, phone, mobile] = contact;
  const stateName = STATES.find((s) => s.value === place.stateId)?.label;
  const country = COUNTRIES.find((c) => c.value === place.countryId)?.label;
  return {
    id,
    name,
    status: state,
    active: state !== 'inactive',
    mainContact: { firstName, lastName, email, phone, mobile },
    city: place.city,
    state: stateName,
    country,
    language: 'English',
    dateCreated,
    registeredDate: state === 'draft' ? undefined : dateCreated,
    registeredBy: state === 'draft' ? undefined : 'Chuck Cavaness',
    languageId: 1,
    timeZoneName: 'America/New_York',
    labelVerticalId: state === 'draft' ? null : 1,
    frameworkIds: [1, 2],
    requireMfa: false,
    address: '1200 Peachtree Industrial Blvd',
    stateId: place.stateId,
    postalCode: '30309',
    countryId: place.countryId,
    audit: { createdBy: 'Chuck Cavaness', dateCreated, updatedBy: 'Chuck Cavaness', lastUpdated: dateCreated },
  };
}

export type MockDb = {
  signedIn: boolean;
  user: CurrentUser;
  environment: string;
  accounts: Account[];
  licenses: Record<number, TenantLicense[]>;
  catalog: AssignableProduct[];
  products: Product[];
  nextId: number;
};

export function createDb(overrides: Partial<MockDb> = {}): MockDb {
  const accounts: Account[] = [
    account(101, 'Northstar Construction', ['Sarah', 'Mitchell', 'sarah.mitchell@northstar.example', '+1 404 555 0100', '+1 404 555 0182'], { city: 'Atlanta', stateId: 10, countryId: 1 }, '2026-09-18T14:00:00Z', 'active'),
    account(102, 'Apex Energy Services', ['Daniel', 'Brooks', 'daniel@apexenergy.example', '+1 713 555 0114', undefined], { city: 'Houston', stateId: 11, countryId: 1 }, '2026-09-12T14:00:00Z', 'active'),
    account(103, 'Blue Ridge Power', ['Megan', 'Harris', 'megan@blueridgepower.example', undefined, undefined], { city: 'Marietta', stateId: 10, countryId: 1 }, '2026-10-04T14:00:00Z', 'draft'),
    account(104, 'Ironwood Manufacturing', ['Paul', 'Grant', 'paul@ironwood.example', '+1 312 555 0130', undefined], { city: 'Chicago', stateId: 12, countryId: 1 }, '2026-08-29T14:00:00Z', 'active'),
    account(105, 'Coastal Infrastructure', ['Amy', 'Chen', 'amy@coastalinfra.example', '+1 843 555 0190', undefined], { city: 'Charleston', countryId: 1 }, '2026-07-11T14:00:00Z', 'inactive'),
    account(106, 'Summit Industrial', ['Rachel', 'Moore', 'rachel@summit.example', '+1 303 555 0188', undefined], { city: 'Denver', stateId: 13, countryId: 1 }, '2026-06-23T14:00:00Z', 'active'),
    account(107, '<img src=x onerror="alert(1)"> Evil Corp', ['Mal', 'Lory', 'mal@evil.example', '+1 555 555 0100', undefined], { city: 'Nowhere', countryId: 1 }, '2026-05-01T14:00:00Z', 'active'),
  ];
  const catalog: AssignableProduct[] = [
    { id: 1, productName: 'ExpectSafe Admin', description: 'Administrative access and configuration', licenseType: 'SUBSCRIPTION', licenseTypeDisplay: 'Subscription', productCode: 'ADMIN', productSku: 'ES-ADMIN', category: 'Platform' },
    { id: 2, productName: 'ExpectSafe Kiosk', description: 'Visitor kiosk runtime license', licenseType: 'SUBSCRIPTION', licenseTypeDisplay: 'Subscription', productCode: 'KIOSK', productSku: 'ES-KSK', category: 'Kiosk' },
    { id: 3, productName: 'ExpectSafe Mobile', description: 'Mobile app access', licenseType: 'PERPETUAL', licenseTypeDisplay: 'Perpetual', productCode: 'AMW_007', productSku: 'SKU_DEF_8921', category: 'Mobile' },
    { id: 4, productName: 'Visitor Analytics', description: 'Usage-based analytics', licenseType: 'USAGE_BASED', licenseTypeDisplay: 'Usage Based', productCode: 'VA_001', productSku: 'SKU_VA_0001', category: 'Analytics' },
    { id: 5, productName: 'Pre-Registration', description: 'Visitor pre-registration (trial)', licenseType: 'TRIAL', licenseTypeDisplay: 'Trial', productCode: 'REG_001', productSku: 'SKU_REG_0001', category: 'Platform' },
  ];
  const lic = (id: number, p: AssignableProduct, purchased: number, used: number, active = true): TenantLicense => ({
    id,
    productName: p.productName,
    description: p.description,
    licenseType: p.licenseType,
    licenseTypeDisplay: p.licenseTypeDisplay,
    productCode: p.productCode,
    productSku: p.productSku,
    category: p.category,
    purchasedCount: purchased,
    usedCount: used,
    active,
  });
  const products: Product[] = [
    { id: 1, name: 'Gatekeeper Admin', description: 'Gatekeeper Admin', productCode: 'AAW_023', productSku: 'SKU_ABC_1234', productVersion: '3.0', productCategoryId: 1, category: 'Platform', active: true, audit: { createdBy: 'Chuck Cavaness', dateCreated: '2026-01-12T15:00:00Z', updatedBy: 'Chuck Cavaness', lastUpdated: '2026-09-29T15:00:00Z' } },
    { id: 2, name: 'Front Desk', description: 'Front Desk', productCode: 'AFW_017', productSku: 'SKU_DEF_5678', productVersion: '3.0', productCategoryId: 1, category: 'Platform', active: true },
    { id: 3, name: 'Kiosk', description: '', productCode: 'AKW_029', productSku: 'SKU_DEF_8901', productVersion: '3.0', productCategoryId: 2, category: 'Kiosk', active: true },
    { id: 4, name: 'Legacy API', description: 'Retired API product', productCode: 'CLIENT_API', productSku: 'SKU_API_0020', productVersion: '1.0', productCategoryId: 3, category: 'API', active: false },
  ];
  return {
    signedIn: true,
    user: makeUser(),
    environment: 'development',
    accounts,
    licenses: {
      101: [lic(1001, catalog[0]!, 25, 14), lic(1002, catalog[1]!, 25, 8), lic(1003, catalog[4]!, 5, 7)],
    },
    catalog,
    products,
    nextId: 500,
    ...overrides,
  };
}

export const PRODUCT_CATEGORIES: Option[] = [
  { value: 1, label: 'Platform' },
  { value: 2, label: 'Kiosk' },
  { value: 3, label: 'API' },
  { value: 4, label: 'Mobile' },
];

export function sessionOf(db: MockDb): SessionInfo {
  return { user: db.user, csrfToken: 'csrf-test-token', idleTimeoutMinutes: 60, environment: db.environment };
}
