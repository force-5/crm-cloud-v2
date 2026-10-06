import { z } from 'zod';
import { auditSchema, emptyToUndefined, idField, optionSchema } from './common';

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

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: emptyToUndefined(z.string().trim().max(500)),
  productCode: z.string().trim().min(1, 'Product code is required').max(50),
  productSku: emptyToUndefined(z.string().trim().max(50)),
  productVersion: emptyToUndefined(z.string().trim().max(20)),
  productCategoryId: idField(),
  active: z.boolean().default(true),
});
export type ProductFormValues = z.input<typeof productFormSchema>;
export type ProductFormData = z.output<typeof productFormSchema>;
