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
  const { selectionFinalizeQueueUrl } = useRuntimeConfig()
  if (!selectionFinalizeQueueUrl) {
    console.warn('selectionFinalizeQueueUrl not configured — skipping finalize gate')
    return false
  }

  const total = progress.totalPhotos
  const success = progress.processedSuccessPhotos ?? 0
  const failed = progress.processedFailedPhotos ?? 0
  if (total == null) return false
  if (success + failed !== total) return false

  try {
    await getDynamoDb().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${username}`, SK: `SELECTION#${eventId}` },
        UpdateExpression: 'SET finalizeEnqueued = :true',
        ConditionExpression: 'attribute_not_exists(finalizeEnqueued) OR finalizeEnqueued = :false',
        ExpressionAttributeValues: { ':true': true, ':false': false },
      }),
    )
  } catch (e) {
    if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false
    throw e
  }

  await getSqs().send(
    new SendMessageCommand({
      QueueUrl: selectionFinalizeQueueUrl,
      MessageBody: JSON.stringify({ username, eventId }),
    }),
  )
  return true
}
