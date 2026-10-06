import { API, listQuerySchema, productFormSchema, setActiveSchema } from '@crm/contracts';
import type { FastifyInstance } from 'fastify';
import { idParam, type Deps } from '../deps';
import { parseOrThrow } from '../errors';
import * as products from '../vms/products';

export async function productRoutes(app: FastifyInstance, _deps: Deps) {
  app.get(API.products.list, async (req) => products.listProducts(req.vms, listQuerySchema.parse(req.query ?? {})));
  app.get(API.products.new, async (req) => products.newProduct(req.vms));
  app.get('/products/:id', async (req) => products.getProduct(req.vms, idParam(req.params)));

  app.post(API.products.list, { config: { audit: 'product.create' } }, async (req, reply) => {
    const product = await products.createProduct(req.vms, parseOrThrow(productFormSchema, req.body));
    req.auditTarget = product.id;
    return reply.code(201).send({ product });
  });

  app.put('/products/:id', { config: { audit: 'product.update' } }, async (req) => ({
    product: await products.updateProduct(req.vms, idParam(req.params), parseOrThrow(productFormSchema, req.body)),
  }));

  app.patch('/products/:id', { config: { audit: 'product.setActive' } }, async (req) => ({
    product: await products.setProductActive(req.vms, idParam(req.params), parseOrThrow(setActiveSchema, req.body).active),
  }));

  app.delete('/products/:id', { config: { audit: 'product.delete' } }, async (req) => {
    await products.deleteProduct(req.vms, idParam(req.params));
    return { deleted: true as const };
  });
}
