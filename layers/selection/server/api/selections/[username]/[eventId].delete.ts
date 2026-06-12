import { selectionRepository } from '../../../repository/selectionRepository'
import { selectionItemRepository } from '../../../repository/selectionItemRepository'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')!
  const eventId = getRouterParam(event, 'eventId')!

  const selection = await selectionRepository.findByUsernameAndEventId(username, eventId)
  if (!selection) throw createError({ statusCode: 404, message: 'Selection not found' })

  const { uploadBucketName } = useRuntimeConfig()
  const prefix = `${username}/${eventId}/selection/`

  let continuationToken: string | undefined
  do {
    const listed = await getS3().send(
      new ListObjectsV2Command({
        Bucket: uploadBucketName,
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
          Bucket: uploadBucketName,
          Delete: { Objects: objects, Quiet: true },
        }),
      )
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)

  await selectionItemRepository.deleteByEventId(username, eventId)

  try {
    await getDynamoDb().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${username}`, SK: `SELECTION#${eventId}` },
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${username}`, SK: `EVENT#${eventId}` },
              UpdateExpression: 'SET selectionAvailable = :false',
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
      throw createError({ statusCode: 409, message: 'Failed to delete selection' })
    }
    throw createError({ statusCode: 500, message: 'Failed to delete selection' })
  }

  return { success: true }
})
