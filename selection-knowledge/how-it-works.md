# How the selection upload pipeline works

> **Current flow (in use, 2026-06-11): simplified.** The photographer compresses + watermarks images on their machine; the admin panel only uploads the finished bytes and writes DB rows. See §0 below for the short walkthrough.
> Sections §1 onward describe the original distributed-Lambda pipeline. **Historical — superseded.** Left in place for context (and to explain why `selection-serverless/` is in the repo).

---

## 0. Current flow (one paragraph + five steps)

A photographer prepares the selection on their own machine — they compress and watermark each photo to a small JPEG/WebP before opening the admin panel. The admin then runs one combined "Create selection" modal that uploads every prepared file to the main bucket and writes all DB rows in a single round-trip. No AWS-side processing, no polling, no DLQ.

1. **Browser** opens the Create Selection modal, takes `maxNumberOfPhotos` + a set of files. For each file the browser reads pixel dimensions client-side via `new Image()`.
2. **Browser → Nuxt** `POST /api/selections/:u/:e/upload-urls` → returns one presigned PUT per file, all targeting `niebieskie-aparaty-client-gallery/{u}/{e}/selection/<filename>`. The Selection row does **not** exist yet.
3. **Browser → S3** PUTs every file (4-worker XHR pool with progress).
4. **Browser → Nuxt** `POST /api/selections` with `{ username, eventId, eventTitle, maxNumberOfPhotos, items: [{ imageName, objectKey, imageWidth, imageHeight }] }`. Server:
   - `BatchWrite`s the SelectionItem rows (chunks of 25 — DynamoDB BatchWrite max),
   - then one `TransactWrite` does `Put SELECTION` (guarded by `attribute_not_exists(PK)`) + `Update EVENT.selectionAvailable = true`.
5. **Browser** navigates to the selection detail page. Done.

That's it. There is no polling, no completion gate, no Lambdas, no DLQ. Failure recovery: if any individual PUT fails, the modal shows it and prevents the create call; if the user retries, S3 PUTs overwrite + BatchWrite overwrites + the transactional Put either succeeds (no prior Selection) or fails with 409 (already exists).

### Why this replaced the old pipeline

The photographer asked to handle compression + watermarking client-side so they could control output quality and watermark style without redeploying Lambdas. That removed every reason for the distributed pipeline below: no need for sharp, no need for SQS, no need for the race-safe completion gate. The remaining work is small enough to do server-side in a single request.

---

> **Status (historical sections below): superseded by §0 above.** Original intro:
> A plain-English walkthrough of the same system that `architecture.md` specifies. Read this when you want to *understand* it; read `architecture.md` when you want IAM policies, table shapes, or alarm thresholds.

## 1. What this pipeline does, in one paragraph

A photographer creates a "selection" for an event and uploads 1–2k raw photos. Each photo is compressed to a smaller WebP, indexed in DynamoDB so the client (the wedding couple, the family, etc.) can later pick favorites, and once the whole batch is done the event flips to `selectionAvailable = true` so the client can see it. The Nuxt admin server never touches the image bytes — uploads go straight from the browser to S3, and the heavy lifting happens in two AWS Lambdas.

## 2. The four actors

| Actor | Role |
|---|---|
| **Browser** | Knows which photos the photographer chose and PUTs them to S3. Only the browser knows the final successful upload count. |
| **Nuxt server** | Issues presigned PUT URLs, owns the DynamoDB writes for the Selection row, and is one of the two parties that can trigger finalization. |
| **S3 + EventBridge + SQS** | The originals bucket emits an event for every uploaded object; EventBridge routes it into the `ProcessingQueue`. Acts as a buffer and a retry mechanism. |
| **Two Lambdas** | `process-image` compresses one photo at a time and updates DynamoDB counters. `finalize-selection` runs once per batch to flip the "done" flags. |

## 3. Happy-path walkthrough

```
Photographer's browser                Nuxt server                   AWS
─────────────────────                  ───────────                   ───
 1. POST /api/selections ─────────────▶  writes Selection row
                                         (isUploaded=false,
                                          totalPhotos=null,
                                          counters=0)

 2. POST .../upload-urls ────────────▶  returns N presigned PUT URLs
    (filenames + sizes)                  (15 min TTL, locked to keys)

 3. PUT each photo directly to S3 ──────────────────────────────────▶  originals bucket
    (concurrency 4, XHR + progress)                                    │
                                                                       │ each PUT triggers:
                                                                       ▼
                                                                      EventBridge
                                                                       │
                                                                       ▼
                                                                      ProcessingQueue (SQS)
                                                                       │
                                                                       ▼
                                                                      process-image Lambda
                                                                       │  ─ GetObject
                                                                       │  ─ sharp → WebP
                                                                       │  ─ PutObject (main bucket)
                                                                       │  ─ idempotent PutItem
                                                                       │     SelectionItem
                                                                       │  ─ atomic ADD counter
                                                                       │  ─ tryEnqueueFinalize
                                                                       │  ─ DeleteObject original

 4. POST .../finalize-upload ────────▶  writes totalPhotos = N
    (after all PUTs finished)            then tryEnqueueFinalize
                                         (one of the two paths wins)
                                                                       │
                                                                       ▼
                                                                      FinalizeQueue (SQS)
                                                                       │
                                                                       ▼
                                                                      finalize-selection Lambda
                                                                       │  ─ sweep originals prefix
                                                                       │  ─ TransactWrite:
                                                                       │     Event.selectionAvailable=true
                                                                       │     Selection.isUploaded=true

 5. UI polls GET /api/selections/...
    sees isUploaded=true → done
```

Things to notice in this picture:

- **Steps 3 and 4 happen in parallel.** The browser is uploading photos AND each Lambda is processing them at the same time. By the time the browser sends step 4, some Lambdas may already be done.
- **The Nuxt server is out of the data path.** No 20MB blobs go through Nitro — it only writes ~200-byte rows to DynamoDB.
- **Finalization is enqueued, not called.** Neither the Lambda nor the Nuxt endpoint calls the finalize Lambda directly; they put a message on `FinalizeQueue` and AWS triggers the Lambda. That's what gives us at-least-once retry semantics for the finalize step too.

## 4. What DynamoDB stores during a batch

### The Selection row (one per batch)

| Field | What it's for |
|---|---|
| `isUploaded` | `false` until everything's done. The user-facing "ready" flag. |
| `totalPhotos` | The target number. Stays `null` until the browser tells us in step 4. |
| `processedSuccessPhotos` | Count of photos the Lambda compressed successfully. Bumped atomically. |
| `processedFailedPhotos` | Count of photos that failed terminally (e.g. corrupt file). Bumped atomically. |
| `finalizeEnqueued` | The race-safety flag. Flips to `true` exactly once when someone wins the gate. |
| `uploadStartedAt` / `uploadCompletedAt` | Timestamps for diagnostics. |

The batch is "ready to finalize" when `processedSuccessPhotos + processedFailedPhotos === totalPhotos` AND `totalPhotos !== null`. Both conditions matter.

### SelectionItem rows (one per photo)

One row per photo, key `SELECTION_ITEM#<eventId>#<imageName>`. Stores the resulting WebP's S3 key, dimensions, file size, processing status (`processed` or `failed`), and a `selected` boolean (always `false` initially — that flag is for the later client-pick flow, not for upload tracking).

Failed rows still exist on purpose: the UI can say "12 of 1500 failed" rather than silently dropping them.

## 5. The three race conditions and how they're handled

This is the part that looks weird until you trace it through. The pipeline has two parties that could trigger finalization — the last `process-image` Lambda, and the `finalize-upload` HTTP endpoint. We can't predict which one finishes last.

### 5.1 — Browser sends `finalize-upload` BEFORE all Lambdas finish

This is the "slow Lambdas" case. The browser uploaded fast, the Lambdas are still chewing through the queue.

1. Browser PUTs 5 photos and the server writes `totalPhotos = 5`.
2. Lambdas process one at a time, bumping the counter each time.
3. The 5th Lambda observes `success + failed === 5 === total` → calls `tryEnqueueFinalize` → wins the gate → enqueues finalize message.

✅ The last Lambda is the one that triggers finalize. The HTTP endpoint also tried earlier (when total was 5 but counters were less than 5), and silently no-op'd.

### 5.2 — Browser sends `finalize-upload` AFTER all Lambdas finish

This is the "fast Lambdas" case. Sharp is quick, only 5 small photos — by the time the browser's HTTP call lands, every Lambda is already done.

1. Browser PUTs 5 photos. Each Lambda processes immediately, bumps counter, calls `tryEnqueueFinalize`. The gate fails every time because `totalPhotos` is still `null`. Counters reach `5 + 0`.
2. **No more S3 events will fire.** No more Lambdas will run. If nothing else happened, the batch would be stuck forever at `isUploaded = false`.
3. Browser finally sends `finalize-upload` with `totalPhotos: 5`. The endpoint writes total, then calls `tryEnqueueFinalize` itself.
4. The endpoint observes `5 + 0 === 5` → wins the gate → enqueues finalize message.

✅ The HTTP endpoint is the one that triggers finalize. **This is exactly why both parties have to try** — without the endpoint also calling `tryEnqueueFinalize`, this scenario would hang.

### 5.3 — Both arrive at the same moment

Last Lambda and HTTP endpoint both call `tryEnqueueFinalize` within milliseconds of each other. Both see counters match total. Both attempt to flip `finalizeEnqueued`.

DynamoDB's conditional `UpdateItem` guarantees atomicity: only one of them succeeds. The other gets `ConditionalCheckFailedException`, catches it, returns false silently. Exactly one finalize message goes on the queue.

Why a DB-level conditional and not a distributed lock or coordination service? Because the Selection row is the natural place to put the flag — we're already writing to it. A separate lock would mean another piece of infra to monitor and pay for, and the same "exactly-once" property would still rely on a conditional somewhere. Cutting out the middleman.

## 6. At-least-once delivery and idempotency

SQS guarantees *at-least-once* delivery — it can hand the same S3 event to the Lambda twice. Without precautions, that would mean: compress twice, write the SelectionItem twice (overwriting), and bump the counter twice (double-count, breaking finalization forever because counters would exceed total).

The fix is the **idempotent `PutItem`** on `SelectionItem`:

```
PutItem with ConditionExpression: attribute_not_exists(PK)
```

On the first delivery: row doesn't exist → PutItem succeeds → counter bump runs → finalize check runs → original deleted.

On the second delivery: row already exists → `ConditionalCheckFailedException` → Lambda logs "duplicate", **skips** the counter bump and `tryEnqueueFinalize`, but **still deletes the original** (cleanup happens in the duplicate-branch too), and returns success. SQS removes the message.

So duplicate deliveries are effectively no-ops for the counters. They do waste CPU (sharp runs again) and one S3 PutObject (the WebP gets overwritten with identical bytes), but those are cheap and acceptable.

## 7. Why originals get deleted three different ways

Defense in depth. The transient originals bucket needs to stay clean — these are 20MB raw files we don't want lingering.

| When | Who | Why |
|---|---|---|
| Right after a photo is successfully processed | `process-image` Lambda | The happy path — instant cleanup. 99%+ of objects exit this way. |
| When the batch finalizes | `finalize-selection` Lambda sweeps the prefix | Defensive — in case a per-image delete failed (network blip, IAM throttle). |
| 24 hours after creation | Bucket-wide S3 lifecycle rule | Last-resort safety net. Catches anything orphaned by a stuck Lambda or operator error. |

The lifecycle rule applies to the WHOLE bucket without a prefix filter because the bucket is dedicated to selection originals — nothing else lives there, so blanket expiration is safe.

## 8. What "stuck" looks like and how to recover

A batch becomes stuck when a `process-image` Lambda invocation fails 3 times in a row. SQS gives up and moves the message to `ProcessingDLQ`. The CloudWatch alarm `selection-processing-dlq-not-empty` fires within ~5 minutes and emails you.

**The counter never moved for that image**, so `success + failed` stays below `totalPhotos` forever. The completion gate never fires. The Selection sits at `isUploaded = false` indefinitely.

This is intentional. Silent finalization with missing photos would be worse — the photographer would think they uploaded 1500 but the client would only see 1488.

**Recovery — the common path:**

1. Look at the message in `ProcessingDLQ` to find what failed.
2. Look at CloudWatch logs for `selection-process-image` to see the actual error.
3. Fix the root cause (e.g. an SDK regression, a new image format sharp can't handle, an IAM permission lost).
4. Redrive: `aws sqs start-message-move-task --source-arn <DLQ arn>` — SQS moves all messages back to `ProcessingQueue` and the now-fixed Lambda processes them.

**Edge case — originals already expired.** If the DLQ sat for >24h, the 24h lifecycle rule has already deleted the underlying S3 objects. Redrive will fail with `NoSuchKey`, which the Lambda treats as permanent → silently drops the message → counter still doesn't move. There's no clean recovery from this without a "reset selection" admin action (future work — see `architecture.md` §12).

## 9. The finalize Lambda's job

Once a finalize message lands on `FinalizeQueue`, the `finalize-selection` Lambda runs:

1. List all objects in the originals bucket under `{username}/{eventId}/` and batch-delete them. Best-effort — if it fails, the 24h lifecycle takes care of it eventually.
2. One `TransactWriteItems` call that does two things atomically:
   - Set `Event.selectionAvailable = true`
   - Set `Selection.isUploaded = true` and `uploadCompletedAt = now`

These two flags MUST agree (the UI assumes `selectionAvailable === isUploaded`). The transactional write is what makes that invariant safe: either both flip or neither does. No window where one is true and the other isn't.

DLQ redelivery of a finalize message is harmless. The TransactWrite is just setting both flags to `true`, which is idempotent — a re-run is a no-op against an already-finalized row.

## 10. Cheat sheet — "if X is happening, look at Y"

| Symptom | Where to look | Likely cause |
|---|---|---|
| Photos uploaded but no WebPs appearing in the main bucket | CloudWatch logs for `selection-process-image` | Lambda failing — read the error, check IAM, check sharp's input |
| Selection stuck at `isUploaded=false` even though all photos are processed | Check `totalPhotos` is set on the Selection row; check `finalizeEnqueued`. If counters match total but flag is false, the gate never fired — manually enqueue a finalize message via SQS console. | Browser never sent `finalize-upload`, OR the gate threw before flipping the flag |
| DLQ alarm fired (`selection-processing-dlq-not-empty`) | DLQ messages + CloudWatch logs at the timestamp of the alarm | A repeatable per-photo failure; fix the cause, then redrive the DLQ |
| Originals bucket has objects from yesterday's batch | Check whether per-image Lambda's `DeleteObject` calls succeeded in CloudWatch; check if any messages are still in `ProcessingQueue` | Lambda's cleanup failed (lifecycle will clean up in 24h anyway, no action needed); OR processing is genuinely behind |

For the deep dive on any of this, jump to the corresponding section in `architecture.md`:
- IAM policies and Lambda runtime config → §4
- Per-image Lambda step-by-step pseudocode → §5
- The completion handshake in full detail → §6
- Cost & scale math → §11
