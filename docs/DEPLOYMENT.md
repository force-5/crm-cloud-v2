# Deploying the Force 5 CRM v2

This follows the admin-cloud-v2 / vmsServer model: a **scheduled CodePipeline** (GitHub → CodeBuild → Elastic Beanstalk) per stage, with **CloudFront** in front.

| | test | prod |
|---|---|---|
| Region | us-east-1 | us-east-2 |
| EB application / environment | `crm-v2-test` / `crm-v2-test-env` | `crm-v2-prod` / `crm-v2-prod-env` |
| Pipeline / build | `crm-test-pipeline` / `crm-test-build` | `crm-prod-pipeline` / `crm-prod-build` |
| Schedule (America/New_York) | 4am and 11am, weekdays | 6am and 1pm, weekdays |
| `APP_ENV` | `staging` | `production` |
| Secret | `test/crm/config` | `prod/crm/config` |

**What gets deployed:**
- `buildspec.yml` runs lint, typecheck and unit tests.
- It builds the SPA and the BFF.
- It packages an EB source bundle for **Node.js 22 on Amazon Linux 2023**: BFF, production `node_modules`, SPA, `Procfile` and `.platform/`.
- It **smoke-boots that exact bundle** before the deploy stage can run.

**How a request reaches the app:** browser or phone → CloudFront → ALB (CloudFront-only security group) → nginx → BFF on `PORT` (8080, set by EB). The BFF serves the SPA under `/crm/` and the API under `/crm/api/`.

**Health check:** `GET /crm/api/health` returns `{status, vms, keycloak}`, always with HTTP 200 while the BFF itself is up.

> Everything below needs AWS access. Nothing here has been applied yet. The templates are in `infra/`, checked for internal consistency but not yet validated by AWS (`aws cloudformation validate-template`). Do that first.

---

## 1. One-time setup per stage

Test comes first, then prod. The commands use test values.

### 1.1 Look up the values the templates need
```bash
REGION=us-east-1   # prod: us-east-2

# EB platform name (pick the newest "Node.js 22" on AL2023)
aws elasticbeanstalk list-available-solution-stacks --region $REGION \
  --query "SolutionStacks[?contains(@, 'Amazon Linux 2023') && contains(@, 'Node.js 22')]"

# CloudFront origin-facing prefix list (the id differs per region; us-east-2 is pl-b6a144df)
aws ec2 describe-managed-prefix-lists --region $REGION \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId'

# VPC / subnets: reuse what the admin environment in this region uses
aws elasticbeanstalk describe-configuration-settings --region $REGION \
  --application-name admin-test --environment-name admin-test-env \
  --query "ConfigurationSettings[0].OptionSettings[?Namespace=='aws:ec2:vpc']"
```

### 1.2 Create the configuration secret
The BFF reads exactly one secret, with its region pinned in code (`apps/bff/src/aws-secrets.ts`), so test can never read prod.
- The secret is a JSON object of environment-variable names. Unknown keys are rejected at startup, so a typo fails the deploy instead of being silently ignored.
- If the secret is missing or unreadable, the instance refuses to start. EB health then shows it, and the rolling deploy stops.

```bash
SESSION_SECRET=$(openssl rand -hex 32)
aws secretsmanager create-secret --region us-east-1 --name test/crm/config \
  --secret-string "{
    \"SESSION_SECRET\": \"$SESSION_SECRET\",
    \"VMS_URL\": \"https://<test vms host>/internal/v1/\",
    \"KEYCLOAK_URL\": \"https://<test keycloak host>/realms/\"
  }"
```

| Key | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | yes | At least 32 characters. Signs session cookies and encrypts the pending-login password. Rotating it signs everyone out. |
| `VMS_URL` | yes | VMS internal API base, ending `/internal/v1/`. |
| `KEYCLOAK_URL` | yes | Keycloak `…/realms/` base; the realm (`gatekeeper`) is appended. |
| `REDIS_URL` | **yes when MinInstances > 1** | Otherwise sessions are per instance and users get signed out when the ALB switches instances. Prod: use ElastiCache. Admin's Valkey cluster in us-east-2 is shared-safe, because the CRM's session keys are namespaced `crm:sess:`, but its owner should agree. us-east-1 has no ElastiCache, so test runs 1 instance. |
| `SENTRY_DSN` | no | Server error reporting. Events are scrubbed of cookies, headers, bodies, query strings and user data. |
| `SENTRY_WEB_DSN` | no | The browser DSN. The BFF's `/crm/api/sentry-tunnel` forwards only to this project (and `SENTRY_DSN`'s). It must match the pipeline's `SentryWebDsn`, which is baked into the web build. |
| `CRM_ALLOWED_ROLES`, `CRM_ALLOWED_TENANT_IDS` | no | Override the EB properties (decision D1). |

### 1.3 Deploy the environment stack
```bash
aws cloudformation deploy --region us-east-1 --stack-name crm-v2-test-environment \
  --template-file infra/crm-eb-environment.yaml --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Stage=test \
    SolutionStackName="<from 1.1>" \
    VpcId=vpc-... InstanceSubnets=subnet-a,subnet-b LoadBalancerSubnets=subnet-c,subnet-d \
    CloudFrontPrefixListId=pl-... \
    CertificateArn=arn:aws:acm:us-east-1:...:certificate/... \
    MinInstances=1 MaxInstances=1
# prod: CertificateArn in us-east-2, MinInstances=2 MaxInstances=4 (and REDIS_URL in the secret)
# CertificateArn is required for every stage: the origin is HTTPS-only (no HTTP listener).
```

**What it creates:**
- A **dedicated instance role** with the EB web-tier and SSM policies, plus read access to *only* its own secret. The legacy CRM uses the shared role with `AmazonS3FullAccess`.
- A **CloudFront-only ALB security group**.
- The **EB app and environment**:
  - health check `/crm/api/health`;
  - `RollingWithAdditionalBatch`, health is never ignored;
  - enhanced health;
  - app logs streamed to CloudWatch with 365-day retention;
  - IMDSv1 off.

A template rule refuses to deploy `test` outside us-east-1 or `prod` outside us-east-2.

### 1.4 Deploy the pipeline stack
```bash
aws cloudformation deploy --region us-east-1 --stack-name crm-v2-test-pipeline \
  --template-file infra/crm-pipeline.yaml --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Stage=test \
    GitHubConnectionArn=arn:aws:codeconnections:us-east-1:349395204314:connection/bb38aaa6-92f5-4bdf-8eba-fe990eb7e124 \
    ArtifactBucket=codepipeline-us-east-1-79c0a0246f81-495b-858a-b642482dd232 \
    EbApplication=crm-v2-test EbEnvironment=crm-v2-test-env EbInstanceRoleName=crm-test-eb-instance-role
# prod: Stage=prod, the us-east-2 connection and bucket (see admin-web-build-pipeline),
#       ScheduleExpression="cron(0 6,13 ? * MON-FRI *)"
```

**Before the first run:** the CodeConnection's GitHub app must have access to `force-5/crm-cloud-v2`.

The IAM composition and the guardrails are copied from `vmsServer/infra/test-pipelines-us-east-1.yaml`. **Read `vmsServer/infra/README-test-pipelines.md` before changing them:** the managed EB policies are required, and the region-deny needs its `Null` condition.

**Pushes do not deploy.** `DetectChanges` is `false` and there is no trigger block. Never add both; that's why the legacy CRM deploys on every push.

### 1.5 First deploy and check
```bash
aws codepipeline start-pipeline-execution --region us-east-1 --name crm-test-pipeline
aws codepipeline get-pipeline-state --region us-east-1 --name crm-test-pipeline \
  --query 'stageStates[].{Stage:stageName,Status:latestExecution.status}'

URL=$(aws cloudformation describe-stacks --region us-east-1 --stack-name crm-v2-test-environment \
  --query "Stacks[0].Outputs[?OutputKey=='EnvironmentUrl'].OutputValue" --output text)
```

The ALB only accepts CloudFront, so check through CloudFront (step 2), or temporarily from inside the VPC. Expected:
- `/crm/api/health` returns `{"status":"ok","vms":"up","keycloak":"up"}`.
- The logs show `Loaded configuration from AWS Secrets Manager` with key names only.
- Then sign in with a CRM user.

---

## 2. CloudFront

The ALB rejects anything that isn't CloudFront. For each stage, set up a distribution (or behaviors on an existing one):

**Origin**
- The EB environment's ALB.
- Origin protocol: **HTTPS only**, in every stage. The ALB has no HTTP listener; over plain HTTP the BFF's `Secure` session cookie is never set and credentials would cross the internet unencrypted.

**Behaviors**

| Path | Cache policy | Origin request policy | Notes |
|---|---|---|---|
| `/crm/assets/*` | `CachingOptimized` | none | Vite content-hashed files; the BFF sends `immutable`. |
| Default (`*`) | `CachingDisabled` | `AllViewerExceptHostHeader` | API calls, the SPA shell and redirects. **Cookies and all headers must reach the BFF** (session cookie, `x-csrf-token`). |

**Settings**
- Viewer protocol: redirect HTTP to HTTPS.
- Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**.
- WAF: reuse the CRM's WAF (`CreatedByCloudFront-f42e823c` on the legacy distribution) or the account standard.
- The BFF already sends HSTS, CSP, `X-Content-Type-Options` and `frame-ancestors 'none'`, so a CloudFront response-headers policy is optional.

**`TRUST_PROXY`**
- The BFF trusts exactly **3** proxy hops by default outside local: CloudFront → ALB → nginx.
- That lets it read the real client IP for login rate limiting, while a forged `X-Forwarded-For` prefix is ignored (covered by `apps/bff/test/trust-proxy.test.ts`).
- If the chain changes (no CloudFront, or another proxy), set `TRUST_PROXY` to the new hop count. Never use `true`.

---

## 3. Cutover from the legacy CRM (plan §11, Phase 6)

1. **Check the legacy base path first.** It ships as `ROOT.war` with an embedded-only `/crm` context path, so it is probably served at `https://crm.force5.cloud/`, **not** `/crm/`. Check the cache behaviors and origin of distribution `E3VCMAVXQ1W0ZT`.
2. Stand v2 up at **`crm-next.force5.cloud`**, with its own distribution and ACM certificate in us-east-1 (for CloudFront). Run UAT there side by side.
3. Switch: point `E3VCMAVXQ1W0ZT`'s origin at the v2 ALB, or move the `crm.force5.cloud` alias to the v2 distribution.
   - The BFF redirects `/` to `/crm/`.
   - Old Grails paths (`/security/signin`, `/dashboard`, …) end in the SPA's 404 page. Add a CloudFront Function redirect for them if bookmarks matter.
4. Keep the legacy environment deployable for **2 weeks** for rollback, then retire it (and its push-triggered pipeline).

**Mobile:** the production app's `EXPO_PUBLIC_API_URL` is `https://crm.force5.cloud/crm/api`, or the `crm-next` host during UAT.

---

## 4. Operating

```bash
# Run now, outside the schedule
aws codepipeline start-pipeline-execution --region us-east-1 --name crm-test-pipeline

# Pause scheduled deploys without deleting anything
aws cloudformation deploy --region us-east-1 --stack-name crm-v2-test-pipeline \
  --template-file infra/crm-pipeline.yaml --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides ScheduleState=DISABLED --no-execute-changeset   # review, then execute

# Roll back to the previous app version
aws elasticbeanstalk describe-application-versions --region us-east-1 --application-name crm-v2-test \
  --query 'ApplicationVersions[:5].[VersionLabel,DateCreated]'
aws elasticbeanstalk update-environment --region us-east-1 --environment-name crm-v2-test-env \
  --version-label <previous label>

# Logs: CloudWatch group /aws/elasticbeanstalk/crm-v2-test-env/var/log/web.stdout.log (pino JSON)
```

**Audit trail:** every mutating API call writes one structured audit line, with action, user, tenant, target id, result and request id, to the same log group. Retention is 365 days.

**Rotating `SESSION_SECRET`:** update the secret, then restart the app servers (`aws elasticbeanstalk restart-app-server`). This signs everyone out.

---

## 5. Configuration reference

| Setting | Where | Value |
|---|---|---|
| `APP_ENV` | EB property (template) | `staging` (test) / `production` (prod). Selects the pinned secret. |
| `NODE_ENV`, `BASE_PATH`, `LOG_LEVEL` | EB property (template) | `production`, `/crm`, `info` |
| `CRM_ALLOWED_ROLES` | EB property (template); the secret wins | `CRM_ADMIN,ROLE_ADMIN` (D1) |
| `PORT` | set by EB | 8080 |
| `WEB_DIST` | bundle `.env` (buildspec) | `web` |
| `TRUST_PROXY` | default | 3 (CloudFront → ALB → nginx) |
| `SESSION_SECRET`, `VMS_URL`, `KEYCLOAK_URL`, `REDIS_URL` | **Secrets Manager only** | see 1.2 |

Never put secrets in EB environment properties: they are readable in the console and in `describe-configuration-settings`.
