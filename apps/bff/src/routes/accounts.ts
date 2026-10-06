import {
  API,
  ERROR_CODES,
  accountFormSchema,
  addLicenseSchema,
  createAccountRequestSchema,
  imageUploadSchema,
  listQuerySchema,
  setActiveSchema,
  updateAccountRequestSchema,
  validateAccountForPublish,
  type AccountFormData,
} from '@crm/contracts';
import type { FastifyInstance } from 'fastify';
import { idParam, type Deps } from '../deps';
import { AppError, parseOrThrow, validationError } from '../errors';
import type { Vms } from '../vms/client';
import * as licenses from '../vms/licenses';
import * as tenants from '../vms/tenants';

const IMAGE_BODY_LIMIT = 8 * 1024 * 1024;

/** Full (publish / registered) validation, using the VMS country list for ISO codes. */
async function validateForPublish(vms: Vms, data: AccountFormData) {
  const codeOf = await tenants.countryCodeLookup(vms);
  const errors = validateAccountForPublish(data, codeOf);
  if (Object.keys(errors).length) throw validationError(errors, 'Complete the required fields first.');
}

export async function accountRoutes(app: FastifyInstance, _deps: Deps) {
  app.get(API.accounts.list, async (req) => tenants.listAccounts(req.vms, listQuerySchema.parse(req.query ?? {})));

  app.get(API.accounts.new, async (req) => tenants.newAccount(req.vms));

  app.get('/accounts/:id', async (req) => tenants.getAccount(req.vms, idParam(req.params)));

  app.post(API.accounts.create, { config: { audit: 'account.create' } }, async (req, reply) => {
    const { mode, account } = parseOrThrow(createAccountRequestSchema, req.body, 'account');
    if (mode === 'publish') await validateForPublish(req.vms, account);
    const created =
      mode === 'publish' ? await tenants.createPublished(req.vms, account) : await tenants.createDraft(req.vms, account);
    req.auditTarget = created.id;
    return reply.code(201).send({ account: created });
  });

  /** Draft vs registered update — decided from the account's current state, not the client. */
  app.put('/accounts/:id', { config: { audit: 'account.update' } }, async (req) => {
    const id = idParam(req.params);
    const { account } = parseOrThrow(updateAccountRequestSchema, req.body, 'account');
    const current = await tenants.getTenant(req.vms, id);
    if (tenants.accountStatus(current) === 'draft') {
      await tenants.updateDraft(req.vms, id, account);
    } else {
      await validateForPublish(req.vms, account);
      await tenants.updateRegistered(req.vms, id, account);
    }
    return { account: tenants.mapAccount(await tenants.getTenant(req.vms, id)) };
  });

  app.post('/accounts/:id/publish', { config: { audit: 'account.publish' } }, async (req) => {
    const id = idParam(req.params);
    const body = (req.body ?? {}) as { account?: unknown };
    const current = await tenants.getTenant(req.vms, id);
    if (tenants.accountStatus(current) !== 'draft') {
      throw new AppError(409, ERROR_CODES.CONFLICT, 'This account has already been published.');
    }
    // The client sends the form it is publishing; fall back to the stored draft.
    const account =
      body.account !== undefined
        ? parseOrThrow(accountFormSchema, body.account)
        : parseOrThrow(accountFormSchema, toForm(tenants.mapAccount(current)));
    await validateForPublish(req.vms, account);
    try {
      return { account: await tenants.publishDraft(req.vms, id, account) };
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        throw new AppError(501, ERROR_CODES.NOT_SUPPORTED, 'Publishing an existing draft needs VMS change V3');
      }
      throw err;
    }
  });

  app.patch('/accounts/:id', { config: { audit: 'account.setActive' } }, async (req) => {
    const { active } = parseOrThrow(setActiveSchema, req.body);
    return { account: await tenants.setAccountActive(req.vms, idParam(req.params), active) };
  });

  app.put(
    '/accounts/:id/logo',
    { bodyLimit: IMAGE_BODY_LIMIT, config: { audit: 'account.uploadLogo' } },
    async (req) => {
      const { dataUrl } = parseOrThrow(imageUploadSchema, req.body);
      return { url: await tenants.uploadLogo(req.vms, idParam(req.params), dataUrl) };
    },
  );

  app.put(
    '/accounts/:id/signin-image',
    { bodyLimit: IMAGE_BODY_LIMIT, config: { audit: 'account.uploadSigninImage' } },
    async (req) => {
      const { dataUrl } = parseOrThrow(imageUploadSchema, req.body);
      return { url: await tenants.uploadSigninImage(req.vms, idParam(req.params), dataUrl) };
    },
  );

  // ---- licenses of an account ------------------------------------------------------

  app.get('/accounts/:id/licenses', async (req) =>
    licenses.listLicenses(req.vms, idParam(req.params), listQuerySchema.parse(req.query ?? {})),
  );

  app.get('/accounts/:id/licenses/available', async (req) => licenses.availableLicenses(req.vms, idParam(req.params)));

  app.post('/accounts/:id/licenses', { config: { audit: 'license.add' } }, async (req, reply) => {
    const id = idParam(req.params);
    const body = parseOrThrow(addLicenseSchema, req.body);
    const license = await licenses.addLicense(req.vms, id, body);
    req.auditTarget = license.id;
    return reply.code(201).send({ license });
  });
}

/** Account (contracts) → form values, for publishing a stored draft without a body. */
function toForm(a: ReturnType<typeof tenants.mapAccount>): AccountFormData {
  return {
    name: a.name,
    languageId: a.languageId,
    timeZoneName: a.timeZoneName,
    labelVerticalId: a.labelVerticalId,
    frameworkIds: a.frameworkIds,
    requireMfa: a.requireMfa,
    active: a.active,
    mainContactFirstName: a.mainContact.firstName,
    mainContactLastName: a.mainContact.lastName,
    mainContactEmail: a.mainContact.email,
    mainContactMobile: a.mainContact.mobile,
    mainContactPhone: a.mainContact.phone,
    countryId: a.countryId,
    address: a.address,
    city: a.city,
    stateId: a.stateId,
    provinceOrRegion: a.provinceOrRegion,
    postalCode: a.postalCode,
  };
}
