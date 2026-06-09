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

## TypeScript gotchas

`layers/*/shared/utils/` files are compiled under the shared tsconfig (`"types": []`). Node.js built-ins (`node:crypto`, `node:util`, `Buffer`) are NOT available there. Keep server-only code in `server/utils/` or avoid Node built-ins in shared utils.

Types from `layers/*/shared/types.ts` are NOT auto-imported — always import them explicitly (e.g. `import type { User } from '../../../shared/types'`).

The `Event` type in `layers/event/shared/types/types.ts` clashes with the DOM global `Event`. In Vue components, alias it: `import type { Event as AppEvent } from '#layers/event/shared/types/types'` and cast return values through `unknown`: `result as unknown as AppEvent`.

Event layer shared files are nested one level deeper than other layers: `layers/event/shared/types/types.ts` and `layers/event/shared/types/schemas.ts` (not `shared/types.ts` / `shared/schemas.ts`).

Server API handlers in `layers/<name>/server/api/<entity>/` are 3 levels from `shared/` — use `../../../shared/schemas`. Handlers nested one level deeper (e.g., `[username]/handler.ts` or `[username]/[id]/handler.ts`) need one extra `../` per level of nesting.

HTML void elements must not be self-closed: write `<input>` and `<img>`, not `<input/>` or `<img/>` — the Nuxt ESLint config flags self-closing void elements as warnings.

## S3 commands

S3 commands are re-exported from `layers/base/server/utils/s3.ts` for auto-import in server code (same pattern as DynamoDB commands). Currently exported: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, multipart commands. Add new commands there before using them in handlers.

## UTable row-action modal pattern

When a modal is triggered from a UTable cell (where the trigger lives in a `h()` renderer), control it externally: `const rowToDelete = ref<Entity | null>(null); const open = ref(false); watch(rowToDelete, v => { if (v) open.value = true })`. Render `<DeleteFoo v-if="rowToDelete" v-model:open="open" :item="rowToDelete" @deleted="rowToDelete = null" />` below the table. The component uses `defineModel<boolean>('open')` instead of a local `ref`.

## API conventions

Optional relation loading: use `?include=<relation>` query param to embed related entities. Example: `GET /api/users/:username?include=events` spreads `events` onto the returned object. Gate with `getQuery(event).include === '<relation>'` and fetch lazily — never fetch relations by default.

## Database

DynamoDB single-table design. Table name: `niebieskie-aparaty-prod`.

**When working on anything DB-related (repositories, entities, access patterns, GSIs, migrations) — always read `dynamodb-desing/single-table-design.md` first.**

- Multi-tenant: `username` is the tenant key (always known from JWT/session)
- PK pattern: `USER#<username>` for all user-owned entities; `TOKEN#<tokenId>` for public client gallery access
- Entities: User, Event, GalleryItem, Selection, SelectionItem, File, TenantGallery
- GSI1: list all users (`ENTITY#USER`); GSI2: look up TenantGallery by eventId (`EVENT#<eventId>`)
- GSI `IndexName` strings match the field prefix exactly: `'GSI1'`, `'GSI2'`.
