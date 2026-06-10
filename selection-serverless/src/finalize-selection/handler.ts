import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import {
  getS3,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ORIGINALS_BUCKET,
} from '../shared/s3.js'
import { getDynamo, TABLE_NAME } from '../shared/dynamo.js'
import { eventSk, selectionPk, selectionSk } from '../shared/keys.js'
import type { FinalizeMessage } from '../shared/types.js'

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record)
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  let msg: FinalizeMessage
  try {
    msg = JSON.parse(record.body) as FinalizeMessage
  } catch (e) {
    console.error('Malformed finalize message — dropping', { body: record.body, error: String(e) })
    return
  }

  const { username, eventId } = msg
  if (!username || !eventId) {
    console.error('Finalize message missing fields — dropping', { msg })
    return
  }

  await sweepOriginalsPrefix(username, eventId)

  const now = new Date().toISOString()
  await getDynamo().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: selectionPk(username), SK: eventSk(eventId) },
            UpdateExpression: 'SET selectionAvailable = :true, updatedAt = :now',
            ExpressionAttributeValues: { ':true': true, ':now': now },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: selectionPk(username), SK: selectionSk(eventId) },
            UpdateExpression: 'SET isUploaded = :true, uploadCompletedAt = :now, updatedAt = :now',
            ExpressionAttributeValues: { ':true': true, ':now': now },
          },
        },
      ],
    }),
  )

  console.info('Selection finalized', { username, eventId })
}

async function sweepOriginalsPrefix(username: string, eventId: string): Promise<void> {
  const prefix = `${username}/${eventId}/`
  let continuationToken: string | undefined
  try {
    do {
      const list = await getS3().send(
        new ListObjectsV2Command({
          Bucket: ORIGINALS_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      )
      const keys = (list.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === 'string')
      if (keys.length > 0) {
        await getS3().send(
          new DeleteObjectsCommand({
            Bucket: ORIGINALS_BUCKET,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        )
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
    } while (continuationToken)
  } catch (e) {
    console.warn('Originals sweep failed (lifecycle is the fallback)', { prefix, error: String(e) })
  }
}
