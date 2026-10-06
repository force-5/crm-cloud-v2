import { z } from 'zod';

export const optionSchema = z.object({
  value: z.number(),
  label: z.string(),
  /** ISO code where the source list has one (countries, languages, states). */
  code: z.string().optional(),
});
export type Option = z.infer<typeof optionSchema>;

export const stringOptionSchema = z.object({ value: z.string(), label: z.string() });
export type StringOption = z.infer<typeof stringOptionSchema>;

export const auditSchema = z.object({
  createdBy: z.string().optional(),
  dateCreated: z.string().optional(),
  updatedBy: z.string().optional(),
  lastUpdated: z.string().optional(),
});
export type Audit = z.infer<typeof auditSchema>;

/** Paged list envelope. `page` is 1-based (the BFF converts from VMS's 0-based pages). */
export type Page<T> = { items: T[]; page: number; size: number; total: number; totalPages: number };

export const statusFilterSchema = z.enum(['active', 'inactive', 'all']);
export type StatusFilter = z.infer<typeof statusFilterSchema>;

export const PAGE_SIZES = [10, 20, 50] as const;

/** Query string accepted by every list endpoint. Also used as typed URL search params in the SPA. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(20)
    .default(20),
  search: z.string().trim().max(100).optional().catch(undefined),
  status: statusFilterSchema.catch('active').default('active'),
  sort: z.string().max(50).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export type ApiError = {
  error: { code: string; message: string; fieldErrors?: Record<string, string> };
};

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  CSRF: 'CSRF',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

// ---- shared field rules ----------------------------------------------------

/** Lenient: accepts E.164 (+14045550123) and legacy display formats VMS already holds, e.g. (404) 555-0100. */
export const PHONE_REGEX = /^\+?[0-9(][0-9 ().-]{6,19}$/;
export const phone = z.string().trim().regex(PHONE_REGEX, 'Enter a valid phone number');
export const email = z.string().trim().max(100).email('Enter a valid email address');

/**
 * Empty strings / null from form inputs become undefined so "optional" really means optional.
 * Unlike z.preprocess this keeps a typed input (`'' | null | undefined | input<T>`), so form
 * libraries see real field types instead of `unknown`.
 */
export const emptyToUndefined = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal('').transform(() => undefined), z.null().transform(() => undefined), schema]).optional();

/** Numeric id from a <select>/picker: a number or a numeric string. */
export const idField = () => emptyToUndefined(z.coerce.number<number | string>().int().positive());
