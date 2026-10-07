import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config';

/**
 * Serves the built SPA under `{BASE_PATH}/` with an index.html fallback for client-side routes.
 * Returns false when WEB_DIST is not configured (local dev uses the Vite dev server instead).
 */
export async function registerSpa(app: FastifyInstance, config: Config): Promise<boolean> {
  if (!config.webDist) return false;
  const root = resolve(config.webDist);
  if (!existsSync(resolve(root, 'index.html'))) {
    app.log.warn({ root }, 'WEB_DIST has no index.html; SPA will not be served');
    return false;
  }
  await app.register(fastifyStatic, {
    root,
    prefix: `${config.basePath}/`,
    index: 'index.html', // `${basePath}/` itself must serve the SPA shell (was a 403)
    wildcard: true,
    cacheControl: false, // we set Cache-Control ourselves below

    setHeaders(res, path) {
      // Vite emits content-hashed files under /assets — cache forever; everything else revalidates.
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.get('/', (_req, reply) => reply.redirect(`${config.basePath}/`));
  app.get(config.basePath, (_req, reply) => reply.redirect(`${config.basePath}/`));
  app.log.info({ root }, 'Serving SPA');
  return true;
}
