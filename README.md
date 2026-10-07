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

### Against your local VMS
1. Start vmsServer: `./gradlew bootRun` in `C:devForce5msServer` (profile `local`, port 8080, MySQL on 3306).
2. Run `pnpm dev:local-vms`, or the **CRM: dev against local VMS** run configuration in IntelliJ.
   - Data comes from real VMS.
   - Sign-in uses the mock Keycloak, which checks passwords against VMS. There is no local Keycloak, and the `local` VMS profile doesn't verify token signatures.
3. Sign in as a tenant-1 user holding `CRM_ADMIN` or `ROLE_ADMIN` (the `CRM_ALLOWED_ROLES` setting).

Configuration is in `apps/bff/local-vms.env` and `apps/mock-vms/local-vms.env`. Every real-VMS defect found so far is in [`docs/VMS_CHANGE_REQUESTS.md`](docs/VMS_CHANGE_REQUESTS.md).

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

## CI and deployment
This follows admin-cloud-v2: GitHub Actions for tests and scans, and AWS CodeBuild as the deploy gate.

**GitHub Actions**
- `.github/workflows/tests.yml` (blocking) runs:
  - lint, typecheck and unit tests;
  - Playwright smoke tests against the production build (desktop and phone);
  - an Expo bundle export plus `expo-doctor`.
- `.github/workflows/security.yml`:
  - gitleaks: blocking, SHA-pinned binary;
  - Trivy (pinned commit), Semgrep and `pnpm audit`: report-only, artifacts kept 400 days.
- `.github/dependabot.yml`: npm and GitHub Actions updates. Expo/React Native and React are excluded; upgrade those together with `npx expo install --fix`.

**CodeBuild** (`buildspec.yml`)
- Runs the same gate as CI, then builds an Elastic Beanstalk source bundle for the **Node.js 22 on AL2023** platform: BFF + production `node_modules` + SPA + `Procfile`.
- Then `scripts/smoke-boot.sh` boots that exact bundle with a production config and checks health, the SPA shell, deep links and API auth. This step is blocking.
- To run the smoke gate locally: build the bundle as in `buildspec.yml`, then `bash scripts/smoke-boot.sh eb-bundle`.

**Runtime**
- EB sets `PORT` (8080), and nginx proxies to it. The health-check path is `/crm/api/health`.
- Required outside `APP_ENV=local` (startup fails fast without them): `SESSION_SECRET` (32+ characters), `VMS_URL`, `KEYCLOAK_URL`.
- Also set `APP_ENV`, `REDIS_URL` (when running more than one instance), and `CRM_ALLOWED_ROLES` if it differs from the default.
- Secrets belong in AWS Secrets Manager, not EB environment properties. Loading them is the next step: deploy prep.

`Dockerfile` builds the same app as a container image (listens on 8082), for local use or a future move to ECS.

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
  - **V14:** product create/edit. VMS returns no product categories, and a category is required.
  - **V15:** saving the theme to VMS. It's kept per session and per browser until then.
- **Verified against local real VMS (2026-10-06):** every read, sort and write path.
  - Works: publish new; edit registered or draft accounts; images; activate/deactivate; licenses (add/seats/deactivate); profile; product activate/deactivate.
  - Doesn't: draft create (V2) and product create/edit (V14).
  - Full findings, including Critical security issues, are in `docs/VMS_CHANGE_REQUESTS.md`.
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
  - Apply the AWS infrastructure. The templates and runbook are ready (`infra/`, `docs/DEPLOYMENT.md`); someone with AWS access has to validate and deploy them.
  - First CI run on GitHub. The workflows are validated locally, not yet run.
  - Final mobile app icons (the current ones are placeholders).
