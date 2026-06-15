# Client App — DynamoDB Single-Table Migration Guidelines

> Paste this file into the client app repo (e.g. as `CLAUDE.md` or `docs/dynamodb-migration.md`). It is the contract between the new admin-side single-table schema and the username/password-authenticated client app that serves galleries and selections to logged-in users.

---

## Context

The client app currently reads from the **old multi-table** DynamoDB schema (separate `Users`, `Events`, `Galleries`, `GalleryItems`, `Selections`, `SelectionItems`, `Files` tables, joined in code).

The admin app (`niebieskie-aparaty-admin-v2`) has migrated to a **single-table design** in the table `niebieskie-aparaty-prod`. The client app must be refactored to read from the new schema. The schema is **the canonical source of truth** — do not re-introduce old table names, do not add SK conventions that diverge from those defined here.

The client app uses **username + password authentication**. After login, `username` is always known (from session/JWT) and is the partition key for every read. There is **no token-based public access** in this app — the `TenantGallery` entity (`PK = TOKEN#<tokenId>`) exists in the table but is consumed by a *different* future app, not this one. Ignore it here.

---

## Table

- **Name:** `niebieskie-aparaty-prod`
- **PK / SK:** both `String`
- **GSIs:** `GSI1` (entity listing), `GSI2` (token inverted index by eventId — not used by this app)
- **Region:** `eu-central-1`
- **No Scan operations** anywhere. If you reach for `Scan`, you are using a wrong access pattern.

---

## Client access flow

The user logs in with username + password. From that point on, every read partitions on `PK = USER#<username>`.

### Step 1 — List the user's events
```ts
Query({
  TableName: 'niebieskie-aparaty-prod',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `USER#${username}`,
    ':prefix': 'EVENT#',
  },
})
// → list of Event records for this user
```

### Step 2 — Get one event's metadata
```ts
GetItem({
  TableName: 'niebieskie-aparaty-prod',
  Key: { PK: `USER#${username}`, SK: `EVENT#${eventId}` },
})
// → { eventId, username, title, date, description, galleryAvailable, selectionAvailable, imagePlaceholderObjectKey, createdAt }
```

Use `galleryAvailable` / `selectionAvailable` as feature gates for which tabs the client UI shows.

### Step 3a — List gallery items (if `galleryAvailable`)
```ts
Query({
  TableName: 'niebieskie-aparaty-prod',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `USER#${username}`,
    ':prefix': `GALLERY_ITEM#${eventId}#`,
  },
})
// → list of GalleryItem records
```

If the client also needs the gallery header (counters, `isUploaded`):
```ts
GetItem({ Key: { PK: `USER#${username}`, SK: `GALLERY#${eventId}` } })
```

### Step 3b — Read the selection (if `selectionAvailable`)
```ts
// Selection header (metadata, max count, blocked flag)
GetItem({ Key: { PK: `USER#${username}`, SK: `SELECTION#${eventId}` } })

// Selection items
Query({
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `USER#${username}`,
    ':prefix': `SELECTION_ITEM#${eventId}#`,
  },
})
```

### Step 4 — Toggle a selection item (the only client write)
```ts
UpdateItem({
  Key: {
    PK: `USER#${username}`,
    SK: `SELECTION_ITEM#${eventId}#${imageName}`,
  },
  UpdateExpression: 'SET selected = :s',
  ExpressionAttributeValues: { ':s': true /* or false */ },
  ConditionExpression: 'attribute_exists(PK)',
})
```

Before allowing a toggle to `true`, read the parent `Selection` row and enforce:
- `blocked === false` (photographer has not frozen edits)
- counted selected items `< maxNumberOfPhotos` (if your UX caps it client-side; the source of truth is the Selection header)

Use the parent Selection's `selectedNumberOfPhotos` for display; it is maintained by the server. Do **not** store a `selectedImages: string[]` list on Selection — that attribute was removed in the new design (would risk 400 KB item-size limit).

---

## Entity shapes (new schema)

Only the entities the client app actually touches. Full reference: `single-table-design.md` in the admin repo. `TenantGallery` is intentionally omitted — it is not consumed by this app.

### Event — `PK = USER#<username>` / `SK = EVENT#<eventId>`
```json
{
  "eventId": "...",
  "username": "...",
  "title": "Sesja ciążowa",
  "date": "2026-04-29",
  "description": null,
  "galleryAvailable": true,
  "selectionAvailable": false,
  "imagePlaceholderObjectKey": "zuza_wojtek/.../okladka.jpg",
  "createdAt": "..."
}
```
> `tokenId`, `tokenIdCreatedAt`, `tokenIdValidDays` were **removed** from Event — they now live on the TenantGallery entity which this app does not read.

### Gallery (header, 1:1 per event) — `SK = GALLERY#<eventId>`
```json
{
  "galleryId": "...",
  "eventId": "...",
  "username": "...",
  "eventTitle": "Sesja plenerowa",
  "isUploaded": false,
  "totalPhotos": null,
  "processedSuccessPhotos": 0,
  "processedFailedPhotos": 0,
  "finalizeEnqueued": false,
  "uploadStartedAt": "...",
  "uploadCompletedAt": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```
> Counters are maintained by the upload pipeline. The client can use `isUploaded` to show "still processing" UI if needed.

### GalleryItem — `SK = GALLERY_ITEM#<eventId>#<imageName>`
```json
{
  "eventId": "...",
  "username": "...",
  "imageName": "IMG_6225",
  "originalFileName": "IMG_6225.JPG",
  "originalObjectKey": "oaza_2025/.../original/IMG_6225.JPG",
  "webpObjectKey":     "oaza_2025/.../compressed/IMG_6225.webp",
  "width": 2500,
  "height": 3750,
  "compressedSize": 1843211,
  "status": "processed",
  "failureReason": null,
  "processedAt": "..."
}
```
> **Display:** sign and serve `webpObjectKey` (compressed WebP).
> **Download original:** sign and serve `originalObjectKey` — originals are kept permanently, no transient bucket.
> **`status === 'failed'`** items are present so the UI can show "12 of 1500 failed" — filter them out of the visible grid unless you want to expose that.
> **No `presignedUrlTimestamp` / no stored URL** — generate signed URLs on demand (see CloudFront section).

### Selection — `SK = SELECTION#<eventId>`
```json
{
  "selectionId": "...",
  "eventId": "...",
  "username": "...",
  "eventTitle": "...",
  "blocked": false,
  "maxNumberOfPhotos": 100,
  "selectedNumberOfPhotos": 147,
  "createdAt": "...",
  "updatedAt": "..."
}
```
> **Removed in the new design:** `isUploaded`, `totalPhotos`, `processedSuccessPhotos`, `processedFailedPhotos`, `finalizeEnqueued`, `uploadStartedAt`, `uploadCompletedAt`, `selectedImages[]`. Do not read or write any of these on Selection — they no longer exist.

### SelectionItem — `SK = SELECTION_ITEM#<eventId>#<imageName>`
```json
{
  "selectionId": "...",
  "eventId": "...",
  "username": "...",
  "imageName": "IMG_3588",
  "objectKey": "sm_zajac/.../selection/IMG_3588.jpg",
  "imageWidth": 1496,
  "imageHeight": 2244,
  "selected": false,
  "presignedUrlTimestamp": "..."
}
```
> Display: sign and serve `objectKey`. `presignedUrlTimestamp` is a legacy attribute — do not rely on it; generate signed URLs on demand.

---

## CloudFront signed URLs (replaces ad-hoc S3 presigning)

**Do not store presigned URLs in DynamoDB.** They expire. The new pattern: store only the `objectKey` and sign on demand at request time, via **CloudFront signed URLs** (not S3 presigned URLs).

Two distributions exist, one per bucket:

| Bucket | Used for | Distribution serves |
|:---|:---|:---|
| `niebieskie-aparaty-client-gallery` | Selection items, files, event cover (`imagePlaceholderObjectKey`) | All `objectKey` values that start with `<username>/<eventId>/selection/`, `<username>/<eventId>/files/`, and event cover keys |
| `niebieskie-aparaty-gallery-images` | Gallery items (`originalObjectKey`, `webpObjectKey`) | All `<username>/<eventId>/original/...` and `<username>/<eventId>/compressed/...` |

### Signing code (server-side only)

```ts
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'

const signedUrl = getSignedUrl({
  url: `https://${CLOUDFRONT_DOMAIN}/${objectKey}`,
  keyPairId: CLOUDFRONT_KEY_PAIR_ID,
  privateKey: CLOUDFRONT_PRIVATE_KEY_PEM,
  dateLessThan: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
})
```

Rules:
- **Sign on the server, never in the browser** — the private key must never leave the server.
- The **cache key is the URL path only**. Query params (`Expires`, `Signature`, `Key-Pair-Id`) are NOT part of the key. This is why the admin app injects a versioned `-<8hex>` suffix into filenames on every re-upload. Treat `objectKey` as already-versioned; do not strip the suffix.
- Choose a signed-URL TTL that comfortably exceeds page-view length but is short enough that a revoked share cannot be replayed forever (1h is a reasonable default for image fetches; longer for big originals being downloaded).
- Multi-line private key in `.env`: wrap in double quotes so dotenv expands `\n`. Convert PEM with `awk 'NF {printf "%s\\n", $0}' key.pem`. On Lambda, read from SSM Parameter Store SecureString and cache module-scope.
- **Lambda Node 22 does NOT ship `@aws-sdk/cloudfront-signer`** — bundle it. If you use a blanket `External: ['@aws-sdk/*']` in esbuild settings, tighten to explicit `@aws-sdk/client-*` only.

---

## What NOT to do

- ❌ `Scan` on any table or index. Single-table design eliminates every Scan.
- ❌ Store presigned URLs or signed URLs on items in DynamoDB.
- ❌ Read `selectedImages[]` off the Selection row — it no longer exists.
- ❌ Read upload-pipeline attributes off the Selection row (`isUploaded`, `totalPhotos`, counters, `finalizeEnqueued`, timestamps) — removed 2026-06-11 when uploads moved client-side.
- ❌ Read `tokenId` / `tokenIdCreatedAt` / `tokenIdValidDays` off the Event row — moved to TenantGallery (which this app does not read).
- ❌ Read the `TenantGallery` entity (`PK = TOKEN#...`) at all from this app — it belongs to a different future app.
- ❌ Mutate any GalleryItem / SelectionItem attribute from the client app other than `SelectionItem.selected`.
- ❌ Use `originalObjectKey` for thumbnails or the grid — it is multi-megabyte. Use `webpObjectKey` for display.
- ❌ Hardcode bucket names in the client app — derive the CloudFront domain by `objectKey` prefix instead.
- ❌ Re-introduce table-per-entity reads. Every read goes against the single `niebieskie-aparaty-prod` table.
- ❌ Trust `username` from anywhere other than the authenticated session — never accept it from a query param or request body for a read.

---

## Old schema → new schema attribute map

| Old (multi-table) | New (single-table) |
|:---|:---|
| `Users` table, `username` PK | `PK = USER#<username>`, `SK = #PROFILE` |
| `Events` table, `eventId` PK | `PK = USER#<username>`, `SK = EVENT#<eventId>` |
| `Events.tokenId`, `tokenIdCreatedAt`, `tokenIdValidDays` | Moved to TenantGallery (`PK = TOKEN#<tokenId>`) — **not used by this app** |
| `Galleries` *(new)* | `PK = USER#<username>`, `SK = GALLERY#<eventId>` (header) |
| `GalleryItems` table, `eventId + fileName` | `SK = GALLERY_ITEM#<eventId>#<imageName>`; attributes restructured: `originalFileName`, `originalObjectKey`, `webpObjectKey`, `width`, `height`, `compressedSize`, `status`, `failureReason`, `processedAt` |
| `Selections` table, `selectionId` PK | `SK = SELECTION#<eventId>`; `selectionId` demoted to plain attribute; `selectedImages[]` removed; upload-pipeline attributes removed |
| `SelectionItems` table, `selectionId + imageName` | `SK = SELECTION_ITEM#<eventId>#<imageName>` |
| `Files` table, `fileId` PK | `SK = FILE#<eventId>#<fileId>` |

When you encounter old code reading by `selectionId` or `eventId` as a top-level PK: rewrite to `PK = USER#<username>` + the corresponding `SK` prefix. The `username` is always available — it comes from the authenticated session.

---

## Code-organization advice for the refactor

1. **Centralize key builders.** A single `keys.ts` module with `userPk(u)`, `eventSk(id)`, `galleryItemSk(eventId, imageName)`, `selectionItemSk(eventId, imageName)`, etc. Never inline `` `USER#${u}` `` at call sites — typos become silent zero-result queries.
2. **One repository per entity**, same shape as the admin app (`eventRepository`, `galleryRepository`, `galleryItemRepository`, `selectionRepository`, `selectionItemRepository`). Repository methods return domain types — never leak `PK`/`SK`/`GSI*` to callers.
3. **A `signObjectKey(objectKey)` helper** that picks the right CloudFront distribution based on the key prefix (`*/original/*` and `*/compressed/*` → gallery distribution; everything else → client-gallery distribution). Callers pass `objectKey` only.
4. **Map at the edge.** Resolve `objectKey → signedUrl` in the API handler that serializes the response, not in the DB layer and not in the browser.
5. **`username` comes from session only.** All repository methods take `username` as their first argument; the API layer pulls it from the authenticated session before calling.

---

## Verification checklist

- [ ] Every read uses `PK = USER#<username>` where `username` is sourced from the authenticated session.
- [ ] No code path reads `PK = TOKEN#...` — that partition belongs to a different app.
- [ ] No Scan in the codebase: `grep -rE "new Scan|ScanCommand"` returns nothing.
- [ ] No string `selectedImages` referenced anywhere in client code.
- [ ] No presigned/signed URL is stored in DynamoDB — every signing call has a fresh `dateLessThan`.
- [ ] Gallery grid uses `webpObjectKey`; download link uses `originalObjectKey`.
- [ ] Selection toggle hits only `SELECTION_ITEM#<eventId>#<imageName>`; the parent Selection row is read but not written by the client app.
- [ ] CloudFront signing private key is loaded from a secret store (SSM SecureString or equivalent), never committed.
