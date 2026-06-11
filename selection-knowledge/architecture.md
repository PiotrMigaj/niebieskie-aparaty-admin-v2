# Selection Upload Pipeline — Architecture

> **Current flow (in use, 2026-06-11):** simplified — photographer compresses + watermarks images on their machine, uploads compressed files directly to the main bucket, server writes all DB rows in one shot. See §0 below.
> **Sections §1 onward are historical** — they describe the original distributed Lambda pipeline that was superseded once the photographer moved compression + watermarking client-side. Kept for context (explains why `selection-serverless/` exists).

---

## 0. Current flow (simplified)

### Overview

The photographer compresses and watermarks each image locally before uploading. The admin panel just shuttles already-final bytes into the main upload bucket and records DB rows. No AWS-side image processing, no transient bucket, no SQS queues, no completion gate, no progress polling.

```
┌─────────────────┐  1. open CreateSelection modal                ┌──────────────────┐
│  Nuxt browser   │                                                │  Nuxt server     │
│  (photographer) │  2. POST /api/selections/:u/:e/upload-urls    │                  │
│                 │ ──────────────────────────────────────────────▶│  presigned PUTs  │
│                 │◀───────────────────────────────────────────────│  (1 per file)    │
│                 │                                                 │                  │
│                 │  3. PUT each file directly to S3 (XHR + progress)                 │
│                 │ ──────────────────────────────────────────────▶  niebieskie-aparaty-client-gallery
│                 │                                                   {u}/{e}/selection/{name}
│                 │                                                 │                  │
│                 │  4. POST /api/selections with items[] + maxPhotos                 │
│                 │ ──────────────────────────────────────────────▶│  BatchWrite      │
│                 │                                                 │   SelectionItems │
│                 │                                                 │  TransactWrite:  │
│                 │                                                 │   Put Selection  │
│                 │                                                 │   Set Event.     │
│                 │                                                 │   selectionAvail │
│                 │◀───────────────────────────────────────────────│   = true         │
│                 │                                                 └──────────────────┘
└─────────────────┘
```

### Sequence

| # | Actor | Action |
|---|-------|--------|
| 1 | Browser | Photographer opens "Create selection" modal, picks `maxNumberOfPhotos`, drag-drops the already-compressed-and-watermarked files. |
| 2 | Browser → Nuxt server | `POST /api/selections/:username/:eventId/upload-urls` with `{ files: [{ filename, contentType, size }] }`. Server returns `[{ filename, url, objectKey }]` — presigned PUT URLs (TTL 15 min) targeting `niebieskie-aparaty-client-gallery/{username}/{eventId}/selection/<safeName>`. No DB writes at this step; the Selection does not exist yet. |
| 3 | Browser → S3 | 4-worker XHR concurrency pool. `xhr.upload.onprogress` drives a per-file + overall progress bar. Browser also reads pixel dimensions via `new Image()` for each file. |
| 4 | Browser → Nuxt server | `POST /api/selections` with `{ username, eventId, eventTitle, maxNumberOfPhotos, items: [{ imageName, objectKey, imageWidth, imageHeight }] }`. Server (a) `BatchWrite`s all `SELECTION_ITEM` rows (chunked at 25 — DynamoDB's BatchWrite limit), then (b) one `TransactWrite` does `Put SELECTION` (with `attribute_not_exists(PK)` to block duplicates) + `Update EVENT.selectionAvailable = true`. |
| 5 | Browser | On success, navigates to the selection detail page. Done — no polling needed. |

### Data model

Selection (slim):
- `selectionId`, `eventId`, `username`, `eventTitle`, `blocked`, `maxNumberOfPhotos`, `selectedNumberOfPhotos`, `createdAt`, `updatedAt`.
- **Dropped** (relative to §3 below): `isUploaded`, `totalPhotos`, `processedSuccessPhotos`, `processedFailedPhotos`, `finalizeEnqueued`, `uploadStartedAt`, `uploadCompletedAt`.

SelectionItem (per uploaded image):
- `imageName`, `selectionId`, `eventId`, `username`, `objectKey`, `imageWidth`, `imageHeight`, `selected: false`.

### Failure handling

- **One file's PUT fails** — modal surfaces "N files failed", the user removes them or retries. The `POST /api/selections` call is gated on zero failures, so a partial set is never persisted.
- **Browser closes mid-upload** — S3 objects may be left behind under `{username}/{eventId}/selection/`. No Selection row exists, so a fresh attempt is unaffected. Stale objects are orphaned (no lifecycle rule on the main bucket — same as gallery's behavior).
- **DB write race** — the `attribute_not_exists(PK)` guard on the Selection `Put` inside the transaction returns 409 if a second request reaches the transaction at the same time as the first.
- **Crash between BatchWrite and TransactWrite** — orphan `SELECTION_ITEM` rows can exist without a parent `SELECTION`. The user retries from the browser; the second attempt re-uploads the files (overwrites in S3), re-BatchWrites the items (idempotent: same SK overwrites same row), and succeeds at the transaction. Acceptable because the orphans don't affect any other access pattern.

### AWS components

| Component | Purpose | Notes |
|---|---|---|
| **S3: `niebieskie-aparaty-client-gallery`** (existing main bucket) | Permanent store for the compressed+watermarked WebP/JPEG files | Same bucket already used by gallery/cover/files. CORS must allow PUT from admin origin (already configured). |
| **DynamoDB**: `niebieskie-aparaty-prod` | Selection + SelectionItem rows | Unchanged keys (`SK = SELECTION#<eventId>` and `SK = SELECTION_ITEM#<eventId>#<imageName>`). |

No SQS queues, no Lambdas, no EventBridge rules, no transient bucket, no DLQs, no CloudWatch alarms — all of that lived in `selection-serverless/`, which is shut down via SAM. The folder is kept in the repo for historical reference.

---

> **Status (historical sections below):** original distributed-pipeline design, **superseded** by §0 above. Original status line: design doc, not yet implemented. Supersedes `gemini-proposal.md` (kept for reference).
> Scope: photographer uploads 1–2k raw photos per event; system stores, compresses to WebP, indexes in DynamoDB, and flips `Event.selectionAvailable = true` when the whole batch is done.

## 1. Overview

The Nuxt admin server must stay out of the data path for image bytes. Photographers upload originals (≤20MB each) directly to S3 via presigned PUT URLs. S3 emits ObjectCreated events into SQS; a Lambda compresses each image to WebP, writes a `SelectionItem` row, and atomically increments counters on the `Selection` row. When success+failed counts equal the finalized total, a second Lambda runs the transactional close-out: `Selection.isUploaded = true` and `Event.selectionAvailable = true`.

Three principles drove the design:

1. **Server-bypass** for uploads — no 20MB blobs through the Nuxt event loop.
2. **At-least-once + idempotent** — SQS may redeliver; DynamoDB conditional writes absorb duplicates without double-counting.
3. **Exactly-once finalization** — a `finalizeEnqueued` BOOL gates the close-out so neither a Lambda nor the HTTP `finalize-upload` endpoint can trigger it twice under a race.

```
┌─────────────────┐   1. POST /api/selections          ┌──────────────────┐
│  Nuxt browser   │ ──────────────────────────────────▶│  Nuxt server     │
│  (photographer) │                                     │  (Selection      │
└─────────────────┘                                     │   repository)    │
        │                                               └────────┬─────────┘
        │ 2. POST /api/selections/:eventId/upload-urls           │
        │    (returns N presigned PUT URLs)                      │ writes Selection
        │◀───────────────────────────────────────────────────────┘ (isUploaded=false)
        │
        │ 3. Promise-pool, concurrency=4
        │    PUT each file directly to S3 (XHR + onprogress)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ S3 bucket: niebieskie-aparaty-selection-original-images               │
│   {username}/{eventId}/{filename}                                     │
│   ─ Bucket-wide lifecycle rule: auto-delete objects >24h              │
│   ─ EventBridge → ProcessingQueue (s3:ObjectCreated:*, bucket-wide)   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────┐
                  │  SQS: ProcessingQueue    │
                  │  ─ Visibility 5 min      │
                  │  ─ maxReceiveCount 3     │
                  │  ─ DLQ: ProcessingDLQ    │
                  └──────────────┬───────────┘
                                 │ batch size 1, reserved concurrency
                                 ▼
                  ┌──────────────────────────────────────┐
                  │  Lambda: process-selection-image     │
                  │  ─ sharp → WebP                      │
                  │  ─ PUT WebP to main bucket           │
                  │  ─ Idempotent PUT SelectionItem      │
                  │  ─ Atomic ADD on Selection counters  │
                  │  ─ If last → enqueue FinalizeQueue   │
                  │  ─ Delete original from originals    │
                  └──────────────┬───────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────┐
                  │  SQS: FinalizeQueue      │
                  │  ─ DLQ: FinalizeDLQ      │
                  └──────────────┬───────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────────┐
                  │  Lambda: finalize-selection          │
                  │  ─ Sweep originals bucket prefix     │
                  │    {username}/{eventId}/ (defensive) │
                  │  ─ TransactWrite:                    │
                  │      Event.selectionAvailable=true   │
                  │      Selection.isUploaded=true       │
                  └──────────────────────────────────────┘
```

S3 paths:

```
niebieskie-aparaty-selection-original-images        # NEW, transient, ≤24h bucket-wide lifecycle
  {username}/{eventId}/{filename}

<main bucket — existing uploadBucketName>           # permanent, shared with gallery/cover/files
  {username}/{eventId}/selection/{imageName}.webp
```

---

## 2. Sequence walkthrough

| # | Actor | Action |
|---|-------|--------|
| 1 | Browser → Nuxt server | `POST /api/selections` `{ eventId, maxNumberOfPhotos }` — creates the Selection row with `isUploaded=false`, `totalPhotos=null`, counters=0. `Event.selectionAvailable` stays `false`. |
| 2 | Browser → Nuxt server | `POST /api/selections/:eventId/upload-urls` with the list of N file descriptors (filename, size, contentType). Server returns N presigned PUT URLs (TTL 15 min, locked to the exact object key). |
| 3 | Browser → S3 | Promise-pool with concurrency 4: each upload uses XHR so `xhr.upload.onprogress` can drive a progress bar. Failures are tracked locally; client retries the file or marks it failed. |
| 4 | Browser → Nuxt server | When the pool drains: `POST /api/selections/:eventId/finalize-upload` `{ totalPhotos: <successful count> }`. Server `UpdateItem` writes `Selection.totalPhotos` and re-runs the completion check (it may already be ready — see §6). |
| 5 | S3 → SQS → Lambda | Each PUT in step 3 emits an ObjectCreated event into ProcessingQueue. `process-selection-image` Lambda compresses, writes `SelectionItem`, atomically increments `processedSuccessPhotos` (or `processedFailedPhotos` on terminal failure), then runs the completion check. |
| 6 | Lambda → SQS → Lambda | The caller (Lambda or finalize endpoint) that observes `success + failed === totalPhotos` and wins the conditional update of `finalizeEnqueued` enqueues exactly one FinalizeQueue message. `finalize-selection` Lambda runs the transactional close-out. |

After step 6, the photographer's UI (which polls `GET /api/selections/:eventId`) sees `isUploaded=true` and `Event.selectionAvailable=true`.

---

## 3. Data model changes

### Selection (extend existing `dynamodb-desing/single-table-design.md`)

`PK = USER#<username>`, `SK = SELECTION#<eventId>`. New attributes:

| Attribute | Type | Written by | Notes |
|---|---|---|---|
| `isUploaded` | BOOL | created `false`; flipped `true` by finalize Lambda | The user-facing "is the selection ready" flag |
| `totalPhotos` | N (null until step 4) | `finalize-upload` endpoint | The anchor; comparison target |
| `processedSuccessPhotos` | N (default 0) | per-image Lambda, atomic `ADD :one` | |
| `processedFailedPhotos` | N (default 0) | per-image Lambda on terminal failure | |
| `finalizeEnqueued` | BOOL (default `false`) | whichever caller wins the gate update | See §6 |
| `uploadStartedAt` | S (ISO) | create endpoint | |
| `uploadCompletedAt` | S (ISO) | finalize Lambda | |

`maxNumberOfPhotos` and `selectedNumberOfPhotos` are **unchanged** — they govern the downstream client-pick flow ("how many shots may the client mark `selected = true`"), not upload progress. Conflating them would break that flow.

### SelectionItem (extend existing)

`PK = USER#<username>`, `SK = SELECTION_ITEM#<eventId>#<imageName>` where `imageName` is the original filename without extension. New attributes layered on the schema already in the design doc:

| Attribute | Type | Notes |
|---|---|---|
| `originalFileName` | S | e.g. `IMG_3588.CR2` |
| `webpObjectKey` | S | `{username}/{eventId}/selection/IMG_3588.webp` |
| `width` | N | from `sharp.metadata()` |
| `height` | N | from `sharp.metadata()` |
| `compressedSize` | N | bytes |
| `processedAt` | S (ISO) | |
| `status` | S | `'processed'` or `'failed'` — failed rows still exist so the UI can show "12 of 1500 failed" |
| `failureReason` | S | optional, only on `failed` |

The existing `selected` boolean is **untouched** and stays at its default for the later client-pick flow.

---

## 4. AWS components

| Component | Purpose | Key config |
|---|---|---|
| **S3: `niebieskie-aparaty-selection-original-images`** (NEW, dedicated) | Transient store for originals during processing | EventBridge ON; **bucket-wide lifecycle rule** `ExpirationInDays: 1` (no prefix filter needed — whole bucket is transient); CORS: PUT from admin origin; `ExposeHeaders: ["ETag"]` (carry-over from existing file layer); no public access |
| **S3: existing `uploadBucketName`** (reused) | Permanent store — WebPs land alongside galleries, covers, files | No change to existing config. Selection WebPs use key prefix `{username}/{eventId}/selection/` to avoid collision with gallery items at `{username}/{eventId}/...` |
| **SQS: ProcessingQueue** | Per-image work queue | Visibility 5 min, `maxReceiveCount: 3`, DLQ `ProcessingDLQ` |
| **SQS: FinalizeQueue** | Close-out work queue | Visibility 1 min, DLQ `FinalizeDLQ` |
| **EventBridge rule** | S3 ObjectCreated:* on the originals bucket (bucket-wide) → ProcessingQueue | No prefix filter — the bucket is dedicated to selection originals, so every ObjectCreated event is in-scope |
| **Lambda: process-selection-image** | Node 22, arm64, 2048 MB, 60s timeout, reserved concurrency e.g. 20 | sharp via container build or layer |
| **Lambda: finalize-selection** | Node 22, arm64, 512 MB, 30s timeout | Idempotent — DLQ redelivery is safe (transactional write either passes or is a no-op against already-flipped flags) |
| **DynamoDB** | Existing `niebieskie-aparaty-prod` | No table change — same single-table design |
| **IAM** | Per-function least-privilege | **process-image**: `s3:GetObject` + `s3:DeleteObject` on originals bucket; `s3:PutObject` on main bucket scoped to `*/selection/*`; `dynamodb:UpdateItem/PutItem` on table; `sqs:SendMessage` FinalizeQueue. **finalize**: `s3:ListBucket` + `s3:DeleteObject` on originals bucket; `dynamodb:TransactWriteItems` on table. |

The Nuxt server gets one new IAM permission: `s3:PutObject` on `niebieskie-aparaty-selection-original-images/*` (for presigned URL generation). Its existing IAM on `uploadBucketName` is unchanged.

---

## 5. Lambda: `process-selection-image`

**Trigger:** ProcessingQueue, batch size 1. Reserved concurrency caps DynamoDB write pressure (see §11).

```
1. Parse SQS body → S3 event → bucket, key
   (bucket will always be niebieskie-aparaty-selection-original-images)
2. Parse key: {username}/{eventId}/{originalFileName}
   imageName = originalFileName.replace(/\.[^.]+$/, '')
3. GetObject from originals bucket → Buffer
4. const img = sharp(buffer).rotate()
   const out = await img
       .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
       .webp({ quality: 92, effort: 6, smartSubsample: true })
       .toBuffer({ resolveWithObject: true })
   // Quality 92 is visually transparent against the already-compressed JPEG source
   // (each re-encode loses something; q≥90 keeps that loss invisible).
   // effort: 6 is sharp's slowest WebP encoder setting — gives the smallest file
   // at a chosen quality, costs ~2× CPU but Lambda is fine for it (60s timeout).
   // smartSubsample: true improves chroma fidelity on saturated colors.
5. PutObject to main bucket (existing uploadBucketName):
     Key: {username}/{eventId}/selection/{imageName}.webp
     ContentType: image/webp
6. Idempotent PutItem SelectionItem (ConditionExpression: attribute_not_exists(PK)).
   If ConditionalCheckFailedException → log "duplicate" → SKIP steps 7–8 → return success.
7. Atomic UpdateItem Selection (ReturnValues: ALL_NEW):
     UpdateExpression: ADD processedSuccessPhotos :one
   Then run the completion check (see §6) using the returned attributes.
8. DeleteObject on originals bucket (per-image cleanup; finalize Lambda also sweeps defensively; 24h lifecycle is the final safety net).
```

### Failure handling

| Failure | Path |
|---|---|
| Transient (S3 5xx, network, OOM) | Throw → SQS retries up to 3 → ProcessingDLQ. Operator inspects DLQ. |
| Permanent (corrupt image, unknown format, sharp `Input buffer contains unsupported image format`) | Caught inside Lambda. Write SelectionItem with `status='failed'`, `failureReason`. Atomic `ADD processedFailedPhotos :one`. Same completion check. Return success — message removed from queue. |
| Duplicate delivery (SQS at-least-once) | Step 6 conditional put fails → return success without bumping counters → no double count. |
| 24h orphan in Uploads | S3 lifecycle rule expires it. |

#### Error classification (transient vs permanent)

The Lambda inspects each thrown error to decide whether to swallow-and-record (permanent) or re-throw (transient). Recommended classification:

| Error source | Treated as | Rationale |
|---|---|---|
| Anything thrown by `sharp` (bad format, truncated, unsupported) | **Permanent** | Re-running won't change the input bytes |
| `s3:GetObject` → `NoSuchKey` | **Permanent** | File was deleted underneath us; nothing to retry |
| `s3:GetObject` / `s3:PutObject` → 5xx, throttling | **Transient** | Likely succeeds on retry |
| `dynamodb` → throttling, 5xx | **Transient** | Likely succeeds on retry |
| Lambda timeout / OOM | **Transient** (by default) | Invocation killed before any catch — SQS will redeliver. If a specific file consistently OOMs, it ends up in DLQ after 3 attempts, which is the right outcome. |
| Any uncaught exception | **Transient** (by default) | Safer to retry than silently lose; if it's actually permanent it lands in DLQ. |

#### Transient failures block finalization

If a message ends up in `ProcessingDLQ` after 3 attempts, **the counter never moves for that image**. The batch's `processedSuccessPhotos + processedFailedPhotos` stays below `totalPhotos` forever, so the completion gate in §6 never fires and `Event.selectionAvailable` is never flipped to `true`.

This is intentional — silent finalization with missing images would be worse. Recovery requires operator action:

- **Redrive the DLQ** (`aws sqs start-message-move-task` or the console "Start DLQ redrive" button) — sends messages back to `ProcessingQueue` for another attempt. Use this once the root cause (e.g. SDK regression, region-wide S3 incident) is resolved.
- **Manually mark as failed** — admin endpoint (future work) that writes the missing `SelectionItem`s with `status='failed'` and bumps `processedFailedPhotos` to close the gap.
- **Reset selection** — future "wipe and restart" admin action (see §12).

A CloudWatch alarm on DLQ depth makes this visible — see §10.

---

## 6. Completion handshake (race-safe)

The "we are done" gate has two possible triggers:

- A per-image Lambda finishes its counter increment.
- The HTTP `finalize-upload` endpoint writes `totalPhotos` (which may happen *after* all images already processed if the network was fast).

Both run the same `UpdateItem` against the Selection row, with a conditional gate:

```
UpdateExpression: SET finalizeEnqueued = :true
ConditionExpression:
    totalPhotos = processedSuccessPhotos + processedFailedPhotos
    AND (attribute_not_exists(finalizeEnqueued) OR finalizeEnqueued = :false)
ExpressionAttributeValues: { ':true': true, ':false': false }
ReturnValues: ALL_NEW
```

- Caller does an UpdateItem to bump its counter (Lambda) or write `totalPhotos` (endpoint).
- Then attempts the gate update above.
- If it succeeds, the caller sends exactly one message `{ username, eventId }` to FinalizeQueue.
- If `ConditionalCheckFailedException` fires, another caller already won (or the totals don't match yet); silently no-op.

DynamoDB does not let an UpdateItem reference one attribute's value in another attribute's value, so the equality is expressed via `ConditionExpression` literally as shown — DynamoDB evaluates the comparison atomically against the current item state. Implementation in TypeScript uses placeholders for all attribute names.

> Alternative considered & rejected: DynamoDB Streams + filter Lambda. Adds infra + a hop with no scale benefit at our volume.

---

## 7. Lambda: `finalize-selection`

**Trigger:** FinalizeQueue, batch size 1.

```
1. List & batch-delete leftover objects in the originals bucket under prefix
   {username}/{eventId}/
   (Defensive — per-image Lambda usually already deleted each one. The bucket-wide
    24h lifecycle is the final safety net even if this step fails.)
2. TransactWriteItems:
   a) UpdateItem Event   (PK=USER#<u>, SK=EVENT#<e>):
        SET selectionAvailable = :true
   b) UpdateItem Selection (PK=USER#<u>, SK=SELECTION#<e>):
        SET isUploaded = :true, uploadCompletedAt = :now
```

The transactional write is the only place these two flags flip, so the UI can rely on the invariant `Event.selectionAvailable === Selection.isUploaded` (eventually). Re-delivery from FinalizeDLQ is safe — both updates are idempotent SETs of `true`.

---

## 8. Frontend changes

### New layer: `layers/selection/`

Follows `specs/layers.md`. File-by-file responsibilities:

```
layers/selection/
  app/
    components/
      CreateSelectionModal.vue       # UModal with maxNumberOfPhotos field; POST /api/selections
      SelectionUploader.vue          # file picker, concurrency-4 pool, per-file + total progress
      SelectionProgress.vue          # live status badge: "1342 / 1500 processed (12 failed)"
    composables/
      useSelection.ts                # GET /api/selections/:eventId  (polls when !isUploaded)
      useSelectionUpload.ts          # the Promise-pool uploader
    pages/
      users/[username]/events/[eventId]/selection/index.vue   # selection details view
  server/
    api/
      selections/
        index.post.ts                          # create selection
        [eventId].get.ts                       # read selection + progress
        [eventId]/upload-urls.post.ts          # batch presigned PUT URLs
        [eventId]/finalize-upload.post.ts      # set totalPhotos, run completion check
    repository/
      selectionRepository.ts
      selectionItemRepository.ts
  shared/
    types.ts
    schemas.ts
  nuxt.config.ts
```

**Routing caveat** (per `specs/layers.md`, "Nested Pages Across Layers"): the event layer currently owns `layers/event/app/pages/users/[username]/events/[eventId].vue`. Adding `…/[eventId]/selection/index.vue` in another layer would make the event page a parent that needs `<NuxtPage />`. Fix during implementation: rename the event page to `…/events/[eventId]/index.vue`.

### Event details page change

In `layers/event/app/pages/users/[username]/events/[eventId].vue`, next to the existing Gallery/Selection availability badges, add a primary action:

- If `Selection` does not exist → `<CreateSelectionModal>` trigger button "Create selection".
- If it exists → link button "Open selection" → `/users/:username/events/:eventId/selection`.

The modal's `@created` handler navigates to the selection page.

### Upload concurrency pool

```ts
async function uploadPool(
  pairs: Array<{ file: File; url: string }>,
  concurrency = 4,
  onProgress: (delta: ProgressDelta) => void,
): Promise<{ ok: number; failed: { file: File; error: string }[] }> {
  let cursor = 0
  const failed: { file: File; error: string }[] = []
  let ok = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < pairs.length) {
      const idx = cursor++
      const { file, url } = pairs[idx]
      try {
        await xhrPut(url, file, onProgress)
        ok++
      } catch (e) {
        failed.push({ file, error: String(e) })
      }
    }
  })
  await Promise.all(workers)
  return { ok, failed }
}
```

`xhrPut` mirrors `putPart` from `layers/file/app/composables/useMultipartUpload.ts` (XHR + `xhr.upload.onprogress`). Aggregate `loaded` deltas across all in-flight uploads for a single overall progress bar plus per-file rows.

### Progress UI polling

Once uploads complete and `finalize-upload` returns, `useSelection` switches to polling `GET /api/selections/:eventId` every 2–3 seconds until `isUploaded === true`, then stops. Cheap (single GetItem) and avoids the complexity of WebSockets.

---

## 9. SAM project (`serverless/`)

Sibling to `layers/`. Self-contained TypeScript project, not part of the Nuxt build.

```
serverless/
  template.yaml              # SAM template (buckets, queues, EventBridge rule, lambdas, IAM)
  src/
    process-image/
      handler.ts             # the per-image Lambda
      sharp.ts               # thin wrapper around sharp config
    finalize-selection/
      handler.ts
    shared/
      dynamo.ts              # DocumentClient + helpers
      s3.ts                  # S3 client + key parsing
      keys.ts                # parseSelectionKey({username, eventId, imageName})
      completion.ts          # the gate UpdateItem in §6
  package.json               # @aws-sdk/client-s3, @aws-sdk/client-dynamodb,
                             # @aws-sdk/lib-dynamodb, @aws-sdk/client-sqs, sharp
  tsconfig.json
  esbuild.config.mjs         # bundles each handler; externalises sharp
  samconfig.toml             # stack name, region, capabilities
  README.md                  # build + deploy commands
```

### Build notes

- `sharp` ships native Linux binaries that must match the Lambda runtime architecture. Two acceptable paths:
  - `sam build --use-container` with the SAM-provided Node 22 image (simplest).
  - Use the published Sharp Lambda Layer for your region and exclude `sharp` from the bundle.
- Target architecture: `arm64` (cheaper + faster for sharp). Pin sharp's optional dep to the matching binary.
- esbuild config bundles per-handler with `platform: 'node'`, `format: 'cjs'`, `external: ['sharp', '@aws-sdk/*']`. The SDK is on the Lambda runtime; sharp comes from the layer or container build.

### Deploy

```
cd serverless
pnpm install
sam build --use-container
sam deploy --guided      # first time
sam deploy               # subsequent
```

The Nuxt app reads the resulting bucket names + queue ARNs from runtime config (env vars).

---

## 10. Resilience

| Risk | Mitigation |
|---|---|
| SQS at-least-once redelivery | Conditional PutItem on SelectionItem makes processing idempotent |
| Lambda crashes mid-image | Original still in Uploads bucket; SQS retries from S3 event; up to 3 attempts then DLQ |
| Sharp OOM on huge file | Lambda memory 2048 MB + 60s timeout; if still fails, message lands in DLQ |
| Photographer closes tab before `finalize-upload` lands | `Selection.isUploaded` stays `false`. Operator can re-call finalize, or admin can reset selection (future work). |
| Orphaned originals in the dedicated bucket | Bucket-wide 24h S3 lifecycle expires anything left behind; finalize Lambda sweeps the happy path. Bucket holds nothing else, so the rule is safe to apply to the whole bucket without prefix filters. |
| Two callers race to enqueue finalize | `finalizeEnqueued` BOOL + conditional update — only one wins (see §6) |
| Finalize Lambda redelivered from DLQ | Transactional SETs of `true` are idempotent |
| `Event.selectionAvailable` and `Selection.isUploaded` disagree | Both flipped inside a single `TransactWriteItems` |
| Transient failure puts message in DLQ → batch never finalizes (see §5) | **CloudWatch alarm on `ProcessingDLQ` `ApproximateNumberOfMessagesVisible > 0` for 1 datapoint in 5 min** → SNS topic → email. Operator redrives the DLQ once root cause is fixed. Mirror alarm on `FinalizeDLQ`. Defined in `template.yaml` as `AWS::CloudWatch::Alarm` resources next to each queue. |

---

## 11. Cost & scale notes

- **Compute**: Lambda + SQS are zero idle cost. WebP `effort: 6` at q=92 is ~2× slower than the original q=80 plan: budget ~5–8s per image. 1500 photos × ~6s @ 2GB ≈ 18 000 GB-s ≈ ~$0.30 per event. Still negligible.
- **Storage**: Originals live in the dedicated bucket for seconds (happy path) or up to 24h (worst case). Permanent storage in the main bucket is WebP only: at q=92 + 2500px long edge, expect ~1.5–3 MB per image (vs ~0.8 MB at the original q=80 target). 1500 images ≈ 2–4 GB per event. Trading storage for visual fidelity is the deliberate choice in this change.
- **DynamoDB hot item**: Counter updates target a single Selection row. Worst case 1500 photos × 20 concurrent Lambdas ≈ 75 UpdateItem/sec on one partition. DynamoDB's per-partition write ceiling is ~1000 wps — comfortable headroom. If we ever raise reserved concurrency above 100, revisit (sharded counters or DAX).
- **S3 request cost**: 1500 PUTs + 1500 GETs + 1500 DELETEs per event. Negligible.

---

## 12. Open questions / future work

- **Cancellation**: photographer closes the tab mid-upload. Today the Selection row is orphaned with `isUploaded=false`. Possible follow-up: a "reset selection" admin action that deletes all `SelectionItem`s + the WebPs + the Selection row.
- **Append uploads**: spec assumes one-shot. To add more photos later we'd need an `append-upload` flow that re-opens the Selection (`isUploaded=false`, `finalizeEnqueued=false`) and increases `totalPhotos`.
- **Per-image retry from UI**: failed uploads (network-only) could be retried client-side without a new presigned URL if we cache them in IndexedDB. Out of scope for v1.
- **Multiple WebP sizes**: v1 produces one ~2500px WebP. A future change could also produce a thumbnail (~400px) to speed up the client-pick gallery grid.
- **Sharded counters**: revisit only if we raise per-event upload volume well above today's ceiling.

---

## References

- Existing single-table design: `dynamodb-desing/single-table-design.md` (Selection at lines 290+, SelectionItem at lines 309+)
- Existing multipart upload pattern (XHR + progress): `layers/file/app/composables/useMultipartUpload.ts`
- Layer conventions: `specs/layers.md`
- Backend patterns (repository, error handling): `specs/backend.md`
- Frontend patterns (data fetching, modal, polling): `specs/frontend.md`
- Earlier draft (kept for reference): `selection-knowledge/gemini-proposal.md`
