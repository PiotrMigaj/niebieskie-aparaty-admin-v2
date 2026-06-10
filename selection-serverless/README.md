# selection-serverless

AWS SAM project that implements the Selection upload pipeline described in
`../selection-knowledge/architecture.md`. Sibling to `layers/` — independent of the Nuxt build.

## What it provisions

- **S3 bucket** `niebieskie-aparaty-selection-original-images` (transient, bucket-wide 24h lifecycle, EventBridge on)
- **SQS** `selection-processing` + DLQ, `selection-finalize` + DLQ
- **EventBridge rule** routing `s3:ObjectCreated` on the originals bucket → ProcessingQueue
- **Lambda** `selection-process-image` (sharp → WebP → main bucket → SelectionItem + counters)
- **Lambda** `selection-finalize` (sweeps originals, TransactWrite flips `Event.selectionAvailable` + `Selection.isUploaded`)
- **CloudWatch alarms** on both DLQs, wired to an SNS email topic

The existing DynamoDB table (`niebieskie-aparaty-prod`) and main upload bucket are referenced via parameters — this stack does not create them.

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity` works)
- SAM CLI installed (`sam --version`)
- `pnpm install` once in this directory (esbuild + types are devDependencies)

## Build & deploy

The default build runs `npm install` with `npm_config_cpu=arm64 npm_config_os=linux npm_config_libc=glibc` so sharp's Linux arm64 native binary gets installed instead of the macOS one — Lambda runs Linux arm64.

```bash
cd selection-serverless
pnpm install
pnpm build                # wraps `sam build` with the cross-platform env vars
sam deploy --guided       # first time — supply MainBucketName, AlarmEmail, AdminOrigin
sam deploy                # subsequent
```

If you prefer the Docker-based build (slower but no env-var trick), use `pnpm build:container` instead. Requires Docker. With OrbStack, set `DOCKER_API_VERSION=1.45` first because the bundled SAM Docker client otherwise negotiates an API version OrbStack rejects.

`samconfig.toml` pins region (`eu-central-1`) and stack name (`niebieskie-aparaty-selection`).

### Parameters

| Name | Required | Description |
|---|---|---|
| `MainBucketName` | yes | The existing permanent upload bucket (where WebPs land) |
| `AlarmEmail` | yes | Email subscribed to DLQ-depth SNS alarms (confirm the subscription email after first deploy) |
| `AdminOrigin` | yes (prod) | CORS allowed origin for browser PUTs to the originals bucket; defaults to `*` |
| `DynamoTableName` | no | Defaults to `niebieskie-aparaty-prod` |
| `OriginalsBucketName` | no | Defaults to `niebieskie-aparaty-selection-original-images` |

### Outputs

After deploy, copy the `OriginalsBucketName` and `FinalizeQueueUrl` outputs into the Nuxt app's env:

```
NUXT_SELECTION_ORIGINAL_UPLOAD_BUCKET_NAME=<OriginalsBucketName>
NUXT_SELECTION_FINALIZE_QUEUE_URL=<FinalizeQueueUrl>
```

The Nuxt server uses those to issue presigned PUT URLs and to enqueue finalize messages
when the HTTP `finalize-upload` endpoint wins the completion gate.

## How esbuild is configured

Both functions use SAM's built-in `BuildMethod: esbuild` (see `Metadata.BuildProperties`
on each `AWS::Serverless::Function` in `template.yaml`). SAM runs esbuild inside the
Node 22 build container, externalizing `sharp` (its native binary is installed from
package.json) and `@aws-sdk/*` (already on the Lambda runtime).

No standalone esbuild config file is needed.

## Project layout

```
template.yaml              SAM template (resources, IAM, alarms, outputs)
samconfig.toml             stack name, region, build flags
package.json               sharp + SDK deps; esbuild for SAM's build step
tsconfig.json              type-check only (sam build emits the actual bundle)
src/
  process-image/
    handler.ts             SQS-triggered; sharp + WebP + counters + finalize gate
  finalize-selection/
    handler.ts             SQS-triggered; sweep originals + TransactWrite close-out
  shared/
    dynamo.ts              DocumentClient singleton + TABLE_NAME
    s3.ts                  S3 client + command re-exports + bucket names
    sqs.ts                 SQS client + SendMessageCommand + FINALIZE_QUEUE_URL
    keys.ts                PK/SK builders, key parser, webp object key builder
    completion.ts          tryEnqueueFinalize — race-safe gate UpdateItem + SQS send
    types.ts               S3 EventBridge event + finalize message shapes
    errors.ts              permanent vs transient classification
```

## Useful one-offs

```bash
# tail process-image logs
sam logs --tail -n selection-process-image --region eu-central-1

# redrive a stuck DLQ once the root cause is fixed
aws sqs start-message-move-task \
  --source-arn $(aws sqs get-queue-attributes --queue-url <ProcessingDLQ url> \
                  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
```
