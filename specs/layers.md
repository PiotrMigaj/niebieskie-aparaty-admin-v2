# Layer Architecture

## Overview

Feature code lives in `layers/` as self-contained Nuxt layers. All layers under `~/layers/*` are auto-discovered — no `extends` entry in the root `nuxt.config.ts` is needed. Run `pnpm nuxi prepare` after adding or removing a layer.

## Layer Inventory

| Layer | Owns | Key exports |
|-------|------|-------------|
| **base** | Root layout, navbar, footer, DynamoDB client, S3 client, request logger | `getDynamoDb()`, `TABLE_NAME`, all DynamoDB command classes, `sleep()` |
| **auth** | `nuxt-auth-utils` registration | `useUserSession()` (app-wide), `hashPassword`, `verifyPassword`, `passwordNeedsReHash` (server-wide) |
| **user** | User CRUD API, user list + detail pages, AddUser modal | `userRepository`, `User` type, `CreateUserSchema` |
| **event** | Event CRUD API, event detail page | `eventRepository`, `Event` type, `CreateEventSchema`; `useEvent(username, eventId)` → `{ event, status, error, refresh, createEvent }` |
| **file**  | File (downloadable asset) CRUD API | `fileRepository`, `File` type, `CreateFileSchema` |
| **selection** | Selection creation (single-shot upload + DB write, no AWS pipeline), client-pick flow API + pages | `selectionRepository`, `selectionItemRepository`, `Selection` / `SelectionItem` types, `CreateSelectionSchema` |
| **gallery** | Gallery upload pipeline (Nuxt half), gallery detail page, `CreateGallery` modal | `galleryRepository`, `galleryItemRepository`, `Gallery` / `GalleryItem` types, `CreateGallerySchema`, `tryEnqueueFinalizeGallery`; `useGallery(username, eventId)` |

## File Structure per Layer

```
layers/<name>/
  app/
    components/       # auto-imported Vue components
    composables/      # auto-imported composables
    pages/            # file-based routes (merged with other layers)
    assets/           # CSS, images (base layer only)
    layouts/          # layout components (base layer only)
  server/
    api/              # H3 route handlers
    repository/       # DynamoDB repository classes
    middleware/       # server middleware (base layer only)
    utils/            # server-only utilities (NOT auto-imported globally)
  shared/
    utils/            # auto-imported in both server and app code
    types.ts          # NOT auto-imported — always import explicitly
    schemas.ts        # Zod validation schemas (shared client/server)
  nuxt.config.ts      # layer-specific Nuxt config
```

## Cross-Layer Imports

Use the `#layers/<name>/*` alias for any cross-layer import of non-auto-imported code:

```ts
// Good — alias resolves correctly
import { userRepository } from '#layers/user/server/repository/userRepository'
import type { User } from '#layers/user/shared/types'

// Bad — relative paths across layers won't resolve
import { userRepository } from '../../layers/user/server/repository/userRepository'
```

Auto-imports (composables, components, `shared/utils/` exports) are available globally without any import statement. Only use `#layers/...` for things that are NOT auto-imported (repositories, explicit types, server utilities).

## Nested Pages Across Layers

If one layer has `pages/foo/[id].vue` and another has `pages/foo/[id]/bar.vue`, Nuxt treats `[id].vue` as a parent route and the child only renders via `<NuxtPage />` inside it.

**Fix:** Use `pages/foo/[id]/index.vue` (sibling) instead of `pages/foo/[id].vue` (parent).

## Adding a New Layer

1. Create `layers/<name>/nuxt.config.ts` (minimal: `export default defineNuxtConfig({})`)
2. Create subdirectories as needed (`app/pages/`, `server/api/`, etc.)
3. Run `pnpm nuxi prepare` to regenerate `.nuxt/` types
4. Add to this table above

**Add to an existing layer** when the feature is a small extension of that domain (e.g. a new endpoint for the user entity belongs in `layers/user`).

**Create a new layer** when the feature is a distinct domain with its own entities, pages, and API routes (e.g. `layers/selection`, `layers/gallery`).
