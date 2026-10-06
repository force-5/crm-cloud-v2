import { API } from '@crm/contracts';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps';
import * as tenants from '../vms/tenants';

/** Dashboard KPIs and shared lookups. */
export async function lookupRoutes(app: FastifyInstance, _deps: Deps) {
  app.get(API.dashboard, async (req) => tenants.dashboardSummary(req.vms));
  app.get('/lookups/tenant', async (req) => tenants.accountLookups(req.vms));
  app.get('/lookups/label-verticals', async (req) => tenants.labelVerticals(req.vms));
}
