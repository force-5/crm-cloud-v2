import type {
  Account,
  AccountDetailResponse,
  AccountFormData,
  AccountLookups,
  AccountStatus,
  AccountSummary,
  DashboardSummary,
  LabelVertical,
  ListQuery,
  Page,
} from '@crm/contracts';
import { z } from 'zod';
import type { Vms } from './client';
import {
  TtlCache,
  isoDate,
  mapCommonLookups,
  mapFrameworks,
  nn,
  pagingQuery,
  supportingListsSchema,
  toPage,
  vmsPageSchema,
  type SortSpec,
  type VmsSupportingLists,
} from './common';

const s = z.string().nullish();
const n = z.number().nullish();
const date = z.union([z.string(), z.number()]).nullish();
const named = z.object({ id: z.number().nullish(), code: s, description: s }).nullish();

/**
 * VMS TenantDto / TenantSetupDto. `looseObject` because VMS sends many more fields (including
 * secrets such as `defaultPassword`, `registrationCode`, `clearPassword`); the mappers below copy
 * an explicit allow-list, so none of those can ever reach the browser.
 */
export const vmsTenantSchema = z.looseObject({
  id: z.number(),
  name: s,
  address: s,
  city: s,
  state: named,
  stateId: n,
  postalCode: s,
  provinceOrRegion: s,
  country: named,
  countryId: n,
  timeZoneName: s,
  language: named,
  languageId: n,
  mainContactFirstName: s,
  mainContactLastName: s,
  mainContactEmail: s,
  mainContactPhone: s,
  mainContactMobile: s,
  requireMfa: z.boolean().nullish(),
  active: z.boolean().nullish(),
  logoUrl: s,
  signinBackgroundImageUrl: s,
  registeredDate: date,
  registeredBy: s,
  accessCode: s,
  frameworkIds: z.array(z.number()).nullish(),
  labelVerticalId: n,
  createdBy: s,
  dateCreated: date,
  updatedBy: s,
  lastUpdated: date,
});
export type VmsTenant = z.infer<typeof vmsTenantSchema>;

const tenantEnvelope = z.object({ tenant: vmsTenantSchema, supportingLists: supportingListsSchema.nullish() });
const labelVerticalsSchema = z.object({
  verticals: z.array(z.object({ id: z.number(), name: z.string(), description: s })).nullish(),
});

// ---- mapping ------------------------------------------------------------------

export function accountStatus(t: Pick<VmsTenant, 'registeredDate' | 'active'>): AccountStatus {
  if (!t.registeredDate) return 'draft';
  return t.active === false ? 'inactive' : 'active';
}

export function mapAccountSummary(t: VmsTenant): AccountSummary {
  return {
    id: t.id,
    name: t.name ?? '',
    status: accountStatus(t),
    mainContact: {
      firstName: nn(t.mainContactFirstName),
      lastName: nn(t.mainContactLastName),
      email: nn(t.mainContactEmail),
      mobile: nn(t.mainContactMobile),
      phone: nn(t.mainContactPhone),
    },
    city: nn(t.city),
    state: nn(t.state?.description),
    country: nn(t.country?.description),
    language: nn(t.language?.description),
    dateCreated: isoDate(t.dateCreated),
  };
}

export function mapAccount(t: VmsTenant): Account {
  return {
    ...mapAccountSummary(t),
    active: t.active !== false,
    registeredDate: isoDate(t.registeredDate),
    registeredBy: nn(t.registeredBy),
    languageId: nn(t.languageId ?? t.language?.id),
    timeZoneName: nn(t.timeZoneName),
    labelVerticalId: t.labelVerticalId ?? null,
    frameworkIds: t.frameworkIds ?? [],
    requireMfa: t.requireMfa === true,
    address: nn(t.address),
    stateId: nn(t.stateId ?? t.state?.id),
    provinceOrRegion: nn(t.provinceOrRegion),
    postalCode: nn(t.postalCode),
    countryId: nn(t.countryId ?? t.country?.id),
    logoUrl: nn(t.logoUrl),
    signinBackgroundImageUrl: nn(t.signinBackgroundImageUrl),
    accessCode: nn(t.accessCode),
    audit: {
      createdBy: nn(t.createdBy),
      dateCreated: isoDate(t.dateCreated),
      updatedBy: nn(t.updatedBy),
      lastUpdated: isoDate(t.lastUpdated),
    },
  };
}

/** Account form → VMS TenantDto body. Never includes `id` (see V3: an id in the publish body overwrites the caller's tenant). */
export function toTenantDto(f: AccountFormData): Record<string, unknown> {
  return {
    name: f.name,
    languageId: f.languageId ?? null,
    timeZoneName: f.timeZoneName ?? null,
    labelVerticalId: f.labelVerticalId ?? null,
    frameworkIds: f.frameworkIds ?? [],
    requireMfa: f.requireMfa ?? false,
    active: f.active ?? true,
    mainContactFirstName: f.mainContactFirstName ?? null,
    mainContactLastName: f.mainContactLastName ?? null,
    mainContactEmail: f.mainContactEmail ?? null,
    mainContactMobile: f.mainContactMobile ?? null,
    mainContactPhone: f.mainContactPhone ?? null,
    countryId: f.countryId ?? null,
    address: f.address ?? null,
    city: f.city ?? null,
    stateId: f.stateId ?? null,
    provinceOrRegion: f.provinceOrRegion ?? null,
    postalCode: f.postalCode ?? null,
  };
}

export function mapAccountLookups(sl: VmsSupportingLists, verticals: LabelVertical[]): AccountLookups {
  return { ...mapCommonLookups(sl), frameworks: mapFrameworks(sl), labelVerticals: verticals };
}

// ---- operations -------------------------------------------------------------------

export const ACCOUNT_SORT: SortSpec = {
  map: {
    name: ['name'],
    mainContact: ['mainContactLastName', 'mainContactFirstName'],
    mainContactLastName: ['mainContactLastName', 'mainContactFirstName'],
    city: ['city'],
    dateCreated: ['dateCreated'],
    created: ['dateCreated'],
    status: ['active'],
    active: ['active'],
  },
  default: ['name,asc'],
};

const supportingListsCache = new TtlCache<VmsSupportingLists>(10 * 60_000);
const verticalsCache = new TtlCache<LabelVertical[]>(10 * 60_000);

export async function tenantSupportingLists(vms: Vms): Promise<VmsSupportingLists> {
  return supportingListsCache.get(() => vms.get('tenant/supportingLists', { schema: supportingListsSchema }));
}

export async function labelVerticals(vms: Vms): Promise<LabelVertical[]> {
  return verticalsCache.get(async () => {
    const r = await vms.get('labelVerticals', { schema: labelVerticalsSchema });
    return (r.verticals ?? []).map((v) => ({ id: v.id, name: v.name, description: nn(v.description) }));
  });
}

export async function accountLookups(vms: Vms): Promise<AccountLookups> {
  const [sl, verticals] = await Promise.all([tenantSupportingLists(vms), labelVerticals(vms)]);
  return mapAccountLookups(sl, verticals);
}

/** ISO country code for a VMS country id (drives `validateAccountForPublish`). */
export async function countryCodeLookup(vms: Vms): Promise<(id: number | undefined) => string | undefined> {
  const sl = await tenantSupportingLists(vms);
  return (id) => nn((sl.country ?? []).find((c) => c.id === id)?.code);
}

export async function listAccounts(vms: Vms, q: ListQuery): Promise<Page<AccountSummary>> {
  const page = await vms.get('tenants', { query: pagingQuery(q, ACCOUNT_SORT), schema: vmsPageSchema(vmsTenantSchema) });
  return toPage(page, mapAccountSummary);
}

export async function newAccount(vms: Vms): Promise<AccountDetailResponse> {
  const [r, verticals] = await Promise.all([
    vms.get('tenant/new', { schema: z.object({ supportingLists: supportingListsSchema }) }),
    labelVerticals(vms),
  ]);
  supportingListsCache.set(r.supportingLists);
  return { account: null, lookups: mapAccountLookups(r.supportingLists, verticals) };
}

export async function getTenant(vms: Vms, id: number): Promise<VmsTenant> {
  const r = await vms.get(`tenant/${id}/detail`, { schema: tenantEnvelope });
  if (r.supportingLists) supportingListsCache.set(r.supportingLists);
  return r.tenant;
}

export async function getAccount(vms: Vms, id: number): Promise<AccountDetailResponse> {
  const [tenant, lookups] = await Promise.all([getTenant(vms, id), accountLookups(vms)]);
  return { account: mapAccount(tenant), lookups };
}

export async function createDraft(vms: Vms, form: AccountFormData): Promise<Account> {
  const r = await vms.post('tenant/draft', { json: toTenantDto(form), schema: tenantEnvelope });
  return mapAccount(r.tenant);
}

export async function createPublished(vms: Vms, form: AccountFormData): Promise<Account> {
  // NEVER send an id here: VMS would update the caller's own tenant (V3).
  const r = await vms.post('tenant/setup/publish', { json: toTenantDto(form), schema: tenantEnvelope });
  return mapAccount(r.tenant);
}

export async function updateDraft(vms: Vms, id: number, form: AccountFormData): Promise<void> {
  await vms.put(`account/setup/draft/update/${id}`, { json: { ...toTenantDto(form), id } });
}

export async function updateRegistered(vms: Vms, id: number, form: AccountFormData): Promise<void> {
  await vms.put(`account/setup/update/${id}`, { json: { ...toTenantDto(form), id } });
}

/** `POST tenant/setup/publish/{id}` — not yet in VMS (V3); the caller maps a 404 to 501. */
export async function publishDraft(vms: Vms, id: number, form: AccountFormData): Promise<Account> {
  const r = await vms.post(`tenant/setup/publish/${id}`, { json: toTenantDto(form), schema: tenantEnvelope });
  return mapAccount(r.tenant);
}

export async function setAccountActive(vms: Vms, id: number, active: boolean): Promise<AccountSummary> {
  const t = await vms.patch(`tenant/${id}`, { json: { active }, schema: vmsTenantSchema });
  return mapAccountSummary(t);
}

export async function uploadLogo(vms: Vms, id: number, dataUrl: string): Promise<string> {
  const r = await vms.put(`tenant/uploadLogo/${id}`, { raw: dataUrl, schema: z.object({ logoUrl: z.string() }) });
  return r.logoUrl;
}

export async function uploadSigninImage(vms: Vms, id: number, dataUrl: string): Promise<string> {
  const r = await vms.put(`tenant/uploadSigninImage/${id}`, { raw: dataUrl, schema: z.object({ imageUrl: z.string() }) });
  return r.imageUrl;
}

export async function dashboardSummary(vms: Vms): Promise<DashboardSummary> {
  const page = vmsPageSchema(vmsTenantSchema);
  const count = (active?: boolean) =>
    vms.get('tenants', { query: { page: 0, size: 1, active }, schema: page }).then((p) => p.page.totalElements);
  const [total, active, inactive, recent] = await Promise.all([
    count(),
    count(true),
    count(false),
    vms.get('tenants', { query: { page: 0, size: 5, sort: ['dateCreated,desc'] }, schema: page }),
  ]);
  // Draft count needs a VMS filter on registeredDate (V8) — reported as null until then.
  return { total, active, inactive, draft: null, recent: recent.content.map(mapAccountSummary) };
}
