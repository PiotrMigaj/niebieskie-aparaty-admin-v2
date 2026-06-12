# cloudfront-serverless

Two CloudFront distributions behind a single signing key pair, serving:
- selection images from `s3://niebieskie-aparaty-client-gallery/`
- gallery originals + compressed WebPs from `s3://niebieskie-aparaty-gallery-images/`

Both restricted to signed-URL viewers. Pure CloudFormation — no Lambdas. Sibling to `gallery-serverless/`, not part of the Nuxt build.

## What this stack creates

- `AWS::CloudFront::PublicKey` — the RSA public half of the signing key pair (shared across both distributions)
- `AWS::CloudFront::KeyGroup` — wraps the public key; viewer requests must be signed by its private half
- `AWS::CloudFront::OriginAccessControl` × 2 — one per bucket (modern OAI replacement, sigv4)
- `AWS::CloudFront::Distribution` × 2 — one per bucket, viewer access restricted to the shared key group

Both S3 buckets exist outside any stack and are shared with the admin server's direct S3 access. The stack does **not** manage their bucket policies — the CloudFront-read statements are applied separately (see step 3).

## Live deployment

| Resource | Value |
|---|---|
| AWS account | `762233765559` |
| Region | `eu-central-1` |
| Stack name | `niebieskie-aparaty-cloudfront` |
| Selection distribution domain | `d319ycflg0po6r.cloudfront.net` |
| Selection distribution ID | `E2731WSA4DHMQN` |
| Gallery distribution domain | (re-read from outputs after the gallery-distribution deploy) |
| Gallery distribution ID | (re-read from outputs after the gallery-distribution deploy) |
| Public key ID (shared) | `K2IHGS3BJ0VXCW` |

Re-read outputs at any time:
```sh
aws cloudformation describe-stacks --stack-name niebieskie-aparaty-cloudfront --region eu-central-1 --query "Stacks[0].Outputs" --output table
```

### Nuxt `.env` (selection signing)

```
NUXT_CLOUD_FRONT_DOMAIN=d319ycflg0po6r.cloudfront.net
NUXT_CLOUD_FRONT_KEY_PAIR_ID=K2IHGS3BJ0VXCW
NUXT_CLOUD_FRONT_PRIVATE_KEY="<paste the body of cloudfront-serverless/private-key.pem here, with newlines escaped as \n>"
```

For the private key one-liner conversion:
```sh
awk 'NF {printf "%s\\n", $0}' cloudfront-serverless/private-key.pem
```
Copy the output and wrap it in double quotes in `.env`.

### Gallery Lambda signing (SSM SecureString)

The gallery Lambda (`gallery-process-image`) reads the same private key from AWS Systems Manager Parameter Store. Populate it once after the stack deploy:

```sh
aws ssm put-parameter \
  --name /niebieskie-aparaty/cloudfront/private-key \
  --type SecureString \
  --value file://cloudfront-serverless/private-key.pem \
  --region eu-central-1
```

To rotate later (after generating a new key pair and re-deploying this stack), use the same command with `--overwrite`. `aws ssm` accepts `file://` so the multi-line PEM goes through directly.

---

## First-time setup

### 1. Generate the key pair

```sh
cd cloudfront-serverless
openssl genrsa -out private-key.pem 2048
openssl rsa -pubout -in private-key.pem -out public-key.pem
```

- `public-key.pem` is committed to the repo (public keys are public).
- `private-key.pem` is gitignored. Keep it locally — its contents go into the Nuxt app's `.env` as `NUXT_CLOUD_FRONT_PRIVATE_KEY`.

### 2. Deploy the stack

The PEM body lives in `template.yaml` as the `PublicKeyPem` parameter's `Default:` value. SAM CLI doesn't support `file://` in `--parameter-overrides`, and `KEY=VALUE` overrides tokenize on whitespace (so a multi-line PEM injected via `$(cat …)` breaks). Inlining sidesteps both.

After regenerating `public-key.pem` (whether on first setup or during rotation), open `template.yaml` and replace the PEM body inside the `Default: |` block with the new key. Then:

```sh
sam deploy
```

First time only, use `sam deploy --guided` to save defaults to `samconfig.toml`. Record the outputs:

- `DistributionDomainName` → Nuxt env `NUXT_CLOUD_FRONT_DOMAIN`
- `DistributionId` → used in the bucket-policy statement below
- `PublicKeyId` → Nuxt env `NUXT_CLOUD_FRONT_KEY_PAIR_ID`

To re-read the outputs at any time:

```sh
aws cloudformation describe-stacks --stack-name niebieskie-aparaty-cloudfront --region eu-central-1 --query "Stacks[0].Outputs" --output table
```

Subsequent deploys: plain `sam deploy`. The PEM is in the template; nothing else needs to change unless you rotate the key.

### 3. Grant CloudFront read access on the buckets

**Selection bucket** (`niebieskie-aparaty-client-gallery`) — append:

```json
{
  "Sid": "AllowCloudFrontServicePrincipalRead",
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::niebieskie-aparaty-client-gallery/*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::762233765559:distribution/E2731WSA4DHMQN"
    }
  }
}
```

**Gallery bucket** (`niebieskie-aparaty-gallery-images`) — append (substitute `<GalleryDistributionId>` from the stack outputs):

```json
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
```

Pull the current policy, hand-merge, and put it back. Repeat for each bucket:

```sh
aws s3api get-bucket-policy --bucket <bucket-name> --query Policy --output text > current-policy.json
# Open current-policy.json, add the statement above to the Statement array
aws s3api put-bucket-policy --bucket <bucket-name> --policy file://current-policy.json
```

If `get-bucket-policy` returns `NoSuchBucketPolicy`, the bucket has no policy yet — wrap the statement in a fresh policy document:

```json
{
  "Version": "2012-10-17",
  "Statement": [ /* the statement above */ ]
}
```

Do not script the merge — the bucket policy is shared with other callers and silently overwriting it is high-risk.

### 4. Sanity check before flipping the Nuxt code over

Pick any existing object key in the bucket. From a node REPL with `@aws-sdk/cloudfront-signer` installed:

```js
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import { readFileSync } from 'node:fs'

console.log(getSignedUrl({
  url: `https://d319ycflg0po6r.cloudfront.net/<objectKey>`,
  keyPairId: 'K2IHGS3BJ0VXCW',
  privateKey: readFileSync('./private-key.pem', 'utf8'),
  dateLessThan: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
}))
```

- Open the signed URL → expect `200`, image renders.
- Open `https://d319ycflg0po6r.cloudfront.net/<objectKey>` (no signature) → expect `403`.

## Key rotation

Rotating the CloudFront key pair **invalidates every `cloudFrontUrl` already persisted on SELECTION_ITEM rows**. This was the explicit trade-off when adopting 6-month stored URLs.

To rotate:

1. Generate a new key pair.
2. Paste the new `public-key.pem` body into the `Default: |` block of the `PublicKeyPem` parameter in `template.yaml`, AND bump the `CallerReference` suffix on `PublicKey` in the same template (e.g. `pk-v1` → `pk-v2`). The suffix change is what tells CloudFormation to replace the resource — without it the update is a no-op.
3. `sam deploy`.
4. Replace the private key in `.env` / production secrets.
5. New uploads will sign with the new key. Old `cloudFrontUrl` values will return `403`. There is no in-place migration without re-signing every row.

A more flexible scheme (multi-key `KeyGroup` + per-row `cloudFrontKeyPairId` stamp) is doable but deferred — only worth introducing once the URL rotation problem is real.
