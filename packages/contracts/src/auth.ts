import { z } from 'zod';
import { IMAGE_DATA_URL } from './accounts';
import { optionSchema, stringOptionSchema, emptyToUndefined, idField, phone } from './common';

export const themeNameSchema = z.enum(['light', 'dark', 'system']);
export type ThemeName = z.infer<typeof themeNameSchema>;

export const mfaTypeSchema = z.enum(['sms', 'totp']);
export type MfaType = z.infer<typeof mfaTypeSchema>;

export const permissionSchema = z.object({
  code: z.string(),
  read: z.boolean(),
  create: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  execute: z.boolean(),
});
export type Permission = z.infer<typeof permissionSchema>;
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'execute';

export const currentUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  profileImageUrl: z.string().optional(),
  mobilePhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  stateId: z.number().optional(),
  postalCode: z.string().optional(),
  countryId: z.number().optional(),
  languageId: z.number().optional(),
  timeZoneName: z.string().optional(),
  locale: z.string(),
  themeName: themeNameSchema,
  mfaEnabled: z.boolean(),
  mfaType: mfaTypeSchema.optional(),
  securityRoles: z.array(z.object({ code: z.string(), name: z.string() })),
  permissions: z.array(permissionSchema),
  tenant: z.object({
    id: z.number(),
    name: z.string(),
    requireMfa: z.boolean(),
    timeZoneName: z.string().optional(),
  }),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export function hasPermission(
  user: Pick<CurrentUser, 'permissions'> | null | undefined,
  code: string,
  action: PermissionAction = 'read',
): boolean {
  return !!user?.permissions.some((p) => p.code === code && p[action]);
}

/** Permission codes the CRM gates on (decision D1 — confirm names with VMS). */
export const PERMISSIONS = {
  ACCOUNTS: 'MANAGE_ACCOUNT',
  PRODUCTS: 'MANAGE_PRODUCT',
  LICENSES: 'MANAGE_LICENSE',
} as const;

export type SessionInfo = {
  user: CurrentUser;
  csrfToken: string;
  idleTimeoutMinutes: number;
  environment: string;
};

// ---- login ---------------------------------------------------------------

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(50).email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type TenantChoice = { id: number; name: string };

export type LoginResult =
  | { status: 'ok'; session: SessionInfo }
  | { status: 'select-account'; accounts: TenantChoice[] }
  | { status: 'mfa'; channel: MfaType; destination?: string };

export const selectAccountSchema = z.object({ tenantId: z.number().int().positive() });
export type SelectAccountRequest = z.infer<typeof selectAccountSchema>;

export const mfaVerifySchema = z.object({
  passcode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifySchema>;

// ---- forgot password -------------------------------------------------------

export const forgotPasswordSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });
export const verifyRecoveryCodeSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(4, 'Enter the code from your email'),
});

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p: string) => /\d/.test(p) },
  { id: 'symbol', label: 'A symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().email(),
    code: z.string().trim().min(4),
    password: z
      .string()
      .refine((p) => PASSWORD_RULES.every((r) => r.test(p)), 'Password does not meet the requirements'),
    passwordConfirmation: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Passwords do not match',
  });
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

// ---- profile -----------------------------------------------------------------

export type ProfileLookups = {
  languages: z.infer<typeof optionSchema>[];
  timeZones: z.infer<typeof stringOptionSchema>[];
  countries: z.infer<typeof optionSchema>[];
  states: z.infer<typeof optionSchema>[];
};
export type ProfileResponse = { user: CurrentUser; lookups: ProfileLookups };

export const profileFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  mobilePhone: emptyToUndefined(phone),
  address: emptyToUndefined(z.string().trim().max(200)),
  city: emptyToUndefined(z.string().trim().max(100)),
  countryId: idField(),
  stateId: idField(),
  postalCode: emptyToUndefined(z.string().trim().max(20)),
  languageId: idField(),
  timeZoneName: emptyToUndefined(z.string().max(64)),
});
export type ProfileFormValues = z.input<typeof profileFormSchema>;
export type ProfileFormData = z.output<typeof profileFormSchema>;

export const preferencesSchema = z
  .object({
    themeName: themeNameSchema.optional(),
    mfaEnabled: z.boolean().optional(),
    mfaType: mfaTypeSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type PreferencesRequest = z.infer<typeof preferencesSchema>;

export type TotpEnrollment = { uri: string; secret: string };

export const photoUploadSchema = z.object({
  dataUrl: z.string().regex(IMAGE_DATA_URL, 'Image must be PNG, JPEG or WebP'),
});
