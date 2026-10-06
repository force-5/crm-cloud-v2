# Force 5 CRM — Rebuild Plan (Grails → React)

**Prepared:** 2026-10-06
**Source reviewed:** `crm-cloud` (Grails 6.2.3, every controller, service, DTO, view, JS asset and taglib) and every VMS endpoint the CRM calls, checked against `vmsServer` source.
**Purpose:** a self-contained spec for building the new CRM as a new project. It keeps every working workflow and every VMS function, drops the dead code, and fixes the known defects.

---

## 1. Executive summary

### What the CRM is
- An **internal Force 5 sales/ops tool** for provisioning customer tenants ("Accounts"). It is not a customer-facing CRM.
- It has no database of its own. All data comes from **VMS** (`/internal/v1/*`) using the logged-in user's **Keycloak** token, sent with `X-App-Id: CRM_001`.

### What it actually does today (working features)
1. **Sign in.** Uses the Keycloak password grant (realm `gatekeeper`, client `gk-admin`), then VMS `authenticate`. It includes a tenant picker for users who belong to several tenants.
2. **Accounts (tenants).** You can list, search, filter by active status, and activate or deactivate. You can create a tenant as a **Draft** or **Publish** it.
   - Publishing provisions the whole tenant in VMS: an admin user, a facility, kiosks per framework, licenses, flows, a label vertical, and a welcome email.
   - A registered account can be edited. You can upload a logo and a sign-in background image.
3. **Licenses per account.** You can list product licenses, showing purchased, used and available counts. You can add a product license, edit the purchased count, and activate or deactivate a license.
4. **Products** (the global saleable product catalog). You can list, create, edit, activate/deactivate and delete.
5. **My Profile.** You can edit your name, phone, address, language and timezone, and upload or remove your photo.

### What is broken, missing, or fake today (do not port these; fix or drop them)
- **MFA crashes, and it can be bypassed.**
  - Logging in with MFA ends in a 500 error, because `mfa.gsp` does not exist.
  - The user is put into the session *before* MFA, so going straight to `/dashboard` skips the second factor.
- **MFA verification uses the wrong field name:** it sends `code`, but VMS reads `passcode`.
- **The registration-code feature is not in use** (§6.3.1). Its UI was removed from the account page ("Removed unused OTP area", commit `1f4b426`), and the registration URL points at an admin-app page that does not exist. **It is dropped from the rebuild.**
- **Several flows are missing or never wired up:**
  - forgot password
  - change password
  - theme switcher
  - idle-timeout dialog (its script and stylesheet tags are swapped)
  - error pages (they redirect in a loop)
  - role/permission gating (the tags exist but are never used)
- **Fake or orphaned screens:**
  - The dashboard KPI cards are hardcoded placeholders.
  - `account/settings` is mostly leftover Metronic demo markup, and its buttons submit the form.
  - `account/index`, `accountCreated`, `license/detail` and the API Key screens are orphaned or broken.
- **Account data problems:**
  - The Active switch on the account form is never saved.
  - `requireMfa` always renders as checked.
  - Saving a new account as a draft silently drops the chosen images.
  - The draft save requires every field to be filled.
  - Uploaded images are stretched instead of cropped.
- **Security problems:**
  - **Stored XSS:** the account and license tables insert names as raw HTML.
  - Test credentials are hardcoded in `chooseAccount.gsp`.
  - State changes are made with GET requests (`setActive`, `updateCount`, `delete`).
- **VMS-side gaps (§10):**
  - Publishing an existing draft (`POST tenant/setup/publish/{id}`) **does not exist** in VMS.
  - `tenant/draft` probably fails at runtime with a type-cast error.
  - **CRM endpoints have no authorization in VMS.** Any authenticated user of any tenant can call them.
  - `account/setup/**` is completely unauthenticated.

### Recommendation
- Build a **React + TypeScript SPA** with a **thin TypeScript BFF** (Backend-for-Frontend) in one monorepo.
- The BFF does the **same login the Grails server does today** (§4). It holds the tokens server-side, exactly as the Grails HTTP session does now, and translates calls to VMS.
- Do not let the browser call VMS directly, even though CORS would allow it. VMS's lack of authorization on tenant-admin endpoints makes that unsafe.

---

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (strict) | One language for the SPA and the BFF, with shared types. |
| SPA build | **Vite** | Fast; produces static assets. |
| UI framework | **React 19** | |
| Routing | **TanStack Router** (file-based, typed search params) | Typed URL state for list filters, paging and sort, so it survives refresh and can be shared as a link. React Router v7 is an acceptable alternative. |
| Server state | **TanStack Query** | Caching, optimistic updates, retries, invalidation. Replaces "reload the whole table". |
| Tables | **TanStack Table** + a shared `<DataTable>` | Server-side paging, sort, search and filters. |
| Forms | **React Hook Form + Zod** | One validation system instead of today's three (jQuery Validate, HTML5, FormValidation.io). |
| Components | **shadcn/ui** (Radix primitives + **Tailwind CSS v4**) | Accessible, themeable, owned in-repo. Light/dark/system theming comes built in. |
| Icons / toasts | **lucide-react** / **sonner** | One toast system replaces flash banners and SweetAlert. |
| Image crop | **react-easy-crop** | Real cropping at a fixed aspect ratio; no more stretching. |
| QR codes | **qrcode** (client-side) | Renders the TOTP `otpauth://` URI. Today the server uses ZXing. |
| i18n | **i18next + react-i18next** | Ship English first, with no hardcoded strings. |
| Dates | **date-fns + date-fns-tz** | Formats in the user's timezone. Replaces ConversionTagLib. |
| BFF | **Node 22 + Fastify** (TypeScript) | Small and fast, with first-class schema validation. It also serves the SPA's static files. |
| BFF session | `@fastify/session` + **Redis** (ElastiCache), with the in-memory store for local dev | Keeps tokens out of the browser. Sessions survive restarts and scale out. |
| VMS client | `undici`/`fetch`, plus hand-written Zod schemas per endpoint | The VMS OpenAPI spec has untyped `Map` responses for most CRM endpoints, so a code-generated client adds little. Validate at the BFF boundary instead. |
| Errors / monitoring | **Sentry** (`@sentry/react`, `@sentry/node`) | Already used today. |
| Tests | **Vitest** + React Testing Library + **MSW** (mock VMS); **Playwright** for end-to-end | |
| Lint / format | ESLint (typescript-eslint) + Prettier | |
| Monorepo | **pnpm workspaces** (Turborepo optional) | |
| Packaging | One **Docker image**: the BFF serving `/crm/*` and the built SPA | Replaces the WAR on Tomcat. |

**Alternative considered: a Spring Boot BFF.** If the team strongly prefers the JVM, the BFF can be Spring Boot 3 with Spring Session and a WebClient. The SPA plan is unchanged; you lose shared TypeScript types. **Next.js** was rejected: an authenticated internal admin tool gets nothing from server-side rendering, and a plain SPA plus BFF is simpler to reason about and deploy.

---

## 3. Architecture

```
Browser (React SPA)
   │  same-origin fetch /crm/api/*   (httpOnly, Secure, SameSite=Strict session cookie + CSRF header)
   ▼
BFF (Fastify, /crm)
   ├─ serves SPA static assets (/crm/*  → index.html fallback)
   ├─ session store (Redis): accessToken, refreshToken, expiry, user, tenantId, pending-login state
   ├─ auth: Keycloak password grant (realm gatekeeper, client gk-admin, tenant_id) + VMS authenticate
   ├─ authorization guard: only Force 5 CRM users (see §10 decision D1)
   ├─ token refresh on demand (no client polling)
   ├─ VMS adapter: one module per domain, Zod-validated responses, error normalization
   └─ audit log (structured JSON → CloudWatch) for every mutating call
   │  Authorization: Bearer <token>, X-App-Id: CRM_001, User-Agent passthrough
   ▼
VMS  /internal/v1/*            Keycloak  /realms/gatekeeper/*
```

### Key rules
- **The browser never sees a Keycloak token.** The BFF attaches the token to VMS calls.
- **Every BFF endpoint is a proper REST verb.** No more GET requests that mutate data.
- **The BFF normalizes VMS quirks**, so the SPA receives clean, typed shapes:
  - page numbers are 1-based for the UI and 0-based for VMS;
  - the `{tenant, supportingLists}` wrappers are unwrapped;
  - `licenseCount` becomes `purchasedCount`;
  - an empty-200 auth failure becomes a 401.
- **Errors use one envelope:** `{ error: { code, message, fieldErrors? } }`, with HTTP status codes passed through. The SPA shows them as toasts or inline field errors.

### Repository layout
```
crm/
├─ apps/
│  ├─ web/                 # React SPA
│  │  └─ src/
│  │     ├─ routes/        # TanStack Router file routes (see §5)
│  │     ├─ features/      # accounts/, licenses/, products/, profile/, auth/, dashboard/
│  │     │   └─ <feature>/ api.ts (query hooks) · schemas.ts · components/
│  │     ├─ components/ui/ # shadcn components
│  │     ├─ components/    # DataTable, PageHeader, ConfirmDialog, ImageCropUpload, AddressFields, StatusBadge...
│  │     ├─ lib/           # apiClient, i18n, date formatting, permissions
│  │     └─ locales/en/*.json
│  └─ bff/
│     └─ src/
│        ├─ routes/        # /api/auth, /api/accounts, /api/licenses, /api/products, /api/profile, /api/lookups
│        ├─ vms/           # vmsClient.ts + one adapter per domain (tenants.ts, licenses.ts, ...)
│        ├─ auth/          # keycloak.ts, session.ts, guard.ts, refresh.ts
│        └─ config.ts      # env-validated config (Zod)
├─ packages/
│  └─ contracts/           # shared Zod schemas + TS types (Account, License, Product, User, Page<T>, errors)
├─ e2e/                    # Playwright
├─ Dockerfile
└─ docs/
```

---

## 4. Authentication and session (rebuild spec)

> **Decision: keep the current login model.** The CRM is internal, so the rebuild uses the same credentials, the same Keycloak realm and client, and the same VMS calls as today. The only thing that changes is that the BFF runs these steps instead of the Grails `SecurityController`. Users will not notice a difference, apart from the fixes noted below.

### 4.1 How login works today (Grails)
Source: `SecurityController.groovy`, `AuthenticationService.groovy`, `SessionInterceptor.groovy`.

1. **Sign-in page** (`/crm/security/signin`). A Force 5-branded page with an email and password form.
   - It accepts an optional access code (`/signin/{code}`), but the page ignores the tenant branding it fetches. The code is only used to choose where to redirect after sign-out.
2. **POST `/security/authenticate`.** The server checks that Keycloak is up with `GET {keycloakUrl}gatekeeper`. If it is down, the page shows "Service unavailable".
3. **Keycloak password grant**, done server-side. Nothing in the browser talks to Keycloak.
   - The call is `POST {keycloakUrl}gatekeeper/protocol/openid-connect/token`, form-encoded, with `client_id=gk-admin`, `grant_type=password`, `username`, `password` and `tenant_id=1`.
   - The access token, refresh token and expiry are stored in the **server HTTP session**.
   - The server fetches the realm public key (`GET {keycloakUrl}gatekeeper` → `public_key`), verifies the JWT, and reads the **`tenants` claim**.
4. **Several tenants:** if the user belongs to more than one tenant, the "Multiple Accounts" page lists them. The user picks one and **re-enters their password**, and the Keycloak grant is repeated with that `tenant_id`.
5. **VMS sign-in:** `POST authenticate {email, password, tenantId}` → `{user}`. The `AuthUser` (roles, permissions, tenant, locale, timezone, theme) is stored in the session.
6. **MFA:** if `tenant.requireMfa || user.mfaEnabled`, the server redirects to an MFA page. **That page does not exist (500 error)**, so in practice CRM users do not have MFA turned on.
7. **Session setup:** locale, timezone and theme go into the session, the inactivity timeout is set to 60 minutes, and the user is redirected to the dashboard.
8. **Keeping the session:**
   - `SessionInterceptor` redirects any request without `session.user` to the sign-in page.
   - The page polls `/security/checkRefreshToken` every 2 minutes, and the server refreshes the Keycloak token when fewer than 5 minutes remain.
   - Every VMS call sends `Authorization: Bearer <token>` and `X-App-Id: CRM_001`.
9. **Sign-out:** invalidates the session and redirects to the sign-in page. Keycloak is not called.

**Who can log in today:** anyone whose credentials pass Keycloak and VMS `authenticate`. Neither the CRM nor VMS checks for Force 5 staff or a CRM role. See decision D1.

### 4.2 Sign-in flow in the rebuild (same steps, moved into the BFF)

| Step | Today | Rebuild |
|---|---|---|
| Page | `/crm/security/signin` | `/crm/login`. Same Force 5 branding (`https://cdn.force5-dev.com/f5/assets/f5-login-bg.png`, `f5-logo-dark.png`). The tenant access-code variant is dropped; it is not needed for an internal app. |
| Fields | email (max 50), password, ignored "remember me" | email (required, max 50), password (show/hide). Drop "remember me". **No prefilled credentials**; today `chooseAccount.gsp` hardcodes test credentials. |
| Keycloak liveness | `GET {kc}gatekeeper` | same |
| Token | password grant, `gk-admin`, `tenant_id=1`, tokens in the server session | **same call**, tokens in the BFF server session (Redis) |
| Tenant list | public key + `tenants` claim | same |
| Multiple tenants | chooser page; password re-entered | Same chooser. The password is held encrypted in the server session for up to 2 minutes, so the user is not asked again. It never goes back to the browser. |
| VMS sign-in | `POST authenticate` | Same. Treat a 200 with an empty body as invalid credentials. |
| MFA | redirects to a missing page (500) | Same rule (`requireMfa \|\| mfaEnabled`), but with a working page: `POST auth/sendMfaCode {token}`, then `POST auth/verifyMfaCode {to, passcode}`. **The field is `passcode`**; today the CRM sends `code`. No API access is allowed until MFA passes. |
| After login | always goes to the dashboard | Goes back to the originally requested URL (`?redirect=`, same-origin only), otherwise the dashboard. |

### 4.3 Session lifetime
- **Token refresh:**
  - The BFF refreshes **lazily**: before proxying any call, if the token has 5 minutes or less left, it posts `grant_type=refresh_token` with `client_id=gk-admin` and `tenant_id`.
  - This replaces the 2-minute `checkRefreshToken` polling, which kept sessions alive forever.
- **Idle timeout:**
  - The default is 60 minutes, as today.
  - The SPA tracks real activity (mouse, keyboard, visibility).
  - At 55 minutes it shows a **"You'll be signed out in 5:00 — Stay signed in / Sign out"** dialog. "Stay signed in" calls `POST /api/auth/keepalive`.
  - On expiry it calls `POST /api/auth/logout` and goes to `/login?reason=timeout`.
- **Any 401 from the BFF** clears the query cache and redirects to login with `?redirect=`.
- **Sign out** (`POST /api/auth/logout`):
  - destroys the session;
  - revokes the refresh token at Keycloak (`/protocol/openid-connect/logout`), which is a TODO today;
  - redirects to `/login`.

### 4.4 Forgot password (new; wired to existing VMS endpoints)
The flow is `/forgot-password`, in three steps:
1. Email → `POST passwordRecovery/forgot {email}`.
2. Recovery code → `POST passwordRecovery/verify {email, passwordRecoveryCode}`.
3. New password plus confirmation → `POST passwordRecovery/update {email, password, passwordConfirmation}`.
   - Show the password-policy rules. VMS has `/password-policy`; confirm with VMS whether it applies here.

Then return to login with a success toast. **Always show the same message after step 1**, so the page does not reveal which emails exist.

### 4.5 Health endpoint
- `GET /crm/api/health` is unauthenticated and is used by the load balancer.
- It returns `{status, vms: up|down, keycloak: up|down}`. VMS is checked with `GET ping`.
- This replaces `security/healthCheck`. Dropping the movie-quote responses is optional.

---

## 5. Screens and routes

Every route except `/login*` and `/forgot-password` requires an authenticated session. List state (page, size, sort, search, filters) **lives in the URL**.

| Route | Screen | Replaces |
|---|---|---|
| `/login` | Force 5 sign-in | `security/signin` |
| `/login/select-account` | Tenant picker | `security/chooseAccount` |
| `/login/mfa` | MFA code entry | missing `mfa.gsp` |
| `/forgot-password` | 3-step recovery | stub page |
| `/` | Dashboard (real KPIs + recent accounts) | `dashboard/index` |
| `/accounts` | Account list | dashboard table + orphaned `account/index` |
| `/accounts/new` | New account form | `account/newAccount` |
| `/accounts/:id` | Account detail, with tabs **Details · Licenses** | `account/detail/{id}` + `license/index?tenantId=` |
| `/products` | Product list | `product/index` |
| `/products/new`, `/products/:id` | Product form | `product/create`, `product/detail/{id}` |
| `/profile` | My Profile, with tabs **Profile · Security · Appearance** | `profile/index` |
| `/organization` *(optional, decision D4)* | Own tenant info (the real fields only) | `account/settings` |
| `*` | 404 page; there is also a generic error boundary page | broken `error/*` |

### 5.1 App shell
- **Header:**
  - Force 5 logo and "CRM" wordmark, with variants for light and dark mode.
  - An **environment badge** that shows only in non-production environments.
  - Global search (optional later) and the user menu: avatar, name, email, My Profile, Theme (Light/Dark/System), Sign out.
- **Sidebar or top nav:** Dashboard, Accounts, Products. Show the active state and gate items by permission (§9).
- **Breadcrumbs:** generated from route metadata.
- **Page header component:** title, breadcrumb, primary actions on the right, and a status badge where relevant.
- **Footer:** "© {year} Force 5, Inc." Remove the Keenthemes placeholder links.
- **Feedback:** sonner toasts for success, error and info. Use a `ConfirmDialog` for destructive or impactful actions. Forms show inline field errors. Lists show skeleton loaders while loading.
- **Responsive:** usable at 1280 px and wider, and degrading well to tablet width. Tables scroll horizontally inside their card.

---

## 6. Feature specs (parity + fixes)

### 6.1 Dashboard
- **KPI cards (real data):**
  - Total accounts, Active, Inactive and Draft. Draft means `registeredDate == null`.
  - Get the counts with paged VMS calls using `size=1` and reading `totalElements` (`GET tenants?active=true`, and so on).
  - VMS cannot currently filter on draft status; see §10, V8. Until it can, drop the Draft card or ask VMS for a summary endpoint.
- **"Recently created accounts":** the top 5 by `dateCreated desc`, each linking to the account.
- **Drop:** the fake "Licensed Products / Locations / Users" panels, unless VMS adds a summary endpoint. Each is a candidate for a later phase.

### 6.2 Account list (`/accounts`)
- **Controls:**
  - Search box (debounced 300 ms; sends VMS `search`).
  - Status segmented filter: **Active** (default) · Inactive · All. This sends VMS `active=true|false` or omits it.
  - A **New Account** button.
  - Page size 10, 20 or 50 (default 20).
- **Columns:**

| Column | Content | Sort field |
|---|---|---|
| Name | Link to the account | `name` (default asc) |
| Main contact | First and last name, with the email underneath | `mainContactLastName` (then `mainContactFirstName`) |
| Phone | `o:` office (red "Missing" if empty) and `m:` mobile | — |
| City | `city` (**fix:** today this shows only when `language` is set) | `city` |
| State | `state.description` | — |
| Country | `country.description` | — |
| Language | `language.description` | — |
| Created | `dateCreated`, in the user's timezone | `dateCreated` |
| Status | Badge: **Draft** if `registeredDate` is null, otherwise **Active** or **Inactive** | `active` |
| Actions | Row "⋯" menu: Edit, plus Deactivate or Activate | — |

- **Activate/Deactivate:**
  - The confirm dialog says "Deactivate account **{name}**?", not "user" as today.
  - The BFF calls `PATCH tenant/{id} {active}`. The table updates optimistically and shows a toast. On error it rolls back.
- **Remove the dead row-selection checkboxes**, unless bulk actions are added later.
- **Render all text through React.** This fixes the XSS issue.

### 6.3 Account detail / new account (`/accounts/new`, `/accounts/:id`)

#### Account states

| State | Condition | Primary actions |
|---|---|---|
| **New** | no id | **Save as draft** · **Publish** |
| **Draft** | id set, `registeredDate == null` | **Save draft** · **Publish** |
| **Registered** | `registeredDate != null` | **Save changes** |

Show the status badge next to the title. When the account is registered, also show "Registered {date} by {registeredBy}".

#### Publishing
Publishing is **heavy and irreversible**. VMS will:
- create an admin user for the main contact email and email that user their credentials;
- create a facility, plus areas, kiosks and OTPs for each selected framework;
- create 25-seat KIOSK and ADMIN licenses;
- assign flows and apply the label vertical;
- email an audit report.

So Publish opens a **confirmation dialog** that summarizes what will be created and who gets emailed: "The welcome email with login credentials will be sent to {mainContactEmail}". It also runs **full validation**.

#### Validation
- **Save as draft:** only Company Name is required. Other fields are validated for format only if they are filled in. Today, draft saves require every field.
- **Publish and Save changes:** full validation, per the table below.

#### Form layout
Two-column cards on desktop, one column on narrow screens. The sticky page header holds the actions. Warn about unsaved changes when the user navigates away.

**Company**

| Field | Key | Control | Rules |
|---|---|---|---|
| Company name | `name` | text | required, max 100 |
| Language | `languageId` | select ← `supportingLists.supportedLanguages` (id/description) | publish: required |
| Time zone | `timeZoneName` | searchable combobox ← `supportingLists.supportedTimeZones` (`zoneId`/`description`) | publish: required |
| Label preset | `labelVerticalId` | select ← VMS `labelVerticals` → `verticals[]` (id/name/description). Option "None". | Optional. Hidden if the list is empty. **Editable only before publish**, because it is applied at publish (confirm — D5). |
| Frameworks | `frameworkIds` | multi-select (chips) ← `supportingLists.framework` (`value`/`text`) | optional. Drives which kiosks and areas are created at publish. |
| Require 2-factor auth | `requireMfa` | switch | **Reflect the saved value** (today it is always checked). |
| Active | `active` | switch | **Actually save it**, or remove it and rely on the list toggle. It is never bound today. Recommend keeping it, sent on update. |

**Administrator (main contact)**

| Field | Key | Rules |
|---|---|---|
| First name | `mainContactFirstName` | publish: required, max 50 |
| Last name | `mainContactLastName` | publish: required, max 50 |
| Email | `mainContactEmail` | publish: required; valid email (type=email). **This becomes the admin login.** |
| Mobile | `mainContactMobile` | publish: required; phone format (E.164 helper) |
| Office phone | `mainContactPhone` | optional; phone format |

**Address**

| Field | Key | Rules |
|---|---|---|
| Country | `countryId` | ← `supportingLists.country`. Publish: required. Today it is optional while state is required, which is inconsistent. |
| Address | `address` | publish: required |
| City | `city` | publish: required |
| State | `stateId` | ← `supportingLists.states`. Shown and required only when the country uses states (for example US). Province or region goes in `provinceOrRegion` for other countries. Ask VMS whether states carry a country id, so the list can be filtered (V7). |
| Postal code | `postalCode` | publish: required; format depends on the country (US ZIP 5 or ZIP+4) |

Note: the current `ajaxGetCountryById` was meant to supply the `display*/required*` flags, but it is broken in the CRM and the VMS route does not exist. Use a small client-side country-rules table to start.

**Branding**

| Asset | Key | Behaviour |
|---|---|---|
| Company logo | `logoUrl` | `ImageCropUpload` with a fixed aspect ratio. ⚠ VMS resizes logos to **200×60**, while the CRM says 400×400; confirm the target with VMS (V10). Use the VMS aspect ratio so nothing is distorted. |
| Sign-in background | `signinBackgroundImageUrl` | `ImageCropUpload` at **16:9**, output 1920×1080, with a **wide preview** (not a 160 px circle). |

Image rules:
- Accept PNG, JPEG and WebP, up to 5 MB. Show a crop dialog with zoom, **Cancel** and **Apply**. Offer a **Remove** option, which needs a VMS endpoint, or upload a blank image (V10).
- **Upload timing (one model):**
  - Existing account: upload immediately on Apply (`PUT tenant/uploadLogo/{id}` / `PUT tenant/uploadSigninImage/{id}`, raw data-URL body). Show progress, then a toast.
  - New account: keep the cropped image in form state. After the first save **of either kind (draft or publish)** returns an id, upload the images, then navigate. Today, images are dropped on a draft save.

**Save calls (through the BFF)**

| Action | VMS call | Notes |
|---|---|---|
| Load new form | `GET tenant/new` → `{tenant, supportingLists}` | |
| Load existing | `GET tenant/{id}/detail` → `{tenant, supportingLists}` | |
| Label presets | `GET labelVerticals` → `{verticals}` | |
| Save draft (new) | `POST tenant/draft` (TenantDto) | ⚠ Probably throws a cast error in VMS (V2). |
| Save draft (existing) | `PUT account/setup/draft/update/{id}` (TenantSetupDto) | ⚠ Unauthenticated in VMS (V1). |
| Publish (new) | `POST tenant/setup/publish` (TenantDto **without id**) → `{tenant}` | |
| Publish (existing draft) | `POST tenant/setup/publish/{id}` | ❌ **Missing in VMS (V3).** Never send an id in the body to `/tenant/setup/publish`: it overwrites the *caller's own* tenant. |
| Update registered | `PUT account/setup/update/{id}` (TenantDto) → bare TenantSetupDto | ⚠ Unauthenticated in VMS (V1). |
| Toggle active | `PATCH tenant/{id} {active}` | |

After a successful save: show a toast, update the cached query data **in place** (no full reload), and move from `/accounts/new` to `/accounts/{id}`.

#### 6.3.1 Registration code: not in use, dropped
Evidence that the feature is unused:
- **CRM UI removed:** the Registration Details card (reveal, regenerate and email the code, with URL and QR) was commented out in `accountDetail.gsp` by commit `1f4b426` ("Removed unused OTP area", Jan 2026). Its leftover script throws on every account page load.
- **The link goes nowhere:** VMS builds `registrationUrl` as `{adminBaseUrl}accountSetup/start/{base64 code}`, but `admin-cloud-v2`'s `AccountSetupController` has **no `start` action**.
- **It doesn't fit the lifecycle:** publishing sets `registeredDate` immediately, and VMS only accepts a code while `registeredDate` is null (`account/setup/verifyRegistration`). Customers log in with the credentials emailed at publish, not with a code.

**Rebuild:** do not build it, and do not call `tenant/{id}/registrationCode*`. If self-service onboarding is wanted later, design it as a new feature (§10, D8).

### 6.4 Licenses tab (`/accounts/:id` → Licenses)
- Disabled for unsaved accounts; today this gives `tenantId=null`, which returns a 400.
- **Controls:** search; status filter Active (default) · Inactive · All; an **Add license** button; refresh is implicit through Query.
- **List:** VMS `GET tenantProductLicense/{tenantId}` (paged; `search`, `active`; default sort `productName`).

| Column | Content |
|---|---|
| Product | `productName` (bold) |
| Description | Truncated, with a tooltip showing the full text |
| Type | Badge from `licenseTypeDisplay`. Colours: SUBSCRIPTION = primary, PERPETUAL = success, TRIAL = warning, USAGE_BASED = info. |
| Code / SKU | `productCode`, `productSku` (monospace) |
| Category | `category` |
| Seats | "**{purchased}** purchased", then "{registeredLicenseCount} used · {available} available". Turns red when available < 0. A small progress bar is optional. |
| Status | Active or Inactive badge |
| Actions | Edit seats · Deactivate/Activate |

- **Add license:**
  - A **dialog**, not a fragile inline row.
  - Product combobox ← `GET productLicenses?tenantId=`. VMS already excludes products assigned to this tenant. Each option is labelled `productName (licenseTypeDisplay)`, and the dialog shows the read-only details of the selected product.
  - Seat count: integer, 1 or more.
  - Saves through `POST tenantProductLicense/{tenantId} {productLicenseId: number, purchasedLicenseCount}`. Send a number, not today's string.
  - Afterwards, invalidate both the list query and the product-options query (today's dropdown goes stale).
- **Edit seats:** a popover or inline number field with 1 or more → `PATCH tenantProductLicense/{id} {purchasedLicenseCount}`. **Warn**, but allow (decision D6), when the new value is lower than the used count.
- **Activate/Deactivate:** confirm, then `PATCH tenantProductLicense/{id} {active}`, with an optimistic update.
- Note: the response field is `licenseCount`. The BFF maps it to `purchasedCount`.

### 6.5 Products (`/products`, `/products/new`, `/products/:id`)
- **List:** `GET products` (paged; `search`, `active`; the service always adds `name` as a secondary sort).
  - Columns: Name (link), Description (an "N/A" badge if empty), Product code, SKU, Category, Status, Actions.
  - Filters: search, plus status Active (default) · Inactive · All.
  - Remove the empty "All Products" description dropdown.
- **Form:** load with `GET products/create` (new, `active:true`) or `GET products/{id}/detail`, each returning `{product, supportingLists:{productCategories}}`.

| Field | Key | Rules |
|---|---|---|
| Name | `name` | required, max 100 |
| Description | `description` | optional, max 500, textarea |
| Product code | `productCode` | required (recommended), max 50 |
| SKU | `productSku` | optional, max 50 |
| Version | `productVersion` | optional, max 20 |
| Category | `productCategoryId` | select ← `productCategories` (id/description); preselect `product.productCategory.id` |
| Active | `active` | switch |

- **Audit footer:** "Created by X on {date} · Updated by Y on {date}" from the base fields. Today this is broken because of missing i18n keys.
- **Save:** `POST products` (new) or `PUT products/{id}` → `{product, supportingLists}`. Show a toast and stay on the page.
  - Show VMS errors inline or as a toast. Today a failed save still shows "Record updated".
- **Activate/Deactivate:** `PATCH products/{id} {active}`.
- **Delete:**
  - A destructive confirm: "Delete product **{name}**? This cannot be undone." → `DELETE products/{id}` → `{deleted}`.
  - Hidden on unsaved products.
  - Decide whether this should be a soft "archive" instead (D7). If any tenant license references the product, the delete should be blocked or warn; check what VMS does.

### 6.6 My Profile (`/profile`)
Load with `GET signedInUser` (`{user, supportingLists}`). **Show field values from the API, not from a cached session copy.**

**Profile tab**
- Photo: `ImageCropUpload`, with a 1:1 circle crop.
  - Upload: `PATCH users/{id}/updateProfileImage {base64Image}` → `{profileImageUrl}`.
  - Remove (with confirm): `PATCH users/{id}/removeProfileImage` → 204.
  - Update the header avatar immediately.
- Security roles: read-only chips from `user.securityRoles`.
- Fields:
  - `email` (required; read-only unless VMS supports changing the login email; confirm)
  - `firstName` and `lastName` (required)
  - `mobilePhone`
  - `address`, `city`, `countryId`, and `stateId` (preselected; today it is never preselected)
  - `postalCode`
  - `languageId` ← `supportedLanguages`
  - `timeZoneName` ← `supportedTimeZones`
- Save: `PUT signedInUser/{id}` (AuthUserDto) → `{user, supportingLists}`. Update the session copy of the user, and apply the new locale and timezone immediately.
- Drop the dead "Visibility" and country-code selects.

**Security tab**
- **Two-factor authentication:**
  - Enable switch, plus a method choice of **SMS** (uses mobilePhone) or **Authenticator app (TOTP)**.
  - Save: `PATCH users/{id} {mfaEnabled, mfaType}`. **Fix:** today the CRM calls the singular `user/{id}`, which does not exist in VMS.
  - Confirm the stored `mfaType` values with VMS. The old UI used `"sms"` and `"topt"` (sic) (V4).
  - If the tenant has `requireMfa`, show "Required by your organization" and lock the switch on.
- **TOTP setup:**
  - `POST auth/registerTotp {identifier}` → `{uri}`. Render the QR client-side from `uri`, and show the secret for manual entry.
  - Then a verification code step (VMS verify endpoint is TBD; V4).
- **Change password:** current, new and confirm, all `type=password`, with policy hints.
  - ❓ VMS has no self-service "change my password" endpoint in the CRM's current calls. `users/{id}/setPassword` exists, so confirm its semantics and authorization (V5).
  - Until then, hide this or link to Forgot Password.

**Appearance tab**
- Theme: Light / Dark / System → `PATCH users/{id} {themeName}`, applied instantly.
- Also available from the user menu.
- Cache the choice in `localStorage` so it applies before the first paint. **Fix** the `"null"` theme bug.

### 6.7 Organization settings (decision D4; recommend **defer or drop**)
- Today's `account/settings` edits the *logged-in user's own tenant* (that is, Force 5's own tenant) through `GET tenant` and `account/update`. Note that `AccountService.update` **does not exist**, so that save is already broken.
- Only these fields are real: name, main contact (first, last, mobile, email), country, address, city, state, postal code, language and timezone.
- If kept, implement it as a simple form using the Account form components and `PUT account/setup/update/{ownTenantId}`.
- Drop all the Metronic mock sections (branding, SSO, API, notifications, delete account).

---

## 7. VMS endpoint inventory (complete — every function the CRM uses)

Base path: `{VMS}/internal/v1/`. Every call carries `Authorization: Bearer`, `X-App-Id: CRM_001`, `Accept: application/json` and a User-Agent passthrough.

Paged endpoints accept `page` (0-based), `size`, `sort=field,dir` (repeatable), `search`, and filters such as `active`. They return `{content[], page:{number,size,totalElements,totalPages}}`.

**Status legend:** ✅ works · ⚠ works with a caveat · ❌ broken or missing · 🗑 drop.

### Auth / system
| # | Current CRM use | VMS call | New BFF route | Status |
|---|---|---|---|---|
| 1 | Startup/login liveness | `GET ping` | `GET /api/health` | ✅ |
| 2 | Keycloak liveness | `GET {kc}/realms/gatekeeper` | inside login + `/api/health` | ✅ |
| 3 | Keycloak token | `POST {kc}/realms/gatekeeper/protocol/openid-connect/token` (password grant, `gk-admin`, `tenant_id`) | `POST /api/auth/login`, `POST /api/auth/select-account` | ✅ |
| 4 | Keycloak refresh | same, `grant_type=refresh_token` | internal (lazy) | ✅ |
| 5 | Keycloak public key → `tenants` claim | `GET {kc}/realms/gatekeeper` → `public_key` | internal | ✅ |
| 6 | VMS login | `POST authenticate {email,password,tenantId}` → `{user}` | internal to login | ⚠ returns 200 with an empty body on failure |
| 🗑 7 | Tenant branding on login | `GET tenant/{accessCode}/assets` | — | Dropped: the internal app uses one Force 5-branded login, and today's page ignores this data anyway. |
| 8 | Send MFA code | `POST auth/sendMfaCode {token}` | `POST /api/auth/mfa/send` | ✅ (email channel is a TODO in VMS) |
| 9 | Verify MFA code | `POST auth/verifyMfaCode {to, passcode}` | `POST /api/auth/mfa/verify` | ❌ **today the CRM sends `code`**; fix in the BFF |
| 10 | Register TOTP | `POST auth/registerTotp {identifier}` → `{uri}` | `POST /api/profile/mfa/totp` | ✅ (the QR is now rendered client-side) |
| 11 | Forgot password | `POST passwordRecovery/forgot {email}` | `POST /api/auth/password/forgot` | ✅ (never wired up in the CRM) |
| 12 | Verify recovery code | `POST passwordRecovery/verify {email, passwordRecoveryCode}` | `POST /api/auth/password/verify` | ✅ |
| 13 | Set new password | `POST passwordRecovery/update {email,password,passwordConfirmation}` | `POST /api/auth/password/reset` | ✅ |
| 14 | Sign out | *(none today)* `POST {kc}/…/logout` | `POST /api/auth/logout` | new |

### Accounts (tenants)
| # | Current CRM use | VMS call | New BFF route | Status |
|---|---|---|---|---|
| 15 | Account list | `GET tenants` (paged; search, active) | `GET /api/accounts` | ✅ ⚠ returns secrets (`defaultPassword`, codes); the BFF must strip them |
| 16 | Lookups | `GET tenant/supportingLists` | `GET /api/lookups/tenant` | ✅ |
| 17 | New account template | `GET tenant/new` | `GET /api/accounts/new` | ✅ |
| 18 | Account detail | `GET tenant/{id}/detail` | `GET /api/accounts/:id` | ✅ |
| 19 | Create draft | `POST tenant/draft` | `POST /api/accounts` `{mode:"draft"}` | ⚠ probably a 500 cast error (V2) |
| 20 | Update draft | `PUT account/setup/draft/update/{id}` | `PUT /api/accounts/:id` (draft) | ⚠ unauthenticated in VMS (V1) |
| 21 | Create + publish | `POST tenant/setup/publish` (no id) | `POST /api/accounts` `{mode:"publish"}` | ✅ |
| 22 | Publish existing draft | `POST tenant/setup/publish/{id}` | `POST /api/accounts/:id/publish` | ❌ **missing in VMS (V3)** |
| 23 | Update registered | `PUT account/setup/update/{id}` | `PUT /api/accounts/:id` (registered) | ⚠ unauthenticated in VMS (V1) |
| 24 | Activate/deactivate | `PATCH tenant/{id} {active}` | `PATCH /api/accounts/:id` | ✅ |
| 25 | Upload logo | `PUT tenant/uploadLogo/{id}` (raw data URL) → `{logoUrl}` | `PUT /api/accounts/:id/logo` | ✅ |
| 26 | Upload sign-in background | `PUT tenant/uploadSigninImage/{id}` → `{imageUrl}` | `PUT /api/accounts/:id/signin-image` | ✅ |
| 27 | Label presets | `GET labelVerticals` → `{verticals}` | `GET /api/lookups/label-verticals` | ✅ |
| 🗑 28 | Get registration code | `GET tenant/{id}/registrationCode` | — | not in use (§6.3.1) |
| 🗑 29 | Regenerate code | `POST tenant/{id}/registrationCode/generate` | — | not in use (§6.3.1) |
| 🗑 30 | Email code | `POST tenant/{id}/registrationCode/email` | — | not in use (§6.3.1) |
| 31 | Own tenant (settings) | `GET tenant` | `GET /api/organization` | ✅ (D4) |
| 🗑 | Country rules | `GET country/{id}` | — | ❌ 404 in VMS; replace with a client-side rules table |
| 🗑 | Setup start | `GET tenant/setup/start/{code}` (AccountSetupService, unused) | — | ❌ 404; unused |
| 🗑 | `apiMetricListJSON` | duplicate of the list | — | unused |

### Licenses
| # | Current CRM use | VMS call | New BFF route | Status |
|---|---|---|---|---|
| 32 | License list | `GET tenantProductLicense/{tenantId}` (paged) | `GET /api/accounts/:id/licenses` | ✅ |
| 33 | Assignable products | `GET productLicenses?tenantId=` | `GET /api/accounts/:id/licenses/available` | ✅ |
| 34 | Add license | `POST tenantProductLicense/{tenantId} {productLicenseId, purchasedLicenseCount}` | `POST /api/accounts/:id/licenses` | ✅ |
| 35 | Update seats | `PATCH tenantProductLicense/{id} {purchasedLicenseCount}` | `PATCH /api/licenses/:id` | ✅ (was a GET in the CRM) |
| 36 | Activate/deactivate | `PATCH tenantProductLicense/{id} {active}` | `PATCH /api/licenses/:id` | ✅ (was a GET in the CRM) |

### Products
| # | Current CRM use | VMS call | New BFF route | Status |
|---|---|---|---|---|
| 37 | List | `GET products` (paged) | `GET /api/products` | ✅ |
| 38 | New template | `GET products/create` | `GET /api/products/new` | ✅ |
| 39 | Detail | `GET products/{id}/detail` | `GET /api/products/:id` | ✅ |
| 40 | Create | `POST products` | `POST /api/products` | ✅ |
| 41 | Update | `PUT products/{id}` | `PUT /api/products/:id` | ✅ |
| 42 | Activate/deactivate | `PATCH products/{id} {active}` | `PATCH /api/products/:id` | ✅ (was a GET in the CRM) |
| 43 | Delete | `DELETE products/{id}` → `{deleted}` | `DELETE /api/products/:id` | ✅ (was a GET in the CRM) |

### Profile
| # | Current CRM use | VMS call | New BFF route | Status |
|---|---|---|---|---|
| 44 | Load profile | `GET signedInUser` | `GET /api/profile` | ✅ |
| 45 | Save profile | `PUT signedInUser/{id}` | `PUT /api/profile` | ✅ ⚠ VMS doesn't check that the id is the signed-in user, so the BFF must always use the session user's id |
| 46 | MFA settings / theme | `PATCH user/{id}` ❌ → **`PATCH users/{id}`** `{mfaEnabled, mfaType}` / `{themeName}` | `PATCH /api/profile/preferences` | ❌ today's path is wrong; use the plural |
| 47 | Upload photo | `PATCH users/{id}/updateProfileImage {base64Image}` | `PUT /api/profile/photo` | ✅ |
| 48 | Remove photo | `PATCH users/{id}/removeProfileImage` | `DELETE /api/profile/photo` | ✅ |

### Dropped (dead code in the CRM; no UI calls these)
- **UserService** (unused): `users` list/supportingLists/create/detail/update, `user/invite` (the VMS path is `users/invite`), and PATCH `users/{id}` active/locked.
  - It is a candidate future feature: "manage users of an account". Note that VMS scopes `users` to the *caller's* tenant, so per-account user management would need new VMS endpoints.
- **ApiKeyService:** `GET apikey/new` (404; VMS uses `apiKeys/*`) and a broken Keycloak client-credentials call. There is no UI for these.
- **AccountSetupService**, `PasswordService` (replaced by #11–13), `TokenService`, and the `jClocksGMT` clock script.
- **Leftovers from other apps:** kiosk, facility, area, webhook, notification and report scripts, `NotificationTagLib`, `salesAccountLayout`, `accountCreated.gsp`, `license/detail.gsp`, and `account/_menuTabs`.

---

## 8. Shared contracts (`packages/contracts`)

These are the shapes the SPA works with. The BFF maps VMS to them.

```ts
type Page<T> = { items: T[]; page: number /*1-based*/; size: number; total: number; totalPages: number };

type AccountStatus = 'draft' | 'active' | 'inactive';
type AccountSummary = {
  id: number; name: string; status: AccountStatus;
  mainContact: { firstName?: string; lastName?: string; email?: string; mobile?: string; phone?: string };
  city?: string; state?: string; country?: string; language?: string; dateCreated: string;
};
type Account = AccountSummary & {
  active: boolean; registeredDate?: string; registeredBy?: string;
  languageId?: number; timeZoneName?: string; labelVerticalId?: number | null; frameworkIds: number[];
  requireMfa: boolean; address?: string; city?: string; stateId?: number; provinceOrRegion?: string;
  postalCode?: string; countryId?: number; logoUrl?: string; signinBackgroundImageUrl?: string;
  accessCode?: string; audit: Audit;
  // never exposed: defaultPassword, registrationCode, registrationUrl, registrationQrCode, clearPassword
};
type AccountLookups = {
  languages: Option[]; timeZones: Option<string>[]; countries: Option[]; states: Option[];
  frameworks: Option[]; labelVerticals: { id: number; name: string; description?: string }[];
};

type TenantLicense = {
  id: number; productName: string; description?: string; licenseType: string; licenseTypeDisplay: string;
  productCode?: string; productSku?: string; category?: string;
  purchasedCount: number | null /* VMS licenseCount */; usedCount: number /* registeredLicenseCount */; active: boolean;
};

type Product = { id?: number; name: string; description?: string; productCode?: string; productSku?: string;
  productVersion?: string; productCategoryId?: number; active: boolean; audit?: Audit };

type CurrentUser = { id: number; email: string; firstName: string; lastName: string; profileImageUrl?: string;
  mobilePhone?: string; address?: string; city?: string; stateId?: number; postalCode?: string; countryId?: number;
  languageId?: number; timeZoneName?: string; locale: string; themeName: 'light'|'dark'|'system';
  mfaEnabled: boolean; mfaType?: 'sms'|'totp'; securityRoles: {code:string;name:string}[];
  permissions: { code: string; read: boolean; create: boolean; update: boolean; delete: boolean; execute: boolean }[];
  tenant: { id: number; name: string; requireMfa: boolean; accessCode?: string } };

type Audit = { createdBy?: string; dateCreated?: string; updatedBy?: string; lastUpdated?: string };
type Option<V = number> = { value: V; label: string };
type ApiError = { error: { code: string; message: string; fieldErrors?: Record<string, string> } };
```

---

## 9. Cross-cutting requirements

### Authorization
- **The BFF guard** allows only users who pass decision D1. Recommended rule: the user's tenant is Force 5 (tenant 1) **and** they hold a CRM permission or role, for example `MANAGE_CRM` or `ROLE_ADMIN`.
- **The SPA** uses `CurrentUser.permissions` to gate nav items and actions with `<Can permission="MANAGE_ACCOUNT" action="update">`. This replaces the SecurityTagLib, which defined these checks but never used them.
- Permission types match VMS: read, create, update, delete, execute.

### Security
- **Session cookie:** httpOnly, Secure, SameSite=Strict. Mutating requests also require a CSRF token header.
- **Response headers:** a strict CSP (no inline scripts, `img-src` allows the CDN and S3), HSTS, `X-Content-Type-Options` and `frame-ancestors 'none'`.
- **Login rate limiting** per IP and per email.
- **No secrets reach the browser:** strip `defaultPassword` and similar fields from tenant responses.
- **Audit log:** every mutation is logged in the BFF with user, tenant, action, target id, result and request id. Under SOC 2 change management, this complements VMS's logs.
- **Dependency scanning:** turn the Trivy workflow back on (`.github/workflows/trivy.yml.bak`) and use Dependabot for npm.

### UX quality bar
- Every async action has loading, success and error states. There are no full-page reloads.
- **Optimistic updates** for toggles.
- Empty states have a call to action (for example "No accounts match 'acme' — clear filters").
- Keyboard accessible, with visible focus, and passes **WCAG 2.1 AA** (axe in Playwright).
- Dark mode is a first-class mode: tokens are defined for both themes, and logos have light and dark variants.
- Dates are formatted in the user's timezone, with the timezone abbreviation where it matters.

### i18n
- All strings live in `locales/en/*.json`, namespaced per feature. Today, 185 keys exist, several referenced keys are missing, and the other locales contain only stock Grails messages, so start fresh in English.
- Locale and timezone come from the user, then fall back to the tenant, then to `en-US` / `America/New_York`.

### Observability
- Sentry in both apps, with a release tag and environment.
- The BFF writes structured logs (pino) with a request id that is forwarded to VMS.

### Configuration (BFF environment, validated at boot)
`VMS_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM=gatekeeper`, `KEYCLOAK_CLIENT_ID=gk-admin`, `X_APP_ID=CRM_001`, `SESSION_SECRET`, `REDIS_URL`, `SESSION_IDLE_MINUTES=60`, `BASE_PATH=/crm`, `SENTRY_DSN`, `APP_ENV`, `CDN_DEFAULT_LOGIN_BG`, `CDN_DEFAULT_LOGO`.

The current values are: dev VMS `http://localhost:8080/vms/internal/v1/`, prod VMS `https://api.force5.cloud/internal/v1/`, and Keycloak `https://keycloak.force5.cloud/realms/`.

**Remove `skipKeycloakAuthentication` entirely.** It is a production foot-gun.

### Deployment
- Multi-stage Dockerfile: build the SPA, then build the BFF, then a `node:22-alpine` runtime.
- Keep the **`/crm` base path** so existing links and the CloudFront routing keep working.
- CI: GitHub Actions or the existing CodeBuild `buildspec.yaml`, running lint, typecheck, unit tests, a Playwright run against MSW, an image build, then deploy to ECS Fargate (or wherever admin-cloud runs).
- Use Redis (ElastiCache) for sessions.

---

## 10. Prerequisites, VMS change requests, and open decisions

### VMS changes (hand to the vmsServer team; several block parity)

| ID | Change | Blocks | Severity |
|---|---|---|---|
| **V1** | Remove `**/account/setup/**` from `permitAll` (`SecurityConfig.java:166`), or at least require auth for the `update/*` and `draft/update/*` writes. Today anyone can rewrite any tenant without logging in. | security | **Critical** |
| **V1b** | Add authorization to the tenant-admin endpoints the CRM uses: `tenants`, `tenant/*`, `tenantProductLicense/*`, `productLicenses`, `products/*`. Use `@HasPermission`, plus a requirement that the caller is tenant 1 / `X-App-Id: CRM_001`. The BFF guard is defence in depth, not a substitute. | security | **Critical** |
| **V2** | Fix `POST tenant/draft`: the `TenantSetupDto`/`TenantDto` cast in `TenantController.createTenantAsDraft`. | Save as draft | High |
| **V3** | Add `POST tenant/setup/publish/{id}` to publish an existing draft. Also stop `/tenant/setup/publish` with an id in the body from updating the *caller's* tenant. | Publish draft | High |
| **V4** | Confirm MFA: the `mfaType` enum values (`sms`/`totp` vs `topt`); how TOTP codes are verified at login and during setup (endpoint and payload); and `sendMfaCode` for TOTP users. | MFA | High |
| **V5** | A self-service change-password endpoint (current password plus new password), or confirm `users/{id}/setPassword` semantics and authorization. | Change password | Medium |
| ~~V6~~ | *Withdrawn:* tenant-branded login is not needed for an internal app. | — | — |
| **V7** | Expose a country id on states, plus per-country address rules (or fix and route `country/{id}`). | Address UX | Low |
| **V8** | Support a draft/registered filter on `GET tenants` (for example `registered=false`), and optionally a `GET tenants/summary` with counts for the dashboard. | Dashboard KPIs | Low |
| ~~V9~~ | *Withdrawn:* the login model stays as it is (§4). | — | — |
| **V10** | Confirm the logo target size (200×60 vs 400×400) and add endpoints to remove the logo and sign-in image. | Branding UX | Low |
| **V11** | `POST authenticate`: return 401 on bad credentials instead of 200 with an empty body. | Cleanliness | Low |
| **V12** | Stop emailing clear-text passwords on publish; send a set-password link instead. Also remove the hardcoded audit email list (`TenantService.groovy:324`). | security | Medium |

### Product decisions (answer before or during Phase 1)
- **D1. Who may use the CRM?** Today, anyone who passes Keycloak and VMS `authenticate` can sign in (§4.1). The login itself stays the same either way. The option is a single check *after* login in the BFF: for example, the user's tenant is Force 5 (tenant 1) and they hold a CRM role. Recommended, since the VMS endpoints the CRM uses have no permission checks of their own. Name the role or permission code, or choose "no change".
- **D2. Login model: DECIDED.** Keep the current login (Keycloak password grant `gatekeeper`/`gk-admin` + VMS `authenticate`, done server-side), moved into the BFF. See §4.
- **D3. Registration code feature: DECIDED.** Not in use; dropped (§6.3.1).
- **D4. Organization settings page.** Drop it (recommended) or keep a minimal version.
- **D5. Label preset after publish.** Read-only after publish (recommended), or re-apply it with `POST labelVerticals/{id}/apply`. Note that this endpoint acts on the caller's tenant, so it would need a tenant-id variant.
- **D6. Seats below the used count.** Warn and allow (recommended), or block.
- **D7. Product delete.** Hard delete as today, or a soft archive (deactivate) only.
- **D8. Future scope** (not in parity, but VMS already has much of it):
  - per-account users and invitations
  - per-account security roles (`tenant/{id}/securityRoles…`)
  - API usage metrics (`GET tenants/apiMetrics`)
  - webhooks and API keys per tenant
  - a resend-welcome-email action
  - impersonation or "open in Admin"

---

## 11. Delivery phases

Each phase ends with a demo and its Playwright tests green. Estimates assume 1–2 developers who know React.

### Phase 0 — Setup and decisions (≈1 week, in parallel with Phase 1)
- File VMS tickets V1–V12. V1, V1b, V2 and V3 are on the critical path for accounts.
- Get answers to D1–D7.
- Pull the VMS OpenAPI spec (`/vms/v3/api-docs/internal`) for reference. Record real VMS responses from dev as **MSW fixtures**, so front-end work does not depend on a running VMS.

### Phase 1 — Foundation (≈2 weeks)
- Monorepo scaffold, lint, typecheck, CI, Dockerfile, environment config, Sentry.
- shadcn/ui setup: theme tokens (light, dark, system) with Force 5 colours (charcoal and orange; see the `force5-branding` skill) and the Bebas Neue / Lato type pairing. Build the app shell, nav, breadcrumbs, toasts, `ConfirmDialog`, `DataTable` and `PageHeader`.
- BFF: session with Redis, VMS client and error normalization, Keycloak client, auth guard, CSRF and security headers.
- Auth flows:
  - login (same Keycloak and VMS calls as today)
  - tenant picker
  - MFA (SMS)
  - logout
  - lazy refresh
  - idle warning
  - deep-link return
  - forgot password
- **Exit criteria:** a Force 5 user can sign in, including MFA, on dev against the real VMS. Non-CRM users are rejected. No token appears in the browser.

### Phase 2 — Accounts (≈2–3 weeks)
- Account list with URL-synced filters, plus activate/deactivate.
- Account form: lookups, the three states, draft vs publish validation, the publish confirmation, and an unsaved-changes guard.
- Image crop and upload, using the single upload-timing model.
- Address country rules.
- **Exit criteria:** create draft → edit draft → publish → edit registered → deactivate, all working end-to-end on dev. This depends on V2 and V3.

### Phase 3 — Licenses (≈1 week)
- Licenses tab: list, add-license dialog, edit seats, activate/deactivate, and the used/available display.

### Phase 4 — Products (≈1 week)
- List, form, category lookup, activate/deactivate, delete (per D7), and the audit footer.

### Phase 5 — Profile and dashboard (≈1–1.5 weeks)
- Profile, photo, preferences, theme, MFA settings and TOTP enrolment (depends on V4), and change password (depends on V5).
- Dashboard KPIs and recent accounts.

### Phase 6 — Hardening and cutover (≈1–2 weeks)
- Accessibility pass (axe), i18n string sweep, and performance (route-level code splitting, Query cache tuning).
- Security review: run the `/security-review` checklist, CSP, a pen-test of the BFF guard, and check the audit logs.
- UAT with the sales/ops users against the **parity checklist** (§12).
- **Cutover:**
  1. Deploy at `/crm-next`.
  2. Run side by side for 1–2 weeks.
  3. Switch the `/crm` routing in CloudFront or the load balancer.
  4. Keep the Grails WAR deployable for a 2-week rollback window, then retire it and archive the repo.

**Total:** roughly **9–12 weeks** for one developer, or about 6–8 weeks for two. Most of the risk sits in the VMS fixes (V1–V4), not the front end.

---

## 12. Parity and acceptance checklist

**Auth**
- [ ] Sign in with email and password; invalid credentials show a clear error; a service outage shows "Service unavailable".
- [ ] Login uses the same Keycloak realm, client and VMS `authenticate` call as the Grails app; existing CRM users sign in with no account changes.
- [ ] A multi-tenant user picks an account without retyping the password.
- [ ] An MFA user cannot reach any page or API before verifying. Resend works.
- [ ] The idle warning appears at 55 minutes; sign-out happens at 60 minutes; sign-in then returns the user to the original page.
- [ ] Sign out revokes the session (pressing back does not show data).
- [ ] Forgot password works end-to-end.

**Accounts**
- [ ] The list searches, filters Active/Inactive/All, sorts by every sortable column, and pages; the URL keeps the state.
- [ ] Status badges show Draft, Active and Inactive correctly; City shows independently of Language.
- [ ] Activate/deactivate has a confirm step with the correct wording, an optimistic update, and rollback on error.
- [ ] Create a draft with only a name, including images; edit the draft; publish with full validation and the confirmation dialog.
- [ ] Edit a registered account; the `requireMfa`, Active, frameworks and label preset values round-trip correctly.
- [ ] Logo and background are cropped at the correct aspect ratio, uploaded, shown immediately, and errors are surfaced.
- [ ] Names containing `<script>` render as text.

**Licenses**
- [ ] The tab is disabled for unsaved accounts; the list, search and active filter work.
- [ ] Add license: the product list excludes assigned products and refreshes after an add.
- [ ] Edit seats with ≥ 1 validation and a below-used warning; activate/deactivate works.
- [ ] Purchased, used and available are displayed, with the over-allocation highlight.

**Products**
- [ ] List, search, active filter; create, edit, activate/deactivate, delete with confirm.
- [ ] Validation errors and VMS errors are shown; there are no false success messages.

**Profile**
- [ ] Fields load from the API; state is preselected; save applies the locale and timezone immediately.
- [ ] Photo upload with crop and cancel; remove with confirm; the header avatar updates.
- [ ] MFA enable/disable with SMS or TOTP (QR enrolment); the tenant-required lock works.
- [ ] Theme Light/Dark/System persists across sessions, with no flash of the wrong theme.

**Non-functional**
- [ ] No Keycloak or VMS tokens in the browser (check DevTools storage and network).
- [ ] Non-CRM users get a 403 from every `/api/*` route.
- [ ] Every mutation produces an audit log entry.
- [ ] Axe reports no serious or critical issues; keyboard-only navigation of every flow works.
- [ ] Sentry receives front-end and BFF errors with the release tag.

---

## Appendix A — Source references (current Grails app)
- **Controllers:** `grails-app/controllers/com/force5/web/crm/*` (Account, License, Product, Profile, Security, Error, ApiKey, Dashboard, SessionInterceptor, UrlMappings).
- **VMS calls:** `grails-app/services/com/force5/web/services/AbstractService.groovy` (HTTP helpers, headers, paging translation), plus `crm/*Service.groovy`.
- **Auth:** `AuthenticationService.groovy` (Keycloak and VMS auth), `SecurityController.groovy` (login chain, MFA, refresh, timeout).
- **Account UI:** `views/account/accountDetail.gsp`, `assets/javascripts/pages/accountInfo.js` (images), `f5/validation/account-detail-validation.js`, `datatables/accounts-list.js`.
- **Licenses UI:** `views/license/index.gsp`, `datatables/licenses-list.js` (add row and inline seat editing).
- **Products UI:** `views/product/*`, `datatables/product-list.js`.
- **Profile UI:** `views/profile/index.gsp` (MFA, TOTP and theme UI are commented out at lines ~339–782).
- **Config:** `grails-app/conf/application.yml` (context path `/crm`, port 8082, 60-minute session, VMS and Keycloak URLs).

## Appendix B — VMS references
- `internal/tenant/TenantController.groovy` (tenants, draft/publish, registration, images)
- `services/tenant/TenantService.groovy` (lifecycle, publish side effects, supportingLists :637)
- `services/tenant/TenantSetupService.groovy:236-342` (what publish provisions)
- `internal/tenantProductLicense/TenantProductLicenseController.groovy`
- `internal/product/ProductController.groovy`
- `internal/security/AuthenticationController.groovy` (authenticate, MFA, TOTP, signedInUser, initiateAuthentication/refresh/logout)
- `internal/user/UserController.groovy` (`PATCH users/{id}`, profile image)
- `internal/user/passwordRecovery/PasswordRecoveryController.groovy`
- `config/SecurityConfig.java` (permitAll list), `config/TenantFilter.groovy`, `config/TenantFilterAspect.java` (tenant-1 and CRM_001 behaviour), `config/CorsConfig.java`
- OpenAPI: `http://localhost:8080/vms/v3/api-docs/internal` (local) and `docs/api-documentation.md`
