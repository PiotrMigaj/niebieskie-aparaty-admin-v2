import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import sharp from 'sharp'
import {
  getS3,
  GetObjectCommand,
  PutObjectCommand,
  GALLERY_BUCKET,
} from '../shared/s3.js'
import { getDynamo, TABLE_NAME } from '../shared/dynamo.js'
import {
  parseOriginalsKey,
  galleryPk,
  gallerySk,
  galleryItemSk,
  originalKey,
  webpKey,
} from '../shared/keys.js'
import { tryEnqueueFinalize, type GalleryProgress } from '../shared/completion.js'
import { isPermanentError, isSharpError } from '../shared/errors.js'
import { signGalleryUrl } from '../shared/sign.js'
import type { S3EventBridgeEvent } from '../shared/types.js'

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record)
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  let s3Event: S3EventBridgeEvent
  try {
    s3Event = JSON.parse(record.body) as S3EventBridgeEvent
  } catch (e) {
    console.error('Malformed SQS body (not JSON) — dropping', { body: record.body, error: String(e) })
    return
  }

  const bucket = s3Event.detail?.bucket?.name
  const rawKey = s3Event.detail?.object?.key
  if (bucket !== GALLERY_BUCKET || !rawKey) {
    console.error('Unexpected event shape — dropping', { bucket, key: rawKey })
    return
  }

  const parsed = parseOriginalsKey(rawKey)
  if (!parsed) {
    console.error('Bad originals key shape — dropping (expected {u}/{e}/original/{file})', { key: rawKey })
    return
  }
  const { username, eventId, originalFileName, imageName } = parsed
  const origKey = originalKey(username, eventId, originalFileName)

  let buffer: Buffer
  try {
    const got = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: rawKey }))
    if (!got.Body) throw new Error('Empty S3 GetObject body')
    buffer = Buffer.from(await got.Body.transformToByteArray())
  } catch (e) {
    if (isPermanentError(e)) {
      console.error('Permanent S3 GetObject error — dropping', { key: rawKey, error: String(e) })
      return
    }
    throw e
  }

  let webpBuffer: Buffer
  let width: number | undefined
  let height: number | undefined
  let compressedSize: number
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })
    webpBuffer = out.data
    width = out.info.width
    height = out.info.height
    compressedSize = out.info.size
  } catch (e) {
    if (isPermanentError(e) || isSharpError(e)) {
      console.warn('sharp failed — recording as failed GalleryItem', { key: rawKey, error: String(e) })
      await recordFailure({
        username,
        eventId,
        imageName,
        originalFileName,
        originalObjectKey: origKey,
        failureReason: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      })
      // NB: originals are NEVER deleted from the bucket. Failed originals remain for inspection / re-processing.
      return
    }
    throw e
  }

  const outKey = webpKey(username, eventId, imageName)
  await getS3().send(
    new PutObjectCommand({
      Bucket: GALLERY_BUCKET,
      Key: outKey,
      Body: webpBuffer,
      ContentType: 'image/webp',
    }),
  )

  const [cloudFrontOriginalUrl, cloudFrontWebpUrl] = await Promise.all([
    signGalleryUrl(origKey),
    signGalleryUrl(outKey),
  ])

  const now = new Date().toISOString()
  const itemKey = { PK: galleryPk(username), SK: galleryItemSk(eventId, imageName) }

  const isDuplicate = await idempotentPutGalleryItem({
    key: itemKey,
    item: {
      ...itemKey,
      entityType: 'GALLERY_ITEM',
      eventId,
      username,
      imageName,
      originalFileName,
      originalObjectKey: origKey,
      webpObjectKey: outKey,
      cloudFrontOriginalUrl,
      cloudFrontWebpUrl,
      width,
      height,
      compressedSize,
      status: 'processed',
      processedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })

  if (isDuplicate) {
    console.info('Duplicate delivery — counters left untouched', { key: rawKey })
    return
  }

  const counterResult = await getDynamo().send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: galleryPk(username), SK: gallerySk(eventId) },
      UpdateExpression: 'ADD processedSuccessPhotos :one SET updatedAt = :now',
      ExpressionAttributeValues: { ':one': 1, ':now': now },
      ReturnValues: 'ALL_NEW',
    }),
  )

  await tryEnqueueFinalize(username, eventId, counterResult.Attributes as GalleryProgress)
}

async function recordFailure(params: {
  username: string
  eventId: string
  imageName: string
  originalFileName: string
  originalObjectKey: string
  failureReason: string
}): Promise<void> {
  const { username, eventId, imageName, originalFileName, originalObjectKey, failureReason } = params
  const now = new Date().toISOString()
  const itemKey = { PK: galleryPk(username), SK: galleryItemSk(eventId, imageName) }

  const isDuplicate = await idempotentPutGalleryItem({
    key: itemKey,
    item: {
      ...itemKey,
      entityType: 'GALLERY_ITEM',
      eventId,
      username,
      imageName,
      originalFileName,
      originalObjectKey,
      cloudFrontOriginalUrl: '',
      cloudFrontWebpUrl: '',
      status: 'failed',
      failureReason,
      processedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })
  if (isDuplicate) return

  const counterResult = await getDynamo().send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: galleryPk(username), SK: gallerySk(eventId) },
      UpdateExpression: 'ADD processedFailedPhotos :one SET updatedAt = :now',
      ExpressionAttributeValues: { ':one': 1, ':now': now },
      ReturnValues: 'ALL_NEW',
    }),
  )

  await tryEnqueueFinalize(username, eventId, counterResult.Attributes as GalleryProgress)
}

async function idempotentPutGalleryItem(params: {
  key: { PK: string; SK: string }
  item: Record<string, unknown>
}): Promise<boolean> {
  try {
    await getDynamo().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: params.item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    )
    return false
  } catch (e) {
    if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return true
    throw e
  }
}
