import {
  API,
  ERROR_CODES,
  photoUploadSchema,
  preferencesSchema,
  profileFormSchema,
  type CurrentUser,
  type ProfileResponse,
  type TotpEnrollment,
} from '@crm/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import type { Deps } from '../deps';
import { withCrmGrants } from '../auth/guard';
import { AppError, parseOrThrow, unauthenticated, validationError } from '../errors';
import * as users from '../vms/users';

const PHOTO_BODY_LIMIT = 8 * 1024 * 1024;
const MAX_PHOTO_CHARS = Math.ceil((5 * 1024 * 1024 * 4) / 3) + 100;

/** Keep the session's cached user in step with VMS after every profile change. */
function rememberUser(req: FastifyRequest, crm: Config['crm'], user: CurrentUser): CurrentUser {
  // Authorization (roles, permissions, tenant) is fixed at login from `authenticate`; profile endpoints
  // return a differently shaped user, so they only refresh the profile fields.
  const atLogin = req.session.auth?.user;
  // The theme also stays session-side: VMS can't store it yet (V15).
  const merged = atLogin
    ? {
        ...user,
        securityRoles: atLogin.securityRoles,
        permissions: atLogin.permissions,
        tenant: atLogin.tenant,
        themeName: atLogin.themeName,
      }
    : user;
  const granted = withCrmGrants(merged, crm);
  if (req.session.auth) req.session.auth = { ...req.session.auth, user: granted };
  return granted;
}

async function freshProfile(req: FastifyRequest, crm: Config['crm']): Promise<ProfileResponse> {
  const r = await users.getSignedInUser(req.vms);
  if (!r) throw unauthenticated();
  return { ...r, user: rememberUser(req, crm, r.user) };
}

export function totpSecretFromUri(uri: string): string {
  try {
    const secret = new URL(uri).searchParams.get('secret');
    if (secret) return secret;
  } catch {
    // fall through to the regex
  }
  return /[?&]secret=([^&]+)/i.exec(uri)?.[1] ?? '';
}

export async function profileRoutes(app: FastifyInstance, deps: Deps) {
  const crm = deps.config.crm;
  const sessionUser = (req: FastifyRequest) => req.session.auth!.user;

  /** Always from VMS, never from the cached session copy. */
  app.get(API.profile.root, async (req) => freshProfile(req, crm));

  app.put(API.profile.root, { config: { audit: 'profile.update' } }, async (req) => {
    const data = parseOrThrow(profileFormSchema, req.body);
    // Uses the SESSION user's id — never one from the client.
    const r = await users.updateSignedInUser(req.vms, sessionUser(req), data);
    if (!r) throw new AppError(502, ERROR_CODES.INTERNAL, 'Your profile could not be saved.');
    return { ...r, user: rememberUser(req, crm, r.user) };
  });

  app.patch(API.profile.preferences, { config: { audit: 'profile.preferences' } }, async (req) => {
    const prefs = parseOrThrow(preferencesSchema, req.body);
    const me = sessionUser(req);
    if (prefs.mfaEnabled === false && me.tenant.requireMfa) {
      throw validationError({ mfaEnabled: 'Two-factor authentication is required by your organization.' });
    }
    const willUseSms = (prefs.mfaType ?? me.mfaType) === 'sms' && (prefs.mfaEnabled ?? me.mfaEnabled);
    if (willUseSms && !me.mobilePhone) {
      throw validationError({ mfaType: 'Add a mobile phone number to your profile to use SMS codes.' });
    }
    await users.patchUserPreferences(req.vms, me.id, prefs);
    if (prefs.themeName && req.session.auth) {
      req.session.auth = { ...req.session.auth, user: { ...req.session.auth.user, themeName: prefs.themeName } };
    }
    const { user } = await freshProfile(req, crm);
    return { user };
  });

  app.put(API.profile.photo, { bodyLimit: PHOTO_BODY_LIMIT, config: { audit: 'profile.photo.upload' } }, async (req) => {
    const { dataUrl } = parseOrThrow(photoUploadSchema, req.body);
    if (dataUrl.length > MAX_PHOTO_CHARS) throw validationError({ dataUrl: 'Image must be 5 MB or smaller' });
    const me = sessionUser(req);
    const profileImageUrl = await users.updateProfileImage(req.vms, me.id, dataUrl);
    rememberUser(req, crm, { ...me, profileImageUrl });
    return { profileImageUrl };
  });

  app.delete(API.profile.photo, { config: { audit: 'profile.photo.remove' } }, async (req, reply) => {
    const me = sessionUser(req);
    await users.removeProfileImage(req.vms, me.id);
    rememberUser(req, crm, { ...me, profileImageUrl: undefined });
    return reply.code(204).send();
  });

  app.post(API.profile.totp, { config: { audit: 'profile.mfa.totp' } }, async (req): Promise<TotpEnrollment> => {
    const uri = await users.registerTotp(req.vms, sessionUser(req).email);
    if (!uri) throw new AppError(502, ERROR_CODES.INTERNAL, 'Authenticator setup could not be started. Try again later.');
    return { uri, secret: totpSecretFromUri(uri) };
  });
}
