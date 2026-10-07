import { buildMockVms } from './app';
import { DEMO_PASSWORD, MFA_PASSCODE, RECOVERY_CODE } from './seed';

const port = Number(process.env.PORT ?? 8090);
const host = process.env.HOST ?? '127.0.0.1';
const publicUrl = process.env.MOCK_PUBLIC_URL ?? `http://localhost:${port}`;
// MOCK_LATENCY_MS: "150-350" (default), "0" to disable, or a single number.
const latencyRaw = process.env.MOCK_LATENCY_MS ?? '150-350';
const [lo, hi] = latencyRaw.split('-').map(Number);
const latencyMs: [number, number] = [lo ?? 0, hi ?? lo ?? 0];

const { app } = await buildMockVms({
  latencyMs,
  publicUrl,
  supportPublishDraft: process.env.MOCK_SUPPORT_PUBLISH_DRAFT !== 'false',
  accessTtlSeconds: process.env.MOCK_ACCESS_TTL_SECONDS ? Number(process.env.MOCK_ACCESS_TTL_SECONDS) : undefined,
  logger: process.env.MOCK_LOG_REQUESTS === 'true',
  keycloakVmsUrl: process.env.MOCK_KEYCLOAK_VMS_URL || undefined,
});

await app.listen({ port, host });
console.log(`[mock-vms] Keycloak: ${publicUrl}/realms/gatekeeper`);
console.log(`[mock-vms] VMS:      ${publicUrl}/vms/internal/v1/`);
console.log(`[mock-vms] latency ${latencyMs[0]}-${latencyMs[1]} ms`);
if (process.env.MOCK_KEYCLOAK_VMS_URL) {
  console.log(`[mock-vms] Keycloak logins are checked against VMS at ${process.env.MOCK_KEYCLOAK_VMS_URL}`);
} else console.log(
  `[mock-vms] demo users (password "${DEMO_PASSWORD}"): admin@force5.com, multi@force5.com, mfa@force5.com (code ${MFA_PASSCODE}), sales@customer.com; recovery code ${RECOVERY_CODE}`,
);
