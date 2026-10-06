import type { AssignableProduct, ListQuery, Page, TenantLicense } from '@crm/contracts';
import { z } from 'zod';
import type { Vms } from './client';
import { nn, pagingQuery, toPage, vmsPageSchema, type SortSpec } from './common';

const s = z.string().nullish();

/** VMS TenantProductLicenseDto */
export const vmsTenantLicenseSchema = z.looseObject({
  id: z.number(),
  productName: s,
  description: s,
  productCode: s,
  productSku: s,
  category: s,
  licenseType: s,
  licenseTypeDisplay: s,
  /** Populated only for SUBSCRIPTION licenses. */
  licenseCount: z.number().nullish(),
  registeredLicenseCount: z.number().nullish(),
  active: z.boolean().nullish(),
});
export type VmsTenantLicense = z.infer<typeof vmsTenantLicenseSchema>;

/** `GET productLicenses?tenantId=` items */
export const vmsProductLicenseSchema = z.looseObject({
  id: z.number(),
  productName: s,
  description: s,
  productCode: s,
  productSku: s,
  category: s,
  licenseType: s,
  licenseTypeDisplay: s,
});

export function mapTenantLicense(l: VmsTenantLicense): TenantLicense {
  return {
    id: l.id,
    productName: l.productName ?? '',
    description: nn(l.description),
    licenseType: l.licenseType ?? '',
    licenseTypeDisplay: l.licenseTypeDisplay ?? l.licenseType ?? '',
    productCode: nn(l.productCode),
    productSku: nn(l.productSku),
    category: nn(l.category),
    purchasedCount: l.licenseCount ?? null,
    usedCount: l.registeredLicenseCount ?? 0,
    active: l.active !== false,
  };
}

export function mapAssignableProduct(p: z.infer<typeof vmsProductLicenseSchema>): AssignableProduct {
  return {
    id: p.id,
    productName: p.productName ?? '',
    description: nn(p.description),
    licenseType: p.licenseType ?? '',
    licenseTypeDisplay: p.licenseTypeDisplay ?? p.licenseType ?? '',
    productCode: nn(p.productCode),
    productSku: nn(p.productSku),
    category: nn(p.category),
  };
}

export const LICENSE_SORT: SortSpec = {
  map: {
    productName: ['productName'],
    product: ['productName'],
    licenseType: ['licenseType'],
    type: ['licenseType'],
    category: ['category'],
    productCode: ['productCode'],
    purchasedCount: ['licenseCount'],
    usedCount: ['registeredLicenseCount'],
    status: ['active'],
    active: ['active'],
  },
  default: ['productName,asc'],
};

export async function listLicenses(vms: Vms, tenantId: number, q: ListQuery): Promise<Page<TenantLicense>> {
  const page = await vms.get(`tenantProductLicense/${tenantId}`, {
    query: pagingQuery(q, LICENSE_SORT),
    schema: vmsPageSchema(vmsTenantLicenseSchema),
  });
  return toPage(page, mapTenantLicense);
}

export async function availableLicenses(vms: Vms, tenantId: number): Promise<AssignableProduct[]> {
  const list = await vms.get('productLicenses', { query: { tenantId }, schema: z.array(vmsProductLicenseSchema) });
  return list.map(mapAssignableProduct);
}

export async function addLicense(
  vms: Vms,
  tenantId: number,
  body: { productLicenseId: number; purchasedCount: number },
): Promise<TenantLicense> {
  const l = await vms.post(`tenantProductLicense/${tenantId}`, {
    // VMS reads `purchasedLicenseCount` — and it must be a number, not the string the old CRM sent.
    json: { productLicenseId: body.productLicenseId, purchasedLicenseCount: body.purchasedCount },
    schema: vmsTenantLicenseSchema,
  });
  return mapTenantLicense(l);
}

/**
 * VMS `PATCH tenantProductLicense/{id}` applies `active` OR `purchasedLicenseCount`, never both,
 * so a request carrying both becomes two calls.
 */
export async function updateLicense(
  vms: Vms,
  id: number,
  body: { purchasedCount?: number; active?: boolean },
): Promise<TenantLicense> {
  let result: VmsTenantLicense | undefined;
  if (body.purchasedCount !== undefined) {
    result = await vms.patch(`tenantProductLicense/${id}`, {
      json: { purchasedLicenseCount: body.purchasedCount },
      schema: vmsTenantLicenseSchema,
    });
  }
  if (body.active !== undefined) {
    result = await vms.patch(`tenantProductLicense/${id}`, { json: { active: body.active }, schema: vmsTenantLicenseSchema });
  }
  return mapTenantLicense(result!);
}
