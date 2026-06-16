# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@specs/layers.md
@specs/backend.md
@specs/frontend.md

## Project

Admin panel (v2) for "Niebieskie Aparaty" (Blue Cameras) — a photography-related service. Built with Nuxt 4 + Vue 3 + TypeScript, using pnpm.

## Commands

```bash
pnpm dev          # Start dev server (script prefixes `TMPDIR=/tmp` — required on macOS, keeps vite-node Unix socket path under the 103-char limit)
pnpm build        # Build for production
pnpm generate     # Static site generation
pnpm preview      # Preview production build
pnpm nuxi prepare # Regenerate .nuxt/ types — run after changing nuxt.config.ts or adding layers
pnpm nuxi typecheck # TypeScript check
```

## Lint scope

`pnpm lint` runs over the whole repo and surfaces ~70 errors from `selection-serverless/.aws-sam/build/**/*.js` (bundled artifacts of the retired SAM stack — not source code). When checking lint impact of your diff, scope it: `pnpm eslint <file1> <file2> ...`. Don't try to "fix" the SAM build noise; the folder is historical.

## Architecture

This is a **Nuxt 4** project. The key structural difference from Nuxt 3: application code lives under `app/` rather than at the project root.

- `app/app.vue` — root component; current structure: `<UApp><NuxtLayout><NuxtPage /></NuxtLayout></UApp>`
- `app/pages/` — file-based routing (create this directory to enable the router)
- `app/components/` — auto-imported components
- `app/composables/` — auto-imported composables
- `app/layouts/` — layout components
- `server/` — Nitro server routes and API handlers (create at root level, not under `app/`)
- `nuxt.config.ts` — Nuxt configuration
- `public/` — static assets served as-is
- `specs/` — design pattern specs loaded above via `@` imports
- `dynamodb-desing/` — DynamoDB schema and access pattern docs

Auto-imports are enabled by default: components, composables, and Vue APIs (`ref`, `computed`, etc.) do not need explicit imports.

## Auth

`nuxt-auth-utils` is installed. `hashPassword`, `verifyPassword`, `passwordNeedsReHash` are global server auto-imports — call them directly in any `server/` file, no import needed.
Do NOT export a function named `hashPassword` from `layers/*/shared/utils/` — it would shadow the nuxt-auth-utils global.
`nuxt-auth-utils` is registered in `layers/auth/nuxt.config.ts`. `useUserSession()` is available in all app code when the auth layer is loaded.
`nuxt-auth-utils` reserves `/api/_auth/*` for its internal session endpoint (`GET /api/_auth/session`, called by `useUserSession().fetch()` and on hydration). `/api/_auth/*` is automatically public because the auth middleware uses an allowlist (see "Auth gating on server handlers" below) — it is NOT in `PROTECTED_PATHS`, so no explicit exclusion is needed. Use `/api/auth/*` (no underscore) for your own auth routes — that's where `login.post.ts` lives.

## Vite pre-bundling for layer deps

Third-party deps imported from `layers/*/shared/` (e.g. `zod` in `shared/types/schemas.ts`) are discovered at runtime and trigger a Vite "new dependencies at runtime" warning + page reload on first request. Add them to `vite.optimizeDeps.include` in `nuxt.config.ts`. Currently included: `zod`.

## Nuxt UI auto-import shadowing

Nuxt UI auto-imports composables that may collide with custom names. Confirmed collisions:
- `useFileUpload` — owned by Nuxt UI's file-upload primitives. Use a different name (e.g. `useMultipartUpload`) for upload composables.

## Layer shared/ exports must be uniquely named across layers

Symbols exported from `layers/*/shared/types/schemas.ts` (and `shared/utils/`) are auto-imported globally by Nuxt. If two layers export the same name (e.g. `UploadUrlsSchema` in both selection and gallery), Nuxt silently keeps one and prints `Duplicated imports "X" ... has been ignored`. Handlers that import via explicit relative path keep working; any code that relies on the global auto-import gets the wrong layer's symbol. Prefix domain-generic names with the layer (`SelectionUploadUrlsSchema`, `GalleryUploadUrlsSchema`).

## TypeScript gotchas

`layers/*/shared/utils/` files are compiled under the shared tsconfig (`"types": []`). Node.js built-ins (`node:crypto`, `node:util`, `Buffer`) are NOT available there. Keep server-only code in `server/utils/` or avoid Node built-ins in shared utils.

Types from `layers/*/shared/types.ts` are NOT auto-imported — always import them explicitly (e.g. `import type { User } from '../../../shared/types'`).

The `Event` type in `layers/event/shared/types/types.ts` clashes with the DOM global `Event`. In Vue components, alias it: `import type { Event as AppEvent } from '#layers/event/shared/types/types'` and cast return values through `unknown`: `result as unknown as AppEvent`.

Event layer shared files are nested one level deeper than other layers: `layers/event/shared/types/types.ts` and `layers/event/shared/types/schemas.ts` (not `shared/types.ts` / `shared/schemas.ts`). The selection and gallery layers follow the same pattern: `layers/selection/shared/types/types.ts`, `layers/gallery/shared/types/types.ts`, etc.

Server API handlers in `layers/<name>/server/api/<entity>/` are 3 levels from `shared/` — use `../../../shared/schemas`. Handlers nested one level deeper (e.g., `[username]/handler.ts` or `[username]/[id]/handler.ts`) need one extra `../` per level of nesting.

After adding a new layer, `#layers/<name>/*` alias imports will show `Cannot find module` TS errors until `pnpm nuxi prepare` is run — this is expected, not a real error.

HTML void elements must not be self-closed: write `<input>` and `<img>`, not `<input/>` or `<img/>` — the Nuxt ESLint config flags self-closing void elements as warnings.

## Nuxt runtimeConfig env var mapping

Nuxt maps `runtimeConfig` keys to env vars by uppercasing and inserting `_` at every camelCase boundary, then prefixing `NUXT_`. So `cloudFrontDomain` → `NUXT_CLOUD_FRONT_DOMAIN`, `uploadBucketName` → `NUXT_UPLOAD_BUCKET_NAME`. Mind every capital letter when writing `.env`.

Multi-line values (PEMs, certs) in `.env` must be wrapped in double quotes — only then does dotenv expand `\n` into real newlines. Convert a PEM file with `awk 'NF {printf "%s\\n", $0}' key.pem` and paste the output between double quotes.

## Zod version

This project uses **Zod v4** (`^4.4.3`). The `invalid_type_error` / `required_error` constructor options from Zod v3 do not exist — use `.message` on the individual validators instead (e.g. `z.string().min(1, { message: '...' })`).

## S3 commands

S3 commands are re-exported from `layers/base/server/utils/s3.ts` for auto-import in server code (same pattern as DynamoDB commands). Currently exported: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `DeleteObjectsCommand`, `ListObjectsV2Command`, multipart commands. Add new commands there before using them in handlers.

## S3 prefix deletion

For wiping an entire S3 "folder" (e.g. `${username}/${eventId}/selection/` on selection delete): paginate `ListObjectsV2Command` via `ContinuationToken` / `IsTruncated`, then issue one `DeleteObjectsCommand` per page (`Delete.Objects` accepts up to 1000 keys — the same cap as one `ListObjectsV2` page). Idempotent on retry: a second run lists nothing. Reference: `layers/selection/server/api/selections/[username]/[eventId].delete.ts`.

## Auth gating on server handlers

`layers/auth/server/middleware/requireAuth.ts` uses an **allowlist model** (Spring Security filter-chain style): only paths in `PROTECTED_PATHS` require a session — everything else is public by default. Current protected prefixes: `/api/users`, `/api/events`, `/api/galleries`, `/api/selections`, `/api/files`. New handlers in these prefixes are automatically protected. When adding a new business-domain API layer, add its `/api/<domain>` prefix to `PROTECTED_PATHS`. Public endpoints (login, health checks, webhooks) need no changes. The session payload only proves "the single admin is logged in"; per-row ownership is moot here because the app is single-tenant.

## UAuthForm provider color

`color: 'white'` is not a valid `ButtonProps` color in this project's Nuxt UI version — use `color: 'neutral'` for white-style provider buttons (e.g. Google sign-in).

## UAlert close callback

`:close="{ onClick: () => x = null }"` — assignment expressions return the assigned value; TypeScript rejects this because the callback must return `void`. Use a block body: `:close="{ onClick: () => { x = null } }"`.

## UInput trailing slot for clickable icons

For a clickable trailing element (e.g. password visibility toggle), use `<template #trailing>` with a `<button>` — the `trailing-icon` prop + `@click:trailing` event approach is unreliable in Nuxt UI v3. Example: `layers/auth/app/pages/login.vue`.

## UTable row-action modal pattern

When a modal is triggered from a UTable cell (where the trigger lives in a `h()` renderer), control it externally: `const rowToDelete = ref<Entity | null>(null); const open = ref(false); watch(rowToDelete, v => { if (v) open.value = true })`. Render `<DeleteFoo v-if="rowToDelete" v-model:open="open" :item="rowToDelete" @deleted="rowToDelete = null" />` below the table. The component uses `defineModel<boolean>('open')` instead of a local `ref`.

## API conventions

Optional relation loading: use `?include=<relation>` query param to embed related entities. Example: `GET /api/users/:username?include=events` spreads `events` onto the returned object. Gate with `getQuery(event).include === '<relation>'` and fetch lazily — never fetch relations by default.

## Server-derived object keys

Never accept S3 `objectKey` from the client in write endpoints — it's an IDOR (an authenticated user can write rows pointing into another user's bucket prefix). Derive `objectKey` server-side from URL params + filename. When a presign endpoint and a later write endpoint both compute the same key, extract the derivation into a single `shared/utils/` helper so they can't drift. Reference: `layers/selection/shared/utils/selectionKey.ts` is shared by `upload-urls.post.ts` and `index.post.ts`.

**Exception for non-deterministic key parts** (e.g. versioned filenames): the presign endpoint generates the randomness, returns the resulting `imageName` to the client, and the persist endpoint accepts `imageName` back. IDOR-safe because the prefix is still derived from authenticated path params (`username`/`eventId`) and the schema regex-validates `imageName` against `[\w.-]+`. Reference: selection `upload-urls.post.ts` → `index.post.ts`.

## CloudFront cache key = URL path only

Both distributions use the AWS-managed `CachingOptimized` policy, which keys cache entries on the URL path only — signed-URL query params (`Expires`, `Signature`, `Key-Pair-Id`) are NOT in the cache key. Consequence: deleting an S3 object and re-uploading new bytes at the same key serves stale content from CloudFront edges for up to ~24h.

Mitigation is **manual CloudFront invalidation**, triggered by the photographer via per-event "Invalidate cache" buttons on the event detail page. Each button POSTs to a small endpoint that issues a single wildcard `CreateInvalidation`:

- Selection: `POST /api/selections/{username}/{eventId}/invalidate-cache` → invalidates `/{username}/{eventId}/selection/*` on the selection distribution.
- Gallery: `POST /api/galleries/{username}/{eventId}/invalidate-cache` → invalidates `/{username}/{eventId}/*` (covers `original/` + `compressed/`) on the gallery distribution.

Helper: `invalidatePaths(distributionId, paths)` in `layers/base/server/utils/cloudFront.ts` (auto-imported in server code). Distribution IDs come from runtimeConfig: `cloudFrontDistributionId` (selection) and `galleryCloudFrontDistributionId` (gallery) — env `NUXT_CLOUD_FRONT_DISTRIBUTION_ID` / `NUXT_GALLERY_CLOUD_FRONT_DISTRIBUTION_ID`.

**Filenames are NOT versioned.** Earlier code injected an 8-char hex suffix in the presign handlers; that has been removed (`layers/selection/shared/utils/selectionKey.ts` no longer exports `injectVersion`, and the gallery presign handler no longer has the inline `injectGalleryVersion`). Re-uploading the same filename to the same key after delete relies on the photographer pressing the invalidation button before re-upload (propagation takes ~5–15 min). Old DDB rows with `-<hex>` filenames keep working — their stored `objectKey` / `cloudFrontUrl` are self-contained.

## CloudFront CORS

Both distributions use a CloudFront Function on **viewer-response** (`AddCorsHeaderFunction` in `cloudfront-serverless/template.yaml`) that unconditionally stamps `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, HEAD`, `Access-Control-Expose-Headers: ETag` and deletes `Vary` on every response. **Do NOT replace this with Managed-SimpleCORS Response Headers Policy** — empirically that policy didn't apply consistently to browser MISS responses (cache-poisoning when an `<img>` without `crossorigin` populates the cache slot first). A viewer-response Function runs unconditionally per request so it's immune to that failure mode. Reference: https://aws.amazon.com/blogs/networking-and-content-delivery/cors-configuration-through-amazon-cloudfront/.

Both S3 buckets (`niebieskie-aparaty-client-gallery`, `niebieskie-aparaty-gallery-images`) allow `GET, HEAD` from all 4 client/admin origins (`localhost:3333`, `localhost:4500`, `app.niebieskie-aparaty.pl`, `admin2.niebieskie-aparaty.pl`) in their bucket CORS rules. S3 auto-emits `Access-Control-Allow-Credentials: true` when bucket CORS is configured — invalid with `ACAO: *` for credentialed fetches. Client uses `credentials: 'omit'` so it's fine; if you ever flip to `include`, strip ACAC inside the Function.

After changing the Function or distribution config, a wildcard invalidation is required to evict pre-change entries. Verify server-side with `curl -sI -H 'Origin: http://localhost:3333' '<url>' | grep -i access-control`.

## CloudFront Free pricing plan constraints

Both distributions have auto-attached Web ACLs (`CreatedByCloudFront-*` ARNs) from a CloudFront Security Savings Bundle subscription, encoded as `WebACLId` parameters in `cloudfront-serverless/template.yaml`. The Free plan blocks three template patterns: (1) custom `AWS::CloudFront::CachePolicy` resources (use Managed-CachingOptimized `658327ea-...` instead), (2) explicit `PriceClass` (omit; it's forced to `PriceClass_All`), (3) removing `WebACLId` on update. Deployment errors mentioning "Free pricing plan" or "can't remove web ACL" mean one of these was violated. Probe live state with `aws cloudfront get-distribution-config --id <id>` before debugging — deployed config may have drifted from what the template last described.

## DynamoDB batch + transaction limits

`BatchWriteCommand` accepts max 25 PutRequests/table per call — chunk in JS. `TransactWriteCommand` accepts max 100 items total. For "write N children + create parent + flip sibling flag" atomically when N can exceed ~99: BatchWrite the children first, then one 2-item `TransactWriteCommand` for the parent (`Put` guarded by `attribute_not_exists(PK)`) + the sibling `Update`. Crash window between BatchWrite and TransactWrite leaves orphan children but no parent — retry overwrites them. Reference: `layers/selection/server/api/selections/index.post.ts`.

## Upload-pipeline progress polling

For the gallery upload pipeline (`totalPhotos`-then-Lambdas pattern), the detail page should poll the GET endpoint only while `totalPhotos != null && !isUploaded`. Gating on `!isUploaded` alone polls forever on idle pre-upload pages (the row exists with `totalPhotos=null` from creation until the browser calls `finalize-upload`). Reference: `isProcessing` computed in `layers/gallery/app/pages/users/[username]/events/[eventId]/gallery/index.vue`. The **selection** flow no longer uses this pattern — see "Serverless (SAM)" below.

## Serverless (SAM)

`gallery-serverless/` is a SAM project sibling to `layers/` (NOT part of the Nuxt build). It runs the gallery upload pipeline (Lambdas, SQS, the dedicated gallery bucket `niebieskie-aparaty-gallery-images` — **originals kept permanently**, EventBridge wildcard-filtered to `*/original/*` so the compressed-WebP PUT cannot re-trigger).

`selection-serverless/` exists in the repo but is **retired** — the selection upload pipeline was superseded (2026-06-11) when the photographer moved compression + watermarking client-side. The stack has been shut down via AWS SAM; the folder is kept as historical reference (don't deploy it, don't extend it). The current selection flow lives entirely in `layers/selection/` and is described in `selection-knowledge/architecture.md` §0 and `selection-knowledge/how-it-works.md` §0.

- Build & deploy (gallery): `pnpm build && sam deploy` (from `gallery-serverless/`). `pnpm build` wraps `sam build` with `npm_config_cpu=arm64 npm_config_os=linux npm_config_libc=glibc` so npm installs sharp's Linux arm64 binary on a macOS host — required because Lambda runs Linux arm64.
- The Lambdas write to the same DynamoDB table (`niebieskie-aparaty-prod`) using the same PK/SK shapes as the Nuxt repositories.
- Each `AWS::Serverless::Function` has a `Metadata: BuildMethod: esbuild` block with `External: [sharp, '@aws-sdk/*']`. No separate esbuild config file.
- **External deps need a Lambda Layer, not just `External:` in BuildProperties.** SAM's `nodejs-npm-esbuild` builder produces only the bundled JS — it does NOT ship `node_modules` for anything listed in `External`. Native modules like `sharp` must be packaged as an `AWS::Serverless::LayerVersion` and attached via `Layers:` on the function.
- **Lambda Layer with `BuildMethod: nodejs22.x`**: `ContentUri` must point to a dir whose root contains `package.json` (NOT `nodejs/package.json`). SAM wraps it as `/opt/nodejs/node_modules/...` itself.
- **Shared modules + CodeUri**: if multiple handlers import from a common `src/shared/` folder, set `CodeUri: src/` for every function and use `EntryPoints: [<handler-dir>/handler.ts]` + `Handler: <handler-dir>/handler.handler`. SAM only copies the `CodeUri` directory into its esbuild build context — `CodeUri: src/process-image/` would make `../shared/` unresolvable.
- **`sam deploy --parameter-overrides` does NOT support `file://`** (aws-cli does, SAM doesn't) AND tokenizes on whitespace, so a multi-line value injected via `$(cat …)` gets split into bogus extra params. For multi-line parameters (PEMs, certs), inline them as a `Default: |` block scalar in `template.yaml` and run `sam deploy` with no overrides. Reference: `cloudfront-serverless/template.yaml` (PublicKeyPem parameter).
- **`sam logs -n <name>`** expects the LOGICAL CloudFormation resource ID (e.g. `ProcessImageFunction`), not the `FunctionName` property value (e.g. `gallery-process-image`). `sam logs --tail` with no `-n` tails every function in the stack.
- **Lambda Node 22 runtime ships `@aws-sdk/client-*` but NOT `@aws-sdk/cloudfront-signer`.** The blanket `External: ['@aws-sdk/*']` in SAM `BuildProperties` excludes both — signing fails at cold start with `Cannot find module '@aws-sdk/cloudfront-signer'`. Tighten the External list to explicit `@aws-sdk/client-*` entries so signer/utility packages get bundled. Reference: `gallery-serverless/template.yaml` (ProcessImageFunction.Metadata.BuildProperties.External).
- **Multi-line Lambda secrets (PEMs, private keys)**: use SSM Parameter Store SecureString. `aws ssm put-parameter --type SecureString --value file://key.pem` accepts multi-line input (unlike `sam deploy --parameter-overrides`). Lambda reads via `@aws-sdk/client-ssm` at cold start and caches in module-scope. Reference: `gallery-serverless/src/shared/sign.ts`.

### Gallery completion gate — DO NOT remove either path

Same invariant for the gallery pipeline. Both `gallery-serverless/src/process-image/handler.ts` AND `layers/gallery/server/api/galleries/[username]/[eventId]/finalize-upload.post.ts` MUST call `tryEnqueueFinalizeGallery`. The conditional `finalizeEnqueued` flip is on the Gallery row (`SK = GALLERY#<eventId>`). Keep `gallery-serverless/src/shared/completion.ts` and `layers/gallery/server/utils/tryEnqueueFinalizeGallery.ts` in sync.

## AWS CloudFormation stack names

The deployed stack names don't match the local directory names. Use the ones below with `aws cloudformation describe-stacks --region eu-central-1 --stack-name <name>`:
- `cloudfront-serverless/` → stack **`niebieskie-aparaty-cloudfront`** (outputs include `DistributionId`, `GalleryDistributionId`, `PublicKeyId`)
- `gallery-serverless/` → stack **`niebieskie-aparaty-gallery`**

## AWS account

- Region: `eu-central-1`
- **Two S3 buckets, not one** (originals kept permanently in both):
  - `niebieskie-aparaty-client-gallery` → `uploadBucketName` (env `NUXT_UPLOAD_BUCKET_NAME`). Used by **selection**, **file**, and **event cover** uploads. Keys: `<username>/<eventId>/selection|files|...`.
  - `niebieskie-aparaty-gallery-images` → `galleryUploadBucketName` (env `NUXT_GALLERY_UPLOAD_BUCKET_NAME`). Used by the **gallery** upload pipeline (Nuxt presign + SAM Lambdas). Keys: `<username>/<eventId>/original/...` and `<username>/<eventId>/compressed/...`.
- DynamoDB table: `niebieskie-aparaty-prod`
- **Lambda account concurrency limit is 10** (default new-account quota). `ReservedConcurrentExecutions` cannot be set on any function — it would drop UnreservedConcurrentExecutions below the required minimum of 10. Request a quota increase before re-introducing reserved concurrency.
- `AWS::EarlyValidation::ResourceExistenceCheck` deploy failures mean a named resource (S3 bucket, SQS queue, Lambda, etc.) already exists outside the stack — probe with `aws s3api head-bucket` / `aws sqs get-queue-url` / `aws lambda get-function` before re-running.

## Database

DynamoDB single-table design. Table name: `niebieskie-aparaty-prod`.

**When working on anything DB-related (repositories, entities, access patterns, GSIs, migrations) — always read `dynamodb-desing/single-table-design.md` first.**

- Multi-tenant: `username` is the tenant key (always known from JWT/session)
- PK pattern: `USER#<username>` for all user-owned entities; `TOKEN#<tokenId>` for public client gallery access
- Entities: User, Event, Gallery, GalleryItem, Selection, SelectionItem, File, TenantGallery
- GSI1: **overloaded entity-listing index** — one partition per entity type (`ENTITY#USER` for users, `ENTITY#SELECTION` for selections with `GSI1SK = USER#<u>#EVENT#<e>`). When a new global "list all X" access pattern is needed (Gallery/File/Event), add `GSI1PK = ENTITY#<TYPE>` to that entity's writes — do NOT create a new GSI. The listings never collide because each lives in its own GSI partition. Reference: `dynamodb-desing/single-table-design.md` GSI1 section.
- GSI2: look up TenantGallery by eventId (`EVENT#<eventId>`)
- GSI `IndexName` strings match the field prefix exactly: `'GSI1'`, `'GSI2'`.
- A separate Electron desktop app (not this repo) is planned to read DynamoDB directly across tenants — it motivates the global listing patterns on GSI1. This Nuxt app itself never lists entities globally; all its queries start from a known `username`.
- **DynamoDB `ConditionExpression` does NOT support arithmetic (`+`, `-`).** Comparisons take only paths or values, no expressions. To compare derived quantities (e.g. `success + failed === total`), do the arithmetic in JS using `ReturnValues: 'ALL_NEW'` from the prior atomic `UpdateCommand`, then issue a follow-up conditional UpdateItem that only guards a flag (`attribute_not_exists(x) OR x = :false`). Pattern: `gallery-serverless/src/shared/completion.ts` and `layers/gallery/server/utils/tryEnqueueFinalizeGallery.ts`.
