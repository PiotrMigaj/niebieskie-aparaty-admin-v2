import { galleryRepository } from '../../../repository/galleryRepository'
import { galleryItemRepository } from '../../../repository/galleryItemRepository'

async function wipePrefix(bucket: string, prefix: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const listed = await getS3().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    const objects = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k)
      .map((Key) => ({ Key }))
    if (objects.length > 0) {
      await getS3().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      )
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const gallery = await galleryRepository.findByUsernameAndEventId(username, eventId)
  if (!gallery) throw createError({ statusCode: 404, message: 'Gallery not found' })

  const { galleryUploadBucketName } = useRuntimeConfig()

  await wipePrefix(galleryUploadBucketName, `${username}/${eventId}/original/`)
  await wipePrefix(galleryUploadBucketName, `${username}/${eventId}/compressed/`)

  await galleryItemRepository.deleteByEventId(username, eventId)

  try {
    await getDynamoDb().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${username}`, SK: `GALLERY#${eventId}` },
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${username}`, SK: `EVENT#${eventId}` },
              UpdateExpression: 'SET galleryAvailable = :false',
              ConditionExpression: 'attribute_exists(PK)',
              ExpressionAttributeValues: { ':false': false },
            },
          },
        ],
      }),
    )
  } catch (e) {
    if (isError(e)) throw e
    if (e instanceof Error && e.name === 'TransactionCanceledException') {
      throw createError({ statusCode: 409, message: 'Failed to delete gallery' })
    }
    throw createError({ statusCode: 500, message: 'Failed to delete gallery' })
  }

  return { success: true }
})
