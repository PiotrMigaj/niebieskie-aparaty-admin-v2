# Gallery Upload Pipeline — Architecture

> Status: implemented. Sister doc to `selection-knowledge/architecture.md` — read that one first for the principles. This doc focuses on the three gallery-specific differences.
> Scope: photographer uploads 1–2k professional originals (10–30MB each) per event; system stores **the originals permanently**, compresses each to WebP for in-app display, indexes the result in DynamoDB, and flips `Event.galleryAvailable = true` when the whole batch is done.

## 1. Overview

The gallery pipeline mirrors the selection pipeline beat-for-beat with three deliberate differences:

1. **Single shared bucket** (`niebieskie-aparaty-gallery-images`) holds both the originals at `{username}/{eventId}/original/` and the compressed WebPs at `{username}/{eventId}/compressed/`. No transient bucket, no main bucket — just one.
2. **Originals are permanent.** No per-image delete, no finalize sweep, no S3 lifecycle rule. Clients later download the full-res original on demand.
3. **EventBridge wildcard filter on `*/original/*`** so the Lambda's own `PutObject` of the compressed WebP cannot re-trigger the pipeline (no infinite loop on a single-bucket layout).

Four principles drove the design:

1. **Server-bypass** for uploads — no 30MB blobs through the Nuxt event loop.
2. **At-least-once + idempotent** — SQS may redeliver; DynamoDB conditional writes absorb duplicates without double-counting.
3. **Exactly-once finalization** — a `finalizeEnqueued` BOOL gates the close-out so neither a Lambda nor the HTTP `finalize-upload` endpoint can trigger it twice under a race.
4. **Originals are forever** — no code path in the pipeline ever deletes an original. Permanence is a downstream product requirement (clients need full-res downloads), not a side effect.

```
┌─────────────────┐   1. POST /api/galleries           ┌──────────────────┐
│  Nuxt browser   │ ──────────────────────────────────▶│  Nuxt server     │
│  (photographer) │                                     │  (Gallery        │
└─────────────────┘                                     │   repository)    │
        │                                               └────────┬─────────┘
        │ 2. POST /api/galleries/:u/:e/upload-urls              │
        │    (returns N presigned PUT URLs)                      │ writes Gallery
        │◀───────────────────────────────────────────────────────┘ (isUploaded=false)
        │
        │ 3. Promise-pool, concurrency=4
        │    PUT each file directly to S3 (XHR + onprogress)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ S3 bucket: niebieskie-aparaty-gallery-images                          │
│   {username}/{eventId}/original/{filename}     ← uploaded here        │
│   {username}/{eventId}/compressed/{name}.webp  ← Lambda writes here   │
│   ─ NO lifecycle rule — originals kept forever                        │
│   ─ EventBridge ON, rule pattern: object.key wildcard "*/original/*"  │
│     (compressed PUTs are filtered out at the bus)                     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────┐
                  │  SQS: ProcessingQueue    │
                  │  ─ Visibility 5 min      │
                  │  ─ maxReceiveCount 3     │
                  │  ─ DLQ: ProcessingDLQ    │
                  └──────────────┬───────────┘
                                 │ batch size 1
                                 ▼
                  ┌──────────────────────────────────────┐
                  │  Lambda: gallery-process-image       │
                  │  ─ Key shape check (4 segments)      │
                  │  ─ sharp → WebP                      │
                  │  ─ PUT WebP to compressed/ subfolder │
                  │  ─ Idempotent PUT GalleryItem        │
                  │  ─ Atomic ADD on Gallery counters    │
                  │  ─ If last → enqueue FinalizeQueue   │
                  │  ─ NO DeleteObject — original stays  │
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
                  │  Lambda: gallery-finalize            │
                  │  ─ NO sweep — originals are kept     │
                  │  ─ TransactWrite:                    │
                  │      Event.galleryAvailable=true     │
                  │      Gallery.isUploaded=true         │
                  └──────────────────────────────────────┘
```

S3 paths:

```
niebieskie-aparaty-gallery-images
  {username}/{eventId}/original/{filename}           ← permanent, browser uploads here
  {username}/{eventId}/compressed/{imageName}.webp   ← permanent, Lambda writes here
```

---

## 2. Sequence walkthrough

| # | Actor | Action |
|---|-------|--------|
| 1 | Browser → Nuxt server | `POST /api/galleries` `{ username, eventId, eventTitle }` — creates the Gallery row with `isUploaded=false`, `totalPhotos=null`, counters=0. `Event.galleryAvailable` stays `false`. **No `maxNumberOfPhotos` field** — gallery has no client-pick flow, so no per-event quota. |
| 2 | Browser → Nuxt server | `POST /api/galleries/:username/:eventId/upload-urls` with the list of N file descriptors. Server returns N presigned PUT URLs (TTL 15 min) locked to keys of shape `{username}/{eventId}/original/{sanitizedFilename}`. |
| 3 | Browser → S3 | Promise-pool with concurrency 4: each upload uses XHR so `xhr.upload.onprogress` can drive a progress bar. PUTs land under `original/`. |
| 4 | Browser → Nuxt server | When the pool drains: `POST /api/galleries/:username/:eventId/finalize-upload` `{ totalPhotos: <successful count> }`. Server `UpdateItem` writes `Gallery.totalPhotos` and re-runs the completion check. |
| 5 | S3 → EventBridge → SQS → Lambda | Each PUT under `original/` matches the EventBridge wildcard `*/original/*` and lands in ProcessingQueue. `gallery-process-image` Lambda compresses, PUTs WebP to `compressed/` (same bucket), idempotent-writes `GalleryItem`, atomically increments `processedSuccessPhotos` (or `processedFailedPhotos`), then runs the completion check. PUTs under `compressed/` are filtered out at the EventBridge rule and never reach the queue. |
| 6 | Lambda → SQS → Lambda | The caller that observes `success + failed === totalPhotos` and wins the conditional update of `finalizeEnqueued` enqueues exactly one FinalizeQueue message. `gallery-finalize` Lambda runs the transactional close-out (no originals sweep). |

After step 6, the photographer's UI (which polls `GET /api/galleries/:username/:eventId?include=items` only while uploads are in flight — see §8) sees `isUploaded=true` and `Event.galleryAvailable=true`.

---

## 3. Data model

Full schemas in `dynamodb-desing/single-table-design.md`. Summary:

### Gallery (header)

`PK = USER#<username>`, `SK = GALLERY#<eventId>`.

| Attribute | Type | Written by | Notes |
|---|---|---|---|
| `galleryId` | S | create endpoint | UUID; kept for audit / external systems |
| `eventId`, `username`, `eventTitle` | S | create endpoint | |
| `isUploaded` | BOOL | created `false`; flipped `true` by finalize Lambda | The user-facing "is the gallery ready" flag |
| `totalPhotos` | N (null until step 4) | `finalize-upload` endpoint | The anchor; comparison target |
| `processedSuccessPhotos` | N (default 0) | per-image Lambda, atomic `ADD :one` | |
| `processedFailedPhotos` | N (default 0) | per-image Lambda on terminal failure | |
| `finalizeEnqueued` | BOOL (default `false`) | whichever caller wins the gate update | See §6 |
| `uploadStartedAt` | S (ISO) | create endpoint | |
| `uploadCompletedAt` | S (ISO) | finalize Lambda | |

**Selection-only attributes absent from Gallery** (and why): `blocked`, `maxNumberOfPhotos`, `selectedNumberOfPhotos` — these govern selection's client-pick flow. Galleries do not have a pick flow; clients view + download, full stop. Conflating them would be misleading.

### GalleryItem

`PK = USER#<username>`, `SK = GALLERY_ITEM#<eventId>#<imageName>` (parallel to `SELECTION_ITEM#...`).

| Attribute | Type | Notes |
|---|---|---|
| `originalFileName` | S | e.g. `IMG_3588.CR2` |
| `originalObjectKey` | S | `{u}/{e}/original/IMG_3588.CR2` — **persistent, used for full-res download** |
| `webpObjectKey` | S | `{u}/{e}/compressed/IMG_3588.webp` |
| `width` | N | from `sharp.metadata()` |
| `height` | N | from `sharp.metadata()` |
| `compressedSize` | N | bytes |
| `processedAt` | S (ISO) | |
| `status` | S | `'processed'` or `'failed'` — failed rows still exist so the UI can show "12 of 1500 failed" |
| `failureReason` | S | optional, only on `failed` |

**Selection's `selected` boolean is absent** — same reason as above.

---

## 4. AWS components

| Component | Purpose | Key config |
|---|---|---|
| **S3: `niebieskie-aparaty-gallery-images`** (existing, out-of-stack) | Single shared bucket — originals at `*/original/*`, WebPs at `*/compressed/*` | EventBridge ON; **no lifecycle rule**; CORS: PUT from admin origin; `ExposeHeaders: ["ETag"]`; no public access. CFN cannot modify it — enabled via one-shot CLI after first deploy (see §9). |
| **SQS: ProcessingQueue** (`gallery-processing`) | Per-image work queue | Visibility 5 min, `maxReceiveCount: 3`, DLQ `ProcessingDLQ` |
| **SQS: FinalizeQueue** (`gallery-finalize`) | Close-out work queue | Visibility 1 min, `maxReceiveCount: 3`, DLQ `FinalizeDLQ` |
| **EventBridge rule** (`gallery-originals-object-created`) | Routes ObjectCreated events into ProcessingQueue | **EventPattern includes `"object": { "key": [{ "wildcard": "*/original/*" }] }`** — this is the loop-guard. Compressed PUTs never reach the queue. |
| **Lambda: gallery-process-image** | Node 22, arm64, 2048 MB, 60s timeout | sharp via Lambda Layer (`gallery-sharp`, Linux arm64) |
| **Lambda: gallery-finalize** | Node 22, arm64, 512 MB, 30s timeout | Idempotent — DLQ redelivery is safe |
| **DynamoDB** | Existing `niebieskie-aparaty-prod` | No table change — same single-table design |
| **IAM (process-image)** | Per-function least-privilege | `s3:GetObject` scoped to `*/original/*`; `s3:PutObject` scoped to `*/compressed/*` (narrower than selection's per-folder scoping); `dynamodb:GetItem/PutItem/UpdateItem` on table; `sqs:SendMessage` FinalizeQueue. **No `s3:DeleteObject`** — by design. |
| **IAM (finalize)** | Per-function least-privilege | `dynamodb:UpdateItem/TransactWriteItems` only. **No `s3:ListBucket` / `s3:DeleteObject`** — there is no sweep. |

The Nuxt server gets two new IAM permissions on the new resources: `s3:PutObject` on `niebieskie-aparaty-gallery-images/*/original/*` (presigned URL generation) and `sqs:SendMessage` on the `gallery-finalize` queue (race-safe gate). `s3:GetObject` on `*/compressed/*` is added at the same time so the gallery detail page can later presign download URLs.

### Post-deploy one-shot bucket config

Because the bucket exists outside the stack, two CLI calls are required after the first `sam deploy`:

```bash
aws s3api put-bucket-notification-configuration \
  --bucket niebieskie-aparaty-gallery-images \
  --notification-configuration '{"EventBridgeConfiguration":{}}'

aws s3api put-bucket-cors \
  --bucket niebieskie-aparaty-gallery-images \
  --cors-configuration '{"CORSRules":[{"AllowedMethods":["PUT"],"AllowedOrigins":["<admin origin>"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]}'
```

Without the first command the Lambda never fires. Without the second, the browser PUT fails CORS preflight.

---

## 5. Lambda: `gallery-process-image`

**Trigger:** ProcessingQueue, batch size 1.

```
1. Parse SQS body → S3 event → bucket, key
   (bucket will always be niebieskie-aparaty-gallery-images)
2. Parse key: {username}/{eventId}/original/{originalFileName}
   parseOriginalsKey() requires 4 segments AND folder === 'original'.
   Reject anything else as defence-in-depth even though EventBridge
   should have filtered compressed/ keys at the bus.
   imageName = originalFileName.replace(/\.[^.]+$/, '')
3. GetObject from same bucket → Buffer
4. const out = await sharp(buffer)
       .rotate()
       .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
       .webp({ quality: 92, effort: 6, smartSubsample: true })
       .toBuffer({ resolveWithObject: true })
   // Same encoder settings as selection — see selection-knowledge/architecture.md §5.
5. PutObject to the SAME bucket, under compressed/ subfolder:
     Key: {username}/{eventId}/compressed/{imageName}.webp
     ContentType: image/webp
   This PUT is what the EventBridge wildcard filter must NOT match,
   otherwise the Lambda would re-trigger itself.
6. Idempotent PutItem GalleryItem
     ConditionExpression: attribute_not_exists(PK)
   If ConditionalCheckFailedException → log "duplicate" → SKIP step 7 → return success.
   GalleryItem stores BOTH originalObjectKey AND webpObjectKey.
7. Atomic UpdateItem Gallery (ReturnValues: ALL_NEW):
     UpdateExpression: ADD processedSuccessPhotos :one SET updatedAt = :now
   Then run the completion check (see §6) using the returned attributes.
8. (NO step 8) — original is NOT deleted. This is the load-bearing
   difference from selection's pipeline. The original remains forever.
```

### Failure handling

| Failure | Path |
|---|---|
| Transient (S3 5xx, network, OOM) | Throw → SQS retries up to 3 → ProcessingDLQ. Operator inspects DLQ. |
| Permanent (corrupt image, unknown format, sharp `Input buffer contains unsupported`) | Caught inside Lambda. Write GalleryItem with `status='failed'`, `failureReason` (and the `originalObjectKey` so an operator can inspect the bad file). Atomic `ADD processedFailedPhotos :one`. Same completion check. Return success — message removed from queue. **Original remains in S3** for inspection / manual re-processing. |
| Duplicate delivery (SQS at-least-once) | Step 6 conditional put fails → return success without bumping counters → no double count. |
| EventBridge mis-routes a compressed key | `parseOriginalsKey` rejects (folder !== 'original') → log "Bad originals key shape — dropping" → return success. Defence-in-depth. |

Error classification (transient vs permanent) is unchanged from selection — see `gallery-serverless/src/shared/errors.ts` and `selection-knowledge/architecture.md` §5.

A DLQ-stuck batch never finalizes (counter stays below `totalPhotos`). Recovery is the same as selection: fix root cause, redrive the DLQ. CloudWatch alarms on both DLQs fire after 5 min.

---

## 6. Completion handshake (race-safe)

Same two-trigger gate as selection: either the last per-image Lambda or the HTTP `finalize-upload` endpoint will be the one to observe `success + failed === totalPhotos` and win the conditional update of `finalizeEnqueued`.

```
UpdateExpression: SET finalizeEnqueued = :true
ConditionExpression: attribute_not_exists(finalizeEnqueued) OR finalizeEnqueued = :false
ExpressionAttributeValues: { ':true': true, ':false': false }
```

The arithmetic comparison (`total === success + failed`) is done in **JS**, not in `ConditionExpression` — DynamoDB doesn't support arithmetic in `ConditionExpression` (see `CLAUDE.md`). The pattern is: do the atomic counter `UpdateItem` with `ReturnValues: 'ALL_NEW'`, then in JS compare `success + failed` vs `total`, then do a second conditional `UpdateItem` that only guards the flag flip.

Code lives in **two** places, both required:

- `gallery-serverless/src/shared/completion.ts` (Lambda half)
- `layers/gallery/server/utils/tryEnqueueFinalizeGallery.ts` (Nuxt server half)

> **DO NOT remove either path.** See the warning in `CLAUDE.md` under "Gallery completion gate". The Lambda covers the case where `totalPhotos` was already written before all images finished; the HTTP endpoint covers the case where all images drained before the browser finished uploading and sent the totals. Neither alone is sufficient.

The conditional `finalizeEnqueued` flip ensures exactly one of them wins under a tied race.

---

## 7. Lambda: `gallery-finalize`

**Trigger:** FinalizeQueue, batch size 1.

```
1. (NO sweep step) — originals are permanent. Skip directly to the close-out.
2. TransactWriteItems:
   a) UpdateItem Event   (PK=USER#<u>, SK=EVENT#<e>):
        SET galleryAvailable = :true, updatedAt = :now
   b) UpdateItem Gallery (PK=USER#<u>, SK=GALLERY#<e>):
        SET isUploaded = :true, uploadCompletedAt = :now, updatedAt = :now
```

The transactional write is the only place these two flags flip, so the UI can rely on the invariant `Event.galleryAvailable === Gallery.isUploaded` (eventually). Re-delivery from FinalizeDLQ is safe — both updates are idempotent SETs of `true`.

---

## 8. Frontend changes

### Layer: `layers/gallery/`

```
layers/gallery/
  app/
    components/
      CreateGallery.vue              # confirmation-only modal — NO form fields
      UploadGalleryImages.vue        # file picker, concurrency-4 pool, per-file + total progress
    composables/
      useGallery.ts                  # GET /api/galleries/:u/:e (?include=items)
      useGalleryUpload.ts            # the Promise-pool uploader
    pages/
      users/[username]/events/[eventId]/gallery/index.vue   # detail view
  server/
    api/
      galleries/
        index.post.ts                          # create gallery (409 on duplicate)
        [username]/[eventId].get.ts            # read gallery + optional ?include=items
        [username]/[eventId]/upload-urls.post.ts
        [username]/[eventId]/finalize-upload.post.ts
    repository/
      galleryRepository.ts
      galleryItemRepository.ts                 # READ-ONLY — Lambda writes the rows
    utils/
      tryEnqueueFinalizeGallery.ts
  shared/
    types/
      types.ts
      schemas.ts
  nuxt.config.ts
```

### Create flow

`CreateGallery.vue` is a **confirmation modal**, not a form. Body reads "Do you really want to create a gallery for *{eventTitle}*?" with the username / eventId chips below. On submit, `POST /api/galleries` then `navigateTo(/users/:u/events/:e/gallery)`. There is no `maxNumberOfPhotos` field — galleries have no client-pick quota.

### Upload concurrency pool

Same XHR + onprogress + 4-worker pattern as `useSelectionUpload`. See `layers/gallery/app/composables/useGalleryUpload.ts`.

### Progress UI polling

`useGallery` is a thin `useFetch` wrapper — **no polling inside the composable**. Polling lives on the gallery detail page:

```ts
const isProcessing = computed(
  () => !!g.value && g.value.totalPhotos != null && !g.value.isUploaded,
)
watch(isProcessing, (active) => active ? startPolling() : stopPolling(), { immediate: true })
```

Polling fires every 3s **only** while `isProcessing` is true — i.e. the browser has already called `finalize-upload` (so `totalPhotos` is set) and the Lambdas haven't finished yet. Idle pre-upload and post-finalize states are silent.

> **Why not poll whenever `!isUploaded`?** That was the first cut, and it hammered the API endlessly any time the page was open without an upload in flight. The `totalPhotos != null` guard is what distinguishes "upload in progress" from "no upload has ever happened".

The upload modal's `@uploaded` event triggers a single `refresh()` on the page — that fetch returns with `totalPhotos != null`, which flips `isProcessing` to `true`, which starts polling.

---

## 9. SAM project (`gallery-serverless/`)

Sibling to `layers/`, self-contained TypeScript project. Layout is identical to `selection-serverless/` save for `finalize-gallery/` instead of `finalize-selection/`:

```
gallery-serverless/
  template.yaml              # SAM template (SQS, EventBridge, Lambdas, IAM, alarms, outputs)
  samconfig.toml             # stack name, region, build flags
  package.json               # sharp + SDK deps; esbuild for SAM's build step
  tsconfig.json              # type-check only
  layers/sharp/              # sharp Lambda Layer (cross-compiled Linux arm64)
  src/
    process-image/
      handler.ts
    finalize-gallery/
      handler.ts
    shared/
      dynamo.ts              # DocumentClient + TABLE_NAME
      s3.ts                  # S3 client + commands + GALLERY_BUCKET
      sqs.ts                 # SQS client + SendMessageCommand + FINALIZE_QUEUE_URL
      keys.ts                # PK/SK builders, originals-key parser
      completion.ts          # tryEnqueueFinalize gate
      types.ts               # event + message shapes
      errors.ts              # permanent vs transient classification
```

### Build & deploy

```bash
cd gallery-serverless
pnpm install
pnpm build         # wraps `sam build` with npm_config_cpu=arm64 npm_config_os=linux npm_config_libc=glibc
sam deploy --guided    # first time — supply AlarmEmail, AdminOrigin
sam deploy             # subsequent
```

`pnpm build` env vars trick npm into installing sharp's Linux arm64 binary on a macOS host. Lambda runs Linux arm64. Without the env vars, sharp ships the macOS binary and the Lambda crashes on first invoke.

### Post-deploy one-shot

After the first deploy, run the two `aws s3api` commands from §4 to enable EventBridge + CORS on the (out-of-stack) bucket. CFN cannot do this because the bucket is not managed by the stack.

### Outputs

Pipe into `.env`:

```
NUXT_GALLERY_UPLOAD_BUCKET_NAME=niebieskie-aparaty-gallery-images
NUXT_GALLERY_FINALIZE_QUEUE_URL=<FinalizeQueueUrl from stack outputs>
```

See `gallery-serverless/README.md` for the operational runbook.

---

## 10. Resilience

| Risk | Mitigation |
|---|---|
| SQS at-least-once redelivery | Conditional PutItem on GalleryItem makes processing idempotent |
| Lambda crashes mid-image | Original still in S3 (forever); SQS retries from S3 event; up to 3 attempts then DLQ |
| Sharp OOM on huge file | Lambda memory 2048 MB + 60s timeout; if still fails, message lands in DLQ |
| Photographer closes tab before `finalize-upload` lands | `Gallery.isUploaded` stays `false`. Operator can re-call finalize, or admin can reset (future work). Originals are safe — they're permanent. |
| **Compressed PUT re-triggers the Lambda** (single-bucket layout) | **EventBridge rule pattern includes `"object": { "key": [{ "wildcard": "*/original/*" }] }`** so compressed PUTs are filtered at the bus. Defence-in-depth: `parseOriginalsKey` in the Lambda rejects any key whose 3rd segment isn't `original`. |
| Two callers race to enqueue finalize | `finalizeEnqueued` BOOL + conditional update — only one wins (see §6) |
| Finalize Lambda redelivered from DLQ | Transactional SETs of `true` are idempotent |
| `Event.galleryAvailable` and `Gallery.isUploaded` disagree | Both flipped inside a single `TransactWriteItems` |
| Transient failure puts message in DLQ → batch never finalizes | **CloudWatch alarm on `gallery-processing-dlq-not-empty`** + SNS topic → email. Operator redrives the DLQ once root cause is fixed. Mirror alarm on FinalizeDLQ. |

**Not on this list:** "orphan originals in the bucket". Originals are intentionally kept forever — there's nothing to orphan against. The trade-off is storage cost (see §11), not a reliability concern.

---

## 11. Cost & scale notes

- **Compute**: Same as selection. Lambda + SQS are zero idle cost. WebP `effort: 6` at q=92: budget ~5–8s per image at 2 GB. 1500 photos × ~6s @ 2 GB ≈ 18,000 GB-s ≈ ~$0.30 per event. Still negligible.
- **Storage (the big differ)**: Gallery keeps **both** originals and WebPs forever in S3 Standard.
  - Originals: 1500 photos × ~20 MB ≈ **30 GB per event**.
  - WebPs: 1500 × ~2 MB ≈ ~3 GB per event.
  - **~33 GB per event, permanent.** At S3 Standard pricing (~$0.023/GB-month in `eu-central-1`), that's ~$0.76/month per event held. 100 events ≈ $76/month. A year of accumulation is real money.
  - This is the deliberate trade-off: download fidelity for clients vs. storage cost. A future "archive old galleries to S3 Glacier Deep Archive" admin action would knock the long-tail cost by ~10× — see §12.
- **DynamoDB hot item**: Counter updates target a single Gallery row. Worst case 1500 photos × 20 concurrent Lambdas ≈ 75 UpdateItem/sec on one partition — well below DynamoDB's ~1000 wps per-partition ceiling.
- **S3 request cost**: 1500 PUTs (uploads) + 1500 GETs (Lambda reads original) + 1500 PUTs (Lambda writes WebP). **No DELETEs**. Negligible.

---

## 12. Open questions / future work

- **Download presigned URL endpoint.** The gallery detail page currently shows a counter + plain item list. A `GET /api/galleries/:u/:e/items/:imageName/download` that mints a 15-min presigned `GetObject` URL on the original is the obvious next step to unlock client-facing full-res download. `originalObjectKey` is already stored on each `GalleryItem` row.
- **Thumbnail grid.** v1 produces one ~2500px WebP. A second smaller WebP (~400px or ~600px) would let the detail page render a grid without the user having to wait for full-size renders.
- **Storage cleanup / archive policy.** Originals never expire. Should there be an admin "archive gallery" action that moves originals to `STANDARD_IA` or `GLACIER_DEEP_ARCHIVE` after N months? Or a "delete gallery" action that removes the bucket prefix + DynamoDB rows entirely?
- **Cancellation.** Photographer closes the tab mid-upload → orphan Gallery row with `isUploaded=false` AND orphan original objects in S3. A "reset gallery" admin action could clean both. (Same gap selection has, but with more storage at stake.)
- **Append uploads.** Spec assumes one-shot. To add more photos later, re-open the Gallery (`isUploaded=false`, `finalizeEnqueued=false`) and bump `totalPhotos`.
- **Per-image retry from UI.** Failed network uploads could retry client-side from IndexedDB without a new presigned URL.
- **Hardened auth on the API.** The current handlers take `username` from path/body without verifying the session — same pattern as selection. A `requireOwnership` middleware in `layers/base/server/middleware/` would cover both pipelines uniformly. Tracked separately.

---

## References

- Sibling design doc: `selection-knowledge/architecture.md` — read first for the shared principles
- Sibling walkthrough: `selection-knowledge/how-it-works.md` — plain-English of the shared mechanics (race conditions, idempotency, DLQ recovery)
- Single-table design: `dynamodb-desing/single-table-design.md` (Gallery + GalleryItem entries)
- Completion-gate enforcement: `CLAUDE.md` → "Gallery completion gate — DO NOT remove either path"
- Build / deploy mechanics: `gallery-serverless/README.md`
- XHR + progress pattern: `layers/file/app/composables/useMultipartUpload.ts`
- Layer conventions: `specs/layers.md`
- Backend patterns: `specs/backend.md`
- Frontend patterns: `specs/frontend.md`
