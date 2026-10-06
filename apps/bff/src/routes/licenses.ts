import { updateLicenseSchema } from '@crm/contracts';
import type { FastifyInstance } from 'fastify';
import { idParam, type Deps } from '../deps';
import { parseOrThrow } from '../errors';
import * as licenses from '../vms/licenses';

/** `PATCH /api/licenses/:id` — seats and/or active (list/add live under /accounts/:id/licenses). */
export async function licenseRoutes(app: FastifyInstance, _deps: Deps) {
  app.patch('/licenses/:id', { config: { audit: 'license.update' } }, async (req) => {
    const body = parseOrThrow(updateLicenseSchema, req.body);
    return { license: await licenses.updateLicense(req.vms, idParam(req.params), body) };
  });
}
