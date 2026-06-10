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

## Zod version

This project uses **Zod v4** (`^4.4.3`). The `invalid_type_error` / `required_error` constructor options from Zod v3 do not exist — use `.message` on the individual validators instead (e.g. `z.string().min(1, { message: '...' })`).

## S3 commands

S3 commands are re-exported from `layers/base/server/utils/s3.ts` for auto-import in server code (same pattern as DynamoDB commands). Currently exported: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, multipart commands. Add new commands there before using them in handlers.

## UAlert close callback

`:close="{ onClick: () => x = null }"` — assignment expressions return the assigned value; TypeScript rejects this because the callback must return `void`. Use a block body: `:close="{ onClick: () => { x = null } }"`.

## UTable row-action modal pattern

When a modal is triggered from a UTable cell (where the trigger lives in a `h()` renderer), control it externally: `const rowToDelete = ref<Entity | null>(null); const open = ref(false); watch(rowToDelete, v => { if (v) open.value = true })`. Render `<DeleteFoo v-if="rowToDelete" v-model:open="open" :item="rowToDelete" @deleted="rowToDelete = null" />` below the table. The component uses `defineModel<boolean>('open')` instead of a local `ref`.

## API conventions

Optional relation loading: use `?include=<relation>` query param to embed related entities. Example: `GET /api/users/:username?include=events` spreads `events` onto the returned object. Gate with `getQuery(event).include === '<relation>'` and fetch lazily — never fetch relations by default.

## Upload-pipeline progress polling

For selection / gallery / any pipeline that follows the same `totalPhotos`-then-Lambdas pattern, the detail page should poll the GET endpoint only while `totalPhotos != null && !isUploaded`. Gating on `!isUploaded` alone polls forever on idle pre-upload pages (the row exists with `totalPhotos=null` from creation until the browser calls `finalize-upload`). Reference: `isProcessing` computed in `layers/gallery/app/pages/users/[username]/events/[eventId]/gallery/index.vue`.

## Serverless (SAM)

`selection-serverless/` and `gallery-serverless/` are SAM projects sibling to `layers/` (NOT part of the Nuxt build). `selection-serverless/` runs the selection upload pipeline (Lambdas, SQS, transient S3 bucket — originals deleted after compression). `gallery-serverless/` runs the gallery upload pipeline (Lambdas, SQS, shared S3 bucket — **originals kept permanently**, EventBridge wildcard-filtered to `*/original/*` so the compressed-WebP PUT cannot re-trigger). See `selection-knowledge/architecture.md` for the design that both projects share.

- Build & deploy: `pnpm build && sam deploy` (from `selection-serverless/`). `pnpm build` wraps `sam build` with `npm_config_cpu=arm64 npm_config_os=linux npm_config_libc=glibc` so npm installs sharp's Linux arm64 binary on a macOS host — required because Lambda runs Linux arm64.
- The Lambdas write to the same DynamoDB table (`niebieskie-aparaty-prod`) using the same PK/SK shapes as the Nuxt repositories. The race-safe completion gate logic is duplicated in `selection-serverless/src/shared/completion.ts` and `layers/selection/server/utils/tryEnqueueFinalize.ts` — keep them in sync.
- Each `AWS::Serverless::Function` has a `Metadata: BuildMethod: esbuild` block with `External: [sharp, '@aws-sdk/*']`. No separate esbuild config file.
- **External deps need a Lambda Layer, not just `External:` in BuildProperties.** SAM's `nodejs-npm-esbuild` builder produces only the bundled JS — it does NOT ship `node_modules` for anything listed in `External`. Native modules like `sharp` must be packaged as an `AWS::Serverless::LayerVersion` (see `SharpLayer` in `selection-serverless/template.yaml`) and attached via `Layers:` on the function.
- **Lambda Layer with `BuildMethod: nodejs22.x`**: `ContentUri` must point to a dir whose root contains `package.json` (NOT `nodejs/package.json`). SAM wraps it as `/opt/nodejs/node_modules/...` itself. Reference: `selection-serverless/layers/sharp/package.json`.
- **Shared modules + CodeUri**: if multiple handlers import from a common `src/shared/` folder, set `CodeUri: src/` for every function and use `EntryPoints: [<handler-dir>/handler.ts]` + `Handler: <handler-dir>/handler.handler`. SAM only copies the `CodeUri` directory into its esbuild build context — `CodeUri: src/process-image/` would make `../shared/` unresolvable.

### Selection completion gate — DO NOT remove either path

Both `selection-serverless/src/process-image/handler.ts` AND `layers/selection/server/api/selections/[username]/[eventId]/finalize-upload.post.ts` MUST call `tryEnqueueFinalize` — neither alone is sufficient. The Lambda is the last to attempt finalize when `totalPhotos` was written before all images finished; the HTTP endpoint is the last to attempt finalize when all images drained before the browser finished uploading and sent the totals. The conditional `finalizeEnqueued` flip on the Selection row ensures exactly one of them wins. Reasoning is in `selection-knowledge/architecture.md` §6.

### Gallery completion gate — DO NOT remove either path

Same invariant for the gallery pipeline. Both `gallery-serverless/src/process-image/handler.ts` AND `layers/gallery/server/api/galleries/[username]/[eventId]/finalize-upload.post.ts` MUST call `tryEnqueueFinalizeGallery`. The conditional `finalizeEnqueued` flip is on the Gallery row (`SK = GALLERY#<eventId>`). Keep `gallery-serverless/src/shared/completion.ts` and `layers/gallery/server/utils/tryEnqueueFinalizeGallery.ts` in sync.

## AWS account

- Region: `eu-central-1`
- Main upload bucket (permanent, shared across gallery/cover/files/selection): `niebieskie-aparaty-client-gallery`
- DynamoDB table: `niebieskie-aparaty-prod`
- **Lambda account concurrency limit is 10** (default new-account quota). `ReservedConcurrentExecutions` cannot be set on any function — it would drop UnreservedConcurrentExecutions below the required minimum of 10. Request a quota increase before re-introducing reserved concurrency.
- `AWS::EarlyValidation::ResourceExistenceCheck` deploy failures mean a named resource (S3 bucket, SQS queue, Lambda, etc.) already exists outside the stack — probe with `aws s3api head-bucket` / `aws sqs get-queue-url` / `aws lambda get-function` before re-running.

## Database

DynamoDB single-table design. Table name: `niebieskie-aparaty-prod`.

**When working on anything DB-related (repositories, entities, access patterns, GSIs, migrations) — always read `dynamodb-desing/single-table-design.md` first.**

- Multi-tenant: `username` is the tenant key (always known from JWT/session)
- PK pattern: `USER#<username>` for all user-owned entities; `TOKEN#<tokenId>` for public client gallery access
- Entities: User, Event, Gallery, GalleryItem, Selection, SelectionItem, File, TenantGallery
- GSI1: list all users (`ENTITY#USER`); GSI2: look up TenantGallery by eventId (`EVENT#<eventId>`)
- GSI `IndexName` strings match the field prefix exactly: `'GSI1'`, `'GSI2'`.
- **DynamoDB `ConditionExpression` does NOT support arithmetic (`+`, `-`).** Comparisons take only paths or values, no expressions. To compare derived quantities (e.g. `success + failed === total`), do the arithmetic in JS using `ReturnValues: 'ALL_NEW'` from the prior atomic `UpdateCommand`, then issue a follow-up conditional UpdateItem that only guards a flag (`attribute_not_exists(x) OR x = :false`). Pattern: `selection-serverless/src/shared/completion.ts` and `layers/selection/server/utils/tryEnqueueFinalize.ts`.
