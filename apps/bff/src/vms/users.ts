import type { CurrentUser, MfaType, PreferencesRequest, ProfileFormData, ProfileResponse, ThemeName } from '@crm/contracts';
import { z } from 'zod';
import type { Vms } from './client';
import { mapCommonLookups, nn, supportingListsSchema } from './common';

const s = z.string().nullish();
const n = z.number().nullish();
const named = z.object({ id: z.number().nullish(), code: s, description: s }).nullish();
/**
 * Roles come in two shapes:
 * - `authenticate`: `AuthSecurityRoleDto {code, name, shortDisplay}` — and every role appears twice, once
 *   auto-mapped from TenantSecurityRole with `code: null`;
 * - `signedInUser`: the TenantSecurityRole entity, with the code nested at `securityRole.code`.
 * `roleCode` reads either; codeless/inactive entries are dropped in mapCurrentUser.
 */
const role = z.looseObject({
  code: s,
  name: s,
  shortDisplay: s,
  active: z.boolean().nullish(),
  securityRole: z.looseObject({ code: s, name: s, shortDisplay: s }).nullish(),
});
type VmsRole = z.infer<typeof role>;
const roleCode = (r: VmsRole) => r.code ?? r.securityRole?.code ?? undefined;
const permission = z.object({
  code: z.string(),
  hasRead: z.boolean().nullish(),
  hasCreate: z.boolean().nullish(),
  hasUpdate: z.boolean().nullish(),
  hasDelete: z.boolean().nullish(),
  hasExecute: z.boolean().nullish(),
});

/** VMS AuthUserDto (from `authenticate`, `signedInUser`). */
export const vmsAuthUserSchema = z.looseObject({
  id: z.number(),
  token: s,
  email: z.string(),
  firstName: s,
  lastName: s,
  mobilePhone: s,
  address: s,
  city: s,
  postalCode: s,
  stateId: n,
  state: named,
  countryId: n,
  country: named,
  languageId: n,
  language: named,
  timeZoneName: s,
  themeName: s,
  themeMode: s,
  mfaEnabled: z.boolean().nullish(),
  mfaType: s,
  profileImageUrl: s,
  roles: z.array(role).nullish(),
  securityRoles: z.array(role).nullish(),
  securityPermissions: z.array(permission).nullish(),
  tenantId: n,
  tenant: z
    .looseObject({
      id: z.number(),
      name: s,
      requireMfa: z.boolean().nullish(),
      timeZoneName: s,
      country: named,
      language: named,
    })
    .nullish(),
});
export type VmsAuthUser = z.infer<typeof vmsAuthUserSchema>;

const THEMES: readonly ThemeName[] = ['light', 'dark', 'system'];

/** VMS stores `sms`, and the legacy UI wrote `topt` (sic) for TOTP (V4). */
export function mapMfaType(v: string | null | undefined): MfaType | undefined {
  const t = v?.toLowerCase();
  if (t === 'sms') return 'sms';
  if (t === 'totp' || t === 'topt') return 'totp';
  return undefined;
}

export function mapCurrentUser(u: VmsAuthUser): CurrentUser {
  const all = [...(u.roles ?? []), ...(u.securityRoles ?? [])];
  const roles = all
    .filter((r) => r.active !== false)
    .map((r) => ({ code: roleCode(r), name: r.name ?? r.securityRole?.name ?? r.shortDisplay ?? undefined }))
    .filter((r): r is { code: string; name: string | undefined } => !!r.code)
    .filter((r, i, arr) => arr.findIndex((x) => x.code === r.code) === i);
  const theme = (u.themeName ?? u.themeMode ?? '').toLowerCase() as ThemeName;
  const lang = u.language?.code ?? u.tenant?.language?.code ?? 'en';
  const country = u.country?.code ?? u.tenant?.country?.code ?? 'US';
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    profileImageUrl: nn(u.profileImageUrl),
    mobilePhone: nn(u.mobilePhone),
    address: nn(u.address),
    city: nn(u.city),
    stateId: nn(u.stateId ?? u.state?.id),
    postalCode: nn(u.postalCode),
    countryId: nn(u.countryId ?? u.country?.id),
    languageId: nn(u.languageId ?? u.language?.id),
    timeZoneName: nn(u.timeZoneName),
    locale: `${lang}-${country}`,
    themeName: THEMES.includes(theme) ? theme : 'system',
    mfaEnabled: u.mfaEnabled === true,
    mfaType: mapMfaType(u.mfaType),
    securityRoles: roles.map((r) => ({ code: r.code, name: r.name ?? r.code })),
    permissions: (u.securityPermissions ?? []).map((p) => ({
      code: p.code,
      read: p.hasRead === true,
      create: p.hasCreate === true,
      update: p.hasUpdate === true,
      delete: p.hasDelete === true,
      execute: p.hasExecute === true,
    })),
    tenant: {
      id: u.tenant?.id ?? u.tenantId ?? 0,
      name: u.tenant?.name ?? '',
      requireMfa: u.tenant?.requireMfa === true,
      timeZoneName: nn(u.tenant?.timeZoneName),
    },
  };
}

// ---- authentication -------------------------------------------------------------

/**
 * `POST authenticate`. VMS returns **200 with an empty body** for bad credentials (V11), so
 * `null` here means "invalid credentials".
 */
export async function authenticate(
  vms: Vms,
  body: { email: string; password: string; tenantId: number },
): Promise<VmsAuthUser | null> {
  const r = await vms.post('authenticate', {
    json: body,
    schema: z.object({ user: vmsAuthUserSchema.nullish() }).nullish(),
  });
  return r?.user ?? null;
}

const mfaResponse = z
  .looseObject({ valid: z.boolean().nullish(), status: s, to: s, channel: s, uri: s })
  .nullish();

export async function sendMfaCode(vms: Vms, userToken: string) {
  return (await vms.post('auth/sendMfaCode', { json: { token: userToken }, schema: mfaResponse })) ?? {};
}

/** The VMS field is `passcode` (the old CRM sent `code`, which VMS ignores). */
export async function verifyMfaCode(vms: Vms, to: string, passcode: string): Promise<boolean> {
  const r = await vms.post('auth/verifyMfaCode', { json: { to, passcode }, schema: mfaResponse });
  return r?.valid === true && (r.status ?? 'approved') === 'approved';
}

export async function registerTotp(vms: Vms, identifier: string): Promise<string | null> {
  const r = await vms.post('auth/registerTotp', { json: { identifier }, schema: mfaResponse });
  return r?.uri ?? null;
}

// ---- password recovery ------------------------------------------------------------

const recoveryResponse = z.looseObject({ status: s, error: s }).nullish();

export async function forgotPassword(vms: Vms, email: string) {
  return vms.post('passwordRecovery/forgot', { json: { email }, schema: recoveryResponse });
}

export async function verifyRecoveryCode(vms: Vms, email: string, code: string): Promise<boolean> {
  const r = await vms.post('passwordRecovery/verify', { json: { email, passwordRecoveryCode: code }, schema: recoveryResponse });
  return r?.status === 'SUCCESS';
}

export async function updatePassword(
  vms: Vms,
  body: { email: string; password: string; passwordConfirmation: string; code: string },
): Promise<{ ok: boolean; error?: string }> {
  const r = await vms.post('passwordRecovery/update', {
    json: {
      email: body.email,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
      passwordRecoveryCode: body.code,
    },
    schema: recoveryResponse,
  });
  return { ok: r?.status === 'SUCCESS', error: nn(r?.error) };
}

// ---- profile ------------------------------------------------------------------------

const userEnvelope = z.object({ user: vmsAuthUserSchema.nullish(), supportingLists: supportingListsSchema.nullish() });

function toProfileResponse(r: z.infer<typeof userEnvelope>): ProfileResponse | null {
  if (!r.user) return null;
  return { user: mapCurrentUser(r.user), lookups: mapCommonLookups(r.supportingLists ?? {}) };
}

export async function getSignedInUser(vms: Vms): Promise<ProfileResponse | null> {
  return toProfileResponse(await vms.get('signedInUser', { schema: userEnvelope }));
}

export async function updateSignedInUser(
  vms: Vms,
  sessionUser: CurrentUser,
  f: ProfileFormData,
): Promise<ProfileResponse | null> {
  // Always the SESSION user's id — VMS does not check the id against the caller.
  const dto = {
    id: sessionUser.id,
    email: sessionUser.email,
    firstName: f.firstName,
    lastName: f.lastName,
    mobilePhone: f.mobilePhone ?? null,
    address: f.address ?? null,
    city: f.city ?? null,
    countryId: f.countryId ?? null,
    stateId: f.stateId ?? null,
    postalCode: f.postalCode ?? null,
    languageId: f.languageId ?? null,
    timeZoneName: f.timeZoneName ?? null,
  };
  return toProfileResponse(await vms.put(`signedInUser/${sessionUser.id}`, { json: dto, schema: userEnvelope }));
}

/**
 * `PATCH users/{id}` (plural — the old CRM called the non-existent `user/{id}`).
 *
 * The theme is NOT sent: VMS's `themeName` case calls a setter that doesn't exist (500), and its
 * ThemeMode enum has no "system" (V15). Until that's fixed, the theme lives in the session and the
 * client's localStorage only. Returns whether anything was sent to VMS.
 */
export async function patchUserPreferences(vms: Vms, userId: number, p: PreferencesRequest): Promise<boolean> {
  const updates: Record<string, unknown> = {};
  if (p.mfaEnabled !== undefined) updates.mfaEnabled = p.mfaEnabled;
  if (p.mfaType !== undefined) updates.mfaType = p.mfaType;
  if (Object.keys(updates).length === 0) return false;
  await vms.patch(`users/${userId}`, { json: updates });
  return true;
}

export async function updateProfileImage(vms: Vms, userId: number, dataUrl: string): Promise<string> {
  const r = await vms.patch(`users/${userId}/updateProfileImage`, {
    json: { base64Image: dataUrl },
    schema: z.object({ profileImageUrl: z.string() }),
  });
  return r.profileImageUrl;
}

export async function removeProfileImage(vms: Vms, userId: number): Promise<void> {
  await vms.patch(`users/${userId}/removeProfileImage`, { json: {} });
}
