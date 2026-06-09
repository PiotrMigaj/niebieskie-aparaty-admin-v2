# Frontend Patterns

## Data Fetching

Use `useAsyncData` + `$fetch` with `{ lazy: true }` (no `server: false`). SSR populates the payload; the client hydrates immediately with no spinner flash. `lazy: true` keeps in-app navigation non-blocking.

```ts
const { data, status } = useAsyncData<User[]>(
  'users',
  () => $fetch<User[]>('/api/users'),
  { default: () => [], lazy: true },
)
```

Direct `useFetch` calls inside a page's `<script setup>` (no wrapper composable) are also fine.

**Never put `server: false` inside a wrapper composable.** The request silently does not fire on the initial SSR'd page load — only after F5 or in-app navigation. This applies to both `useFetch` and `useAsyncData` inside composables.

## Loading State Gate

Gate on `status !== 'success'`, NOT `status === 'pending'`. During SSR, `status` is `'idle'` — gating on `'pending'` renders the empty-data page and causes a flash before the client fetch starts.

```html
<template>
  <div v-if="status !== 'success'">
    <UIcon name="i-lucide-loader" class="animate-spin" />
  </div>
  <div v-else>
    <!-- full page content here -->
  </div>
</template>
```

Wrap the **entire** page in the success branch — don't leave headers or stats visible during load.

When using `{ lazy: true }` with error branches (no `server: false`), gate the spinner on `status !== 'success' && status !== 'error'`.

## Error Handling in Pages

Branch on `error?.statusCode === 404` for entity-not-found UI; fall through to a generic error alert otherwise.

```ts
const { data: user, status, error } = useAsyncData(...)
// In template:
// v-if="error?.statusCode === 404" → show not-found message
// v-else-if="error" → show generic alert
// v-else → show content
```

Do NOT set a truthy `default` (e.g. `default: () => []`) on endpoints that can 404 or return a single object — `data` stays the default and the not-found branch never fires.

## Composable Shape

Composables wrap data fetching and keep fetch logic out of pages and components. Naming: `useUser`, `useUsers`, `useEvents`.

```ts
// layers/user/app/composables/useUsers.ts
export function useUsers() {
  const { data: users, status } = useAsyncData<User[]>(
    'users',
    () => $fetch<User[]>('/api/users'),
    { default: () => [], lazy: true },
  )
  return { users, status }
}
```

Return `{ data, status }` (and optional mutation methods like `addUser`). Keep the `useAsyncData` key unique and stable (string literal, not dynamic unless needed for per-entity caching).

**Optional relation loading** — to support `?include=<relation>`, accept `options?: { include?: '<relation>' }` and forward via the `query` option in `useFetch`:

```ts
useFetch<Entity>(`/api/entity/${id}`, {
  lazy: true,
  query: options?.include ? { include: options.include } : undefined,
})
```

Reference implementation: `useUser` in `layers/user/app/composables/useUser.ts`.

## UModal Pattern

Wrap trigger + modal in a single self-contained component. Reference implementation: `layers/user/app/components/AddUser.vue`.

```html
<template>
  <UModal v-model:open="open">
    <!-- default slot: the trigger element -->
    <UButton @click="open = true">Add User</UButton>

    <template #body>
      <!-- form content -->
    </template>

    <template #footer>
      <!-- action buttons -->
      <UButton @click="onSubmit">Save</UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const open = ref(false)
</script>
```

The × close button is built-in — no extra config. Bind `v-model:open` to a local `ref<boolean>`.

## UTable Columns

Use `h()` with `resolveComponent()` for custom cell rendering. Hoist `resolveComponent` calls to the top of `<script setup>` — calling them inside cell functions causes runtime warnings.

```ts
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

const UDropdownMenu = resolveComponent('UDropdownMenu')
const UButton = resolveComponent('UButton')

const columns: TableColumn<User>[] = [
  {
    key: 'actions',
    cell: ({ row }) => h(UDropdownMenu, { ... }),
  },
]
```

`Nuxt UI` types (`TableColumn`, etc.) need explicit `import ... from '@nuxt/ui'` — they are not auto-imported.

Global filter: bind with `v-model:global-filter="filterRef"` on `<UTable>`.

## Design System

- **Fonts:** Cormorant (serif, branding) + Montserrat (sans, body/UI) — loaded from Google Fonts in `layers/base/app/assets/css/main.css`
- **Tokens:** Colors, radius, shadows live in the `@theme` block in that file
- **Aesthetic:** White/black, minimal, high-contrast
- Use `.font-cormorant` utility class for Cormorant text
- Always prefer Nuxt UI components (`UButton`, `UIcon`, `UInput`, `UAlert`, etc.) over plain HTML elements
- Icons use the Lucide set: `i-lucide-search`, `i-lucide-eye`, `i-lucide-ellipsis`, etc.
- Reference project for visual style: `../niebieskie-aparaty-app`

## Nuxt UI Notes

- `<UApp>` must wrap the root in `app/app.vue` to provide toast/modal context
- `ui: { colorMode: false, fonts: false }` is set in `layers/base/nuxt.config.ts` — Nuxt UI's own fonts and dark-mode toggle are disabled
- All UI copy is in English — no Polish strings in templates or component code ("Niebieskie Aparaty" is the only exception — it's the brand name)

## File uploads

- `fetch` does not expose upload progress — use `XMLHttpRequest` and `xhr.upload.onprogress` when you need a progress UI.
- Browser-side S3 multipart uploads require the bucket's CORS to include `ExposeHeaders: ["ETag"]`, otherwise the JS can't read per-part ETags and `CompleteMultipartUpload` will reject.
