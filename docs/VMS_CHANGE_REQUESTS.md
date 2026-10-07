# VMS change requests for the CRM rebuild

**For:** vmsServer team
**From:** CRM v2 rebuild ([`CRM_REBUILD_PLAN.md`](../CRM_REBUILD_PLAN.md) §10)
**Verified against:** `vmsServer` @ `0cc71b0b`, 2026-10-06

Every item below was checked in the source. Paths are relative to `vmsServer/src/main/`, and line numbers are as of that commit. Each ticket can be filed on its own.

> **Handle as security-sensitive.** V1, V1b and V13 (and finding F2) let an unauthenticated caller, or a user from any tenant, read or change other tenants' data or take over accounts. Track them privately until they are fixed.

## Summary

| ID | Title | Severity | Blocks CRM v2 |
|---|---|---|---|
| **V13** | `passwordRecovery/update` never checks the recovery code | **Critical** | Forgot password (§4.4) |
| **V1** | `**/account/setup/**` is open to anyone | **Critical** | Yes: account save |
| **V1b** | No authorization on tenant, license and product admin endpoints; `X-App-Id` is trusted | **Critical** | Yes: go-live |
| **F2** | `PUT tenant/updates/{id}` sets any field by reflection, with no authorization | **Critical** | No (the CRM doesn't call it) |
| **V2** | `POST tenant/draft` fails with a cast error and leaves an orphan tenant (**seen live**) | High | Save as draft |
| **V3** | No way to publish an existing draft; an id in the body overwrites the *caller's* tenant | High | Publish draft |
| **V4** | MFA: TOTP is never checked, `verifyMfaCode` trusts a phone number from the client, `mfaType` isn't validated | High | MFA setup and login |
| **F1** | `PUT signedInUser/{id}` doesn't check that the id is the caller | High | No (the BFF always sends the session user) |
| **V5** | Change password doesn't ask for the current password; `setPassword` reaches across tenants and emails passwords | Medium (cross-tenant part: High) | Change password |
| **V12** | Publish emails a clear-text password and returns it in the response; the audit recipients are hardcoded (**seen live**) | Medium–High | No; should ship with V3 |
| **V14** | Product categories come back empty, so products can't be created or edited (category is NOT NULL) | **High** | **Yes: product create/edit** |
| **V15** | Saving a user's theme crashes (`setThemeName` doesn't exist); `ThemeMode` has no `system` | Low | Theme isn't saved to VMS |
| **F6** | Product name, description, code, SKU and version are VARCHAR(25) | Low | No (CRM forms enforce 25) |
| **V7** | States have no country id; the `country/{id}` handler has no route | Low | No |
| **V8** | No draft filter or counts on `GET tenants`; the list returns secrets | Low | Draft dashboard card |
| **V10** | Logo resize doesn't fit 200×60; no way to remove images | Low | Remove logo/background |
| **V11** | `POST authenticate` returns 200 with an empty body on bad credentials | Low | No |
| **F5** | `POST authenticate` response includes `passwordRecoveryCode` | High | No (the BFF strips it) |
| **F3** | `sendMfaCode` has no login and no rate limit (risk of SMS-cost abuse) | Medium | No |
| **F4** | A failed publish leaves a half-built tenant and still returns 200; publish currently skips flow creation (**seen live**) | **High** | Publish is incomplete |

Two facts apply to every item:
- **Authorization isn't enforced yet.** `InternalApiAuthorizationInterceptor` only *logs* endpoints that have no `@HasPermission`. `f5.internal-api.authorization.enforce` defaults to `false`.
- **Unauthenticated requests run with the tenant filter turned off.** With no token, the tenant resolver returns 0, and `TenantFilterAspect.java:35-37` disables the Hibernate `tenantFilter`.

---

## V13: `passwordRecovery/update` never checks the recovery code. **Critical**

**Endpoint:** `POST /internal/v1/passwordRecovery/update`. No login is needed (`SecurityConfig` L151/L164-165, `application.properties:116`).

**Problem:**
- `PasswordRecoveryService.groovy:112-123` checks that the two passwords match, then updates *every active user with that email, in every tenant*, and unlocks them.
- `passwordRecoveryCode` is never read.
- The controller test mocks the service, so this has never been tested.

**Related weaknesses:**
- `UserService.verifyPasswordRecoveryCode` (L539-548) compares with `==`. When the user has no pending code, `null == null` is true, so the check passes.
- Codes are 6 digits from `java.util.Random` (L143-153), with no expiry and no attempt limit.
- `forgot` sets `accountLocked=true` (L530-533), so anyone can lock any email.

**Fix:**
1. `update` must require a stored code that is non-null, matches (compared in constant time) and hasn't expired. Otherwise return 400.
2. Add `passwordRecoveryCodeExpiresAt`, about 15 minutes after the code is issued.
3. Use `SecureRandom`, and limit attempts per email and per IP.
4. `verify` must require a stored code that isn't null.
5. Don't lock the account on `forgot`. Return the same response whether or not the email exists.
6. *Preferred design:* `verify` returns a single-use reset token, and `update` accepts only that token.

**CRM note:** the CRM BFF re-checks the code before calling `update`. That protects the CRM's own flow, but not the endpoint itself.

## V1: `**/account/setup/**` is open to anyone. **Critical**

**Where:**
- `SecurityConfig.java:152` and `:166-167` (permitAll)
- `application.properties:117`

**Exposed (no login, any tenant id, tenant filter off):**

| Endpoint | Effect |
|---|---|
| `PUT account/setup/update/{id}`, `PUT account/setup/draft/update/{id}` | `TenantService.updateTenantSetup` (L586-618) runs `BeanUtils.copyProperties` with nulls, which replaces the whole tenant record. That includes `active`, `defaultPassword`, `logoUrl` and the security realm. |
| `PUT account/setup/updateContactInfo/{id}` | Rewrites the main contact email and mobile. |
| `GET account/setup/start/{id}` | Returns the full `TenantSetupDto`, including codes, `accessCode`, `defaultPassword` and contact details. |
| `POST account/setup/verifyRegistration` | 6-digit code with no attempt limit. An unknown code causes a 500. |
| `POST account/setup/sendMfa` | Calls a method that doesn't exist, which causes a 500. |

**Fix:**
- Remove the permitAll lines (`SecurityConfig` L152 and L166, `application.properties:117`).
- If self-onboarding still needs `start` or `verifyRegistration`, permit only those exact paths. Return a reduced DTO and add rate limiting.
- Move the write endpoints behind authentication plus the V1b guard.
- Delete `sendMfa`, or implement it.

**CRM impact:** the CRM saves draft and registered accounts through `account/setup/*update*`. It needs these endpoints to require authentication and the CRM permission.

## V1b: No authorization on the CRM admin endpoints; `X-App-Id` is trusted. **Critical**

**Problem:**
- There is no `@HasPermission` on:
  - `TenantController` (except one `DELETE securityRoles` endpoint, L434)
  - `ProductController`
  - `TenantProductLicenseController` (commented out at L41 and L70)
- `Tenant`, `SaleableProduct` and `ProductLicense` don't extend `BaseEntity`, so the tenant filter never applies to them.
- `TenantFilterAspect.java:38-46`: for tenant 1, the filter is *disabled* unless the client sends `X-App-Id: CRM_001`. The header comes straight from the client (`TenantFilter.groovy:80-83`). A tenant-1 user who leaves it out can read every tenant's `BaseEntity` rows.
- `AuthenticationService.authenticateUser` (L140-143) only *warns* when a user isn't licensed for the app.

**Result:** any authenticated user of any tenant can list, change, publish and upload branding for every tenant, and manage every tenant's licenses and the global product catalog. This covers:
- `tenants`
- `tenant/{id}`, `tenant/{id}/detail`
- `tenant/draft`, `tenant/setup/publish`
- `tenant/uploadLogo/{id}`, `tenant/uploadSigninImage/{id}`
- `tenant/{id}/registrationCode*`
- `tenantProductLicense/*`, `productLicenses`
- `products/*`

**Fix:**
1. Add a CRM guard to these controllers, for example a `@CrmAdminOnly` aspect or a `@HasPermission(["MANAGE_ACCOUNTS:…"])` family. It should require:
   - the token's tenant is 1 (Force 5);
   - the user holds a CRM role or permission (decision D1). **No CRM permission exists in `security_permission` today**; `MANAGE_ACCOUNT`, `MANAGE_PRODUCT` and `MANAGE_LICENSE` are not seeded. The seeded but unassigned role `CRM_ADMIN` (`SecurityRoleCode`, `01_vms_gold_sample.sql:853-854`) is the natural fit. Alternatively, add `MANAGE_ACCOUNT` / `MANAGE_PRODUCT` / `MANAGE_LICENSE` permissions in a migration;
   - the app is taken from the token's client or audience, **not** from `X-App-Id`.
2. Restore `@HasPermission` on `TenantProductLicenseController`, and add it to `ProductController`.
3. Reject unlicensed users in `authenticateUser`.
4. Once the open paths are cleaned up, set `f5.internal-api.authorization.enforce=true`.

**CRM impact:** the BFF has its own guard on top (tenant 1 plus the permission). That is defence in depth, not a substitute.

## F2: `PUT tenant/updates/{id}` sets any field by reflection. **Critical**

**Where:** `TenantController.groovy:518`, which calls `TenantService.groovy:1022-1034` (`tenant."$key" = value`).

**Problem:** with no authorization, any caller can set any tenant property, including `accessCode`, `defaultPassword`, `deletedDate` and `active`. The CRM doesn't call this endpoint.

**Fix:** use an allow-list of fields plus the V1b guard, or remove the endpoint.

## V2: `POST tenant/draft` fails with a cast error. **High**

**Seen live (2026-10-06):** a CRM draft save returned 500 and left an orphan tenant row (`registered_date` NULL) in the local DB.

**Where:** `TenantController.groovy:189-191`.

**Problem:**
- The result of `createAndRegisterTenant`, a `TenantDto`, is assigned to a `TenantSetupDto` variable. At runtime that throws `GroovyCastException`, a 500.
- The tenant row has already been saved (`TenantService.groovy:234`), so every failed attempt leaves an orphan tenant.
- `TenantControllerTest.java:89` mocks the method to return a `TenantSetupDto`, which hides the bug.

**Fix:**
- Declare the variable as `TenantDto`, or map the result to `TenantSetupDto`.
- Fix the test to use a real return value.
- Add the V1b guard.

## V3: No way to publish an existing draft; an id in the body overwrites the caller's tenant. **High**

**Where:**
- `TenantController.groovy:291-299`
- `TenantService.updateTenant`, L448-461

**Problem:**
- When the body has an `id`, the code calls `updateTenant(dto)`. That method loads `getTenant()`, which is the **signed-in user's tenant**: tenant 1, Force 5, for every CRM user. It then copies the DTO over it.
- It never registers the draft.
- There is no `tenant/setup/publish/{id}` route.

**Fix:**
1. `POST tenant/setup/publish` should reject a non-null `id` with 400.
2. Add `POST /internal/v1/tenant/setup/publish/{id}`:
   - It takes an optional `TenantDto` body, applied first with `updateTenantSetup(id, dto)`.
   - It requires `registeredDate == null`, otherwise it returns 409.
   - It then runs the same flow as creating a tenant:
     1. `setCurrentTenant(id)`
     2. `createTenantSetupData(id)`
     3. `createAreaPoc`
     4. apply the label vertical
     5. send the audit email
     6. send the invite (see V12)
   - It returns `{tenant, supportingLists}`, without `clearPassword`.
3. Put the shared steps in a `TenantService.publish(Long id)` method, so both routes use them.

**CRM impact:** until this ships, the CRM shows "Publishing an existing draft needs VMS change V3" (BFF returns 501).

## V4: MFA is incomplete and enforced only by the client. **High**

**Problems:**

| Area | Where | What's wrong |
|---|---|---|
| `mfaType` | `User.java:167-168`, `VARCHAR(5)`, saved as sent (`UserService.groovy:381-382`) | Free text; `topt` and `totp` can both be stored. |
| TOTP check | `MfaService.verifyTotp` (L157-170) | Registers a *new* Twilio factor and never checks the code. |
| TOTP check | `verifyTotp(String)` (L234-236) | Just `return true`. |
| TOTP check | `POST auth/validateToptToken` | Calls a method that doesn't exist, which causes a 500. |
| TOTP check | `User` | The factor SID isn't stored. |
| `sendMfaCode` | L81-113 | Ignores `mfaType` and always sends an SMS. With no mobile number it returns empty (email is a TODO). |
| `verifyMfaCode` | L115-138 | Checks the code against `to`, a phone number the client supplies. Outside the `aws`/production profiles it always approves. |
| Enforcement | `/authenticate`, `/auth/**` | `/authenticate` returns the user before MFA, and `/auth/**` is permitAll. |

**Fix:**
- Make `mfaType` an enum `{SMS, TOTP}` and migrate `topt` → `totp`. Running `SELECT DISTINCT mfa_type` first shows what's actually stored.
- Store `totpFactorSid` on `User`.
- `POST auth/verifyTotp {userToken, code}` should create a Twilio Challenge against the stored factor and return `{valid, status}`. During setup it should also verify the factor.
- `sendMfaCode` should return `{channel:"totp", status:"no_send_required"}` for TOTP users.
- `verifyMfaCode` should take the user token and look up the phone number on the server.
- Best of all, issue tokens only after MFA succeeds.

**CRM impact:**
- The BFF passes the phone number from the server-side user, never from the browser.
- TOTP enrolment and verification stay hidden until this is fixed.

## F1: `PUT signedInUser/{id}` doesn't check that the id is the caller. **High**

**Where:** `AuthenticationController.groovy:241-253`, which calls `UserService.updateUserProfile` (L246-300).

**Problem:** any user can rewrite another same-tenant user's profile, email or `mfaType`. Because of the V1b `X-App-Id` bypass, a tenant-1 user can do it across tenants.

**Fix:** use `getCurrentUser()` and ignore the id in the path, or require that it matches the caller.

**CRM impact:** the BFF always uses the session user's id.

## V5: Change password. **Medium** (cross-tenant part: **High**)

**What exists:** `POST /internal/v1/users/updatePassword` (`UserController.groovy:239-244`, `UserService.groovy:581-605`). It takes `{password, passwordConfirmation}`, applies to the current user, and returns 422 listing the broken policy rules.

**Problem:** it doesn't ask for the current password.

**`users/{id}/setPassword`** (L207-219, L629-655) is an admin reset guarded by `MANAGE_USER:UPDATE`. It has three problems:
- It loads the user with `findById`, which the tenant filter doesn't cover, so an admin in any tenant can reset users in other tenants.
- It **emails the new password in clear text**.
- It doesn't set `passwordExpired`.

**Fix:**
- Add `currentPassword` to `PasswordDto`. Check it in `updatePassword`, and count failed attempts.
- In `setPassword`, load the user with a tenant-scoped query.
- Stop emailing the password; send a reset link instead. Set `passwordExpired=true`.

**CRM impact:** once `currentPassword` is checked, the CRM can enable Change Password using `users/updatePassword`. It never uses `setPassword`.

## V12: Publish emails a clear-text password. **Medium–High**

**Seen live (2026-10-06):** publishing a test account sent a "Welcome to Force 5!" email to the main contact containing the admin password in plain text, plus 3 "Setup Audit Report" emails to the hardcoded internal list.

**Where:**
- **`TenantController.groovy:324`**. The plan says `TenantService`, which is wrong. It has a hardcoded list of 3 audit recipients (L372).
- Credentials email: L374-380, which calls `TenantService.sendRegistrationAndLoginEmail` (L775-800).

**Problems:**
- `clearPassword` is **returned in the publish response** (`TenantSetupService.groovy:339`).
- `Tenant.defaultPassword` is stored in clear text and becomes the admin's password (`TenantSetupService.groovy:632-638`).
- That field is returned by `GET tenants` and `GET tenant/{id}`.
- The dev profile has a hardcoded fallback password (L636).
- The JMS register listener (`TenantService.groovy:974`) also emails a password.

**Fix:**
- Create the admin with a random password, `passwordExpired=true`, and a single-use set-password token that expires (reuse the recovery-code flow). Email a link, not the password.
- Remove `clearPassword` and `defaultPassword` from all DTOs, and drop or hash the column.
- Move the audit recipients to config (`f5.tenant.audit-recipients`).

**CRM impact:** the BFF strips these fields today. Ship this with V3.

## V7: Country rules. **Low**

**Problems:**
- `State` has no `country_id` (`State.java`, `StateDto`, schema L85-93).
- `CountryController.groovy:23-33` handler methods have **no `@GetMapping`**, so the route is unreachable.
- The `Country` entity already holds address rules (`displayStateField`, `stateFieldRequired`, `displayProvinceField`, `zipcodeFieldRequired`, `phoneFormatRegExp`; `Country.java:34-81`), but `CountryDto` doesn't expose them.

**Fix:**
- Add `state.country_id` with a migration, and add `countryId` to `StateDto`.
- Add the rule fields to `CountryDto`.
- Add `GET country/{id}` and `GET country/code/{code}`.
- Clear the STATES/countries caches.

**CRM impact:** the CRM uses a client-side rules table in the meantime.

## V8: Tenant list filters and counts. **Low**

**Problems:**
- `GET tenants` (`TenantController.groovy:97-101`, `TenantSearchSpec`) supports only `search` and `active`.
- There is no summary endpoint.
- The list returns `TenantSetupDto`, which includes `defaultPassword`, `registrationCode` and `accessCode`.

**Fix:**
- Add `registered=true|false` (`registeredDate` is null / not null).
- Add `GET tenants/summary` returning `{total, active, inactive, draft, registered}`. Leave out tenant 1 and deleted tenants.
- Use a list DTO without secrets.

**CRM impact:** enables the Draft dashboard card.

## V10: Branding images. **Low**

**Problems:**
- Logo: `TenantService.groovy:1043` resizes to 200×60 with `Scalr.Mode.AUTOMATIC` (L1097). That mode fits by *width* for wide images, so a 400×400 logo becomes 200×200, not 200×60.
- Small images are scaled up, and everything is output as PNG.
- There's no way to remove an image: `updateTenantFromMap` skips nulls (L1025).
- `uploadLogo` doesn't check that the tenant exists (it throws an NPE) and has no size limit.

**Fix:**
- Decide on the target box: an exact fit with padding, or a true bounding box. Document it so the CRM's crop aspect matches.
- Add `DELETE tenant/{id}/logo` and `DELETE tenant/{id}/signinImage`, returning a null URL.
- Return 404 for unknown tenants, and add a size limit.

## V11: `POST authenticate` returns 200 with an empty body on failure. **Low**

**Where:** `AuthenticationController.groovy:101-104`.

**Problems:**
- It returns `200` with a `null` body when the credentials are wrong.
- `getAuthenticatedUser` doesn't check `accountLocked` or `accountExpired` (TODO at L145-146).

**Fix:** return `401`. Longer term, the CRM could use `auth/initiateAuthentication`, which already returns 401/503 correctly.

## F3: `sendMfaCode` has no login and no rate limit. **Medium**

`POST auth/sendMfaCode` sends a Twilio SMS without any login. Add rate limits per user, per number and per IP to prevent SMS-cost abuse.

## F4: A failed publish leaves a half-built tenant. **High**

**Seen live (2026-10-06):** every publish logs `No signature of method: FlowDefinitionService.create() is applicable…` (`TenantSetupService`), so **no flows are created for new tenants**, yet publish returns 200 and the tenant shows as registered. Fix the call signature, and stop swallowing the exception.

**Problem:**
- `createAndRegisterTenant` saves the tenant before the setup steps run.
- `setupAdminUser` catches and logs every exception (L651-653), so a failure part-way still returns 200.

**Fix:** run the whole publish in one transaction, or roll back explicitly and return an error.

## F5: `POST authenticate` returns the user's password-recovery code. **High**

**Problem:** the `authenticate` response's `user` object includes `passwordRecoveryCode`. Observed against local VMS on 2026-10-06. Combined with V13, anyone who can sign in, or who can see a response, gets a working reset code.

**Fix:** remove `passwordRecoveryCode` (and any other secret fields) from `AuthUserDto` and all user DTOs.

**CRM impact:** the BFF never passes it to the browser.

## V14: Product categories come back empty. **High**

**Where:** `ProductService.groovy:138-139`. It runs `modelMapper.map(productCategories, new TypeToken<List<ProductCategoryDto>>(){}.getType())`.

**Problem:**
- `GET products/create` and `GET products/{id}/detail` return every `supportingLists.productCategories` entry as `{id:null, code:null, description:null, active:false}`, even though `product_category` holds 4 active rows.
- `product.productCategory` is also null for products that have a `product_category_id`.
- Observed against local VMS on 2026-10-06.

**Fix:** map each entry explicitly, e.g. `productCategories.collect { modelMapper.map(it, ProductCategoryDto) }`, and check the `SaleableProduct` → DTO category mapping. Add a controller test that asserts on the real fields.

**CRM impact:** `saleable_product.product_category_id` is NOT NULL, so **creating or editing a product fails** (seen live as a 409 "product_category_id cannot be null"). The category list is empty, so a category can't be chosen. Product create/edit is blocked until this is fixed. Activate/deactivate still works.

## V15: Saving the theme crashes. **Low**

**Where:** `UserService.groovy:378-379`. The `PATCH users/{id}` case `"themeName"` calls `user.setThemeName(...)`, but `User` has `themeMode` (enum `ThemeMode {light, dark}`).

**Problem:**
- `PATCH users/{id} {themeName}` fails with `MissingMethodException` (500). Seen live.
- Other keys outside the switch are silently ignored.
- There's no "system" theme value.

**Fix:**
- Map `themeName`/`themeMode` to `setThemeMode(ThemeMode.valueOf(...))`.
- Add `system` to `ThemeMode`, or treat null as system.
- Return 400 for unknown keys.

**CRM impact:** the theme is kept in the session and the browser only until this is fixed.

## F6: Product fields are VARCHAR(25). **Low**

**Where:** `saleable_product`. `name`, `description`, `product_code`, `product_sku` and `product_version` are all VARCHAR(25) NOT NULL. Longer values fail with a 409 "Data too long".

**Fix:** widen `description` (e.g. 500) and `name` (e.g. 100) if the catalog needs them. Otherwise, the 25 limit stands (the CRM enforces it).

## Needs a runtime check

**License tenant filter may be stale:** `TenantFilterAspect` only turns the filter on when it isn't already on (L41, L48), and never updates its parameter. In `TenantProductLicenseService.create`, the resolver switches to the target tenant after a tenant-1 lookup, but the session filter may still say `tenant_id=1`. Please confirm with an integration test.
