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
  GalleryItem + counters → `tryEnqueueFinalize`) — also signs both image URLs
  via CloudFront at GalleryItem write time
- **Lambda** `gallery-finalize` (TransactWrite flips `Event.galleryAvailable`
  + `Gallery.isUploaded`)
- **CloudWatch alarms** on both DLQs, wired to an SNS email topic

The existing DynamoDB table (`niebieskie-aparaty-prod`) and the shared S3 bucket
are referenced via parameters — this stack does not create them. The CloudFront
distribution + key group used for URL signing live in `cloudfront-serverless/`
and must be deployed first.

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

## CloudFront signing setup (do before first deploy)

The `gallery-process-image` Lambda signs the `cloudFrontOriginalUrl` and
`cloudFrontWebpUrl` fields on every `GALLERY_ITEM` row at write time, using a
private RSA key fetched from AWS Systems Manager Parameter Store. Before
deploying this stack the first time, run through the four steps below.

### Step 1 — Deploy the CloudFront stack (if not already done)

The `cloudfront-serverless/` stack defines two distributions (selection + gallery)
behind one shared signing key pair.

```bash
cd ../cloudfront-serverless
sam deploy
```

Record these outputs:
- `GalleryDistributionDomainName` — feeds the `CloudFrontDomain` parameter on this stack
- `GalleryDistributionId` — needed for the gallery bucket policy in step 2
- `PublicKeyId` — already wired as the default `CloudFrontKeyPairId` parameter

To re-read at any time:
```bash
aws cloudformation describe-stacks \
  --stack-name niebieskie-aparaty-cloudfront \
  --region eu-central-1 \
  --query "Stacks[0].Outputs" --output table
```

### Step 2 — Grant CloudFront read access on the gallery bucket

The gallery bucket (`niebieskie-aparaty-gallery-images`) needs a policy
statement allowing the new distribution to read from it. From any working
directory:

```bash
aws s3api get-bucket-policy \
  --bucket niebieskie-aparaty-gallery-images \
  --query Policy --output text > current-policy.json
```

If the file is empty (no existing policy), create it from scratch:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalRead",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::niebieskie-aparaty-gallery-images/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::762233765559:distribution/<GalleryDistributionId>"
        }
      }
    }
  ]
}
```

Substitute `<GalleryDistributionId>` from step 1. If a policy already exists,
hand-merge that one statement into its `Statement` array. Then apply:

```bash
aws s3api put-bucket-policy \
  --bucket niebieskie-aparaty-gallery-images \
  --policy file://current-policy.json
```

### Step 3 — Populate the SSM SecureString with the private key

The Lambda reads the private signing key from SSM Parameter Store at cold start
and caches it. Populate the parameter once:

```bash
aws ssm put-parameter \
  --name /niebieskie-aparaty/cloudfront/private-key \
  --type SecureString \
  --value file://../cloudfront-serverless/private-key.pem \
  --region eu-central-1
```

To rotate later (after generating a new key pair and redeploying
`cloudfront-serverless`), use the same command with `--overwrite`.

### Step 4 — First-time deploy with the new CloudFrontDomain parameter

The Lambda needs the gallery distribution domain. The first deploy passes it
as a parameter override; `sam deploy --guided` saves it to `samconfig.toml` so
subsequent deploys don't need it.

```bash
cd ../gallery-serverless
pnpm install         # installs @aws-sdk/cloudfront-signer + @aws-sdk/client-ssm
pnpm build
sam deploy --guided --parameter-overrides "CloudFrontDomain=<GalleryDistributionDomainName from step 1>"
```

When the guided deploy prompts, accept the existing values from `samconfig.toml`
for everything else and let it save the new override. After this, plain
`sam deploy` works.

### Verification

Upload a fresh gallery through the running Nuxt app, watch CloudWatch logs:

```bash
sam logs --tail -n gallery-process-image --region eu-central-1
```

Then inspect the `GALLERY_ITEM` rows in DynamoDB — both `cloudFrontOriginalUrl`
and `cloudFrontWebpUrl` should be populated. Open each URL in a browser; both
should render the image. The same URL with the query parameters stripped
should return `403`.

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
| `CloudFrontDomain` | **yes** | Gallery distribution domain from `cloudfront-serverless` outputs (e.g. `d1234abcd.cloudfront.net`). No default — must be supplied on first deploy. |
| `CloudFrontKeyPairId` | no | Defaults to `K2IHGS3BJ0VXCW` (shared with selection). Update if the CloudFront key is rotated. |
| `CloudFrontPrivateKeyParam` | no | Defaults to `/niebieskie-aparaty/cloudfront/private-key`. SSM SecureString name. |

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
    handler.ts             SQS-triggered; sharp + WebP + counters + finalize gate + CloudFront URL signing
  finalize-gallery/
    handler.ts             SQS-triggered; TransactWrite close-out
  shared/
    dynamo.ts              DocumentClient singleton + TABLE_NAME
    s3.ts                  S3 client + command re-exports + GALLERY_BUCKET
    sqs.ts                 SQS client + SendMessageCommand + FINALIZE_QUEUE_URL
    keys.ts                PK/SK builders, originals-key parser, key shape helpers
    completion.ts          tryEnqueueFinalize — race-safe gate UpdateItem + SQS send
    sign.ts                CloudFront URL signer (SSM-cached private key, 6-month TTL)
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
