# gallery-serverless

AWS SAM project that implements the Gallery upload pipeline. Sibling to `layers/` —
independent of the Nuxt build. Modelled on `selection-serverless/` with three
deliberate differences:

1. **Single shared bucket** (`niebieskie-aparaty-gallery-images`) holds originals
   under `{user}/{event}/original/` and the compressed WebPs under
   `{user}/{event}/compressed/`. The bucket exists out-of-stack — this template
   only references it via parameter.
2. **EventBridge wildcard filter** on `object.key = */original/*` so the Lambda's
   own PUT of the compressed WebP cannot re-trigger processing.
3. **Originals are never deleted.** No per-image delete, no finalize sweep,
   no lifecycle rule. Clients can download the full-res original on demand.

## What it provisions

- **SQS** `gallery-processing` + DLQ, `gallery-finalize` + DLQ
- **EventBridge rule** routing `s3:ObjectCreated` for `*/original/*` keys in
  the shared bucket → `gallery-processing`
- **Lambda** `gallery-process-image` (sharp → WebP under `compressed/` →
  GalleryItem + counters → `tryEnqueueFinalize`)
- **Lambda** `gallery-finalize` (TransactWrite flips `Event.galleryAvailable`
  + `Gallery.isUploaded`)
- **CloudWatch alarms** on both DLQs, wired to an SNS email topic

The existing DynamoDB table (`niebieskie-aparaty-prod`) and the shared S3 bucket
are referenced via parameters — this stack does not create them.

## One-time bucket setup

CloudFormation cannot modify an out-of-stack bucket. After the first deploy,
enable EventBridge notifications and CORS for browser PUTs manually:

```bash
aws s3api put-bucket-notification-configuration \
  --bucket niebieskie-aparaty-gallery-images \
  --notification-configuration '{"EventBridgeConfiguration":{}}'

aws s3api put-bucket-cors \
  --bucket niebieskie-aparaty-gallery-images \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedMethods": ["PUT"],
      "AllowedOrigins": ["*"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }]
  }'
```

(Replace `*` with the real admin origin in production.)

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity` works)
- SAM CLI installed (`sam --version`)
- `pnpm install` once in this directory

## Build & deploy

```bash
cd gallery-serverless
pnpm install
pnpm build                # wraps `sam build` with cross-platform sharp env vars
sam deploy --guided       # first time — supply AlarmEmail, AdminOrigin
sam deploy                # subsequent
```

`samconfig.toml` pins region (`eu-central-1`) and stack name (`niebieskie-aparaty-gallery`).

### Parameters

| Name | Required | Description |
|---|---|---|
| `GalleryBucketName` | no | Defaults to `niebieskie-aparaty-gallery-images` |
| `DynamoTableName` | no | Defaults to `niebieskie-aparaty-prod` |
| `AdminOrigin` | yes (prod) | CORS allowed origin; defaults to `*` |
| `AlarmEmail` | yes | Email for DLQ alarms (confirm subscription after first deploy) |

### Outputs

After deploy, copy the `FinalizeQueueUrl` output into the Nuxt app's env:

```
NUXT_GALLERY_UPLOAD_BUCKET_NAME=niebieskie-aparaty-gallery-images
NUXT_GALLERY_FINALIZE_QUEUE_URL=<FinalizeQueueUrl>
```

## Project layout

```
template.yaml              SAM template (SQS, EventBridge, Lambdas, IAM, alarms, outputs)
samconfig.toml             stack name, region, build flags
package.json               sharp + SDK deps; esbuild for SAM's build step
tsconfig.json              type-check only (sam build emits the actual bundle)
layers/sharp/              sharp Lambda Layer (cross-compiled Linux arm64)
src/
  process-image/
    handler.ts             SQS-triggered; sharp + WebP + counters + finalize gate
  finalize-gallery/
    handler.ts             SQS-triggered; TransactWrite close-out
  shared/
    dynamo.ts              DocumentClient singleton + TABLE_NAME
    s3.ts                  S3 client + command re-exports + GALLERY_BUCKET
    sqs.ts                 SQS client + SendMessageCommand + FINALIZE_QUEUE_URL
    keys.ts                PK/SK builders, originals-key parser, key shape helpers
    completion.ts          tryEnqueueFinalize — race-safe gate UpdateItem + SQS send
    types.ts               S3 EventBridge event + finalize message shapes
    errors.ts              permanent vs transient classification
```

## Useful one-offs

```bash
# tail process-image logs
sam logs --tail -n gallery-process-image --region eu-central-1

# redrive a stuck DLQ once the root cause is fixed
aws sqs start-message-move-task \
  --source-arn $(aws sqs get-queue-attributes --queue-url <ProcessingDLQ url> \
                  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
```
