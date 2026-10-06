import { buildApp } from './app';
import { loadConfig } from './config';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { env: config.env, vms: config.vmsUrl, keycloak: config.keycloak.realmUrl, api: config.apiPrefix },
    'Force 5 CRM BFF ready',
  );
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
