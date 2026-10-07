import {
  API,
  ERROR_CODES,
  forgotPasswordSchema,
  loginRequestSchema,
  mfaVerifySchema,
  resetPasswordSchema,
  selectAccountSchema,
  verifyRecoveryCodeSchema,
  type CurrentUser,
  type LoginResult,
  type MfaType,
  type SessionInfo,
} from '@crm/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ensureCsrfToken, rotateCsrfToken } from '../auth/csrf';
import { isCrmUser, withCrmGrants } from '../auth/guard';
import type { TokenSet } from '../auth/keycloak';
import { SESSION_COOKIE } from '../auth/session';
import type { Deps } from '../deps';
import { AppError, forbidden, parseOrThrow, unauthenticated, validationError } from '../errors';
import * as users from '../vms/users';

/** Tenant the first password grant is scoped to (as in Grails). */
const DEFAULT_TENANT_ID = 1;
const PENDING_PASSWORD_TTL_MS = 2 * 60_000;
const MFA_TTL_MS = 10 * 60_000;
const MFA_MAX_ATTEMPTS = 5;

export function maskDestination(to: string | undefined, channel: MfaType): string | undefined {
  if (!to) return undefined;
  if (to.includes('@')) {
    const [local, domain] = to.split('@') as [string, string];
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  if (channel === 'totp') return undefined;
  const digits = to.replace(/\D/g, '');
  return digits.length >= 4 ? `•••-•••-${digits.slice(-4)}` : '•••';
}

export async function authRoutes(app: FastifyInstance, deps: Deps) {
  const { config, keycloak, vmsClient, secretBox, requireAuth, loginLimiter, recoveryLimiter } = deps;
  const loginRateLimit = { rateLimit: { max: config.rateLimit.loginPerMinute, timeWindow: '1 minute' } };

  const vmsFor = (req: FastifyRequest, token?: string) =>
    vmsClient.bind({ token, requestId: req.id, userAgent: req.headers['user-agent'] });

  const sessionInfo = (req: FastifyRequest): SessionInfo => ({
    user: req.session.auth!.user,
    csrfToken: ensureCsrfToken(req.session),
    idleTimeoutMinutes: config.sessionIdleMinutes,
    environment: config.env,
  });

  /** D1 guard, then session fixation defence + CSRF rotation. Only now is the session authenticated. */
  async function finalize(req: FastifyRequest, tokens: TokenSet, user: CurrentUser, tenantId: number): Promise<LoginResult> {
    req.auditTenant = tenantId;
    if (!isCrmUser(user, config.crm)) {
      req.log.warn({ email: user.email, tenantId }, 'login rejected: not a CRM user');
      await keycloak.logout(tokens.refreshToken);
      await req.session.destroy();
      throw forbidden('Your account does not have access to the Force 5 CRM.');
    }
    await req.session.regenerate();
    const now = Date.now();
    req.session.auth = { ...tokens, tenantId, user: withCrmGrants(user, config.crm), loginAt: now };
    req.session.lastSeen = now;
    rotateCsrfToken(req.session);
    loginLimiter.reset(user.email);
    return { status: 'ok', session: sessionInfo(req) };
  }

  /** VMS `authenticate`, then MFA gate or finalize. */
  async function continueWithTenant(
    req: FastifyRequest,
    email: string,
    password: string,
    tenantId: number,
    tokens: TokenSet,
  ): Promise<LoginResult> {
    const vms = vmsFor(req, tokens.accessToken);
    const vmsUser = await users.authenticate(vms, { email, password, tenantId });
    if (!vmsUser) {
      // VMS's empty-200 failure.
      await keycloak.logout(tokens.refreshToken);
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.');
    }
    const user = users.mapCurrentUser(vmsUser);

    if (user.tenant.requireMfa || user.mfaEnabled) {
      const channel: MfaType = user.mfaType === 'totp' ? 'totp' : 'sms';
      let to = channel === 'totp' ? user.email : (user.mobilePhone ?? '');
      if (channel === 'sms') {
        const sent = await users.sendMfaCode(vms, vmsUser.token ?? '');
        if (!sent.valid || !sent.to) {
          await keycloak.logout(tokens.refreshToken);
          throw forbidden('Two-factor authentication is required, but no mobile number is on file. Contact your administrator.');
        }
        to = sent.to;
      }
      req.session.pending = {
        stage: 'mfa',
        email,
        tokens,
        tenantId,
        user,
        channel,
        to,
        userToken: vmsUser.token ?? '',
        attempts: 0,
        expiresAt: Date.now() + MFA_TTL_MS,
      };
      return { status: 'mfa', channel, destination: maskDestination(to, channel) };
    }
    return finalize(req, tokens, user, tenantId);
  }

  // ---- CSRF / session --------------------------------------------------------

  app.get(API.auth.csrf, async (req) => ({ csrfToken: ensureCsrfToken(req.session) }));

  app.get(API.auth.session, { preHandler: requireAuth }, async (req) => sessionInfo(req));

  app.post(API.auth.keepalive, { preHandler: requireAuth, config: { audit: 'session.keepalive' } }, async () => ({
    ok: true as const,
  }));

  // ---- login -------------------------------------------------------------------

  app.post(API.auth.login, { config: { audit: 'auth.login', ...loginRateLimit } }, async (req): Promise<LoginResult> => {
    const { email, password } = parseOrThrow(loginRequestSchema, req.body);
    req.auditUser = email;
    loginLimiter.hit(email);

    // Start from a clean slate: a new login replaces any previous state in this session.
    req.session.auth = undefined;
    req.session.pending = undefined;

    await keycloak.realmInfo(); // liveness: Keycloak down => 503 "Service unavailable"
    let tokens = await keycloak.passwordGrant(email, password, DEFAULT_TENANT_ID);
    const tenants = await keycloak.tenantsFromToken(tokens.accessToken);

    if (tenants.length === 0) {
      await keycloak.logout(tokens.refreshToken);
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.');
    }
    if (tenants.length > 1) {
      await keycloak.logout(tokens.refreshToken);
      req.session.pending = {
        stage: 'select-account',
        email,
        password: secretBox.encrypt(password),
        passwordExpiresAt: Date.now() + PENDING_PASSWORD_TTL_MS,
        accounts: tenants,
      };
      return { status: 'select-account', accounts: tenants };
    }

    const tenantId = tenants[0]!.id;
    if (tenantId !== DEFAULT_TENANT_ID) {
      await keycloak.logout(tokens.refreshToken);
      tokens = await keycloak.passwordGrant(email, password, tenantId);
    }
    return continueWithTenant(req, email, password, tenantId, tokens);
  });

  app.post(
    API.auth.selectAccount,
    { config: { audit: 'auth.select-account', ...loginRateLimit } },
    async (req): Promise<LoginResult> => {
      const { tenantId } = parseOrThrow(selectAccountSchema, req.body);
      const pending = req.session.pending;
      if (pending?.stage !== 'select-account') throw unauthenticated('Please sign in again.');
      req.auditUser = pending.email;
      req.auditTenant = tenantId;

      const box = pending.password;
      // One shot: the encrypted password is removed whatever happens next.
      req.session.pending = { ...pending, password: undefined };
      const password = box && pending.passwordExpiresAt > Date.now() ? secretBox.decrypt(box) : null;
      if (!password) {
        req.session.pending = undefined;
        throw unauthenticated('Your sign-in expired. Please sign in again.');
      }
      if (!pending.accounts.some((a) => a.id === tenantId)) {
        req.session.pending = { ...pending }; // allow another pick within the window
        throw validationError({ tenantId: 'Choose one of your accounts.' });
      }

      const tokens = await keycloak.passwordGrant(pending.email, password, tenantId);
      req.session.pending = undefined;
      return continueWithTenant(req, pending.email, password, tenantId, tokens);
    },
  );

  // ---- MFA -----------------------------------------------------------------------

  const requireMfaPending = (req: FastifyRequest) => {
    const p = req.session.pending;
    if (p?.stage !== 'mfa') throw unauthenticated('Please sign in again.');
    if (p.expiresAt < Date.now()) {
      req.session.pending = undefined;
      throw unauthenticated('Your verification code expired. Please sign in again.');
    }
    req.auditUser = p.email;
    req.auditTenant = p.tenantId;
    return p;
  };

  app.post(
    API.auth.mfaSend,
    { config: { audit: 'auth.mfa.send', rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const p = requireMfaPending(req);
      if (p.channel === 'sms') {
        const sent = await users.sendMfaCode(vmsFor(req, p.tokens.accessToken), p.userToken);
        if (!sent.valid) throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, 'The code could not be sent. Try again shortly.');
      }
      return { sent: true as const, destination: maskDestination(p.to, p.channel) };
    },
  );

  app.post(API.auth.mfaVerify, { config: { audit: 'auth.mfa.verify', ...loginRateLimit } }, async (req) => {
    const { passcode } = parseOrThrow(mfaVerifySchema, req.body);
    const p = requireMfaPending(req);
    const attempts = p.attempts + 1;
    if (attempts > MFA_MAX_ATTEMPTS) {
      await keycloak.logout(p.tokens.refreshToken);
      req.session.pending = undefined;
      throw unauthenticated('Too many incorrect codes. Please sign in again.');
    }
    req.session.pending = { ...p, attempts };
    const ok = await users.verifyMfaCode(vmsFor(req, p.tokens.accessToken), p.to, passcode);
    if (!ok) throw validationError({ passcode: 'That code is not valid. Check it and try again.' }, 'Invalid code');
    return finalize(req, p.tokens, p.user, p.tenantId);
  });

  // ---- logout --------------------------------------------------------------------

  app.post(API.auth.logout, { config: { audit: 'auth.logout' } }, async (req, reply) => {
    const auth = req.session.auth;
    const pending = req.session.pending;
    req.auditUser = auth?.user.email ?? pending?.email;
    req.auditTenant = auth?.tenantId;
    if (auth) await keycloak.logout(auth.refreshToken);
    if (pending?.stage === 'mfa') await keycloak.logout(pending.tokens.refreshToken);
    await req.session.destroy();
    reply.clearCookie(SESSION_COOKIE, { path: config.basePath });
    return reply.code(204).send();
  });

  // ---- forgot password (public) -----------------------------------------------------

  app.post(API.auth.passwordForgot, { config: { audit: 'auth.password.forgot', ...loginRateLimit } }, async (req) => {
    const { email } = parseOrThrow(forgotPasswordSchema, req.body);
    req.auditUser = email;
    recoveryLimiter.hit(`forgot:${email}`);
    // Same answer whether or not the email exists.
    await users.forgotPassword(vmsFor(req), email);
    return { ok: true as const };
  });

  app.post(API.auth.passwordVerify, { config: { audit: 'auth.password.verify', ...loginRateLimit } }, async (req) => {
    const { email, code } = parseOrThrow(verifyRecoveryCodeSchema, req.body);
    req.auditUser = email;
    recoveryLimiter.hit(`verify:${email}`);
    const ok = await users.verifyRecoveryCode(vmsFor(req), email, code);
    if (!ok) throw validationError({ code: 'That code is not valid or has expired.' });
    return { ok: true as const };
  });

  app.post(API.auth.passwordReset, { config: { audit: 'auth.password.reset', ...loginRateLimit } }, async (req) => {
    const body = parseOrThrow(resetPasswordSchema, req.body);
    req.auditUser = body.email;
    recoveryLimiter.hit(`verify:${body.email}`);
    const vms = vmsFor(req);
    // VMS `passwordRecovery/update` does not check the recovery code itself — verify it here first.
    if (!(await users.verifyRecoveryCode(vms, body.email, body.code))) {
      throw validationError({ code: 'That code is not valid or has expired.' });
    }
    const r = await users.updatePassword(vms, body);
    if (!r.ok) throw validationError({ password: r.error ?? 'Password could not be updated.' });
    return { ok: true as const };
  });
}
