import { z } from 'zod';
import { auditSchema, emptyToUndefined, optionSchema } from './common';

export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  productCode: z.string().optional(),
  productSku: z.string().optional(),
  productVersion: z.string().optional(),
  productCategoryId: z.number().optional(),
  category: z.string().optional(),
  active: z.boolean(),
  audit: auditSchema.optional(),
});
export type Product = z.infer<typeof productSchema>;

export type ProductDetailResponse = { product: Product | null; categories: z.infer<typeof optionSchema>[] };

/** Limits are the VMS `saleable_product` column sizes (all VARCHAR(25), NOT NULL; verified 2026-10-06). */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(25),
  description: emptyToUndefined(z.string().trim().max(25)),
  productCode: z.string().trim().min(1, 'Product code is required').max(25),
  productSku: emptyToUndefined(z.string().trim().max(25)),
  productVersion: emptyToUndefined(z.string().trim().max(25)),
  // Required: `product_category_id` is NOT NULL in VMS.
  productCategoryId: z.coerce
    .number<number | string | undefined | null>({ message: 'Category is required' })
    .int('Category is required')
    .positive('Category is required'),
  active: z.boolean().default(true),
});
export type ProductFormValues = z.input<typeof productFormSchema>;
export type ProductFormData = z.output<typeof productFormSchema>;
