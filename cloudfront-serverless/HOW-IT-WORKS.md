# How the CloudFront setup works

Companion to `README.md` (which is operational). This doc explains *why* the stack looks the way it does and what happens when a client opens an image URL.

---

## 1. The big picture

The selection flow stores client-gallery photos in `s3://niebieskie-aparaty-client-gallery/<username>/<eventId>/selection/<imageName>`. Before this stack existed, the client viewer would have had to call an API endpoint, which would generate a short-lived S3 presigned GET URL and return it — one round-trip per image render.

CloudFront replaces that with edge caching and **signed URLs that live for 6 months**. The Nuxt server signs each image URL once at upload time, persists it on the `SELECTION_ITEM` row, and the client viewer just uses it directly. No per-render API call, and after the first viewer in a region hits an image, the CloudFront edge serves the next requests from cache.

The signing is RSA-based: a key pair is generated, the public half is registered with CloudFront, and the private half lives on the Nuxt server. Only URLs signed by that private key are accepted by the distribution; everyone else gets `403`.

---

## 2. What a request looks like end-to-end

When a client opens a signed image URL like:

```
https://d319ycflg0po6r.cloudfront.net/amigaj/<eventId>/selection/<imageName>?Expires=…&Signature=…&Key-Pair-Id=K2IHGS3BJ0VXCW
```

1. **DNS** resolves `d319ycflg0po6r.cloudfront.net` to the nearest CloudFront edge location (Frankfurt, Warsaw, etc. since `PriceClass_100` enables EU + NA edges).
2. **CloudFront verifies the signature**:
   - Reads `Key-Pair-Id` from the query string and looks up the corresponding `PublicKey` resource in our `KeyGroup`.
   - Recomputes the expected signature over the URL + `Expires` policy.
   - If the signature matches and `Expires` is still in the future → continue. Otherwise → `403`.
3. **Cache lookup**: if the object is already cached at this edge (and the cache entry hasn't expired per the AWS-managed `CachingOptimized` policy), the edge returns it directly. **The signed URL is verified on every request**, but a cache hit avoids an origin round-trip to S3.
4. **Cache miss** → CloudFront fetches the object from S3 using **Origin Access Control (OAC)**:
   - The edge node signs an sigv4 request to S3 with its service identity.
   - S3 checks its bucket policy. Our policy allows `s3:GetObject` only when the requester is the CloudFront service principal AND `AWS:SourceArn` matches our distribution ARN.
   - S3 returns the object; CloudFront caches it, then returns it to the client.
5. Subsequent viewers in the same region get the cached copy.

The S3 bucket itself stays private — no public ACL, no presigned URLs floating around, no IAM credentials in browsers. Only CloudFront can read it, and only signed clients can read CloudFront.

---

## 3. The signing mechanism in detail

### Key pair

`openssl genrsa -out private-key.pem 2048` generated the pair. `public-key.pem` is committed and lives in `template.yaml` as the `PublicKeyPem` parameter's `Default:` value. `private-key.pem` is gitignored and lives in:
- `.env` as `NUXT_CLOUD_FRONT_PRIVATE_KEY` (single line, newlines escaped as `\n`)
- on disk in `cloudfront-serverless/private-key.pem` for the sanity check + future rotations

### What gets signed

`@aws-sdk/cloudfront-signer`'s `getSignedUrl({ url, dateLessThan, keyPairId, privateKey })` produces a "canned policy" signature — the simplest CloudFront URL signature, which restricts only by `Expires` timestamp (no IP or path-pattern restrictions). The output URL has three query params appended:

- `Expires` — Unix epoch seconds; CloudFront rejects after this point
- `Signature` — base64-encoded RSA signature of the policy
- `Key-Pair-Id` — tells CloudFront which public key to verify against

### When signing happens in the app

`layers/selection/server/api/selections/index.post.ts` (line 49) calls `signSelectionUrl(objectKey)` for each item in the upload batch. The result is stored on the `SELECTION_ITEM` DynamoDB row in the `cloudFrontUrl` field with `dateLessThan = now + 6 months`. The Nuxt server is the only thing that ever sees the private key.

---

## 4. The CloudFront resources we created

The stack `niebieskie-aparaty-cloudfront` (deployed to `eu-central-1`, but CloudFront resources are global) created four CloudFormation resources. Here's what each does:

### `AWS::CloudFront::PublicKey` (ID: `K2IHGS3BJ0VXCW`)

Stores the public half of our RSA key. CloudFront uses this to verify signatures on incoming requests. The `CallerReference: niebieskie-aparaty-cloudfront-pk-v1` suffix is the rotation lever — bumping it (e.g. `pk-v2`) forces CloudFormation to replace the resource with a new key.

### `AWS::CloudFront::KeyGroup` (`niebieskie-aparaty-selection-kg`)

A wrapper around one or more `PublicKey` resources. The distribution references a key group, not a public key directly — this makes multi-key rotation possible later (you could have `pk-v1` and `pk-v2` both in the group during a transition window). We only have one key for now.

### `AWS::CloudFront::OriginAccessControl` (`niebieskie-aparaty-client-gallery-oac`)

The modern replacement for Origin Access Identity (OAI). It tells CloudFront to sign requests to S3 with sigv4 using its own service identity (`SigningBehavior: always`, `SigningProtocol: sigv4`). With OAC the bucket policy can reference `Service: cloudfront.amazonaws.com` + an `AWS:SourceArn` condition, which is more granular than the legacy OAI principal.

### `AWS::CloudFront::Distribution` (ID: `E2731WSA4DHMQN`, domain `d319ycflg0po6r.cloudfront.net`)

The actual distribution. Key config:

- `PriceClass: PriceClass_100` — only deploys to EU + NA edges. Cheapest tier. Polish clients are still served from Frankfurt/Warsaw.
- `HttpVersion: http2and3` — modern HTTP/2 + HTTP/3 (QUIC) support for free.
- `Origins[0]`:
  - `DomainName: niebieskie-aparaty-client-gallery.s3.eu-central-1.amazonaws.com` — **regional** S3 domain, **required** for OAC sigv4 to work. The legacy global `bucket.s3.amazonaws.com` silently breaks signing.
  - `S3OriginConfig.OriginAccessIdentity: ""` — must be present and empty when OAC is used. Omitting it makes CloudFormation reject the origin.
  - `OriginAccessControlId` — points at our OAC.
- `DefaultCacheBehavior`:
  - `CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6` — AWS-managed `CachingOptimized` policy. Caches `GET`/`HEAD` aggressively, no query strings or cookies in cache key (so two viewers with different `Signature` query params get the same cache entry).
  - `TrustedKeyGroups: [KeyGroup]` — **this is what makes unsigned requests fail with 403**. Without this, the distribution would happily serve anyone.
  - `ViewerProtocolPolicy: redirect-to-https` — HTTP → HTTPS redirect.
  - `Compress: true` — gzip/brotli on text responses (irrelevant for JPEGs, free upside for any future JSON).
- `ViewerCertificate.CloudFrontDefaultCertificate: true` — uses the free `*.cloudfront.net` cert. We'd swap this if we ever attach a custom domain.

---

## 5. The S3 bucket policy (applied separately)

`niebieskie-aparaty-client-gallery` exists outside any CloudFormation stack and is shared with the Nuxt server's direct S3 access (uploads, deletes, etc.). The stack deliberately doesn't manage the bucket policy — we just append one statement after deploy:

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

The `AWS:SourceArn` condition scopes the grant to **our distribution only**, so even if someone else's CloudFront tried to use our bucket as an origin, S3 would deny it. This is what makes the chain trustworthy end-to-end: only our distribution can read the bucket, and only our private key can sign URLs the distribution accepts.

---

## 6. Caching behavior in plain terms

- **First viewer to open an image** → CloudFront edge has nothing cached → fetches from S3 → caches → returns. ~200-500ms.
- **Second viewer to the same image at the same edge** → cache hit → returns immediately. ~30-50ms.
- **Viewer in a different region** → different edge, separate cache → first request there is a miss too.
- **Cache duration**: per the managed `CachingOptimized` policy, CloudFront respects S3's `Cache-Control` header if present, otherwise defaults to 1 day. The image content never changes (we treat S3 keys as immutable), so the cache TTL only affects how often the edge re-fetches.
- **Signature verification is per-request**, not cached. Even cached responses still require a valid signature on each request.

We aren't invalidating the cache anywhere in the app. If we ever overwrote an S3 object at the same key (we don't — keys are derived from `imageName` and uploads are one-shot), we'd need to call `CreateInvalidation` to drop the stale cache entry.

---

## 7. How this connects to the Nuxt app

Two places in `layers/selection/`:

1. **`server/utils/signSelectionUrl.ts`** — pure signing helper. Reads the three env vars from `useRuntimeConfig()`, calls `@aws-sdk/cloudfront-signer`'s `getSignedUrl()`, returns the signed string. 6-month expiry is hard-coded as `SIX_MONTHS_MS`.

2. **`server/api/selections/index.post.ts`** — at selection creation time, for each item the handler derives the `objectKey` (via `toSelectionObjectKey`), signs it (via `signSelectionUrl`), and passes both to `selectionItemRepository.buildRecord({ objectKey, cloudFrontUrl, … })`. The repository batches the rows into DynamoDB.

The client-gallery app (separate Nuxt project) just reads `cloudFrontUrl` from the `SELECTION_ITEM` record and uses it as `<img src>`. No server logic needed there — that's the whole point of pre-signing at upload time.

---

## 8. The rotation trade-off (recap)

The 6-month signed URLs are persisted, so the only way to invalidate them is to rotate the CloudFront key pair (which breaks **every** URL signed with the old key, simultaneously). For this single-tenant app the trade-off is acceptable; for a multi-tenant or compliance-sensitive setup you'd want either:

- shorter TTLs + on-demand signing in an API endpoint, or
- a multi-key `KeyGroup` with per-row `cloudFrontKeyPairId` stamps for staged rotation.

Both are out of scope for now. Documented in `README.md` § Key rotation.

---

## 9. Things that would surprise you later

- **Edge caches are independent per region**. If you check "is this cached?" by hitting the URL from your laptop in Poland (Warsaw edge) and again from a VPN in NY (NA edge), the second hit is a fresh miss.
- **CloudFront has no built-in metrics on signed-URL failures**. If signing breaks (wrong key pair, expired URL), you get 403s in viewers' browsers but nothing in CloudWatch by default. If this becomes a real concern, enable real-time logs.
- **`KeyGroup` membership change** triggers a distribution config update, which propagates over ~5-10 minutes globally. Briefly during deploy, some edges may still know the old key list.
- **`CallerReference` on `PublicKey`** is the rotation lever — bumping the suffix in `template.yaml` is what tells CloudFormation to replace the resource. Without changing it, `sam deploy` no-ops on the public key even if you replaced the PEM body.
- **The free tier is genuinely permanent**, not 12-month. As long as you stay under 1 TB/month transfer + 10M HTTPS requests, you pay zero for CloudFront forever.
