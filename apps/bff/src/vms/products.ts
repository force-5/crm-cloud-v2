import type { ListQuery, Option, Page, Product, ProductDetailResponse, ProductFormData } from '@crm/contracts';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Vms } from './client';
import { isoDate, nn, pagingQuery, toPage, vmsPageSchema, type SortSpec } from './common';

const s = z.string().nullish();
const date = z.union([z.string(), z.number()]).nullish();

/** Real VMS currently returns every category with null fields (ModelMapper bug, see VMS change request V14). */
const vmsCategorySchema = z.object({ id: z.number().nullish(), code: s, description: s, active: z.boolean().nullish() });

/** VMS SaleableProductDto (audit fields only if VMS ever adds them). */
export const vmsProductSchema = z.looseObject({
  id: z.number().nullish(),
  name: s,
  description: s,
  productCode: s,
  productVersion: s,
  productSku: s,
  productCategory: vmsCategorySchema.nullish(),
  productCategoryId: z.number().nullish(),
  active: z.boolean().nullish(),
  createdBy: s,
  dateCreated: date,
  updatedBy: s,
  lastUpdated: date,
});
type VmsProduct = z.infer<typeof vmsProductSchema>;

const productEnvelope = z.object({
  product: vmsProductSchema.nullish(),
  supportingLists: z.object({ productCategories: z.array(vmsCategorySchema).nullish() }).nullish(),
});

export function mapProduct(p: VmsProduct & { id?: number | null }): Product {
  const hasAudit = p.createdBy || p.dateCreated || p.updatedBy || p.lastUpdated;
  return {
    id: p.id ?? 0,
    name: p.name ?? '',
    description: nn(p.description) || undefined,
    productCode: nn(p.productCode),
    productSku: nn(p.productSku),
    productVersion: nn(p.productVersion),
    productCategoryId: nn(p.productCategoryId ?? p.productCategory?.id ?? undefined),
    category: nn(p.productCategory?.description),
    active: p.active !== false,
    ...(hasAudit
      ? {
          audit: {
            createdBy: nn(p.createdBy),
            dateCreated: isoDate(p.dateCreated),
            updatedBy: nn(p.updatedBy),
            lastUpdated: isoDate(p.lastUpdated),
          },
        }
      : {}),
  };
}

const mapCategories = (r: z.infer<typeof productEnvelope>): Option[] =>
  (r.supportingLists?.productCategories ?? [])
    .filter((c): c is typeof c & { id: number } => typeof c.id === 'number' && c.active !== false)
    .map((c) => ({ value: c.id, label: c.description ?? c.code ?? String(c.id), ...(c.code ? { code: c.code } : {}) }));

export const PRODUCT_SORT: SortSpec = {
  map: {
    name: ['name'],
    description: ['description'],
    productCode: ['productCode'],
    productSku: ['productSku'],
    productVersion: ['productVersion'],
    category: ['productCategory.description'],
    status: ['active'],
    active: ['active'],
  },
  default: ['name,asc'],
  // ProductService always adds `name` as a secondary sort.
  always: ['name,asc'],
};

export async function listProducts(vms: Vms, q: ListQuery): Promise<Page<Product>> {
  const page = await vms.get('products', { query: pagingQuery(q, PRODUCT_SORT), schema: vmsPageSchema(vmsProductSchema) });
  return toPage(page, mapProduct);
}

export async function newProduct(vms: Vms): Promise<ProductDetailResponse> {
  const r = await vms.get('products/create', { schema: productEnvelope });
  return { product: null, categories: mapCategories(r) };
}

export async function getProduct(vms: Vms, id: number): Promise<ProductDetailResponse> {
  const r = await vms.get(`products/${id}/detail`, { schema: productEnvelope });
  if (!r.product?.id) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  return { product: mapProduct(r.product), categories: mapCategories(r) };
}

const toProductDto = (f: ProductFormData) => ({
  name: f.name,
  description: f.description ?? null,
  productCode: f.productCode,
  productSku: f.productSku ?? null,
  productVersion: f.productVersion ?? null,
  productCategoryId: f.productCategoryId ?? null,
  productCategory: f.productCategoryId ? { id: f.productCategoryId } : null,
  active: f.active,
});

function requireProduct(r: z.infer<typeof productEnvelope>): Product {
  // VMS's old failure mode was a 200 without a product; never report that as success.
  if (!r.product?.id) throw new AppError(502, 'INTERNAL', 'The product could not be saved.');
  return mapProduct(r.product);
}

export async function createProduct(vms: Vms, f: ProductFormData): Promise<Product> {
  return requireProduct(await vms.post('products', { json: toProductDto(f), schema: productEnvelope }));
}

export async function updateProduct(vms: Vms, id: number, f: ProductFormData): Promise<Product> {
  return requireProduct(await vms.put(`products/${id}`, { json: { ...toProductDto(f), id }, schema: productEnvelope }));
}

export async function setProductActive(vms: Vms, id: number, active: boolean): Promise<Product> {
  return mapProduct(await vms.patch(`products/${id}`, { json: { active }, schema: vmsProductSchema }));
}

export async function deleteProduct(vms: Vms, id: number): Promise<void> {
  const r = await vms.delete(`products/${id}`, { schema: z.object({ deleted: z.boolean() }) });
  if (!r.deleted) {
    throw new AppError(409, 'CONFLICT', 'This product could not be deleted. It may still be assigned to an account — deactivate it instead.');
  }
}
