import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDynamo, TABLE_NAME } from './dynamo.js'
import { getSqs, FINALIZE_QUEUE_URL, SendMessageCommand } from './sqs.js'
import { selectionPk, selectionSk } from './keys.js'
import type { FinalizeMessage } from './types.js'

export interface SelectionProgress {
  totalPhotos: number | null | undefined
  processedSuccessPhotos: number | undefined
  processedFailedPhotos: number | undefined
}

export async function tryEnqueueFinalize(
  username: string,
  eventId: string,
  progress: SelectionProgress,
): Promise<boolean> {
  const total = progress.totalPhotos
  const success = progress.processedSuccessPhotos ?? 0
  const failed = progress.processedFailedPhotos ?? 0
  if (total == null) return false
  if (success + failed !== total) return false

  try {
    await getDynamo().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: selectionPk(username), SK: selectionSk(eventId) },
        UpdateExpression: 'SET finalizeEnqueued = :true',
        ConditionExpression: 'attribute_not_exists(finalizeEnqueued) OR finalizeEnqueued = :false',
        ExpressionAttributeValues: { ':true': true, ':false': false },
      }),
    )
  } catch (e) {
    if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false
    throw e
  }

  const body: FinalizeMessage = { username, eventId }
  await getSqs().send(
    new SendMessageCommand({
      QueueUrl: FINALIZE_QUEUE_URL,
      MessageBody: JSON.stringify(body),
    }),
  )
  return true
}
