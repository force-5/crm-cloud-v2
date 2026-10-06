/**
 * Seed data for the mock VMS. Shapes mirror the real VMS entities closely enough that the
 * serializers in `vms.ts` can produce the same JSON VMS returns (TenantSetupDto, AuthUserDto,
 * TenantProductLicenseDto, SaleableProductDto, supportingLists, ...).
 */

export const DEMO_PASSWORD = 'Force5!demo';
export const MFA_PASSCODE = '123456';
export const RECOVERY_CODE = '654321';

export type Language = { id: number; code: string; description: string };
export type TimeZone = { id: number; zoneId: string; countryCode: string; description: string; active: boolean };
export type Country = { id: number; code: string; description: string; active: boolean };
export type State = { id: number; code: string; description: string; active: boolean };
export type Framework = { id: number; name: string };
export type LabelVertical = { id: number; slug: string; name: string; description: string };
export type ProductCategory = { id: number; code: string; description: string; active: boolean };
export type LicenseType = { code: 'SUBSCRIPTION' | 'PERPETUAL' | 'TRIAL' | 'USAGE_BASED'; description: string };

export type Audit = { createdBy: string | null; dateCreated: string; updatedBy: string | null; lastUpdated: string | null };

export type Tenant = Audit & {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  stateId: number | null;
  postalCode: string | null;
  provinceOrRegion: string | null;
  countryId: number | null;
  timeZoneName: string | null;
  languageId: number | null;
  mainContactFirstName: string | null;
  mainContactLastName: string | null;
  mainContactEmail: string | null;
  mainContactPhone: string | null;
  mainContactMobile: string | null;
  requireMfa: boolean;
  active: boolean;
  logoUrl: string | null;
  signinLogoImageUrl: string | null;
  signinBackgroundImageUrl: string | null;
  registeredDate: string | null;
  registeredBy: string | null;
  accessCode: string;
  // Secrets VMS really returns on tenant responses; the BFF must strip them.
  defaultPassword: string | null;
  registrationCode: string | null;
  registrationUrl: string | null;
  registrationQrCode: string | null;
  frameworkIds: number[];
  labelVerticalId: number | null;
};

export type Product = Audit & {
  id: number;
  name: string;
  description: string | null;
  productCode: string | null;
  productVersion: string | null;
  productSku: string | null;
  productCategoryId: number | null;
  active: boolean;
};

export type ProductLicense = { id: number; productId: number; licenseType: LicenseType['code']; active: boolean };

export type TenantLicense = Audit & {
  id: number;
  tenantId: number;
  productLicenseId: number;
  licenseCount: number | null;
  registeredLicenseCount: number;
  active: boolean;
};

export type Permission = {
  code: string;
  name: string;
  hasExecute: boolean;
  hasCreate: boolean;
  hasRead: boolean;
  hasUpdate: boolean;
  hasDelete: boolean;
};
export type Role = { code: string; name: string; shortDisplay: string };

export type User = Audit & {
  id: number;
  tenantId: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  mobilePhone: string | null;
  officePhone: string | null;
  address: string | null;
  city: string | null;
  stateId: number | null;
  postalCode: string | null;
  countryId: number | null;
  languageId: number | null;
  timeZoneName: string | null;
  themeName: string | null;
  mfaEnabled: boolean;
  mfaType: string | null;
  profileImageUrl: string | null;
  roles: Role[];
  permissions: Permission[];
  passwordRecoveryCode: string | null;
  active: boolean;
};

export const LICENSE_TYPES: Record<LicenseType['code'], string> = {
  SUBSCRIPTION: 'Subscription',
  PERPETUAL: 'Perpetual',
  TRIAL: 'Trial',
  USAGE_BASED: 'Usage Based',
};

const iso = (d: string) => new Date(d).toISOString();

export function createSeed() {
  const languages: Language[] = [
    { id: 1, code: 'en', description: 'English' },
    { id: 2, code: 'es', description: 'Spanish' },
    { id: 3, code: 'fr', description: 'French' },
    { id: 4, code: 'de', description: 'German' },
    { id: 5, code: 'pt', description: 'Portuguese' },
  ];

  const tzRaw: [string, string, string][] = [
    ['America/New_York', 'US', '(UTC-05:00) Eastern Time (US & Canada)'],
    ['America/Chicago', 'US', '(UTC-06:00) Central Time (US & Canada)'],
    ['America/Denver', 'US', '(UTC-07:00) Mountain Time (US & Canada)'],
    ['America/Phoenix', 'US', '(UTC-07:00) Arizona'],
    ['America/Los_Angeles', 'US', '(UTC-08:00) Pacific Time (US & Canada)'],
    ['America/Anchorage', 'US', '(UTC-09:00) Alaska'],
    ['Pacific/Honolulu', 'US', '(UTC-10:00) Hawaii'],
    ['America/Puerto_Rico', 'PR', '(UTC-04:00) Atlantic Time (Puerto Rico)'],
    ['America/Halifax', 'CA', '(UTC-04:00) Atlantic Time (Canada)'],
    ['America/St_Johns', 'CA', '(UTC-03:30) Newfoundland'],
    ['America/Toronto', 'CA', '(UTC-05:00) Eastern Time (Toronto)'],
    ['America/Winnipeg', 'CA', '(UTC-06:00) Central Time (Winnipeg)'],
    ['America/Edmonton', 'CA', '(UTC-07:00) Mountain Time (Edmonton)'],
    ['America/Vancouver', 'CA', '(UTC-08:00) Pacific Time (Vancouver)'],
    ['America/Mexico_City', 'MX', '(UTC-06:00) Mexico City'],
    ['America/Tijuana', 'MX', '(UTC-08:00) Tijuana'],
    ['America/Sao_Paulo', 'BR', '(UTC-03:00) Brasilia'],
    ['America/Bogota', 'CO', '(UTC-05:00) Bogota'],
    ['Europe/London', 'GB', '(UTC+00:00) London'],
    ['Europe/Dublin', 'IE', '(UTC+00:00) Dublin'],
    ['Europe/Paris', 'FR', '(UTC+01:00) Paris'],
    ['Europe/Berlin', 'DE', '(UTC+01:00) Berlin'],
    ['Europe/Madrid', 'ES', '(UTC+01:00) Madrid'],
    ['Europe/Amsterdam', 'NL', '(UTC+01:00) Amsterdam'],
    ['Africa/Johannesburg', 'ZA', '(UTC+02:00) Johannesburg'],
    ['Asia/Dubai', 'AE', '(UTC+04:00) Dubai'],
    ['Asia/Kolkata', 'IN', '(UTC+05:30) India Standard Time'],
    ['Asia/Singapore', 'SG', '(UTC+08:00) Singapore'],
    ['Asia/Tokyo', 'JP', '(UTC+09:00) Tokyo'],
    ['Australia/Sydney', 'AU', '(UTC+10:00) Sydney'],
    ['Pacific/Auckland', 'NZ', '(UTC+12:00) Auckland'],
    ['UTC', '', '(UTC) Coordinated Universal Time'],
  ];
  const timeZones: TimeZone[] = tzRaw.map(([zoneId, countryCode, description], i) => ({
    id: i + 1,
    zoneId,
    countryCode,
    description,
    active: true,
  }));

  const countries: Country[] = [
    ['US', 'United States'],
    ['CA', 'Canada'],
    ['GB', 'United Kingdom'],
    ['MX', 'Mexico'],
    ['AU', 'Australia'],
    ['IE', 'Ireland'],
    ['DE', 'Germany'],
    ['FR', 'France'],
    ['ES', 'Spain'],
    ['NL', 'Netherlands'],
    ['BR', 'Brazil'],
    ['IN', 'India'],
    ['NZ', 'New Zealand'],
    ['ZA', 'South Africa'],
  ].map(([code, description], i) => ({ id: i + 1, code: code!, description: description!, active: true }));

  const statesRaw =
    'AL:Alabama,AK:Alaska,AZ:Arizona,AR:Arkansas,CA:California,CO:Colorado,CT:Connecticut,DE:Delaware,DC:District of Columbia,FL:Florida,GA:Georgia,HI:Hawaii,ID:Idaho,IL:Illinois,IN:Indiana,IA:Iowa,KS:Kansas,KY:Kentucky,LA:Louisiana,ME:Maine,MD:Maryland,MA:Massachusetts,MI:Michigan,MN:Minnesota,MS:Mississippi,MO:Missouri,MT:Montana,NE:Nebraska,NV:Nevada,NH:New Hampshire,NJ:New Jersey,NM:New Mexico,NY:New York,NC:North Carolina,ND:North Dakota,OH:Ohio,OK:Oklahoma,OR:Oregon,PA:Pennsylvania,RI:Rhode Island,SC:South Carolina,SD:South Dakota,TN:Tennessee,TX:Texas,UT:Utah,VT:Vermont,VA:Virginia,WA:Washington,WV:West Virginia,WI:Wisconsin,WY:Wyoming';
  const states: State[] = statesRaw.split(',').map((s, i) => {
    const [code, description] = s.split(':') as [string, string];
    return { id: i + 1, code, description, active: true };
  });
  const stateId = (code: string) => states.find((s) => s.code === code)?.id ?? null;

  const frameworks: Framework[] = ['Visitor', 'Contractor', 'Employee', 'Vendor', 'Delivery'].map((name, i) => ({
    id: i + 1,
    name,
  }));

  const labelVerticals: LabelVertical[] = [
    { id: 1, slug: 'construction', name: 'Construction', description: 'Job sites, subcontractors and safety orientation' },
    { id: 2, slug: 'energy', name: 'Energy', description: 'Plants, substations and field crews' },
    { id: 3, slug: 'healthcare', name: 'Healthcare', description: 'Hospitals, clinics and vendor credentialing' },
    { id: 4, slug: 'manufacturing', name: 'Manufacturing', description: 'Plants, shifts and supplier visits' },
  ];

  const productCategories: ProductCategory[] = [
    { id: 1, code: 'PLATFORM', description: 'Platform', active: true },
    { id: 2, code: 'MOBILE', description: 'Mobile', active: true },
    { id: 3, code: 'INTEGRATION', description: 'Integration', active: true },
    { id: 4, code: 'INTERNAL', description: 'Internal', active: true },
  ];

  const seedAudit = (date: string): Audit => ({
    createdBy: 'system@force5.com',
    dateCreated: iso(date),
    updatedBy: null,
    lastUpdated: null,
  });

  // From the prototype's `saleableProducts`.
  const products: Product[] = [
    [1, 'Gatekeeper Admin', 'Administrative web application', 'AAW_023', '3.0', 'SKU_ABC_1234', 1],
    [2, 'Front Desk', 'Front desk / reception web application', 'AFW_017', '3.0', 'SKU_DEF_5678', 1],
    [3, 'Kiosk', 'Self-service visitor kiosk runtime', 'AKW_029', '3.0', 'SKU_DEF_8901', 1],
    [4, 'Mobile', 'Mobile app for hosts and security staff', 'AMW_007', '3.0', 'SKU_DEF_8921', 2],
    [5, 'API', 'Client API access', 'CLIENT_API', '1.0', 'SKU_API_0020', 3],
    [6, 'CRM', 'Internal Force 5 CRM', 'CRM_001', '1.0', 'SKU_CRM_0000', 4],
    [7, 'Pre-Registration', 'Visitor pre-registration portal', 'REG_001', '1.0', 'SKU_REG_0001', 1],
  ].map(([id, name, description, productCode, productVersion, productSku, cat]) => ({
    id: id as number,
    name: name as string,
    description: description as string,
    productCode: productCode as string,
    productVersion: productVersion as string,
    productSku: productSku as string,
    productCategoryId: cat as number,
    active: true,
    ...seedAudit('2025-01-15T12:00:00Z'),
  }));

  const productLicenses: ProductLicense[] = [
    { id: 1, productId: 1, licenseType: 'SUBSCRIPTION', active: true },
    { id: 2, productId: 2, licenseType: 'SUBSCRIPTION', active: true },
    { id: 3, productId: 3, licenseType: 'SUBSCRIPTION', active: true },
    { id: 4, productId: 4, licenseType: 'SUBSCRIPTION', active: true },
    { id: 5, productId: 5, licenseType: 'USAGE_BASED', active: true },
    { id: 6, productId: 6, licenseType: 'PERPETUAL', active: true },
    { id: 7, productId: 7, licenseType: 'SUBSCRIPTION', active: true },
    { id: 8, productId: 3, licenseType: 'TRIAL', active: true },
    { id: 9, productId: 4, licenseType: 'TRIAL', active: true },
  ];

  let accessSeq = 1000;
  const mkTenant = (t: Partial<Tenant> & { id: number; name: string; dateCreated: string }): Tenant => ({
    address: null,
    city: null,
    stateId: null,
    postalCode: null,
    provinceOrRegion: null,
    countryId: 1,
    timeZoneName: 'America/New_York',
    languageId: 1,
    mainContactFirstName: null,
    mainContactLastName: null,
    mainContactEmail: null,
    mainContactPhone: null,
    mainContactMobile: null,
    requireMfa: false,
    active: true,
    logoUrl: null,
    signinLogoImageUrl: null,
    signinBackgroundImageUrl: null,
    registeredDate: t.dateCreated,
    registeredBy: 'Chuck Cavaness',
    accessCode: `AC${accessSeq++}`,
    defaultPassword: `Welcome-${t.id}-${Math.random().toString(36).slice(2, 8)}`,
    registrationCode: `RC-${t.id}-889301`,
    registrationUrl: `https://admin.force5-dev.com/accountSetup/start/${Buffer.from(String(t.id)).toString('base64')}`,
    registrationQrCode: 'data:image/png;base64,iVBORw0KGgo=',
    frameworkIds: [1],
    labelVerticalId: null,
    createdBy: 'chuck@force5.com',
    updatedBy: null,
    lastUpdated: null,
    ...t,
    dateCreated: iso(t.dateCreated),
  });

  const tenants: Tenant[] = [
    mkTenant({
      id: 1,
      name: 'Force 5',
      address: '3330 Cumberland Blvd SE',
      city: 'Atlanta',
      stateId: stateId('GA'),
      postalCode: '30339',
      mainContactFirstName: 'Chuck',
      mainContactLastName: 'Cavaness',
      mainContactEmail: 'admin@force5.com',
      mainContactPhone: '(770) 555-0100',
      mainContactMobile: '(404) 555-0101',
      dateCreated: '2019-03-01T12:00:00Z',
      frameworkIds: [1, 2, 3],
    }),
    // ---- the six prototype accounts ----
    mkTenant({
      id: 2,
      name: 'Northstar Construction',
      address: '1200 Peachtree Industrial Blvd',
      city: 'Atlanta',
      stateId: stateId('GA'),
      postalCode: '30309',
      mainContactFirstName: 'Sarah',
      mainContactLastName: 'Mitchell',
      mainContactEmail: 'sarah.mitchell@northstar.example',
      mainContactPhone: '(404) 555-0100',
      mainContactMobile: '(404) 555-0182',
      dateCreated: '2026-09-18T14:05:00Z',
      requireMfa: true,
      frameworkIds: [1, 2],
      labelVerticalId: 1,
    }),
    mkTenant({
      id: 3,
      name: 'Apex Energy Services',
      address: '900 Louisiana St',
      city: 'Houston',
      stateId: stateId('TX'),
      postalCode: '77002',
      timeZoneName: 'America/Chicago',
      mainContactFirstName: 'Daniel',
      mainContactLastName: 'Brooks',
      mainContactEmail: 'daniel@apexenergy.example',
      mainContactPhone: '(713) 555-0114',
      mainContactMobile: '(713) 555-0115',
      dateCreated: '2026-09-12T16:30:00Z',
      frameworkIds: [1, 2, 4],
      labelVerticalId: 2,
    }),
    mkTenant({
      id: 4,
      name: 'Blue Ridge Power',
      city: 'Marietta',
      stateId: stateId('GA'),
      mainContactFirstName: 'Megan',
      mainContactLastName: 'Harris',
      mainContactEmail: 'megan@blueridgepower.example',
      dateCreated: '2026-10-04T13:00:00Z',
      registeredDate: null,
      registeredBy: null,
      defaultPassword: null,
      frameworkIds: [],
      timeZoneName: null,
      languageId: null,
    }),
    mkTenant({
      id: 5,
      name: 'Ironwood Manufacturing',
      address: '2100 S Halsted St',
      city: 'Chicago',
      stateId: stateId('IL'),
      postalCode: '60608',
      timeZoneName: 'America/Chicago',
      mainContactFirstName: 'Paul',
      mainContactLastName: 'Grant',
      mainContactEmail: 'paul@ironwood.example',
      mainContactPhone: '(312) 555-0130',
      mainContactMobile: '(312) 555-0131',
      dateCreated: '2026-08-29T15:00:00Z',
      frameworkIds: [1, 3, 4],
      labelVerticalId: 4,
    }),
    mkTenant({
      id: 6,
      name: 'Coastal Infrastructure',
      address: '40 Calhoun St',
      city: 'Charleston',
      stateId: stateId('SC'),
      postalCode: '29401',
      mainContactFirstName: 'Amy',
      mainContactLastName: 'Chen',
      mainContactEmail: 'amy@coastalinfra.example',
      mainContactPhone: '(843) 555-0190',
      mainContactMobile: '(843) 555-0191',
      dateCreated: '2026-07-11T12:00:00Z',
      active: false,
      labelVerticalId: 1,
    }),
    mkTenant({
      id: 7,
      name: 'Summit Industrial',
      address: '1700 Lincoln St',
      city: 'Denver',
      stateId: stateId('CO'),
      postalCode: '80203',
      timeZoneName: 'America/Denver',
      mainContactFirstName: 'Rachel',
      mainContactLastName: 'Moore',
      mainContactEmail: 'rachel@summit.example',
      mainContactPhone: '(303) 555-0188',
      mainContactMobile: '(303) 555-0189',
      dateCreated: '2026-06-23T12:00:00Z',
      frameworkIds: [1, 2, 3, 4],
      labelVerticalId: 4,
    }),
  ];

  // ~20 more so paging is real.
  const more: [string, string, string, string, string, string, string?][] = [
    ['Clearwater Logistics', 'Tampa', 'FL', '33602', 'Luis', 'Ortega', 'America/New_York'],
    ['Granite Works', 'Barre', 'VT', '05641', 'Hannah', 'Price', 'America/New_York'],
    ['Horizon Electric', 'Phoenix', 'AZ', '85004', 'Marcus', 'Lee', 'America/Phoenix'],
    ['Juniper Healthcare', 'Portland', 'OR', '97201', 'Priya', 'Natarajan', 'America/Los_Angeles'],
    ['Keystone Rail', 'Pittsburgh', 'PA', '15222', 'Owen', 'Fitzgerald', 'America/New_York'],
    ['Lakeshore Medical Group', 'Milwaukee', 'WI', '53202', 'Grace', 'Kowalski', 'America/Chicago'],
    ['Meridian Utilities', 'Birmingham', 'AL', '35203', 'Thomas', 'Reed', 'America/Chicago'],
    ['Northgate Aerospace', 'Wichita', 'KS', '67202', 'Elena', 'Vasquez', 'America/Chicago'],
    ['Oakridge Labs', 'Oak Ridge', 'TN', '37830', 'Samuel', 'Turner', 'America/New_York'],
    ['Pinecrest Hospitality', 'Asheville', 'NC', '28801', 'Laura', 'Bennett', 'America/New_York'],
    ['Quarry Hill Materials', 'Columbus', 'OH', '43215', 'Derek', 'Shaw', 'America/New_York'],
    ['Redwood Data Centers', 'Sacramento', 'CA', '95814', 'Nina', 'Park', 'America/Los_Angeles'],
    ['Sterling Shipyards', 'Norfolk', 'VA', '23510', 'Victor', 'Hale', 'America/New_York'],
    ['Tidewater Ports', 'Savannah', 'GA', '31401', 'Monica', 'Dawson', 'America/New_York'],
    ['Union Steelworks', 'Gary', 'IN', '46402', 'Frank', 'Novak', 'America/Chicago'],
    ['Vantage Pharmaceuticals', 'Newark', 'NJ', '07102', 'Aisha', 'Khan', 'America/New_York'],
    ['Westfield Distribution', 'Reno', 'NV', '89501', 'Brian', 'Cole', 'America/Los_Angeles'],
    ['Yellowstone Mining', 'Billings', 'MT', '59101', 'Kara', 'Lindqvist', 'America/Denver'],
    ['Zenith Water Authority', 'Salt Lake City', 'UT', '84101', 'Ian', 'Morales', 'America/Denver'],
    ['Bayfront Biotech', 'Boston', 'MA', '02110', 'Chloe', 'Nguyen', 'America/New_York'],
    ['Cascade Timber', 'Spokane', 'WA', '99201', 'Ryan', 'Holt', 'America/Los_Angeles'],
    ['Delta Agriculture Co-op', 'Memphis', 'TN', '38103', 'Joy', 'Washington', 'America/Chicago'],
  ];
  more.forEach(([name, city, st, zip, first, last, tz], i) => {
    const id = 8 + i;
    const day = new Date(Date.UTC(2026, 5, 20) - i * 6 * 86400000).toISOString();
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '');
    const draft = i % 9 === 4; // a couple more drafts
    tenants.push(
      mkTenant({
        id,
        name,
        address: `${100 + i * 37} Main St`,
        city,
        stateId: stateId(st),
        postalCode: zip,
        timeZoneName: tz ?? 'America/New_York',
        mainContactFirstName: first,
        mainContactLastName: last,
        mainContactEmail: `${first.toLowerCase()}@${slug}.example`,
        mainContactPhone: i % 5 === 3 ? null : `(555) 555-${String(1000 + i).slice(-4)}`,
        mainContactMobile: `(555) 556-${String(2000 + i).slice(-4)}`,
        dateCreated: day,
        active: i % 7 !== 5,
        registeredDate: draft ? null : day,
        registeredBy: draft ? null : 'Chuck Cavaness',
        defaultPassword: draft ? null : `Welcome-${id}`,
        frameworkIds: [1, ...(i % 2 ? [2] : []), ...(i % 3 ? [] : [4])],
        labelVerticalId: (i % 5) - 1 > 0 ? (i % 5) - 1 : null,
      }),
    );
  });

  // Tenant licenses, from the prototype's accountProductMap (+ a few more).
  let tlSeq = 1;
  const tenantLicenses: TenantLicense[] = [];
  const addTl = (tenantId: number, productLicenseId: number, licenseCount: number | null, used: number, active = true) =>
    tenantLicenses.push({
      id: tlSeq++,
      tenantId,
      productLicenseId,
      licenseCount,
      registeredLicenseCount: used,
      active,
      ...seedAudit('2026-09-20T12:00:00Z'),
    });
  // Force 5 itself
  addTl(1, 1, 50, 12);
  addTl(1, 6, null, 9);
  // Northstar Construction: products 1,3,4,7
  addTl(2, 1, 25, 14);
  addTl(2, 3, 25, 8);
  addTl(2, 4, 40, 22);
  addTl(2, 7, 10, 3);
  // Apex Energy Services: 1,2,3,5
  addTl(3, 1, 25, 19);
  addTl(3, 2, 5, 5);
  addTl(3, 3, 25, 11);
  addTl(3, 5, null, 0);
  // Ironwood Manufacturing: 1,3,5 — Kiosk is OVER-ALLOCATED (10 purchased, 14 used)
  addTl(5, 1, 25, 7);
  addTl(5, 3, 10, 14);
  addTl(5, 5, null, 2);
  // Coastal Infrastructure (inactive tenant) — inactive license
  addTl(6, 1, 25, 4, false);
  addTl(6, 3, 25, 6);
  // Summit Industrial
  addTl(7, 1, 25, 20);
  addTl(7, 2, 3, 1);
  addTl(7, 3, 25, 15);
  addTl(7, 4, 25, 9);
  addTl(7, 9, 10, 2, false);
  for (const t of tenants.filter((t) => t.id >= 8 && t.registeredDate)) {
    addTl(t.id, 1, 25, (t.id * 3) % 25);
    addTl(t.id, 3, 25, (t.id * 5) % 25);
  }

  const crudx = (code: string, name: string): Permission => ({
    code,
    name,
    hasExecute: true,
    hasCreate: true,
    hasRead: true,
    hasUpdate: true,
    hasDelete: true,
  });
  const ADMIN_ROLE: Role = { code: 'ROLE_ADMIN', name: 'Administrator', shortDisplay: 'Admin' };
  const USER_ROLE: Role = { code: 'ROLE_USER', name: 'User', shortDisplay: 'User' };
  const crmPermissions = [
    crudx('MANAGE_ACCOUNT', 'Manage Accounts'),
    crudx('MANAGE_PRODUCT', 'Manage Products'),
    crudx('MANAGE_LICENSE', 'Manage Licenses'),
  ];

  let userSeq = 101;
  const mkUser = (u: Partial<User> & { tenantId: number; email: string; firstName: string; lastName: string }): User => ({
    id: userSeq++,
    password: DEMO_PASSWORD,
    mobilePhone: null,
    officePhone: null,
    address: null,
    city: null,
    stateId: null,
    postalCode: null,
    countryId: 1,
    languageId: 1,
    timeZoneName: 'America/New_York',
    themeName: 'system',
    mfaEnabled: false,
    mfaType: null,
    profileImageUrl: null,
    roles: [],
    permissions: [],
    passwordRecoveryCode: null,
    active: true,
    ...seedAudit('2024-01-10T12:00:00Z'),
    ...u,
  });

  const users: User[] = [
    mkUser({
      tenantId: 1,
      email: 'admin@force5.com',
      firstName: 'Chuck',
      lastName: 'Cavaness',
      mobilePhone: '(404) 555-0101',
      address: '3330 Cumberland Blvd SE',
      city: 'Atlanta',
      stateId: stateId('GA'),
      postalCode: '30339',
      roles: [ADMIN_ROLE],
      permissions: crmPermissions,
    }),
    mkUser({
      tenantId: 1,
      email: 'multi@force5.com',
      firstName: 'Morgan',
      lastName: 'Tenantson',
      mobilePhone: '(404) 555-0144',
      roles: [ADMIN_ROLE],
      permissions: crmPermissions,
    }),
    mkUser({
      tenantId: 3,
      email: 'multi@force5.com',
      firstName: 'Morgan',
      lastName: 'Tenantson',
      roles: [USER_ROLE],
      permissions: [],
    }),
    mkUser({
      tenantId: 1,
      email: 'mfa@force5.com',
      firstName: 'Avery',
      lastName: 'Secure',
      mobilePhone: '(404) 555-0199',
      mfaEnabled: true,
      mfaType: 'sms',
      roles: [ADMIN_ROLE],
      permissions: crmPermissions,
    }),
    mkUser({
      tenantId: 2,
      email: 'sales@customer.com',
      firstName: 'Casey',
      lastName: 'Customer',
      mobilePhone: '(404) 555-0177',
      roles: [USER_ROLE],
      permissions: [],
    }),
  ];

  return {
    languages,
    timeZones,
    countries,
    states,
    frameworks,
    labelVerticals,
    productCategories,
    products,
    productLicenses,
    tenants,
    tenantLicenses,
    users,
    roles: { ADMIN_ROLE, USER_ROLE },
  };
}

export type Db = ReturnType<typeof createSeed> & {
  files: Map<string, { contentType: string; data: Buffer }>;
};
