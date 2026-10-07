import { z } from 'zod';
import { auditSchema, email, emptyToUndefined, idField, optionSchema, phone, stringOptionSchema } from './common';
import { countryRule } from './address';

export const accountStatusSchema = z.enum(['draft', 'active', 'inactive']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const mainContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  phone: z.string().optional(),
});

export const accountSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  status: accountStatusSchema,
  mainContact: mainContactSchema,
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  dateCreated: z.string().optional(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

export const accountSchema = accountSummarySchema.extend({
  active: z.boolean(),
  registeredDate: z.string().optional(),
  registeredBy: z.string().optional(),
  languageId: z.number().optional(),
  timeZoneName: z.string().optional(),
  labelVerticalId: z.number().nullable().optional(),
  frameworkIds: z.array(z.number()),
  requireMfa: z.boolean(),
  address: z.string().optional(),
  stateId: z.number().optional(),
  provinceOrRegion: z.string().optional(),
  postalCode: z.string().optional(),
  countryId: z.number().optional(),
  logoUrl: z.string().optional(),
  signinBackgroundImageUrl: z.string().optional(),
  accessCode: z.string().optional(),
  audit: auditSchema,
  // Never exposed: defaultPassword, registrationCode, registrationUrl, registrationQrCode, clearPassword.
});
export type Account = z.infer<typeof accountSchema>;

export const labelVerticalSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
});
export type LabelVertical = z.infer<typeof labelVerticalSchema>;

export const accountLookupsSchema = z.object({
  languages: z.array(optionSchema),
  timeZones: z.array(stringOptionSchema),
  countries: z.array(optionSchema),
  states: z.array(optionSchema),
  frameworks: z.array(optionSchema),
  labelVerticals: z.array(labelVerticalSchema),
});
export type AccountLookups = z.infer<typeof accountLookupsSchema>;

/** `GET /api/accounts/new` and `GET /api/accounts/:id` */
export type AccountDetailResponse = { account: Account | null; lookups: AccountLookups };

export type DashboardSummary = {
  total: number;
  active: number;
  inactive: number;
  /** null until VMS supports a draft filter (plan V8). */
  draft: number | null;
  recent: AccountSummary[];
};

// ---- form ------------------------------------------------------------------

export const LOGO_ASPECT = 200 / 60; // VMS resizes logos to 200x60 (V10: confirm)
export const SIGNIN_IMAGE_ASPECT = 16 / 9;
export const SIGNIN_IMAGE_SIZE = { width: 1920, height: 1080 } as const;
export const LOGO_SIZE = { width: 400, height: 120 } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * The editable account fields. Format rules apply whenever a field is filled in;
 * "required" rules apply only on Publish / Save changes (see `validateAccountForPublish`).
 */
/** Max lengths follow the VMS `tenant` columns (verified 2026-10-06). */
export const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(100),
  languageId: idField(),
  timeZoneName: emptyToUndefined(z.string().max(64)),
  labelVerticalId: z.number().int().positive().nullable().optional(),
  frameworkIds: z.array(z.number().int().positive()).max(50).default([]),
  requireMfa: z.boolean().default(false),
  active: z.boolean().default(true),
  mainContactFirstName: emptyToUndefined(z.string().trim().max(50)),
  mainContactLastName: emptyToUndefined(z.string().trim().max(50)),
  mainContactEmail: emptyToUndefined(email.max(50)),
  mainContactMobile: emptyToUndefined(phone),
  mainContactPhone: emptyToUndefined(phone),
  countryId: idField(),
  address: emptyToUndefined(z.string().trim().max(200)),
  city: emptyToUndefined(z.string().trim().max(50)),
  stateId: idField(),
  provinceOrRegion: emptyToUndefined(z.string().trim().max(100)),
  postalCode: emptyToUndefined(z.string().trim().max(12)),
});
export type AccountFormValues = z.input<typeof accountFormSchema>;
export type AccountFormData = z.output<typeof accountFormSchema>;

export type SaveMode = 'draft' | 'publish';

/**
 * Full validation for Publish and for saving a registered account.
 * Returns field → message for every problem (empty object when valid).
 */
export function validateAccountForPublish(
  data: AccountFormData,
  countryCodeOf: (countryId: number | undefined) => string | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const req = (key: keyof AccountFormData, label: string) => {
    const v = data[key];
    if (v === undefined || v === null || v === '') errors[key] = `${label} is required`;
  };
  req('languageId', 'Language');
  req('timeZoneName', 'Time zone');
  req('mainContactFirstName', 'First name');
  req('mainContactLastName', 'Last name');
  req('mainContactEmail', 'Email');
  req('mainContactMobile', 'Mobile');
  req('countryId', 'Country');
  req('address', 'Address');
  req('city', 'City');
  req('postalCode', 'Postal code');

  const rule = countryRule(countryCodeOf(data.countryId));
  if (rule.usesStates) req('stateId', rule.stateLabel);
  if (data.postalCode && rule.postalPattern && !rule.postalPattern.test(data.postalCode)) {
    errors.postalCode = `Enter a valid ${rule.postalLabel.toLowerCase()}${rule.postalHint ? ` (${rule.postalHint})` : ''}`;
  }
  return errors;
}

/** `POST /api/accounts` body */
export const createAccountRequestSchema = z.object({
  mode: z.enum(['draft', 'publish']),
  account: accountFormSchema,
});
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;

/** `PUT /api/accounts/:id` body (draft update or registered update; BFF decides from state). */
export const updateAccountRequestSchema = z.object({ account: accountFormSchema });
export type UpdateAccountRequest = z.input<typeof updateAccountRequestSchema>;

/** `PATCH /api/accounts/:id` */
export const setActiveSchema = z.object({ active: z.boolean() });
export type SetActiveRequest = z.infer<typeof setActiveSchema>;

/** `PUT /api/accounts/:id/logo` and `/signin-image`: a data URL produced by the cropper. */
/** A PNG/JPEG/WebP data URL whose body is genuine base64 (the BFF also checks the file signature). */
export const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const imageUploadSchema = z.object({
  dataUrl: z
    .string()
    .regex(IMAGE_DATA_URL, 'Image must be PNG, JPEG or WebP')
    .max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100, 'Image must be 5 MB or smaller'),
});
export type ImageUploadRequest = z.infer<typeof imageUploadSchema>;
