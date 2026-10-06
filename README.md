# Force 5 CRM (v2)

The rebuild of the Grails `crm-cloud` app, built from [`CRM_REBUILD_PLAN.md`](CRM_REBUILD_PLAN.md). Its look follows [`force5-crm-prototype.html`](force5-crm-prototype.html).

It is an internal Force 5 tool for provisioning customer tenants ("Accounts") and managing their licenses, the product catalog and your own profile. All data lives in **VMS**. Sign-in uses **Keycloak** (realm `gatekeeper`, client `gk-admin`), with the same login model as today.

```
apps/
  web/        React 19 SPA (Vite, TanStack Router/Query/Table, Tailwind v4, Radix). Responsive from phone to desktop.
  mobile/     Expo SDK 57 / React Native app for the sales team (expo-router).
  bff/        Fastify BFF: Keycloak + VMS login, Redis/in-memory session, CSRF, VMS adapters. Serves the SPA at /crm.
  mock-vms/   Local stand-in for VMS /internal/v1 and Keycloak, speaking the real wire formats.
packages/
  contracts/  Shared Zod schemas, types, validation rules and the BFF route table.
  api-client/ Typed fetch client and TanStack Query keys, used by both web and mobile.
  tokens/     Design tokens (Force 5 orange/charcoal, light and dark).
e2e/          Playwright smoke tests against the production build (desktop and phone).
```

The browser and the phone never see a Keycloak token. Both hold an httpOnly session cookie, and the BFF calls VMS on their behalf (plan §3).

## Prerequisites
- Node 22+
- pnpm 9. Use `corepack enable`, which needs an admin shell on Windows; otherwise prefix the commands below with `corepack`.

## Run locally (no VMS or Keycloak needed)

```bash
pnpm install
pnpm dev          # mock-vms :8090, BFF :8082, web :5173
```

Open **http://localhost:5173/crm/**.

Demo users come from the mock VMS seed. Every password is `Force5!demo`.

| Email | What it shows |
|---|---|
| `admin@force5.com` | Normal CRM admin |
| `multi@force5.com` | Tenant picker; picking the non-Force 5 tenant is refused |
| `mfa@force5.com` | SMS MFA, code `123456` |
| `sales@customer.com` | A non-CRM user, rejected with 403 (decision D1) |

The password-recovery code is `654321`.

**Against a real VMS:** copy `apps/bff/.env.example` to `apps/bff/.env`, then set `VMS_URL` and `KEYCLOAK_URL`.

### Mobile
```bash
pnpm dev:mobile   # expo start; scan the QR code with Expo Go (SDK 57)
```
- **Physical phone:** set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8082/crm/api` in `apps/mobile/.env.local`. The BFF already listens on `0.0.0.0`.
- **Android emulator:** uses `10.0.2.2` automatically.
- No development build is needed.
- Release builds need HTTPS.

## Checks
```bash
pnpm typecheck
pnpm test         # contracts, api-client, bff, web (unit/integration)
pnpm lint

pnpm --filter @crm/web build && pnpm --filter @crm/bff build
pnpm --filter @crm/e2e install-browsers   # once
pnpm test:e2e
```

## Production
`Dockerfile` builds one image: the BFF serves `/crm/api` and the built SPA under `/crm`. It listens on 8082, and `/crm/api/health` is used for the load balancer.

Required environment in non-local deployments:
- `SESSION_SECRET` (at least 32 characters)
- `REDIS_URL`
- `VMS_URL`
- `KEYCLOAK_URL`
- `APP_ENV`

See `apps/bff/.env.example` for the full list.

## Status against the plan
- **Built:** every phase-1 to phase-5 screen and flow, on web; the core sales flows on mobile (accounts, account detail, licenses, products, profile); the BFF with all §7 routes; and the mock VMS.
- **Waiting on VMS** (the UI handles each gracefully today):
  - **V2:** draft create.
  - **V3:** publish an existing draft. The BFF returns `501 NOT_SUPPORTED`, and the web app saves the edits as a draft and explains why. The mock implements it so the flow can be demoed.
  - **V4:** TOTP verification step.
  - **V5:** change password. The UI links to Forgot Password instead.
  - **V8:** draft KPI. The card is hidden until VMS supports it.
  - **V10:** remove a logo or sign-in image.
- **New VMS finding:** `passwordRecovery/update` does not check the recovery code. The BFF re-verifies the code first, but VMS should fix this.
- **Omitted by decision:** the prototype's Subscription Status column and Assigned Products table, because VMS has no subscription data. Assigned products are covered by the Licenses tab.
- **Deliberate visual change:**
  - Filled primary buttons use a darker orange (`#c2500e`) so white text meets WCAG AA.
  - Brand orange `#f36b21` is still used for the logo mark, the active nav bar, toggles, tabs and focus rings.
  - To change this, edit `--primary-solid` in `apps/web/src/styles.css`.
- **Not yet done:**
  - Sentry SDK wiring (only the hooks are in place).
  - Redis session store tested against a real Redis.
  - Docker image build (it was not run here).
  - axe accessibility pass.
  - CI pipeline.
  - Final mobile app icons (the current ones are placeholders).
