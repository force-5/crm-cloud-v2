import { z } from 'zod';

export const LICENSE_TYPES = ['SUBSCRIPTION', 'PERPETUAL', 'TRIAL', 'USAGE_BASED'] as const;

export const tenantLicenseSchema = z.object({
  id: z.number(),
  productName: z.string(),
  description: z.string().optional(),
  licenseType: z.string(),
  licenseTypeDisplay: z.string(),
  productCode: z.string().optional(),
  productSku: z.string().optional(),
  category: z.string().optional(),
  /** VMS `licenseCount` */
  purchasedCount: z.number().nullable(),
  /** VMS `registeredLicenseCount` */
  usedCount: z.number(),
  active: z.boolean(),
});
export type TenantLicense = z.infer<typeof tenantLicenseSchema>;

export function availableSeats(l: Pick<TenantLicense, 'purchasedCount' | 'usedCount'>): number {
  return (l.purchasedCount ?? 0) - l.usedCount;
}

/** A product license that can still be assigned to the account. */
export const assignableProductSchema = z.object({
  id: z.number(),
  productName: z.string(),
  description: z.string().optional(),
  licenseType: z.string(),
  licenseTypeDisplay: z.string(),
  productCode: z.string().optional(),
  productSku: z.string().optional(),
  category: z.string().optional(),
});
export type AssignableProduct = z.infer<typeof assignableProductSchema>;

export const addLicenseSchema = z.object({
  productLicenseId: z.number({ message: 'Choose a product' }).int().positive('Choose a product'),
  purchasedCount: z.coerce.number().int('Whole seats only').min(1, 'At least 1 seat'),
});
export type AddLicenseRequest = z.input<typeof addLicenseSchema>;

export const updateLicenseSchema = z
  .object({
    purchasedCount: z.coerce.number().int('Whole seats only').min(1, 'At least 1 seat').optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.purchasedCount !== undefined || v.active !== undefined, 'Nothing to update');
export type UpdateLicenseRequest = z.input<typeof updateLicenseSchema>;
